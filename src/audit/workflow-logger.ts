// Copyright (C) 2025 Keygraph, Inc.
//
// This program is free software: you can redistribute it and/or modify
// it under the terms of the GNU Affero General Public License version 3
// as published by the Free Software Foundation.

/**
 * Workflow Logger
 *
 * Provides a unified, human-readable log file per workflow.
 * Optimized for `tail -f` viewing during concurrent workflow execution.
 */

import fs from 'fs';
import path from 'path';
import { generateWorkflowLogPath, ensureDirectory, type SessionMetadata } from './utils.js';
import { formatDuration, formatTimestamp } from '../utils/formatting.js';
import { format_tool_params } from './tool-formatter.js';

export interface AgentLogDetails {
  attemptNumber?: number;
  duration_ms?: number;
  cost_usd?: number;
  success?: boolean;
  error?: string;
}

export interface AgentMetricsSummary {
  durationMs: number;
  costUsd: number | null;
}

export interface WorkflowSummary {
  status: 'completed' | 'failed';
  totalDurationMs: number;
  totalCostUsd: number;
  completedAgents: string[];
  agentMetrics: Record<string, AgentMetricsSummary>;
  error?: string;
}

/**
 * WorkflowLogger - Manages the unified workflow log file
 */
export class WorkflowLogger {
  private sessionMetadata: SessionMetadata;
  private logPath: string;
  private stream: fs.WriteStream | null = null;
  private initialized: boolean = false;

  constructor(sessionMetadata: SessionMetadata) {
    this.sessionMetadata = sessionMetadata;
    this.logPath = generateWorkflowLogPath(sessionMetadata);
  }

  /**
   * Initialize the log stream (creates file and writes header)
   */
  async initialize(): Promise<void> {
    if (this.initialized) {
      return;
    }

    // Ensure directory exists
    await ensureDirectory(path.dirname(this.logPath));

    // Create write stream with append mode
    this.stream = fs.createWriteStream(this.logPath, {
      flags: 'a',
      encoding: 'utf8',
      autoClose: true,
    });

    this.initialized = true;

    // Write header only if file is new (empty)
    const stats = await fs.promises.stat(this.logPath).catch(() => null);
    if (!stats || stats.size === 0) {
      await this.writeHeader();
    }
  }

  /**
   * Write header to log file
   */
  private async writeHeader(): Promise<void> {
    const header = [
      `================================================================================`,
      `Shannon Pentest - Workflow Log`,
      `================================================================================`,
      `Workflow ID: ${this.sessionMetadata.id}`,
      `Target URL:  ${this.sessionMetadata.webUrl}`,
      `Started:     ${formatTimestamp()}`,
      `================================================================================`,
      ``,
    ].join('\n');

    return this.writeRaw(header);
  }

  /**
   * Write raw text to log file with immediate flush
   */
  private writeRaw(text: string): Promise<void> {
    return new Promise((resolve, reject) => {
      if (!this.initialized || !this.stream) {
        reject(new Error('WorkflowLogger not initialized'));
        return;
      }

      const needsDrain = !this.stream.write(text, 'utf8', (error) => {
        if (error) reject(error);
      });

      if (needsDrain) {
        this.stream.once('drain', resolve);
      } else {
        resolve();
      }
    });
  }

  /**
   * Format timestamp for log line (local time, human readable)
   */
  private formatLogTime(): string {
    const now = new Date();
    return now.toISOString().replace('T', ' ').slice(0, 19);
  }

  /**
   * Log a phase transition event
   */
  async logPhase(phase: string, event: 'start' | 'complete'): Promise<void> {
    await this.ensureInitialized();

    const action = event === 'start' ? 'Starting' : 'Completed';
    const line = `[${this.formatLogTime()}] [PHASE] ${action}: ${phase}\n`;

    // Add blank line before phase start for readability
    if (event === 'start') {
      await this.writeRaw('\n');
    }

    await this.writeRaw(line);
  }

