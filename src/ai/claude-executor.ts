// Copyright (C) 2025 Keygraph, Inc.
//
// This program is free software: you can redistribute it and/or modify
// it under the terms of the GNU Affero General Public License version 3
// as published by the Free Software Foundation.

// Production Claude agent execution with retry, git checkpoints, and audit logging

import { fs, path as zxPath } from 'zx';
import { dirname } from 'node:path';
import chalk, { type ChalkInstance } from 'chalk';
import { query } from '@anthropic-ai/claude-agent-sdk';

import { isRetryableError, getRetryDelay, PentestError } from '../error-handling.js';
import { timingResults, Timer } from '../utils/metrics.js';
import { formatTimestamp } from '../utils/formatting.js';
import { AGENT_VALIDATORS, MCP_AGENT_MAPPING } from '../constants.js';
import { AuditSession } from '../audit/index.js';
import { createShannonHelperServer } from '../../mcp-server/dist/index.js';
import type { SessionMetadata } from '../audit/utils.js';
import { getPromptNameForAgent } from '../types/agents.js';
import type { AgentName } from '../types/index.js';
import { is_billing_error } from '../utils/billing-detector.js';
import { DEFAULT_AGENT_TIMEOUT_MS, PROGRESS_HEARTBEAT_INTERVAL_MS } from '../constants/timeouts.js';

import { dispatchMessage } from './message-handlers.js';
import { detectExecutionContext, formatErrorOutput, formatCompletionMessage } from './output-formatters.js';
import { createProgressManager } from './progress-manager.js';
import { createAuditLogger } from './audit-logger.js';
import { getActualModelName } from './router-utils.js';
import { run_claude_prompt_with_retry } from './retry-handler.js';

declare global {
  var SHANNON_DISABLE_LOADER: boolean | undefined;
}

export interface ClaudePromptResult {
  result?: string | null | undefined;
  success: boolean;
  duration: number;
  turns?: number | undefined;
  cost: number;
  model?: string | undefined;
  partialCost?: number | undefined;
  apiErrorDetected?: boolean | undefined;
  error?: string | undefined;
  errorType?: string | undefined;
  prompt?: string | undefined;
  retryable?: boolean | undefined;
}

interface StdioMcpServer {
  type: 'stdio';
  command: string;
  args: string[];
  env: Record<string, string>;
}
type McpServer = ReturnType<typeof createShannonHelperServer> | StdioMcpServer;

function build_mcp_servers(source_dir: string, agent_name: string | null): Record<string, McpServer> {
  const shannon_helper = createShannonHelperServer(source_dir);
  const mcp_servers: Record<string, McpServer> = { 'shannon-helper': shannon_helper };
  if (!agent_name) return mcp_servers;
  const prompt_name = getPromptNameForAgent(agent_name as AgentName);
  const playwright_mcp = MCP_AGENT_MAPPING[prompt_name as keyof typeof MCP_AGENT_MAPPING] ?? null;
  if (!playwright_mcp) return mcp_servers;
  console.log(chalk.gray(`    Assigned ${agent_name} -> ${playwright_mcp}`));
  const user_data_dir = `/tmp/${playwright_mcp}`;
  const is_docker = process.env.SHANNON_DOCKER === 'true';
  const mcp_args: string[] = ['@playwright/mcp@latest', '--isolated', '--user-data-dir', user_data_dir];
  if (is_docker) {
    mcp_args.push('--executable-path', '/usr/bin/chromium-browser');
    mcp_args.push('--browser', 'chromium');
  }
  const headless = process.env.SHANNON_HEADLESS || 'false';
  const env_vars: Record<string, string> = Object.fromEntries(
    Object.entries({
      ...process.env,
      PLAYWRIGHT_HEADLESS: headless,
      ...(is_docker && { PLAYWRIGHT_SKIP_BROWSER_DOWNLOAD: '1' }),
    }).filter((e): e is [string, string] => e[1] !== undefined)
  );
  mcp_servers[playwright_mcp] = { type: 'stdio', command: 'npx', args: mcp_args, env: env_vars };
  return mcp_servers;
}

