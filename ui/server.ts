// file: shannon/ui/server.ts
// description: Shannon UI Bun + Hono HTTP server with REST API endpoints
// reference: temporal_bridge.ts, ws_server.ts, hono

import { Hono } from 'hono';
import { serveStatic } from 'hono/bun';
import { cors } from 'hono/cors';
import { temporal } from './temporal_bridge.js';
import { startWebSocketServer } from './ws_server.js';
import * as fs from 'fs';
import * as path from 'path';
import { config } from 'dotenv';
import chalk from 'chalk';

config();

// Active workflow tracking for emergency stop
const active_workflows = new Set<string>();

// Simple authorization check (inlined to avoid dependencies)
async function is_target_authorized(target_url: string): Promise<{ authorized: boolean; reason?: string; scope?: string }> {
  try {
    const allowlist_path = path.join(process.cwd(), '..', 'configs', 'target-allowlist.json');
    
    if (!fs.existsSync(allowlist_path)) {
      // No allowlist - allow localhost only
      if (target_url.includes('localhost') || target_url.includes('127.0.0.1')) {
        return { authorized: true, scope: 'dev' };
      }
      return { authorized: false, reason: 'No allowlist configured' };
    }
    
    const allowlist = JSON.parse(fs.readFileSync(allowlist_path, 'utf8'));
    
    // Check if require_explicit_consent is disabled - if so, allow all except production
    if (allowlist.require_explicit_consent === false) {
      // Permissive mode - only block obvious production URLs
      if (allowlist.production_block_enabled !== false) {
        const production_indicators = [
          /^https:\/\/(?!.*(?:staging|dev|qa|sandbox|test|local|localhost))/i,
          /^https:\/\/api\.(?!.*(?:staging|dev))/i,
          /^https:\/\/www\.(?!.*(?:staging|dev))/i
        ];
        
        for (const pattern of production_indicators) {
          if (pattern.test(target_url)) {
            return { authorized: false, reason: 'Target appears to be production (blocked by heuristic)' };
          }
        }
      }
      
      // Not production - authorize
      console.log(`[AUTH] Authorized: ${target_url} (permissive mode, production_block_enabled=${allowlist.production_block_enabled !== false})`);
      return { authorized: true, scope: 'dev' };
    }
    
    // Strict mode - check explicit allowlist
    for (const auth of (allowlist.authorized_targets || [])) {
      if (target_url.includes(auth.url)) {
        const not_expired = !auth.expires_at || new Date(auth.expires_at) > new Date();
        if (not_expired) {
          console.log(`[AUTH] Authorized: ${target_url} via allowlist entry for ${auth.url}`);
          return { authorized: true, scope: auth.scope };
        }
      }
    }
    
    console.log(`[AUTH] Denied: ${target_url} - not in allowlist (strict mode)`);
    return { authorized: false, reason: 'Target not in allowlist (require_explicit_consent=true)' };
  } catch (err) {
    console.error('[AUTH] Error reading allowlist:', err);
    // Error reading allowlist - allow localhost for safety
    if (target_url.includes('localhost') || target_url.includes('127.0.0.1')) {
      return { authorized: true, scope: 'dev' };
    }
    return { authorized: false, reason: `Authorization check failed: ${err instanceof Error ? err.message : String(err)}` };
  }
}

const app = new Hono();

// Enable CORS for cross-origin requests
app.use('/*', cors());

// Serve static files from public directory
app.use('/*', serveStatic({ root: './public' }));

// Health check endpoint for TechTide ecosystem
app.get('/health', async (c) => {
  const isTemporalConnected = temporal.isConnected();
  
  try {
    // Try to connect if not already connected
    if (!isTemporalConnected) {
      await temporal.connect();
    }

    // Get active workflow count
    const workflows = await temporal.listWorkflows(100);
    const activeWorkflows = workflows.filter(w => w.status === 'RUNNING').length;
    
    // Get last pentest info
    const lastPentest = workflows.length > 0 ? workflows[0] : null;
    let lastPentestInfo = null;

    if (lastPentest) {
      try {
        const progress = await temporal.getProgress(lastPentest.workflowId);
        lastPentestInfo = {
          id: lastPentest.workflowId,
          target: 'Unknown', // Would need to extract from workflow input
          status: progress.status,
          progress: `${progress.completedAgents.length}/13 agents complete`,
          elapsed: formatDuration(progress.elapsedMs)
        };
      } catch {
        // Ignore errors for last pentest info
      }
    }

    return c.json({
      status: 'healthy',
      service: 'shannon',
      version: '1.0.0',
      temporal: temporal.isConnected() ? 'connected' : 'disconnected',
      activeWorkflows,
      lastPentest: lastPentestInfo
    });
  } catch (error) {
    return c.json({
      status: 'degraded',
      service: 'shannon',
      version: '1.0.0',
      temporal: 'disconnected',
      error: error instanceof Error ? error.message : 'Unknown error'
    }, 503);
  }
});

