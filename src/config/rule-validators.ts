// file: src/config/rule-validators.ts
// description: Per-type validation for config rules (path, domain, method, header, parameter)
// reference: src/config-parser.ts, src/types/config.js

import type { Rule } from '../types/config.js';

const ALLOWED_HTTP_METHODS = ['GET', 'POST', 'PUT', 'DELETE', 'PATCH', 'HEAD', 'OPTIONS'];

/**
 * Validate a single rule based on its type.
 * @throws Error if the rule is invalid
 */
export function validate_rule_type_specific(rule: Rule, rule_type: string, index: number): void {
  switch (rule.type) {
    case 'path':
      if (!rule.url_path.startsWith('/')) {
        throw new Error(`rules.${rule_type}[${index}].url_path for type 'path' must start with '/'`);
      }
      break;

    case 'subdomain':
    case 'domain':
      if (rule.url_path.includes('/')) {
        throw new Error(
          `rules.${rule_type}[${index}].url_path for type '${rule.type}' cannot contain '/' characters`
        );
      }
      if (rule.type === 'domain' && !rule.url_path.includes('.')) {
        throw new Error(
          `rules.${rule_type}[${index}].url_path for type 'domain' must be a valid domain name`
        );
      }
      break;

    case 'method':
      if (!ALLOWED_HTTP_METHODS.includes(rule.url_path.toUpperCase())) {
        throw new Error(
          `rules.${rule_type}[${index}].url_path for type 'method' must be one of: ${ALLOWED_HTTP_METHODS.join(', ')}`
        );
      }
      break;

    case 'header':
      if (!rule.url_path.match(/^[a-zA-Z0-9\-_]+$/)) {
        throw new Error(
          `rules.${rule_type}[${index}].url_path for type 'header' must be a valid header name (alphanumeric, hyphens, underscores only)`
        );
      }
      break;

    case 'parameter':
      if (!rule.url_path.match(/^[a-zA-Z0-9\-_]+$/)) {
        throw new Error(
          `rules.${rule_type}[${index}].url_path for type 'parameter' must be a valid parameter name (alphanumeric, hyphens, underscores only)`
        );
      }
      break;
  }
}