function outputLines(lines: string[]): void {
  for (const line of lines) {
    console.log(line);
  }
}

function parse_agent_timeout_ms(): number {
  const raw = process.env.SHANNON_AGENT_TIMEOUT_MS || String(DEFAULT_AGENT_TIMEOUT_MS);
  const parsed = Number.parseInt(raw, 10);
  if (!Number.isFinite(parsed) || parsed <= 0) {
    return DEFAULT_AGENT_TIMEOUT_MS;
  }
  return parsed;
}

async function writeErrorLog(
  err: Error & { code?: string; status?: number },
  sourceDir: string,
  fullPrompt: string,
  duration: number
): Promise<void> {
  try {
    const errorLog = {
      timestamp: formatTimestamp(),
      agent: 'claude-executor',
      error: {
        name: err.constructor.name,
        message: err.message,
        code: err.code,
        status: err.status,
        stack: err.stack
      },
      context: {
        sourceDir,
        prompt: fullPrompt.slice(0, 200) + '...',
        retryable: isRetryableError(err)
      },
      duration
    };
    const logPath = zxPath.join(sourceDir, 'error.log');
    await fs.appendFile(logPath, JSON.stringify(errorLog) + '\n');
  } catch (logError) {
    const logErrMsg = logError instanceof Error ? logError.message : String(logError);
    console.log(chalk.gray(`    (Failed to write error log: ${logErrMsg})`));
  }
}

export async function validateAgentOutput(
  result: ClaudePromptResult,
  agentName: string | null,
  sourceDir: string
): Promise<boolean> {
  console.log(chalk.blue(`    Validating ${agentName} agent output`));

  try {
    // Check if agent completed successfully
    if (!result.success || !result.result) {
      console.log(chalk.red(`    Validation failed: Agent execution was unsuccessful`));
      return false;
    }

    // Get validator function for this agent
    const validator = agentName ? AGENT_VALIDATORS[agentName as keyof typeof AGENT_VALIDATORS] : undefined;

    if (!validator) {
      console.log(chalk.yellow(`    No validator found for agent "${agentName}" - assuming success`));
      console.log(chalk.green(`    Validation passed: Unknown agent with successful result`));
      return true;
    }

    console.log(chalk.blue(`    Using validator for agent: ${agentName}`));
    console.log(chalk.blue(`    Source directory: ${sourceDir}`));

    // Apply validation function
    const validationResult = await validator(sourceDir);

    if (validationResult) {
      console.log(chalk.green(`    Validation passed: Required files/structure present`));
    } else {
      console.log(chalk.red(`    Validation failed: Missing required deliverable files`));
    }

    return validationResult;

  } catch (error) {
    const errMsg = error instanceof Error ? error.message : String(error);
    console.log(chalk.red(`    Validation failed with error: ${errMsg}`));
    return false;
  }
}

