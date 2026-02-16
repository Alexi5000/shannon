// file: shannon/ui/temporal_bridge.ts
// description: Temporal client wrapper for Shannon UI server operations
// reference: @temporalio/client, ../src/temporal/shared.ts

import { Connection, Client, WorkflowHandle } from '@temporalio/client';

export interface PipelineProgress {
  status: 'running' | 'completed' | 'failed';
  currentPhase: string | null;
  currentAgent: string | null;
  completedAgents: string[];
  failedAgent: string | null;
  error: string | null;
  startTime: number;
  agentMetrics: Record<string, AgentMetrics>;
  workflowId: string;
  elapsedMs: number;
}

export interface AgentMetrics {
  durationMs: number;
  inputTokens: number | null;
  outputTokens: number | null;
  costUsd: number | null;
  numTurns: number | null;
  model?: string | undefined;
}

export interface PentestConfig {
  url: string;
  repoPath?: string;
  configPath?: string;
  outputPath?: string;
  mode?: 'white_box' | 'black_box';
}

export class TemporalBridge {
  private client: Client | null = null;
  private connection: Connection | null = null;
  private readonly address: string;

  constructor(address: string = 'localhost:7233') {
    this.address = address;
  }

  async connect(): Promise<void> {
    if (this.connection && this.client) {
      return;
    }

    try {
      this.connection = await Connection.connect({ address: this.address });
      this.client = new Client({ connection: this.connection });
    } catch (error) {
      console.error('[TemporalBridge] Connection failed:', error);
      throw error;
    }
  }

  async disconnect(): Promise<void> {
    if (this.connection) {
      await this.connection.close();
      this.connection = null;
      this.client = null;
    }
  }

  async reconnect(): Promise<void> {
    console.log('[TemporalBridge] Reconnecting to Temporal server...');
    await this.disconnect();
    await this.connect();
    console.log('[TemporalBridge] Reconnection complete');
  }

  async startPentest(config: PentestConfig): Promise<string> {
    await this.connect();
    if (!this.client) throw new Error('Temporal client not initialized');

    const workflowId = `shannon-${Date.now()}`;
    const normalized_repo_path = config.repoPath?.trim() || `repos/black-box-${workflowId}`;
    
    // Build workflow args - repoPath is required by workflow prompt interpolation.
    // For black-box mode, generate an isolated workspace path automatically.
    const workflow_args: Record<string, unknown> = {
      webUrl: config.url,
      repoPath: normalized_repo_path,
      workflowId
    };
    
    if (config.configPath) workflow_args.configPath = config.configPath;
    if (config.outputPath) workflow_args.outputPath = config.outputPath;
    if (config.mode) workflow_args.mode = config.mode;
    
    const handle = await this.client.workflow.start('pentestPipelineWorkflow', {
      taskQueue: 'shannon-pipeline',
      workflowId,
      args: [workflow_args]
    });

    return workflowId;
  }

  async getProgress(workflowId: string): Promise<PipelineProgress> {
    await this.connect();
    if (!this.client) throw new Error('Temporal client not initialized');

    const to_progress_status = (status_name: string | undefined): PipelineProgress['status'] => {
      const normalized_status = (status_name || '').toUpperCase();
      if (normalized_status === 'RUNNING') return 'running';
      if (normalized_status === 'COMPLETED') return 'completed';
      return 'failed';
    };

    const is_query_unavailable_error = (error: unknown): boolean => {
      const message = error instanceof Error ? error.message : String(error);
      const normalized_message = message.toLowerCase();
      return (
        normalized_message.includes('failed_precondition') ||
        normalized_message.includes('failed to query workflow') ||
        normalized_message.includes('workflow task in failed state') ||
        normalized_message.includes('no poller seen for task queue recently')
      );
    };

    try {
      const handle = this.client.workflow.getHandle(workflowId);
      const progress = await handle.query<PipelineProgress>('getProgress');

      // Query state can lag behind actual execution status (e.g., terminated workflows).
      // Reconcile against describe() so UI reflects true runtime state.
      try {
        const description = await handle.describe();
        const runtime_status = to_progress_status(description.status?.name);
        if (runtime_status !== 'running') {
          const start_time_ms = description.startTime ? description.startTime.getTime() : progress.startTime;
          return {
            ...progress,
            status: runtime_status,
            startTime: start_time_ms,
            elapsedMs: Math.max(progress.elapsedMs, Math.max(0, Date.now() - start_time_ms)),
            error: progress.error ?? `Workflow is ${description.status?.name?.toLowerCase() || 'not running'}`,
          };
        }
      } catch (describe_error) {
        console.error(`[TemporalBridge] Describe reconciliation failed for ${workflowId}:`, describe_error);
      }

      return progress;
    } catch (error) {
      // Query can fail transiently (worker unavailable) or permanently (workflow task failed).
      // Fall back to workflow describe() so UI can still show status without error spam.
      if (is_query_unavailable_error(error)) {
        try {
          const handle = this.client.workflow.getHandle(workflowId);
          const description = await handle.describe();
          const start_time_ms = description.startTime ? description.startTime.getTime() : Date.now();
          const status = to_progress_status(description.status?.name);
          const reason = error instanceof Error ? error.message : String(error);

          return {
            status,
            currentPhase: null,
            currentAgent: null,
            completedAgents: [],
            failedAgent: null,
            error: status === 'running' ? null : `Workflow query unavailable: ${reason}`,
            startTime: start_time_ms,
            agentMetrics: {},
            workflowId,
            elapsedMs: Math.max(0, Date.now() - start_time_ms),
          };
        } catch (describe_error) {
          console.error(`[TemporalBridge] Fallback describe failed for ${workflowId}:`, describe_error);
        }
      }

      console.error(`[TemporalBridge] Failed to query workflow ${workflowId}:`, error);
      throw error;
    }
  }

  async listWorkflows(limit: number = 10): Promise<Array<{ workflowId: string; status: string; startTime: Date }>> {
    await this.connect();
    if (!this.client) throw new Error('Temporal client not initialized');

    const workflows = await this.client.workflow.list({
      query: 'WorkflowType="pentestPipelineWorkflow"'
    });

    const results = [];
    for await (const workflow of workflows) {
      results.push({
        workflowId: workflow.workflowId,
        status: workflow.status.name,
        startTime: workflow.startTime
      });

      if (results.length >= limit) break;
    }

    return results;
  }

  async getWorkflowHandle(workflowId: string): Promise<WorkflowHandle | null> {
    await this.connect();
    if (!this.client) return null;

    try {
      return this.client.workflow.getHandle(workflowId);
    } catch {
      return null;
    }
  }
  
  async terminateWorkflow(workflowId: string, reason?: string): Promise<boolean> {
    await this.connect();
    if (!this.client) return false;

    try {
      const handle = await this.client.workflow.getHandle(workflowId);
      await handle.terminate(reason);
      return true;
    } catch {
      return false;
    }
  }

  isConnected(): boolean {
    return this.client !== null && this.connection !== null;
  }
}

// Singleton instance
export const temporal = new TemporalBridge(process.env.TEMPORAL_ADDRESS || 'localhost:7233');