  /**
   * Log an agent event
   */
  async logAgent(
    agentName: string,
    event: 'start' | 'end',
    details?: AgentLogDetails
  ): Promise<void> {
    await this.ensureInitialized();

    let message: string;

    if (event === 'start') {
      const attempt = details?.attemptNumber ?? 1;
      message = `${agentName}: Starting (attempt ${attempt})`;
    } else {
      const parts: string[] = [agentName + ':'];

      if (details?.success === false) {
        parts.push('Failed');
        if (details?.error) {
          parts.push(`- ${details.error}`);
        }
      } else {
        parts.push('Completed');
      }

      if (details?.duration_ms !== undefined) {
        parts.push(`(${formatDuration(details.duration_ms)}`);
        if (details?.cost_usd !== undefined) {
          parts.push(`$${details.cost_usd.toFixed(2)})`);
        } else {
          parts.push(')');
        }
      }

      message = parts.join(' ');
    }

    const line = `[${this.formatLogTime()}] [AGENT] ${message}\n`;
    await this.writeRaw(line);
  }

  /**
   * Log a general event
   */
  async logEvent(eventType: string, message: string): Promise<void> {
    await this.ensureInitialized();

    const line = `[${this.formatLogTime()}] [${eventType.toUpperCase()}] ${message}\n`;
    await this.writeRaw(line);
  }

  /**
   * Log an error
   */
  async logError(error: Error, context?: string): Promise<void> {
    await this.ensureInitialized();

    const contextStr = context ? ` (${context})` : '';
    const line = `[${this.formatLogTime()}] [ERROR] ${error.message}${contextStr}\n`;
    await this.writeRaw(line);
  }

  /**
   * Truncate string to max length with ellipsis
   */
  /**
   * Log tool start event
   */
  async logToolStart(agentName: string, toolName: string, parameters: unknown): Promise<void> {
    await this.ensureInitialized();

    const params = format_tool_params(toolName, parameters);
    const paramStr = params ? `: ${params}` : '';
    const line = `[${this.formatLogTime()}] [${agentName}] [TOOL] ${toolName}${paramStr}\n`;
    await this.writeRaw(line);
  }

  /**
   * Log LLM response
   */
  async logLlmResponse(agentName: string, turn: number, content: string): Promise<void> {
    await this.ensureInitialized();

    // Show full content, replacing newlines with escaped version for single-line output
    const escaped = content.replace(/\n/g, '\\n');
    const line = `[${this.formatLogTime()}] [${agentName}] [LLM] Turn ${turn}: ${escaped}\n`;
    await this.writeRaw(line);
  }

  /**
   * Log workflow completion with full summary
   */
  async logWorkflowComplete(summary: WorkflowSummary): Promise<void> {
    await this.ensureInitialized();

    const status = summary.status === 'completed' ? 'COMPLETED' : 'FAILED';

    await this.writeRaw('\n');
    await this.writeRaw(`================================================================================\n`);
    await this.writeRaw(`Workflow ${status}\n`);
    await this.writeRaw(`────────────────────────────────────────\n`);
    await this.writeRaw(`Workflow ID: ${this.sessionMetadata.id}\n`);
    await this.writeRaw(`Status:      ${summary.status}\n`);
    await this.writeRaw(`Duration:    ${formatDuration(summary.totalDurationMs)}\n`);
    await this.writeRaw(`Total Cost:  $${summary.totalCostUsd.toFixed(4)}\n`);
    await this.writeRaw(`Agents:      ${summary.completedAgents.length} completed\n`);

    if (summary.error) {
      await this.writeRaw(`Error:       ${summary.error}\n`);
    }

    await this.writeRaw(`\n`);
    await this.writeRaw(`Agent Breakdown:\n`);

    for (const agentName of summary.completedAgents) {
      const metrics = summary.agentMetrics[agentName];
      if (metrics) {
        const duration = formatDuration(metrics.durationMs);
        const cost = metrics.costUsd !== null ? `$${metrics.costUsd.toFixed(4)}` : 'N/A';
        await this.writeRaw(`  - ${agentName} (${duration}, ${cost})\n`);
      } else {
        await this.writeRaw(`  - ${agentName}\n`);
      }
    }

    await this.writeRaw(`================================================================================\n`);
  }

  /**
   * Ensure initialized (helper for lazy initialization)
   */
  private async ensureInitialized(): Promise<void> {
    if (!this.initialized) {
      await this.initialize();
    }
  }

  /**
   * Close the log stream
   */
  async close(): Promise<void> {
    if (!this.initialized || !this.stream) {
      return;
    }

    return new Promise((resolve) => {
      this.stream!.end(() => {
        this.initialized = false;
        resolve();
      });
    });
  }
}
