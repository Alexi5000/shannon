// file: src/constants/error-patterns.ts
// description: Centralized error pattern arrays for retry and Temporal classification
// reference: src/error-handling.ts, src/ai/claude-executor.ts, src/ai/message-handlers.ts

/**
 * Patterns that indicate retryable errors (network, rate limit, server errors).
 */
export const RETRYABLE_PATTERNS: readonly string[] = [
  'network',
  'connection',
  'timeout',
  'econnreset',
  'enotfound',
  'econnrefused',
  'rate limit',
  '429',
  'too many requests',
  'server error',
  '5xx',
  'internal server error',
  'service unavailable',
  'bad gateway',
  'mcp server',
  'model unavailable',
  'service temporarily unavailable',
  'api error',
  'terminated',
  'max turns',
  'maximum turns',
];

/**
 * Patterns that indicate non-retryable errors (checked before default).
 */
export const NON_RETRYABLE_PATTERNS: readonly string[] = [
  'authentication',
  'invalid prompt',
  'out of memory',
  'permission denied',
  'session limit reached',
  'invalid api key',
];

/**
 * Billing-related patterns for classifyErrorForTemporal (retryable).
 */
export const BILLING_ERROR_PATTERNS: readonly string[] = [
  'billing_error',
  'credit balance is too low',
  'insufficient credits',
  'usage is blocked due to insufficient credits',
  'please visit plans & billing',
  'please visit plans and billing',
  'usage limit reached',
  'quota exceeded',
  'daily rate limit',
  'limit will reset',
  'spending cap',
  'spending limit',
  'cap reached',
  'budget exceeded',
  'billing limit reached',
];

/**
 * Authentication error patterns (non-retryable).
 */
export const AUTH_ERROR_PATTERNS: readonly string[] = [
  'authentication',
  'api key',
  '401',
  'authentication_error',
];

/**
 * Permission error patterns (non-retryable).
 */
export const PERMISSION_ERROR_PATTERNS: readonly string[] = [
  'permission',
  'forbidden',
  '403',
];

/**
 * Output validation error patterns (retryable).
 */
export const OUTPUT_VALIDATION_PATTERNS: readonly string[] = [
  'failed output validation',
  'output validation failed',
];

/**
 * Invalid request error patterns (non-retryable).
 */
export const INVALID_REQUEST_PATTERNS: readonly string[] = [
  'invalid_request_error',
  'malformed',
  'validation',
];

/**
 * Request too large patterns (non-retryable).
 */
export const REQUEST_TOO_LARGE_PATTERNS: readonly string[] = [
  'request_too_large',
  'too large',
  '413',
];

/**
 * Configuration error patterns (non-retryable).
 */
export const CONFIG_ERROR_PATTERNS: readonly string[] = [
  'enoent',
  'no such file',
  'cli not installed',
];

/**
 * Execution limit patterns (non-retryable).
 */
export const EXECUTION_LIMIT_PATTERNS: readonly string[] = [
  'max turns',
  'budget',
  'execution limit',
  'error_max_turns',
  'error_max_budget',
];

/**
 * Invalid target URL patterns (non-retryable).
 */
export const INVALID_TARGET_PATTERNS: readonly string[] = [
  'invalid url',
  'invalid target',
  'malformed url',
  'invalid uri',
];
