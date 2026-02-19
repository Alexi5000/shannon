// file: src/tools/tool-executor.ts
// description: Strategy-based execution of external security tools (nmap, subfinder, whatweb, schemathesis)
// reference: src/phases/pre-recon.ts, src/error-handling.js

import { $, fs, path } from 'zx';
import chalk from 'chalk';
import { Timer } from '../utils/metrics.js';
import { formatDuration } from '../utils/formatting.js';
import { handleToolError } from '../error-handling.js';

export type ToolName = 'nmap' | 'subfinder' | 'whatweb' | 'schemathesis';
export type ToolStatus = 'success' | 'skipped' | 'error';

export interface TerminalScanResult {
  tool: ToolName;
  output: string;
  status: ToolStatus;
  duration: number;
  success?: boolean;
  error?: Error;
}

async function run_nmap(target: string): Promise<TerminalScanResult> {
  const timer = new Timer('command-nmap');
  try {
    console.log(chalk.blue('    Running nmap scan...'));
    const hostname = new URL(target).hostname;
    const result = await $({ silent: true, stdio: ['ignore', 'pipe', 'ignore'] })`nmap -sV -sC ${hostname}`;
    const duration = timer.stop();
    console.log(chalk.green(`    nmap completed in ${formatDuration(duration)}`));
    return { tool: 'nmap', output: result.stdout, status: 'success', duration };
  } catch (error) {
    const duration = timer.stop();
    console.log(chalk.red(`    nmap failed in ${formatDuration(duration)}`));
    return handleToolError('nmap', error as Error & { code?: string }) as TerminalScanResult;
  }
}

async function run_subfinder(target: string): Promise<TerminalScanResult> {
  const timer = new Timer('command-subfinder');
  try {
    console.log(chalk.blue('    Running subfinder scan...'));
    const hostname = new URL(target).hostname;
    const result = await $({ silent: true, stdio: ['ignore', 'pipe', 'ignore'] })`subfinder -d ${hostname}`;
    const duration = timer.stop();
    console.log(chalk.green(`    subfinder completed in ${formatDuration(duration)}`));
    return { tool: 'subfinder', output: result.stdout, status: 'success', duration };
  } catch (error) {
    const duration = timer.stop();
    console.log(chalk.red(`    subfinder failed in ${formatDuration(duration)}`));
    return handleToolError('subfinder', error as Error & { code?: string }) as TerminalScanResult;
  }
}

async function run_whatweb(target: string): Promise<TerminalScanResult> {
  const timer = new Timer('command-whatweb');
  try {
    console.log(chalk.blue('    Running whatweb scan...'));
    const result = await $({ silent: true, stdio: ['ignore', 'pipe', 'ignore'] })`whatweb --open-timeout 30 --read-timeout 60 ${target}`;
    const duration = timer.stop();
    console.log(chalk.green(`    whatweb completed in ${formatDuration(duration)}`));
    return { tool: 'whatweb', output: result.stdout, status: 'success', duration };
  } catch (error) {
    const duration = timer.stop();
    console.log(chalk.red(`    whatweb failed in ${formatDuration(duration)}`));
    return handleToolError('whatweb', error as Error & { code?: string }) as TerminalScanResult;
  }
}

async function run_schemathesis(target: string, source_dir: string | null): Promise<TerminalScanResult> {
  const timer = new Timer('command-schemathesis');
  const source = source_dir ?? '.';
  const schemas_dir = path.join(source, 'outputs', 'schemas');
  if (!(await fs.pathExists(schemas_dir))) {
    console.log(chalk.gray('    schemathesis - schemas directory not found'));
    return { tool: 'schemathesis', output: 'Schemas directory not found', status: 'skipped', duration: timer.stop() };
  }
  const schema_files = (await fs.readdir(schemas_dir)) as string[];
  const api_schemas = schema_files.filter((f) => f.endsWith('.json') || f.endsWith('.yml') || f.endsWith('.yaml'));
  if (api_schemas.length === 0) {
    console.log(chalk.gray('    schemathesis - no API schemas found'));
    return { tool: 'schemathesis', output: 'No API schemas found', status: 'skipped', duration: timer.stop() };
  }
  console.log(chalk.blue('    Running schemathesis scan...'));
  const all_results: string[] = [];
  for (const schema_file of api_schemas) {
    const schema_path = path.join(schemas_dir, schema_file);
    try {
      const result = await $({ silent: true, stdio: ['ignore', 'pipe', 'ignore'] })`schemathesis run ${schema_path} -u ${target} --max-failures=5`;
      all_results.push(`Schema: ${schema_file}\n${result.stdout}`);
    } catch (schema_error) {
      const err = schema_error as { stdout?: string; message?: string };
      all_results.push(`Schema: ${schema_file}\nError: ${err.stdout ?? err.message}`);
    }
  }
  const duration = timer.stop();
  console.log(chalk.green(`    schemathesis completed in ${formatDuration(duration)}`));
  return { tool: 'schemathesis', output: all_results.join('\n\n'), status: 'success', duration };
}

const TOOL_RUNNERS: {
  [K in ToolName]: (target: string, sourceDir?: string | null) => Promise<TerminalScanResult>;
} = {
  nmap: (target) => run_nmap(target),
  subfinder: (target) => run_subfinder(target),
  whatweb: (target) => run_whatweb(target),
  schemathesis: (target, sourceDir) => run_schemathesis(target, sourceDir ?? null),
};

/**
 * Run a single external security tool and return its result.
 */
export async function run_terminal_scan(
  tool: ToolName,
  target: string,
  source_dir: string | null = null
): Promise<TerminalScanResult> {
  const runner = TOOL_RUNNERS[tool];
  if (!runner) {
    throw new Error(`Unknown tool: ${tool}`);
  }
  return runner(target, source_dir);
}