// Low-level SDK execution. Handles message streaming, progress, and audit logging.
// Exported for Temporal activities to call single-attempt execution.
export async function runClaudePrompt(
  prompt: string,
  sourceDir: string,
  context: string = '',
  description: string = 'Claude analysis',
  agentName: string | null = null,
  colorFn: ChalkInstance = chalk.cyan,
  sessionMetadata: SessionMetadata | null = null,
  auditSession: AuditSession | null = null,
  attemptNumber: number = 1
): Promise<ClaudePromptResult> {
  const timer = new Timer(`agent-${description.toLowerCase().replace(/\s+/g, '-')}`);
  const fullPrompt = context ? `${context}\n\n${prompt}` : prompt;
  const agentTimeoutMs = parse_agent_timeout_ms();
  const abortController = new AbortController();
  let timedOut = false;
  const abortTimer = setTimeout(() => {
    timedOut = true;
    console.log(chalk.yellow(`    ⏱️ Agent timeout reached (${Math.floor(agentTimeoutMs / 1000)}s), aborting Claude process...`));
    abortController.abort(new Error(`Agent timed out after ${agentTimeoutMs}ms`));
  }, agentTimeoutMs);
  abortTimer.unref?.();

  const execContext = detectExecutionContext(description);
  const progress = createProgressManager(
    { description, useCleanOutput: execContext.useCleanOutput },
    global.SHANNON_DISABLE_LOADER ?? false
  );
  const auditLogger = createAuditLogger(auditSession);

  console.log(chalk.blue(`  Running Claude Code: ${description}...`));

  const mcpServers = build_mcp_servers(sourceDir, agentName);
  
  // Ensure node binary is findable by SDK subprocess spawn (Windows compatibility)
  // The SDK spawns "node" to run cli.js, which fails on Windows without explicit PATH
  const nodeDir = dirname(process.execPath);
  const pathSep = process.platform === 'win32' ? ';' : ':';
  const processEnv = {
    ...process.env,
    PATH: `${nodeDir}${pathSep}${process.env.PATH || ''}`,
  };
  
  console.log(chalk.gray(`    Node.js binary: ${process.execPath}`));
  console.log(chalk.gray(`    Node directory: ${nodeDir}`));
  console.log(chalk.gray(`    PATH (first 200 chars): ${processEnv.PATH?.substring(0, 200)}`));
  const apiKey = process.env.ANTHROPIC_API_KEY;
  console.log(chalk.gray(`    ANTHROPIC_API_KEY in env: ${apiKey ? 'YES (' + apiKey.substring(0, 20) + '...)' : 'NO'}`));
  
  const options = {
    model: 'claude-sonnet-4-5-20250929',
    maxTurns: 10_000,
    cwd: sourceDir,
    permissionMode: 'bypassPermissions' as const,
    mcpServers,
    env: processEnv,
    abortController,
  };

  if (!execContext.useCleanOutput) {
    console.log(chalk.gray(`    SDK Options: maxTurns=${options.maxTurns}, cwd=${sourceDir}, permissions=BYPASS`));
  }

  let turnCount = 0;
  let result: string | null = null;
  let apiErrorDetected = false;
  let totalCost = 0;

  progress.start();

  try {
    const messageLoopResult = await processMessageStream(
      fullPrompt,
      options,
      { execContext, description, colorFn, progress, auditLogger },
      timer
    );

    turnCount = messageLoopResult.turnCount;
    result = messageLoopResult.result;
    apiErrorDetected = messageLoopResult.apiErrorDetected;
    totalCost = messageLoopResult.cost;
    const model = messageLoopResult.model;

    // === SPENDING CAP SAFEGUARD ===
    if (turnCount <= 2 && totalCost === 0 && is_billing_error(result ?? '')) {
      throw new PentestError(
        `Spending cap likely reached (turns=${turnCount}, cost=$0): ${result?.slice(0, 100)}`,
        'billing',
        true
      );
    }

    const duration = timer.stop();
    timingResults.agents[execContext.agentKey] = duration;

    if (apiErrorDetected) {
      console.log(chalk.yellow(`  API Error detected in ${description} - will validate deliverables before failing`));
    }

    progress.finish(formatCompletionMessage(execContext, description, turnCount, duration));

    return {
      result,
      success: true,
      duration,
      turns: turnCount,
      cost: totalCost,
      model,
      partialCost: totalCost,
      apiErrorDetected
    };

  } catch (error) {
    clearTimeout(abortTimer);
    const duration = timer.stop();
    timingResults.agents[execContext.agentKey] = duration;

    const err = error as Error & { code?: string; status?: number };
    const effectiveErr =
      timedOut
        ? Object.assign(new Error(`Agent timed out after ${Math.floor(agentTimeoutMs / 1000)}s`), {
            name: 'AgentTimeoutError',
          })
        : err;

    await auditLogger.logError(effectiveErr, duration, turnCount);
    progress.stop();
    outputLines(formatErrorOutput(effectiveErr, execContext, description, duration, sourceDir, isRetryableError(effectiveErr)));
    await writeErrorLog(effectiveErr, sourceDir, fullPrompt, duration);

    return {
      error: effectiveErr.message,
      errorType: effectiveErr.name,
      prompt: fullPrompt.slice(0, 100) + '...',
      success: false,
      duration,
      cost: totalCost,
      retryable: isRetryableError(effectiveErr)
    };
  } finally {
    clearTimeout(abortTimer);
  }
}