// Get current service status
app.get('/api/status', async (c) => {
  try {
    const workflows = await temporal.listWorkflows(10);
    const activeCount = workflows.filter(w => w.status === 'RUNNING').length;
    
    return c.json({
      service: 'shannon',
      version: '1.0.0',
      temporal: {
        connected: temporal.isConnected(),
        address: process.env.TEMPORAL_ADDRESS || 'localhost:7233'
      },
      activeWorkflows: activeCount,
      recentWorkflows: workflows.map(w => ({
        id: w.workflowId,
        status: w.status,
        startTime: w.startTime.toISOString()
      }))
    });
  } catch (error) {
    return c.json({
      error: 'Failed to get status',
      message: error instanceof Error ? error.message : 'Unknown error'
    }, 500);
  }
});

// Start a new pentest (unrestricted - red team mode)
app.post('/api/pentest/start', async (c) => {
  try {
    let body: Record<string, unknown> = {};
    try {
      body = await c.req.json();
    } catch {
      return c.json({ error: 'Invalid JSON payload' }, 400);
    }

    const url = typeof body.url === 'string' ? body.url : '';
    const repoPath = typeof body.repoPath === 'string' ? body.repoPath : undefined;
    const config = typeof body.config === 'string' ? body.config : undefined;
    const mode = body.mode === 'white_box' || body.mode === 'black_box' ? body.mode : undefined;
    const browserProfile = typeof body.browserProfile === 'string' ? body.browserProfile : undefined;
    const allow_parallel = body.allowParallel === true;

    if (!url) {
      return c.json({ error: 'Missing required field: url' }, 400);
    }

    if (!allow_parallel) {
      const workflows = await temporal.listWorkflows(50);
      const running_workflow_ids = workflows
        .filter((workflow) => workflow.status === 'RUNNING')
        .map((workflow) => workflow.workflowId);

      if (running_workflow_ids.length > 0) {
        return c.json({
          error: 'A workflow is already running',
          runningWorkflows: running_workflow_ids,
          message: 'Stop the current workflow before starting another, or pass allowParallel=true.'
        }, 409);
      }
    }

    // Auto-detect mode if not specified
    const execution_mode = mode ?? (repoPath ? 'white_box' : 'black_box');
    
    // Set browser profile in environment for worker to pick up
    if (browserProfile) {
      process.env.SHANNON_BROWSER_PROFILE = browserProfile;
    }

    const workflowId = await temporal.startPentest({
      url,
      repoPath,
      configPath: config,
      mode: execution_mode
    });
    
    // Track active workflow for emergency stop
    active_workflows.add(workflowId);

    console.log(`[PENTEST] Started: ${workflowId} on ${url} (${execution_mode} mode)`);

    return c.json({
      success: true,
      workflowId,
      mode: execution_mode,
      scope: 'unrestricted',
      browserProfile: browserProfile ?? 'red_team',
      message: `Pentest started successfully in ${execution_mode} mode`
    });
  } catch (error) {
    console.error('[API] Start pentest error:', error);
    return c.json({
      error: 'Failed to start pentest',
      message: error instanceof Error ? error.message : 'Unknown error'
    }, 500);
  }
});

// Emergency stop endpoint
app.post('/api/pentest/emergency-stop', async (c) => {
  try {
    let body: Record<string, unknown> = {};
    try {
      body = await c.req.json();
    } catch {
      return c.json({ error: 'Invalid JSON payload' }, 400);
    }

    const workflowId = typeof body.workflowId === 'string' ? body.workflowId : undefined;
    const reason = typeof body.reason === 'string' ? body.reason : undefined;

    if (!workflowId) {
      // Stop all known running workflows (tracked + discovered from Temporal)
      const temporal_workflows = await temporal.listWorkflows(100);
      const running_workflow_ids = temporal_workflows
        .filter((workflow) => workflow.status === 'RUNNING')
        .map((workflow) => workflow.workflowId);
      const workflows_to_stop = Array.from(new Set([
        ...Array.from(active_workflows),
        ...running_workflow_ids
      ]));
      const stopped_count = workflows_to_stop.length;

      console.log(chalk.red(`[EMERGENCY STOP] Stopping all ${stopped_count} active workflows: ${reason ?? 'No reason provided'}`));

      for (const wf_id of workflows_to_stop) {
        try {
          const handle = await temporal.getWorkflowHandle(wf_id);
          if (handle) {
            await handle.terminate(reason ?? 'Emergency stop requested');
          }
        } catch (err) {
          console.error(`Failed to stop workflow ${wf_id}:`, err);
        }
      }
      
      active_workflows.clear();
      
      return c.json({
        success: true,
        stopped: stopped_count,
        message: 'All workflows terminated'
      });
    } else {
      // Stop specific workflow
      console.log(chalk.red(`[EMERGENCY STOP] Stopping workflow ${workflowId}: ${reason ?? 'No reason provided'}`));
      
      try {
        const handle = await temporal.getWorkflowHandle(workflowId);
        if (handle) {
          await handle.terminate(reason ?? 'Emergency stop requested');
        }
        active_workflows.delete(workflowId);
        return c.json({
          success: true,
          workflowId,
          message: 'Workflow terminated'
        });
      } catch (stop_error) {
        const stop_error_message = stop_error instanceof Error ? stop_error.message : String(stop_error);
        const already_stopped =
          stop_error_message.toLowerCase().includes('already completed') ||
          stop_error_message.toLowerCase().includes('not found');
        if (already_stopped) {
          active_workflows.delete(workflowId);
          return c.json({
            success: true,
            workflowId,
            message: 'Workflow already stopped'
          });
        }
        throw stop_error;
      }
    }
  } catch (error) {
    console.error('[API] Emergency stop error:', error);
    return c.json({
      error: 'Failed to stop workflow',
      message: error instanceof Error ? error.message : 'Unknown error'
    }, 500);
  }
});

