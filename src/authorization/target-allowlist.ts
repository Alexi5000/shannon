// file: src/authorization/target-allowlist.ts
// description: Target allowlist and authorization controls for Shannon red-team testing
// reference: src/temporal/activities.ts, src/cli/input-validator.ts

import { fs } from 'zx';
import path from 'node:path';
import chalk from 'chalk';

export interface TargetAuthorization {
  url: string;
  authorized_by: string;
  authorization_token: string;
  expires_at: string;
  scope: 'staging' | 'dev' | 'qa' | 'sandbox';
  notes?: string;
}

export interface AllowlistConfig {
  authorized_targets: TargetAuthorization[];
  emergency_stop_enabled: boolean;
  require_explicit_consent: boolean;
  production_block_enabled: boolean;
}

const DEFAULT_ALLOWLIST_PATH = path.join(process.cwd(), 'configs', 'target-allowlist.json');

/**
 * Load target allowlist from config
 */
export async function load_allowlist(config_path?: string): Promise<AllowlistConfig> {
  const allowlist_path = config_path ?? DEFAULT_ALLOWLIST_PATH;
  
  try {
    if (!await fs.pathExists(allowlist_path)) {
      // Return default strict config
      return {
        authorized_targets: [],
        emergency_stop_enabled: true,
        require_explicit_consent: true,
        production_block_enabled: true
      };
    }
    
    const content = await fs.readFile(allowlist_path, 'utf8');
    const config = JSON.parse(content) as AllowlistConfig;
    
    // Validate required fields
    if (!config.authorized_targets) {
      config.authorized_targets = [];
    }
    
    // Apply safe defaults
    if (config.emergency_stop_enabled === undefined) config.emergency_stop_enabled = true;
    if (config.require_explicit_consent === undefined) config.require_explicit_consent = true;
    if (config.production_block_enabled === undefined) config.production_block_enabled = true;
    
    return config;
  } catch (err) {
    const errMsg = err instanceof Error ? err.message : String(err);
    console.error(chalk.red(`Failed to load allowlist: ${errMsg}`));
    
    // Return strict default on error
    return {
      authorized_targets: [],
      emergency_stop_enabled: true,
      require_explicit_consent: true,
      production_block_enabled: true
    };
  }
}

/**
 * Check if target is authorized for testing
 */
export async function is_target_authorized(
  target_url: string,
  authorization_token?: string
): Promise<{ authorized: boolean; reason?: string; scope?: string }> {
  const allowlist = await load_allowlist();
  
  // Check production blocking
  if (allowlist.production_block_enabled) {
    const production_indicators = [
      /^https?:\/\/(?!staging|dev|qa|sandbox|test|local)/i,
      /\.com(?!.*(?:staging|dev|qa|sandbox))/i,
      /api\.(?!staging|dev)/i
    ];
    
    for (const pattern of production_indicators) {
      if (pattern.test(target_url)) {
        return {
          authorized: false,
          reason: 'Target appears to be production (blocked by production_block_enabled)'
        };
      }
    }
  }
  
  // Check explicit allowlist
  if (allowlist.require_explicit_consent && allowlist.authorized_targets.length === 0) {
    return {
      authorized: false,
      reason: 'No authorized targets in allowlist (require_explicit_consent enabled)'
    };
  }
  
  // Find matching authorization
  const now = new Date();
  for (const auth of allowlist.authorized_targets) {
    const url_match = target_url.includes(auth.url) || auth.url === '*';
    const token_match = !authorization_token || auth.authorization_token === authorization_token;
    const not_expired = !auth.expires_at || new Date(auth.expires_at) > now;
    
    if (url_match && token_match && not_expired) {
      return {
        authorized: true,
        scope: auth.scope
      };
    }
  }
  
  // No match found
  if (allowlist.require_explicit_consent) {
    return {
      authorized: false,
      reason: 'Target not in authorized allowlist'
    };
  }
  
  // Allowlist mode disabled - allow all
  return {
    authorized: true,
    scope: 'dev'
  };
}

/**
 * Create example allowlist configuration
 */
export async function create_example_allowlist(output_path?: string): Promise<void> {
  const example: AllowlistConfig = {
    authorized_targets: [
      {
        url: 'http://localhost',
        authorized_by: 'security-team',
        authorization_token: 'shannon-local-dev-token',
        expires_at: new Date(Date.now() + 365 * 24 * 60 * 60 * 1000).toISOString(),
        scope: 'dev',
        notes: 'Local development and testing'
      },
      {
        url: 'https://staging.example.com',
        authorized_by: 'security-lead',
        authorization_token: 'shannon-staging-2026',
        expires_at: new Date(Date.now() + 90 * 24 * 60 * 60 * 1000).toISOString(),
        scope: 'staging',
        notes: 'Quarterly staging pentest - expires in 90 days'
      }
    ],
    emergency_stop_enabled: true,
    require_explicit_consent: true,
    production_block_enabled: true
  };
  
  const path_to_write = output_path ?? DEFAULT_ALLOWLIST_PATH;
  await fs.ensureDir(path.dirname(path_to_write));
  await fs.writeFile(path_to_write, JSON.stringify(example, null, 2));
  
  console.log(chalk.green(`✅ Example allowlist created at ${path_to_write}`));
}
