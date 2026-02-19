// file: src/utils/billing-detector.ts
// description: Single function to detect billing/spending-cap errors in message or result text
// reference: src/constants/billing-patterns.ts, src/ai/claude-executor.ts, src/temporal/activities.ts

import { BILLING_KEYWORDS } from '../constants/billing-patterns.js';

/**
 * Returns true if the given text looks like a billing/spending cap message.
 * Used when turns <= 2 and cost === 0 to detect cap that slipped through.
 */
export function is_billing_error(text: string): boolean {
  if (!text || typeof text !== 'string') {
    return false;
  }
  const lower = text.toLowerCase();
  return BILLING_KEYWORDS.some((kw) => lower.includes(kw));
}
