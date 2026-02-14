// file: shannon/ui/ws_server.ts
// description: WebSocket server for real-time Shannon pipeline progress streaming
// reference: temporal_bridge.ts, ws

import { WebSocketServer, WebSocket } from 'ws';
import { temporal, type PipelineProgress } from './temporal_bridge.js';
import * as fs from 'fs';
import * as path from 'path';

interface ClientSubscription {
  ws: WebSocket;
  workflowId: string;
  lastProgress?: PipelineProgress;
  logPosition: number;
}

export class ShannonWebSocketServer {
  private wss: WebSocketServer;
  private subscriptions: Map<string, Set<ClientSubscription>> = new Map();
  private pollIntervals: Map<string, NodeJS.Timeout> = new Map();
  private lastPollErrors: Map<string, { message: string; timestampMs: number }> = new Map();
  private readonly port: number;
  private readonly pollInterval: number = 5000; // 5 seconds (reduce Temporal query pressure)
  private readonly pollErrorBackoff: number = 10000; // 10 seconds after query errors

  constructor(port: number = 4006) {
    this.port = port;
    this.wss = new WebSocketServer({ port });
    this.setupWebSocketServer();
  }

  private setupWebSocketServer(): void {
    this.wss.on('connection', (ws: WebSocket) => {
      console.log('[WS] Client connected');

      ws.on('message', (data: Buffer) => {
        try {
          const message = JSON.parse(data.toString());
          this.handleMessage(ws, message);
        } catch (error) {
          console.error('[WS] Message parse error:', error);
          ws.send(JSON.stringify({ type: 'error', message: 'Invalid message format' }));
        }
      });

      ws.on('close', () => {
        console.log('[WS] Client disconnected');
        this.removeClient(ws);
      });

      ws.on('error', (error) => {
        console.error('[WS] WebSocket error:', error);
      });
    });

    console.log(`[WS] WebSocket server listening on port ${this.port}`);
  }

  private handleMessage(ws: WebSocket, message: any): void {
    switch (message.type) {
      case 'subscribe':
        if (message.workflowId) {
          this.subscribe(ws, message.workflowId);
        }
        break;

      case 'unsubscribe':
        if (message.workflowId) {
          this.unsubscribe(ws, message.workflowId);
        }
        break;

      case 'ping':
        ws.send(JSON.stringify({ type: 'pong' }));
        break;

      default:
        ws.send(JSON.stringify({ type: 'error', message: 'Unknown message type' }));
    }
  }

  private subscribe(ws: WebSocket, workflowId: string): void {
    const subscription: ClientSubscription = {
      ws,
      workflowId,
      logPosition: 0
    };

    if (!this.subscriptions.has(workflowId)) {
      this.subscriptions.set(workflowId, new Set());
    }

    this.subscriptions.get(workflowId)!.add(subscription);

    // Start polling if not already running
    if (!this.pollIntervals.has(workflowId)) {
      this.startPolling(workflowId);
    }

    ws.send(JSON.stringify({ type: 'subscribed', workflowId }));
    console.log(`[WS] Client subscribed to workflow: ${workflowId}`);
  }

  private unsubscribe(ws: WebSocket, workflowId: string): void {
    const subs = this.subscriptions.get(workflowId);
    if (subs) {
      for (const sub of subs) {
        if (sub.ws === ws) {
          subs.delete(sub);
          break;
        }
      }

      // Stop polling if no more subscribers
      if (subs.size === 0) {
        this.stopPolling(workflowId);
        this.subscriptions.delete(workflowId);
      }
    }

    ws.send(JSON.stringify({ type: 'unsubscribed', workflowId }));
  }

  private removeClient(ws: WebSocket): void {
    for (const [workflowId, subs] of this.subscriptions.entries()) {
      for (const sub of subs) {
        if (sub.ws === ws) {
          subs.delete(sub);
        }
      }

      if (subs.size === 0) {
        this.stopPolling(workflowId);
        this.subscriptions.delete(workflowId);
      }
    }
  }