interface MessageLoopResult {
  turnCount: number;
  result: string | null;
  apiErrorDetected: boolean;
  cost: number;
  model?: string | undefined;
}

interface MessageLoopDeps {
  execContext: ReturnType<typeof detectExecutionContext>;
  description: string;
  colorFn: ChalkInstance;
  progress: ReturnType<typeof createProgressManager>;
  auditLogger: ReturnType<typeof createAuditLogger>;
}

async function processMessageStream(
  fullPrompt: string,
  options: NonNullable<Parameters<typeof query>[0]['options']>,
  deps: MessageLoopDeps,
  timer: Timer
): Promise<MessageLoopResult> {
  const { execContext, description, colorFn, progress, auditLogger } = deps;
  let turnCount = 0;
  let result: string | null = null;
  let apiErrorDetected = false;
  let cost = 0;
  let model: string | undefined;
  let lastHeartbeat = Date.now();

  for await (const message of query({ prompt: fullPrompt, options })) {
    const now = Date.now();
    if (global.SHANNON_DISABLE_LOADER && now - lastHeartbeat > PROGRESS_HEARTBEAT_INTERVAL_MS) {
      console.log(chalk.blue(`    [${Math.floor((now - timer.startTime) / 1000)}s] ${description} running... (Turn ${turnCount})`));
      lastHeartbeat = now;
    }

    // Increment turn count for assistant messages
    if (message.type === 'assistant') {
      turnCount++;
    }

    const dispatchResult = await dispatchMessage(
      message as { type: string; subtype?: string },
      turnCount,
      { execContext, description, colorFn, progress, auditLogger }
    );

    if (dispatchResult.type === 'throw') {
      throw dispatchResult.error;
    }

    if (dispatchResult.type === 'complete') {
      result = dispatchResult.result;
      cost = dispatchResult.cost;
      break;
    }

    if (dispatchResult.type === 'continue') {
      if (dispatchResult.apiErrorDetected) {
        apiErrorDetected = true;
      }
      // Capture model from SystemInitMessage, but override with router model if applicable
      if (dispatchResult.model) {
        model = getActualModelName(dispatchResult.model);
      }
    }
  }

  return { turnCount, result, apiErrorDetected, cost, model };
}

// Main entry point for agent execution. Handles retries, git checkpoints, and validation.
export async function runClaudePromptWithRetry(
  prompt: string,
  sourceDir: string,
  _allowedTools: string = 'Read',
  context: string = '',
  description: string = 'Claude analysis',
  agentName: string | null = null,
  colorFn: ChalkInstance = chalk.cyan,
  sessionMetadata: SessionMetadata | null = null
): Promise<ClaudePromptResult> {
  return run_claude_prompt_with_retry({
    prompt,
    source_dir: sourceDir,
    context,
    description,
    agent_name: agentName,
    color_fn: colorFn,
    session_metadata: sessionMetadata,
    max_retries: 3,
    run_single_attempt: (attempt, audit_session) =>
      runClaudePrompt(
        prompt,
        sourceDir,
        context,
        description,
        agentName,
        colorFn,
        sessionMetadata,
        audit_session,
        attempt
      ),
    validate_output: (result) => validateAgentOutput(result, agentName, sourceDir),
  }) as Promise<ClaudePromptResult>;
}
