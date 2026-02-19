// Copyright (C) 2025 Keygraph, Inc.
//
// This program is free software: you can redistribute it and/or modify
// it under the terms of the GNU Affero General Public License version 3
// as published by the Free Software Foundation.

/**
 * Temporal workflow for Shannon pentest pipeline.
 *
 * Orchestrates the penetration testing workflow:
 * 1. Pre-Reconnaissance (sequential)
 * 2. Reconnaissance (sequential)
 * 3-4. Vulnerability + Exploitation (5 pipelined pairs in parallel)
 *      Each pair: vuln agent → queue check → conditional exploit
 *      No synchronization barrier - exploits start when their vuln finishes
 * 5. Reporting (sequential)
 *
 * Features:
 * - Queryable state via getProgress
 * - Automatic retry with backoff for transient/billing errors
 * - Non-retryable classification for permanent errors
 * - Audit correlation via workflowId
 * - Graceful failure handling: pipelines continue if one fails
 */

import {
  proxyActivities,
  setHandler,
  workflowInfo,
} from '@temporalio/workflow';
import type * as activities from './activities.js';
import type { ActivityInput } from './activities.js';
import {
  getProgress,
  type PipelineInput,
  type PipelineState,
  type PipelineProgress,
  type PipelineSummary,
  type VulnExploitPipelineResult,
  type AgentMetrics,
} from './shared.js';
import type { VulnType } from '../queue-validation.js';

// Retry configuration for production (long intervals for billing recovery)
const PRODUCTION_RETRY = {
  initialInterval: '5 minutes',
  maximumInterval: '30 minutes',
  backoffCoefficient: 2,
  maximumAttempts: 50,
  nonRetryableErrorTypes: [
    'AuthenticationError',
    'PermissionError',
    'InvalidRequestError',
    'RequestTooLargeError',
    'ConfigurationError',
    'InvalidTargetError',
    'ExecutionLimitError',
  ],
};

// Retry configuration for pipeline testing (fast iteration)
const TESTING_RETRY = {
  initialInterval: '10 seconds',
  maximumInterval: '30 seconds',
  backoffCoefficient: 2,
  maximumAttempts: 5,
  nonRetryableErrorTypes: PRODUCTION_RETRY.nonRetryableErrorTypes,
};

// Activity proxy with production retry configuration (default)
const acts = proxyActivities<typeof activities>({
  startToCloseTimeout: '2 hours',
  heartbeatTimeout: '10 minutes', // Long timeout for resource-constrained workers with many concurrent activities
  retry: PRODUCTION_RETRY,
});

// Activity proxy with testing retry configuration (fast)
const testActs = proxyActivities<typeof activities>({
  startToCloseTimeout: '10 minutes',
  heartbeatTimeout: '5 minutes', // Shorter for testing but still tolerant of resource contention
  retry: TESTING_RETRY,
});

type ActivityProxy = ReturnType<typeof proxyActivities<typeof activities>>;

/**
 * Compute aggregated metrics from the current pipeline state.
 */
function computeSummary(state: PipelineState): PipelineSummary {
  const metrics = Object.values(state.agentMetrics);
  return {
    totalCostUsd: metrics.reduce((sum, m) => sum + (m.costUsd ?? 0), 0),
    totalDurationMs: Date.now() - state.startTime,
    totalTurns: metrics.reduce((sum, m) => sum + (m.numTurns ?? 0), 0),
    agentCount: state.completedAgents.length,
  };
}

async function execute_pre_recon_phase(
  a: ActivityProxy,
  activityInput: ActivityInput,
  state: PipelineState
): Promise<void> {
  state.currentPhase = 'pre-recon';
  state.currentAgent = 'pre-recon';
  await a.logPhaseTransition(activityInput, 'pre-recon', 'start');
  state.agentMetrics['pre-recon'] = await a.runPreReconAgent(activityInput);
  state.completedAgents.push('pre-recon');
  await a.logPhaseTransition(activityInput, 'pre-recon', 'complete');
}

async function execute_recon_phase(
  a: ActivityProxy,
  activityInput: ActivityInput,
  state: PipelineState
): Promise<void> {
  state.currentPhase = 'recon';
  state.currentAgent = 'recon';
  await a.logPhaseTransition(activityInput, 'recon', 'start');
  state.agentMetrics['recon'] = await a.runReconAgent(activityInput);
  state.completedAgents.push('recon');
  await a.logPhaseTransition(activityInput, 'recon', 'complete');
}

