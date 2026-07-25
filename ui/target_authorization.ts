// file: shannon/ui/target_authorization.ts
// description: Fail-closed target authorization for the standalone Shannon UI image
// reference: configs/target-allowlist.json, server.ts

import * as fs from 'node:fs';
import * as path from 'node:path';

export type TargetScope = 'staging' | 'dev' | 'qa' | 'sandbox' | 'internal';

export interface TargetAuthorization {
  url: string;
  authorization_token: string;
  expires_at: string;
  scope: TargetScope;
}

export interface AllowlistConfig {
  authorized_targets: TargetAuthorization[];
  emergency_stop_enabled: boolean;
  require_explicit_consent: boolean;
  production_block_enabled: boolean;
}

export interface AuthorizationResult {
  authorized: boolean;
  reason?: string;
  scope?: TargetScope;
}

const STRICT_DEFAULT: AllowlistConfig = {
  authorized_targets: [],
  emergency_stop_enabled: true,
  require_explicit_consent: true,
  production_block_enabled: true,
};

export function load_allowlist(): AllowlistConfig {
  const configured_path = process.env.SHANNON_ALLOWLIST_PATH;
  const candidates = [
    configured_path,
    path.resolve(process.cwd(), 'configs', 'target-allowlist.json'),
    path.resolve(process.cwd(), '..', 'configs', 'target-allowlist.json'),
  ].filter((candidate): candidate is string => Boolean(candidate));

  const allowlist_path = candidates.find(candidate => fs.existsSync(candidate));
  if (!allowlist_path) {
    return { ...STRICT_DEFAULT, authorized_targets: [] };
  }

  try {
    const parsed = JSON.parse(fs.readFileSync(allowlist_path, 'utf8')) as Partial<AllowlistConfig>;
    return {
      authorized_targets: Array.isArray(parsed.authorized_targets)
        ? parsed.authorized_targets
        : [],
      emergency_stop_enabled: parsed.emergency_stop_enabled !== false,
      require_explicit_consent: parsed.require_explicit_consent !== false,
      production_block_enabled: parsed.production_block_enabled !== false,
    };
  } catch (error) {
    console.error('[AUTH] Failed to load allowlist; denying targets:', error);
    return { ...STRICT_DEFAULT, authorized_targets: [] };
  }
}

export function is_target_authorized(
  target_url: string,
  authorization_token?: string,
): AuthorizationResult {
  return authorize_target(target_url, authorization_token, load_allowlist());
}

export function authorize_target(
  target_url: string,
  authorization_token: string | undefined,
  allowlist: AllowlistConfig,
): AuthorizationResult {
  const target = parse_http_url(target_url);
  if (!target) {
    return {
      authorized: false,
      reason: 'Target must be a valid HTTP or HTTPS URL without embedded credentials',
    };
  }

  if (allowlist.production_block_enabled && is_production_target(target)) {
    return {
      authorized: false,
      reason: 'Target appears to be production (blocked by production_block_enabled)',
    };
  }

  const now = Date.now();
  let matched_url = false;
  let matched_expired = false;
  let matched_bad_token = false;

  for (const authorization of allowlist.authorized_targets) {
    if (!target_matches_authorization(target, authorization.url)) {
      continue;
    }
    matched_url = true;

    const expires_at = Date.parse(authorization.expires_at);
    if (!Number.isFinite(expires_at) || expires_at <= now) {
      matched_expired = true;
      continue;
    }

    const configured_token = authorization.authorization_token?.trim();
    const token_required = Boolean(configured_token) || !is_loopback_hostname(target.hostname);
    if (
      token_required
      && (!configured_token || configured_token !== authorization_token)
    ) {
      matched_bad_token = true;
      continue;
    }

    return { authorized: true, scope: authorization.scope };
  }

  if (matched_expired) {
    return { authorized: false, reason: 'Target authorization has expired' };
  }
  if (matched_bad_token) {
    return { authorized: false, reason: 'Authorization token is missing or invalid' };
  }
  if (allowlist.require_explicit_consent || matched_url) {
    return { authorized: false, reason: 'Target not in authorized allowlist' };
  }
  return { authorized: true, scope: 'dev' };
}

export function target_matches_authorization(target: URL, authorization_url: string): boolean {
  if (authorization_url === '*') {
    return true;
  }

  const has_protocol = /^https?:\/\//i.test(authorization_url);
  const authorization = parse_http_url(
    has_protocol ? authorization_url : `${target.protocol}//${authorization_url}`,
  );
  if (!authorization) {
    return false;
  }

  if (
    authorization.protocol !== target.protocol
    || authorization.hostname.toLowerCase() !== target.hostname.toLowerCase()
  ) {
    return false;
  }
  if (authorization.port && authorization.port !== target.port) {
    return false;
  }

  const authorization_path = normalize_path(authorization.pathname);
  const target_path = normalize_path(target.pathname);
  return authorization_path === '/'
    || target_path === authorization_path
    || target_path.startsWith(`${authorization_path}/`);
}

function is_production_target(target: URL): boolean {
  const hostname = target.hostname.toLowerCase();
  if (is_loopback_hostname(hostname)) {
    return false;
  }
  const non_production_labels = new Set([
    'staging',
    'stage',
    'dev',
    'development',
    'qa',
    'sandbox',
    'test',
    'testing',
    'local',
  ]);
  return !hostname.split('.').some(label => non_production_labels.has(label));
}

function parse_http_url(value: string): URL | null {
  try {
    const parsed = new URL(value);
    if (
      !['http:', 'https:'].includes(parsed.protocol)
      || parsed.username
      || parsed.password
    ) {
      return null;
    }
    return parsed;
  } catch {
    return null;
  }
}

function normalize_path(value: string): string {
  if (!value || value === '/') {
    return '/';
  }
  return value.replace(/\/+$/, '');
}

function is_loopback_hostname(hostname: string): boolean {
  const normalized = hostname.replace(/^\[|\]$/g, '').toLowerCase();
  if (normalized === 'localhost' || normalized === '::1') {
    return true;
  }
  const octets = normalized.split('.').map(Number);
  return octets.length === 4
    && octets.every(octet => Number.isInteger(octet) && octet >= 0 && octet <= 255)
    && octets[0] === 127;
}