// Query workflow progress
app.get('/api/pentest/:id/progress', async (c) => {
  const workflowId = c.req.param('id');

  try {
    const progress = await temporal.getProgress(workflowId);
    return c.json(progress);
  } catch (error) {
    console.error(`[API] Get progress error for ${workflowId}:`, error);
    return c.json({
      error: 'Failed to get workflow progress',
      message: error instanceof Error ? error.message : 'Unknown error'
    }, 404);
  }
});

// List past pentests
app.get('/api/pentest/history', async (c) => {
  try {
    const limit = parseInt(c.req.query('limit') || '20');
    const workflows = await temporal.listWorkflows(limit);

    const history = await Promise.all(
      workflows.map(async (w) => {
        try {
          const progress = await temporal.getProgress(w.workflowId);
          return {
            id: w.workflowId,
            status: w.status,
            startTime: w.startTime.toISOString(),
            progress: {
              completedAgents: progress.completedAgents.length,
              totalAgents: 13,
              currentPhase: progress.currentPhase,
              elapsed: formatDuration(progress.elapsedMs)
            }
          };
        } catch {
          return {
            id: w.workflowId,
            status: w.status,
            startTime: w.startTime.toISOString(),
            progress: null
          };
        }
      })
    );

    return c.json({ history });
  } catch (error) {
    return c.json({
      error: 'Failed to get history',
      message: error instanceof Error ? error.message : 'Unknown error'
    }, 500);
  }
});

// Get completed report
app.get('/api/pentest/:id/report', async (c) => {
  const workflowId = c.req.param('id');

  try {
    // Find the report file in audit-logs
    const reportPath = await findReportFile(workflowId);
    
    if (!reportPath) {
      return c.json({ error: 'Report not found' }, 404);
    }

    const report = fs.readFileSync(reportPath, 'utf-8');
    
    return c.json({
      workflowId,
      report,
      path: reportPath
    });
  } catch (error) {
    return c.json({
      error: 'Failed to get report',
      message: error instanceof Error ? error.message : 'Unknown error'
    }, 500);
  }
});

// Serve index.html for root path
app.get('/', (c) => {
  return c.html(fs.readFileSync('./public/index.html', 'utf-8'));
});

// Helper functions
function formatDuration(ms: number): string {
  const seconds = Math.floor(ms / 1000);
  const minutes = Math.floor(seconds / 60);
  const hours = Math.floor(minutes / 60);

  if (hours > 0) {
    return `${hours}h ${minutes % 60}m`;
  } else if (minutes > 0) {
    return `${minutes}m ${seconds % 60}s`;
  }
  return `${seconds}s`;
}

async function findReportFile(workflowId: string): Promise<string | null> {
  const auditLogsBase = path.join(process.cwd(), '..', 'audit-logs');
  
  try {
    const dirs = fs.readdirSync(auditLogsBase);
    for (const dir of dirs) {
      if (dir.includes(workflowId)) {
        const reportPath = path.join(auditLogsBase, dir, 'deliverables', 'comprehensive_security_assessment_report.md');
        if (fs.existsSync(reportPath)) {
          return reportPath;
        }
      }
    }
  } catch {
    // Directory doesn't exist
  }

  return null;
}

// Start servers
const SHANNON_PORT = parseInt(process.env.SHANNON_PORT || '4005');
const SHANNON_WS_PORT = parseInt(process.env.SHANNON_WS_PORT || '4006');

// Start WebSocket server
startWebSocketServer(SHANNON_WS_PORT);

// Start HTTP server
export default {
  port: SHANNON_PORT,
  fetch: app.fetch,
};

console.log(`
┌─────────────────────────────────────────────┐
│                                             │
│   SHANNON AI PENTESTER UI                   │
│                                             │
│   HTTP:      http://localhost:${SHANNON_PORT}      │
│   WebSocket: ws://localhost:${SHANNON_WS_PORT}        │
│   Temporal:  ${process.env.TEMPORAL_ADDRESS || 'localhost:7233'}            │
│                                             │
└─────────────────────────────────────────────┘
`);