async function execute_vulnerability_exploitation_phase(
  a: ActivityProxy,
  activityInput: ActivityInput,
  state: PipelineState
): Promise<void> {
  state.currentPhase = 'vulnerability-exploitation';
  state.currentAgent = 'pipelines';
  await a.logPhaseTransition(activityInput, 'vulnerability-exploitation', 'start');

  async function run_vuln_exploit_pipeline(
    vulnType: VulnType,
    runVulnAgent: () => Promise<AgentMetrics>,
    runExploitAgent: () => Promise<AgentMetrics>
  ): Promise<VulnExploitPipelineResult> {
    const vulnMetrics = await runVulnAgent();
    state.agentMetrics[`${vulnType}-vuln`] = vulnMetrics;
    state.completedAgents.push(`${vulnType}-vuln`);
    const decision = await a.checkExploitationQueue(activityInput, vulnType);
    let exploitMetrics: AgentMetrics | null = null;
    if (decision.shouldExploit) {
      exploitMetrics = await runExploitAgent();
      state.agentMetrics[`${vulnType}-exploit`] = exploitMetrics;
      state.completedAgents.push(`${vulnType}-exploit`);
    }
    return {
      vulnType,
      vulnMetrics,
      exploitMetrics,
      exploitDecision: {
        shouldExploit: decision.shouldExploit,
        vulnerabilityCount: decision.vulnerabilityCount,
      },
      error: null,
    };
  }

  const pipelineResults = await Promise.allSettled([
    run_vuln_exploit_pipeline(
      'injection',
      () => a.runInjectionVulnAgent(activityInput),
      () => a.runInjectionExploitAgent(activityInput)
    ),
    run_vuln_exploit_pipeline(
      'xss',
      () => a.runXssVulnAgent(activityInput),
      () => a.runXssExploitAgent(activityInput)
    ),
    run_vuln_exploit_pipeline(
      'auth',
      () => a.runAuthVulnAgent(activityInput),
      () => a.runAuthExploitAgent(activityInput)
    ),
    run_vuln_exploit_pipeline(
      'ssrf',
      () => a.runSsrfVulnAgent(activityInput),
      () => a.runSsrfExploitAgent(activityInput)
    ),
    run_vuln_exploit_pipeline(
      'authz',
      () => a.runAuthzVulnAgent(activityInput),
      () => a.runAuthzExploitAgent(activityInput)
    ),
  ]);

  const failedPipelines: string[] = [];
  for (const result of pipelineResults) {
    if (result.status === 'rejected') {
      failedPipelines.push(
        result.reason instanceof Error ? result.reason.message : String(result.reason)
      );
    }
  }
  if (failedPipelines.length > 0) {
    console.log(`⚠️ ${failedPipelines.length} pipeline(s) failed:`, failedPipelines);
  }

  state.currentPhase = 'exploitation';
  state.currentAgent = null;
  await a.logPhaseTransition(activityInput, 'vulnerability-exploitation', 'complete');
}

async function execute_reporting_phase(
  a: ActivityProxy,
  activityInput: ActivityInput,
  state: PipelineState
): Promise<void> {
  state.currentPhase = 'reporting';
  state.currentAgent = 'report';
  await a.logPhaseTransition(activityInput, 'reporting', 'start');
  await a.assembleReportActivity(activityInput);
  state.agentMetrics['report'] = await a.runReportAgent(activityInput);
  state.completedAgents.push('report');
  await a.injectReportMetadataActivity(activityInput);
  await a.logPhaseTransition(activityInput, 'reporting', 'complete');
}

function build_workflow_summary(state: PipelineState, status: 'completed' | 'failed', error?: string) {
  return {
    status,
    totalDurationMs: state.summary!.totalDurationMs,
    totalCostUsd: state.summary!.totalCostUsd,
    completedAgents: state.completedAgents,
    agentMetrics: Object.fromEntries(
      Object.entries(state.agentMetrics).map(([name, m]) => [
        name,
        { durationMs: m.durationMs, costUsd: m.costUsd },
      ])
    ),
    ...(error !== undefined && { error }),
  };
}

export async function pentestPipelineWorkflow(
  input: PipelineInput
): Promise<PipelineState> {
  const { workflowId } = workflowInfo();
  const a = input.pipelineTestingMode ? testActs : acts;

  const state: PipelineState = {
    status: 'running',
    currentPhase: null,
    currentAgent: null,
    completedAgents: [],
    failedAgent: null,
    error: null,
    startTime: Date.now(),
    agentMetrics: {},
    summary: null,
  };

  setHandler(getProgress, (): PipelineProgress => ({
    ...state,
    workflowId,
    elapsedMs: Date.now() - state.startTime,
  }));

  const activityInput: ActivityInput = {
    webUrl: input.webUrl,
    repoPath: input.repoPath,
    workflowId,
    ...(input.mode !== undefined && { mode: input.mode }),
    ...(input.configPath !== undefined && { configPath: input.configPath }),
    ...(input.outputPath !== undefined && { outputPath: input.outputPath }),
    ...(input.pipelineTestingMode !== undefined && {
      pipelineTestingMode: input.pipelineTestingMode,
    }),
  };

  try {
    await execute_pre_recon_phase(a, activityInput, state);
    await execute_recon_phase(a, activityInput, state);
    await execute_vulnerability_exploitation_phase(a, activityInput, state);
    await execute_reporting_phase(a, activityInput, state);

    state.status = 'completed';
    state.currentPhase = null;
    state.currentAgent = null;
    state.summary = computeSummary(state);
    await a.logWorkflowComplete(activityInput, build_workflow_summary(state, 'completed'));
    return state;
  } catch (error) {
    state.status = 'failed';
    state.failedAgent = state.currentAgent;
    state.error = error instanceof Error ? error.message : String(error);
    state.summary = computeSummary(state);
    await a.logWorkflowComplete(
      activityInput,
      build_workflow_summary(state, 'failed', state.error ?? undefined)
    );
    throw error;
  }
}
