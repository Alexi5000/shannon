// file: src/constants/billing-patterns.ts
// description: Centralized billing and spending-cap keywords for error detection
// reference: src/ai/claude-executor.ts, src/temporal/activities.ts, src/ai/message-handlers.ts

/**
 * Keywords that indicate a billing/spending cap message in agent result text.
 * Used for defense-in-depth detection when turns <= 2 and cost === 0.
 */
export const BILLING_KEYWORDS: readonly string[] = [
  'spending',
  'cap',
  'limit',
  'budget',
  'resets',
];

/**
 * Patterns for detecting billing errors in API/stream content.
 * Used by message handlers and error classification.
 */
export const BILLING_PATTERNS: readonly string[] = [
  'spending cap',
  'spending limit',
  'cap reached',
  'budget exceeded',
  'usage limit',
];
