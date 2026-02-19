// file: src/audit/tool-formatter.ts
// description: Format tool parameters for human-readable workflow log display
// reference: src/audit/workflow-logger.ts

function truncate(str: string, max_len: number): string {
  if (str.length <= max_len) return str;
  return str.slice(0, max_len - 3) + '...';
}

/**
 * Format tool parameters for human-readable display in workflow log.
 */
export function format_tool_params(tool_name: string, params: unknown): string {
  if (!params || typeof params !== 'object') {
    return '';
  }
  const p = params as Record<string, unknown>;

  switch (tool_name) {
    case 'Bash':
      if (p.command) return truncate(String(p.command).replace(/\n/g, ' '), 100);
      break;
    case 'Read':
    case 'Write':
    case 'Edit':
      if (p.file_path) return String(p.file_path);
      break;
    case 'Glob':
      if (p.pattern) return String(p.pattern);
      break;
    case 'Grep':
      if (p.pattern) {
        const path_suffix = p.path ? ` in ${p.path}` : '';
        return `"${truncate(String(p.pattern), 50)}"${path_suffix}`;
      }
      break;
    case 'WebFetch':
    case 'mcp__playwright__browser_navigate':
      if (p.url) return String(p.url);
      break;
    case 'mcp__playwright__browser_click':
      if (p.selector) return truncate(String(p.selector), 60);
      break;
    case 'mcp__playwright__browser_type':
      if (p.selector) {
        const text = p.text ? `: "${truncate(String(p.text), 30)}"` : '';
        return `${truncate(String(p.selector), 40)}${text}`;
      }
      break;
  }

  for (const [key, val] of Object.entries(p)) {
    if (typeof val === 'string' && val.length > 0) {
      return `${key}=${truncate(val, 60)}`;
    }
  }
  return '';
}