  private startPolling(workflowId: string): void {
    const shouldBroadcastPollingError = (errorMessage: string): boolean => {
      const now = Date.now();
      const previous = this.lastPollErrors.get(workflowId);
      if (!previous) {
        this.lastPollErrors.set(workflowId, { message: errorMessage, timestampMs: now });
        return true;
      }

      const messageChanged = previous.message !== errorMessage;
      const cooldownElapsed = now - previous.timestampMs > 30000;
      if (messageChanged || cooldownElapsed) {
        this.lastPollErrors.set(workflowId, { message: errorMessage, timestampMs: now });
        return true;
      }

      return false;
    };

    const poll = async (): Promise<void> => {
      let nextDelay = this.pollInterval;

      try {
        const progress = await temporal.getProgress(workflowId);
        this.broadcastProgress(workflowId, progress);
        await this.streamLogs(workflowId);

        // Stop polling if workflow is complete or failed
        if (progress.status === 'completed' || progress.status === 'failed') {
          this.stopPolling(workflowId);
          
          // Notify completion
          this.broadcast(workflowId, {
            type: progress.status === 'completed' ? 'complete' : 'failed',
            workflowId,
            error: progress.error
          });
          return;
        }
      } catch (error) {
        console.error(`[WS] Polling error for ${workflowId}:`, error);
        nextDelay = this.pollErrorBackoff;
        const errorMessage = `Failed to query workflow: ${error instanceof Error ? error.message : 'Unknown error'}`;
        if (shouldBroadcastPollingError(errorMessage)) {
          this.broadcast(workflowId, {
            type: 'error',
            message: errorMessage
          });
        }
      }

      // Schedule the next poll only after the current one completes.
      // This prevents overlapping Temporal queries under slow responses.
      if (!this.subscriptions.has(workflowId)) {
        this.stopPolling(workflowId);
        return;
      }
      const timeout = setTimeout(() => {
        void poll();
      }, nextDelay);
      this.pollIntervals.set(workflowId, timeout);
    };

    // Poll immediately, then schedule the next poll after completion.
    void poll();
  }

  private stopPolling(workflowId: string): void {
    const timeout = this.pollIntervals.get(workflowId);
    if (timeout) {
      clearTimeout(timeout);
      this.pollIntervals.delete(workflowId);
    }
    this.lastPollErrors.delete(workflowId);
  }

  private broadcastProgress(workflowId: string, progress: PipelineProgress): void {
    const subs = this.subscriptions.get(workflowId);
    if (!subs) return;

    for (const sub of subs) {
      const lastProgress = sub.lastProgress;

      // Check for phase change
      if (lastProgress && lastProgress.currentPhase !== progress.currentPhase) {
        sub.ws.send(JSON.stringify({
          type: 'phase_change',
          phase: progress.currentPhase,
          agent: progress.currentAgent
        }));
      }

      // Send full progress update
      sub.ws.send(JSON.stringify({
        type: 'progress',
        data: progress
      }));

      sub.lastProgress = progress;
    }
  }

  private async streamLogs(workflowId: string): Promise<void> {
    const subs = this.subscriptions.get(workflowId);
    if (!subs) return;

    // Attempt to find workflow.log file
    const logPath = await this.findLogFile(workflowId);
    if (!logPath) return;

    try {
      const stats = fs.statSync(logPath);
      
      for (const sub of subs) {
        if (sub.logPosition < stats.size) {
          const stream = fs.createReadStream(logPath, {
            start: sub.logPosition,
            encoding: 'utf-8'
          });

          let buffer = '';
          stream.on('data', (chunk) => {
            buffer += chunk;
            const lines = buffer.split('\n');
            buffer = lines.pop() || '';

            for (const line of lines) {
              if (line.trim()) {
                sub.ws.send(JSON.stringify({
                  type: 'log',
                  line
                }));
              }
            }
          });

          stream.on('end', () => {
            sub.logPosition = stats.size;
          });
        }
      }
    } catch (error) {
      // Log file may not exist yet
    }
  }

  private async findLogFile(workflowId: string): Promise<string | null> {
    // Shannon stores logs in audit-logs/{hostname}_{sessionId}/workflow.log
    // Try to find the log file based on workflow ID pattern
    const auditLogsBase = path.join(process.cwd(), '..', 'audit-logs');
    
    try {
      const dirs = fs.readdirSync(auditLogsBase);
      for (const dir of dirs) {
        if (dir.includes(workflowId)) {
          const logPath = path.join(auditLogsBase, dir, 'workflow.log');
          if (fs.existsSync(logPath)) {
            return logPath;
          }
        }
      }
    } catch {
      // Directory doesn't exist yet
    }

    return null;
  }

  private broadcast(workflowId: string, message: any): void {
    const subs = this.subscriptions.get(workflowId);
    if (!subs) return;

    const json = JSON.stringify(message);
    for (const sub of subs) {
      sub.ws.send(json);
    }
  }

  close(): void {
    // Stop all polling
    for (const workflowId of this.pollIntervals.keys()) {
      this.stopPolling(workflowId);
    }

    // Close all connections
    this.wss.close();
  }
}

// Export singleton
let wsServer: ShannonWebSocketServer | null = null;

export function startWebSocketServer(port?: number): ShannonWebSocketServer {
  if (!wsServer) {
    wsServer = new ShannonWebSocketServer(port);
  }
  return wsServer;
}

export function getWebSocketServer(): ShannonWebSocketServer | null {
  return wsServer;
}
