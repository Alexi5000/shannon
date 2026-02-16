#!/usr/bin/env node
// Copyright (C) 2025 Keygraph, Inc.
//
// This program is free software: you can redistribute it and/or modify
// it under the terms of the GNU Affero General Public License version 3
// as published by the Free Software Foundation.

/**
 * Shannon - Security Pentest Agent Server
 *
 * Standalone HTTP server entry point for the Shannon pentest agent.
 * Provides:
 *   - Health check endpoint (GET /health)
 *   - Status endpoint (GET /status)
 *   - Pipeline trigger endpoint (POST /scan)
 *   - Optional Temporal worker co-hosting
 *
 * Environment:
 *   SHANNON_PORT          - HTTP server port (default: 4005)
 *   TEMPORAL_ADDRESS      - Temporal server address (default: localhost:7233)
 *   SKIP_TEMPORAL_WORKER  - Set to "true" to skip starting the Temporal worker
 */

import http from 'node:http';
import dotenv from 'dotenv';
import { Connection, Client } from '@temporalio/client';

dotenv.config();

const PORT = parseInt(process.env.SHANNON_PORT || '4005', 10);
const TEMPORAL_ADDRESS = process.env.TEMPORAL_ADDRESS || 'localhost:7233';

interface ServerState {
  startedAt: string;
  temporalWorker: 'running' | 'stopped' | 'failed' | 'skipped';
  temporalError?: string;
  scansCompleted: number;
}

const state: ServerState = {
  startedAt: new Date().toISOString(),
  temporalWorker: 'stopped',
  scansCompleted: 0,
};

// ---------------------------------------------------------------------------
// Temporal Client (lazy-initialized for starting workflows)
// ---------------------------------------------------------------------------

let temporal_client: Client | null = null;

async function get_temporal_client(): Promise<Client> {
  if (!temporal_client) {
    const connection = await Connection.connect({
      address: TEMPORAL_ADDRESS,
    });
    temporal_client = new Client({ connection });
    console.log(`[Shannon] Temporal client connected to ${TEMPORAL_ADDRESS}`);
  }
  return temporal_client;
}

async function close_temporal_client(): Promise<void> {
  if (temporal_client) {
    await temporal_client.connection.close();
    temporal_client = null;
    console.log('[Shannon] Temporal client connection closed');
  }
}

// ---------------------------------------------------------------------------
// Temporal Worker (optional co-hosting)
// ---------------------------------------------------------------------------

async function startTemporalWorker(): Promise<void> {
  if (process.env.SKIP_TEMPORAL_WORKER === 'true') {
    state.temporalWorker = 'skipped';
    console.log('[Shannon] Temporal worker skipped (SKIP_TEMPORAL_WORKER=true)');
    return;
  }

  try {
    // Dynamic import so the server starts even if Temporal deps are missing
    const { NativeConnection, Worker, bundleWorkflowCode } = await import('@temporalio/worker');
    const { fileURLToPath } = await import('node:url');
    const path = await import('node:path');
    const activities = await import('./temporal/activities.js');

    const __dirname = path.dirname(fileURLToPath(import.meta.url));

    // Wait for Temporal with a few retries
    let connection: Awaited<ReturnType<typeof NativeConnection.connect>> | null = null;
    for (let i = 0; i < 15; i++) {
      try {
        connection = await NativeConnection.connect({ address: TEMPORAL_ADDRESS });
        break;
      } catch {
        console.log(`[Shannon] Waiting for Temporal at ${TEMPORAL_ADDRESS}... (${i + 1}/15)`);
        await new Promise((r) => setTimeout(r, 3000));
      }
    }

    if (!connection) {
      state.temporalWorker = 'failed';
      state.temporalError = `Temporal not available at ${TEMPORAL_ADDRESS}`;
      console.error(`[Shannon] ${state.temporalError}`);
      return;
    }

    const workflowBundle = await bundleWorkflowCode({
      workflowsPath: path.join(__dirname, 'temporal', 'workflows.js'),
    });

    const worker = await Worker.create({
      connection,
      namespace: 'default',
      workflowBundle,
      activities,
      taskQueue: 'shannon-pipeline',
      maxConcurrentActivityTaskExecutions: 25,
    });

    state.temporalWorker = 'running';
    console.log('[Shannon] Temporal worker started on queue: shannon-pipeline');

    // Run worker in background - don't block the HTTP server
    worker.run().catch((err) => {
      state.temporalWorker = 'failed';
      state.temporalError = String(err);
      console.error('[Shannon] Temporal worker crashed:', err);
    });

    // Graceful shutdown - will be called by main shutdown handler
    const shutdown_worker = (): void => {
      console.log('[Shannon] Shutting down Temporal worker...');
      worker.shutdown();
    };
    
    // Store for main shutdown
    (global as any).shannonWorkerShutdown = shutdown_worker;
  } catch (err) {
    state.temporalWorker = 'failed';
    state.temporalError = String(err);
    console.error('[Shannon] Failed to start Temporal worker:', err);
  }
}

