// file: tests/authorization/authorization_enforcement.test.ts
// description: Regression coverage for exact target matching and fail-closed authorization
// reference: src/authorization/target-allowlist.ts, ui/target_authorization.ts

import { describe, expect, test } from 'bun:test';
import {
  authorize_target as authorize_core_target,
  type AllowlistConfig as CoreAllowlistConfig,
} from '../../src/authorization/target-allowlist.js';
import {
  authorize_target as authorize_ui_target,
  type AllowlistConfig as UiAllowlistConfig,
} from '../../ui/target_authorization.js';

const future_expiration = '2099-12-31T23:59:59.000Z';

const core_allowlist: CoreAllowlistConfig = {
  authorized_targets: [
    {
      url: 'http://localhost',
      authorized_by: 'test',
      authorization_token: 'local-token',
      expires_at: future_expiration,
      scope: 'dev',
    },
    {
      url: 'https://staging.example.com/app',
      authorized_by: 'test',
      authorization_token: 'staging-token',
      expires_at: future_expiration,
      scope: 'staging',
    },
  ],
  emergency_stop_enabled: true,
  require_explicit_consent: true,
  production_block_enabled: true,
};

const ui_allowlist: UiAllowlistConfig = {
  authorized_targets: core_allowlist.authorized_targets.map(authorization => ({
    url: authorization.url,
    authorization_token: authorization.authorization_token,
    expires_at: authorization.expires_at,
    scope: authorization.scope,
  })),
  emergency_stop_enabled: true,
  require_explicit_consent: true,
  production_block_enabled: true,
};

const authorizers = [
  {
    name: 'core',
    authorize: (url: string, token?: string) =>
      authorize_core_target(url, token, core_allowlist),
  },
  {
    name: 'ui',
    authorize: (url: string, token?: string) =>
      authorize_ui_target(url, token, ui_allowlist),
  },
];

for (const authorizer of authorizers) {
  describe(`${authorizer.name} authorization enforcement`, () => {
    test('enforces configured tokens for loopback targets', () => {
      expect(authorizer.authorize('http://localhost:4002/health').authorized).toBe(false);
      expect(
        authorizer.authorize('http://localhost:4002/health', 'local-token').authorized,
      ).toBe(true);
      expect(authorizer.authorize('http://127.0.0.2:4003/health').authorized).toBe(false);
    });

    test('requires the configured token for non-loopback staging targets', () => {
      expect(authorizer.authorize('https://staging.example.com/app', 'staging-token').authorized).toBe(true);
      expect(authorizer.authorize('https://staging.example.com/app').authorized).toBe(false);
      expect(authorizer.authorize('https://staging.example.com/app', 'wrong-token').authorized).toBe(false);
    });

    test('matches URL boundaries rather than substrings', () => {
      expect(
        authorizer.authorize(
          'https://staging.example.com/app/admin',
          'staging-token',
        ).authorized,
      ).toBe(true);
      expect(
        authorizer.authorize(
          'https://staging.example.com/application',
          'staging-token',
        ).authorized,
      ).toBe(false);
      expect(
        authorizer.authorize(
          'https://staging.example.com.evil.test/app',
          'staging-token',
        ).authorized,
      ).toBe(false);
    });

    test('blocks production-like and malformed targets before workflow launch', () => {
      expect(
        authorizer.authorize('https://example.com', 'staging-token').authorized,
      ).toBe(false);
      expect(authorizer.authorize('file:///etc/passwd').authorized).toBe(false);
      expect(authorizer.authorize('http://user:pass@localhost:4002').authorized).toBe(false);
    });
  });
}
