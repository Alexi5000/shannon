// file: src/integrations/molten-memory-bridge.ts
// description: Bridge to push Shannon findings into Molten memory system (security namespace)
// reference: ../temporal/workflows.ts, ../phases/reporting.ts

import { fs } from 'zx';
import chalk from 'chalk';
import path from 'node:path';

interface MemoryItem {
  content: string;
  type: string;
  tier: string;
  importance: number;
  metadata?: Record<string, unknown>;
}

export interface MoltenMemoryBridgeConfig {
  memory_api_url: string;
  namespace: string;
  agent_id: string;
  framework: string;
}

/**
 * Push Shannon pentest findings to Molten memory system
 */
export class MoltenMemoryBridge {
  private readonly config: MoltenMemoryBridgeConfig;

  constructor(config?: Partial<MoltenMemoryBridgeConfig>) {
    this.config = {
      memory_api_url: config?.memory_api_url ?? process.env.MOLTEN_MEMORY_API_URL ?? 'http://localhost:18789/api/memories',
      namespace: config?.namespace ?? 'security',
      agent_id: config?.agent_id ?? 'shannon-pentester',
      framework: config?.framework ?? 'shannon'
    };
  }

  /**
   * Push workflow completion to memory
   */
  async push_workflow_completion(
    workflow_id: string,
    target_url: string,
    repo_path: string | undefined,
    status: 'completed' | 'failed',
    duration_ms: number,
    cost_usd: number,
    agent_count: number
  ): Promise<boolean> {
    try {
      const mode = repo_path ? 'white-box' : 'black-box';
      const content = `Shannon pentest ${status} for ${target_url} in ${mode} mode. ` +
        `Workflow: ${workflow_id}, Duration: ${Math.floor(duration_ms / 1000)}s, ` +
        `Cost: $${cost_usd.toFixed(2)}, Agents: ${agent_count}`;

      const response = await fetch(`${this.config.memory_api_url}/share`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'X-Agent-Id': this.config.agent_id,
          'X-Framework': this.config.framework
        },
        body: JSON.stringify({
          content,
          namespace: this.config.namespace,
          agentId: this.config.agent_id,
          framework: this.config.framework,
          tier: 'long_term',
          importance: status === 'completed' ? 0.8 : 0.5,
          source_repo: 'shannon',
          source_url: process.env.SHANNON_URL ?? 'http://localhost:4005',
          metadata: {
            workflow_id,
            target_url,
            repo_path: repo_path ?? null,
            execution_mode: mode,
            status,
            duration_ms,
            cost_usd,
            agent_count,
            timestamp: new Date().toISOString()
          }
        })
      });