// ---------------------------------------------------------------------------
// HTTP Server
// ---------------------------------------------------------------------------

const server = http.createServer((req, res) => {
  const url = new URL(req.url || '/', `http://localhost:${PORT}`);

  // Health check
  if (req.method === 'GET' && url.pathname === '/health') {
    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ status: 'ok', uptime: process.uptime() }));
    return;
  }

  // Status
  if (req.method === 'GET' && url.pathname === '/status') {
    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(
      JSON.stringify({
        service: 'shannon',
        version: '1.0.0',
        ...state,
        uptime: process.uptime(),
        temporalAddress: TEMPORAL_ADDRESS,
      })
    );
    return;
  }

  // Trigger a scan
  if (req.method === 'POST' && url.pathname === '/scan') {
    let body = '';
    req.on('data', (chunk) => (body += chunk));
    req.on('end', async () => {
      try {
        const params = JSON.parse(body);
        if (!params.targetUrl) {
          res.writeHead(400, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify({ error: 'targetUrl is required' }));
          return;
        }

        // Start Temporal workflow
        const scan_id = `scan-${Date.now()}-${Math.random().toString(36).slice(2, 9)}`;
        
        try {
          const client = await get_temporal_client();
          const handle = await client.workflow.start('shannonPipeline', {
            taskQueue: 'shannon-pipeline',
            workflowId: scan_id,
            args: [{
              targetUrl: params.targetUrl,
              scanType: params.scanType || 'full',
              options: params.options || {},
            }],
          });

          state.scansCompleted++;
          
          res.writeHead(202, { 'Content-Type': 'application/json' });
          res.end(
            JSON.stringify({
              status: 'accepted',
              message: 'Scan started',
              scanId: scan_id,
              workflowId: handle.workflowId,
              targetUrl: params.targetUrl,
              temporalWorker: state.temporalWorker,
            })
          );
        } catch (err) {
          console.error('[Shannon] Failed to start workflow:', err);
          res.writeHead(503, { 'Content-Type': 'application/json' });
          res.end(
            JSON.stringify({
              error: 'Failed to start scan',
              message: String(err),
              temporalWorker: state.temporalWorker,
            })
          );
        }
      } catch {
        res.writeHead(400, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ error: 'Invalid JSON body' }));
      }
    });
    return;
  }

  // 404
  res.writeHead(404, { 'Content-Type': 'application/json' });
  res.end(JSON.stringify({ error: 'Not found' }));
});

// ---------------------------------------------------------------------------
// Startup
// ---------------------------------------------------------------------------

async function main(): Promise<void> {
  console.log(`[Shannon] Security Pentest Agent v1.0.0`);
  console.log(`[Shannon] Starting HTTP server on port ${PORT}...`);

  server.listen(PORT, '0.0.0.0', () => {
    console.log(`[Shannon] HTTP server listening on 0.0.0.0:${PORT}`);
    console.log(`[Shannon] Health: http://localhost:${PORT}/health`);
    console.log(`[Shannon] Status: http://localhost:${PORT}/status`);
  });

  // Start Temporal worker in background (non-blocking)
  await startTemporalWorker();

  // Graceful shutdown handlers
  const shutdown = async (): Promise<void> => {
    console.log('[Shannon] Received shutdown signal...');
    
    // Close HTTP server
    server.close(() => {
      console.log('[Shannon] HTTP server closed');
    });
    
    // Close Temporal client
    await close_temporal_client();
    
    // Shutdown worker if it exists
    if ((global as any).shannonWorkerShutdown) {
      (global as any).shannonWorkerShutdown();
    }
    
    console.log('[Shannon] Shutdown complete');
    process.exit(0);
  };

  process.on('SIGINT', shutdown);
  process.on('SIGTERM', shutdown);
}

main().catch((err) => {
  console.error('[Shannon] Fatal error:', err);
  process.exit(1);
});
