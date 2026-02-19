// file: src/ai/retry-handler.ts
// description: Retry loop with git checkpoints and output validation for Claude agent execution
// reference: src/ai/claude-executor.ts, src/error-handling.js, src/utils/git-manager.js

import chalk from 'chalk';
import { PentestError, isRetryableError, getRetryDelay } from '../error-handling.js';
import {
  createGitCheckpoint,
  commitGitSuccess,
  rollbackGitWorkspace,
  getGitCommitHash,
} from '../utils/git-manager.js';
import { AuditSession } from '../audit/index.js';
import type { SessionMetadata } from '../audit/utils.js';
import type { ChalkInstance } from 'chalk';

export interface ClaudePromptResultLike {
  result?: string | null | undefined;
  success: boolean;
  duration: number;
  turns?: number | undefined;
  cost: number;
  partialCost?: number | undefined;
  apiErrorDetected?: boolean | undefined;
  error?: string | undefined;
  model?: string | undefined;
}

export interface RunWithRetryOptions {
  prompt: string;
  source_dir: string;
  context: string;
  description: string;
  agent_name: string | null;
  color_fn: ChalkInstance;
  session_metadata: SessionMetadata | null;
  max_retries: number;
  run_single_attempt: (
    attempt: number,
    audit_session: AuditSession | null
  ) => Promise<ClaudePromptResultLike>;
  validate_output: (result: ClaudePromptResultLike) => Promise<boolean>;
}

/**
 * Runs agent execution with retries, git checkpoints, and output validation.
 * Caller provides run_single_attempt and validate_output to avoid circular dependency.
 */
export async function run_claude_prompt_with_retry(
  options: RunWithRetryOptions
): Promise<ClaudePromptResultLike> {
  const {
    source_dir,
    description,
    agent_name,
    session_metadata,
    max_retries,
    run_single_attempt,
    validate_output,
  } = options;

  let last_error: Error | undefined;
  let audit_session: AuditSession | null = null;
  if (session_metadata && agent_name) {
    audit_session = new AuditSession(session_metadata);
    await audit_session.initialize();
  }

  console.log(chalk.cyan(`Starting ${description} with ${max_retries} max attempts`));

  for (let attempt = 1; attempt <= max_retries; attempt++) {
    await createGitCheckpoint(source_dir, description, attempt);

    if (audit_session && agent_name) {
      const full_prompt = options.context ? `${options.context}\n\n${options.prompt}` : options.prompt;
      await audit_session.startAgent(agent_name, full_prompt, attempt);
    }

    try {
      const result = await run_single_attempt(attempt, audit_session);

      if (result.success) {
        const passed = await validate_output(result);
        if (passed) {
          if (result.apiErrorDetected) {
            console.log(chalk.yellow(`Validation: Ready for exploitation despite API error warnings`));
          }
          if (audit_session && agent_name) {
            const commit_hash = await getGitCommitHash(source_dir);
            await audit_session.endAgent(agent_name, {
              attemptNumber: attempt,
              duration_ms: result.duration,
              cost_usd: result.cost ?? 0,
              success: true,
              ...(commit_hash && { checkpoint: commit_hash }),
            });
          }
          await commitGitSuccess(source_dir, description);
          console.log(chalk.green.bold(`${description} completed successfully on attempt ${attempt}/${max_retries}`));
          return result;
        }

        console.log(chalk.yellow(`${description} completed but output validation failed`));
        if (audit_session && agent_name) {
          await audit_session.endAgent(agent_name, {
            attemptNumber: attempt,
            duration_ms: result.duration,
            cost_usd: result.partialCost ?? result.cost ?? 0,
            success: false,
            error: 'Output validation failed',
            isFinalAttempt: attempt === max_retries,
          });
        }
        last_error = result.apiErrorDetected
          ? new Error('API Error: terminated with validation failure')
          : new Error('Output validation failed');
        if (attempt < max_retries) {
          await rollbackGitWorkspace(source_dir, 'validation failure');
          continue;
        }
        throw new PentestError(
          `Agent ${description} failed output validation after ${max_retries} attempts. Required deliverable files were not created.`,
          'validation',
          false,
          { description, sourceDir: source_dir, attemptsExhausted: max_retries }
        );
      }
    } catch (error) {
      const err = error as Error & { duration?: number; cost?: number; partialResults?: unknown };
      last_error = err;
      if (audit_session && agent_name) {
        await audit_session.endAgent(agent_name, {
          attemptNumber: attempt,
          duration_ms: err.duration ?? 0,
          cost_usd: err.cost ?? 0,
          success: false,
          error: err.message,
          isFinalAttempt: attempt === max_retries,
        });
      }
      if (!isRetryableError(err)) {
        console.log(chalk.red(`${description} failed with non-retryable error: ${err.message}`));
        await rollbackGitWorkspace(source_dir, 'non-retryable error cleanup');
        throw err;
      }
      if (attempt < max_retries) {
        await rollbackGitWorkspace(source_dir, 'retryable error cleanup');
        const delay = getRetryDelay(err, attempt);
        console.log(chalk.yellow(`${description} failed (attempt ${attempt}/${max_retries})`));
        console.log(chalk.gray(`    Error: ${err.message}`));
        console.log(chalk.gray(`    Workspace rolled back, retrying in ${(delay / 1000).toFixed(1)}s...`));
        await new Promise((r) => setTimeout(r, delay));
      } else {
        await rollbackGitWorkspace(source_dir, 'final failure cleanup');
        console.log(chalk.red(`${description} failed after ${max_retries} attempts`));
        console.log(chalk.red(`    Final error: ${err.message}`));
      }
    }
  }

  throw last_error;
}