      if (response.ok) {
        console.log(chalk.green(`  ✅ Workflow completion pushed to Molten memory (${this.config.namespace} namespace)`));
        return true;
      } else {
        const error = await response.json() as { error?: string };
        console.error(chalk.yellow(`  ⚠️ Failed to push to Molten memory: ${error.error ?? 'Unknown error'}`));
        return false;
      }
    } catch (err) {
      const errMsg = err instanceof Error ? err.message : String(err);
      console.error(chalk.yellow(`  ⚠️ Error pushing to Molten memory: ${errMsg}`));
      return false;
    }
  }

  /**
   * Push vulnerability findings to memory
   */
  async push_findings(
    workflow_id: string,
    target_url: string,
    findings: Array<{ severity: string; category: string; description: string }>
  ): Promise<boolean> {
    try {
      const items: MemoryItem[] = findings.map(finding => ({
        content: `Shannon finding: ${finding.severity} ${finding.category} in ${target_url}. ${finding.description}`,
        type: 'vulnerability',
        tier: finding.severity === 'CRITICAL' || finding.severity === 'HIGH' ? 'long_term' : 'short_term',
        importance: finding.severity === 'CRITICAL' ? 1.0 : finding.severity === 'HIGH' ? 0.9 : 0.7,
        metadata: {
          workflow_id,
          target_url,
          severity: finding.severity,
          category: finding.category,
          timestamp: new Date().toISOString()
        }
      }));

      const response = await fetch(`${this.config.memory_api_url}/ingest-external`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'X-Agent-Id': this.config.agent_id,
          'X-Framework': this.config.framework
        },
        body: JSON.stringify({
          items,
          source_repo: 'shannon',
          source_url: process.env.SHANNON_URL ?? 'http://localhost:4005'
        })
      });

      if (response.ok) {
        const result = await response.json() as { ingested?: number };
        console.log(chalk.green(`  ✅ Pushed ${result.ingested ?? 0} findings to Molten memory`));
        return true;
      } else {
        const error = await response.json() as { error?: string };
        console.error(chalk.yellow(`  ⚠️ Failed to push findings: ${error.error ?? 'Unknown error'}`));
        return false;
      }
    } catch (err) {
      const errMsg = err instanceof Error ? err.message : String(err);
      console.error(chalk.yellow(`  ⚠️ Error pushing findings: ${errMsg}`));
      return false;
    }
  }

  /**
   * Extract findings from comprehensive report
   */
  async extract_findings_from_report(report_path: string): Promise<Array<{ severity: string; category: string; description: string }>> {
    try {
      if (!await fs.pathExists(report_path)) {
        return [];
      }

      const report_content = await fs.readFile(report_path, 'utf8');
      const findings: Array<{ severity: string; category: string; description: string }> = [];

      // Parse report for vulnerability sections
      // Look for patterns like: ## CRITICAL, ## HIGH, ## MEDIUM
      const severity_sections = report_content.match(/##\s+(CRITICAL|HIGH|MEDIUM|LOW)[\s\S]*?(?=##|$)/gi) || [];

      for (const section of severity_sections) {
        const severity_match = section.match(/##\s+(CRITICAL|HIGH|MEDIUM|LOW)/i);
        const severity = severity_match ? severity_match[1].toUpperCase() : 'UNKNOWN';

        // Extract vulnerability titles (usually ### headings)
        const vuln_matches = section.match(/###\s+([^\n]+)/g) || [];
        
        for (const vuln of vuln_matches) {
          const title = vuln.replace(/###\s+/, '').trim();
          
          // Extract category from title (e.g., "SQL Injection", "XSS")
          let category = 'unknown';
          if (/injection|sql|nosql|command/i.test(title)) category = 'injection';
          else if (/xss|cross.?site/i.test(title)) category = 'xss';
          else if (/auth/i.test(title)) category = 'authentication';
          else if (/authz|authorization|idor/i.test(title)) category = 'authorization';
          else if (/ssrf/i.test(title)) category = 'ssrf';
          
          findings.push({
            severity,
            category,
            description: title
          });
        }
      }

      return findings;
    } catch (err) {
      const errMsg = err instanceof Error ? err.message : String(err);
      console.error(chalk.yellow(`  ⚠️ Error extracting findings: ${errMsg}`));
      return [];
    }
  }

  /**
   * Push complete workflow results to Molten memory
   */
  async push_workflow_results(
    workflow_id: string,
    target_url: string,
    repo_path: string | undefined,
    status: 'completed' | 'failed',
    duration_ms: number,
    cost_usd: number,
    agent_count: number,
    report_path: string | null
  ): Promise<void> {
    console.log(chalk.blue('📤 Pushing Shannon results to Molten memory...'));

    // Push workflow completion summary
    await this.push_workflow_completion(
      workflow_id,
      target_url,
      repo_path,
      status,
      duration_ms,
      cost_usd,
      agent_count
    );

    // If report exists and workflow completed, extract and push findings
    if (status === 'completed' && report_path && await fs.pathExists(report_path)) {
      const findings = await this.extract_findings_from_report(report_path);
      
      if (findings.length > 0) {
        await this.push_findings(workflow_id, target_url, findings);
      } else {
        console.log(chalk.gray('  ℹ️  No exploitable findings to push (Shannon\'s "No Exploit, No Report" policy)'));
      }
    }
  }
}

/**
 * Create Molten memory bridge with default config
 */
export function create_molten_memory_bridge(config?: Partial<MoltenMemoryBridgeConfig>): MoltenMemoryBridge {
  return new MoltenMemoryBridge(config);
}
