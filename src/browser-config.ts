// file: src/browser-config.ts
// description: Browser automation configuration and controls for Shannon pentest agents
// reference: src/ai/claude-executor.ts, src/constants.ts

export interface BrowserProfile {
  headless: boolean;
  proxy?: string;
  timeout_ms: number;
  capture_screenshots: boolean;
  capture_network: boolean;
  capture_console: boolean;
  user_agent?: string;
  viewport?: { width: number; height: number };
}

export interface BrowserTelemetry {
  agent_name: string;
  workflow_id: string;
  navigation_count: number;
  click_count: number;
  form_fill_count: number;
  screenshot_count: number;
  network_requests: number;
  console_messages: number;
  errors: number;
  start_time: number;
  last_action_time: number;
}

/**
 * Browser profiles for different testing scenarios
 */
export const BROWSER_PROFILES: Record<string, BrowserProfile> = Object.freeze({
  // Red-team mode: Full automation, aggressive timeouts, comprehensive capture
  red_team: {
    headless: true,
    timeout_ms: 60000,
    capture_screenshots: true,
    capture_network: true,
    capture_console: true,
    user_agent: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
    viewport: { width: 1920, height: 1080 }
  },
  
  // Standard pentest: Balanced settings
  standard: {
    headless: true,
    timeout_ms: 30000,
    capture_screenshots: true,
    capture_network: false,
    capture_console: true,
    viewport: { width: 1920, height: 1080 }
  },
  
  // Minimal: Fast, low overhead
  minimal: {
    headless: true,
    timeout_ms: 15000,
    capture_screenshots: false,
    capture_network: false,
    capture_console: false,
    viewport: { width: 1280, height: 720 }
  },
  
  // Debug: Headed browser for troubleshooting
  debug: {
    headless: false,
    timeout_ms: 120000,
    capture_screenshots: true,
    capture_network: true,
    capture_console: true,
    viewport: { width: 1920, height: 1080 }
  }
});

/**
 * Get browser profile by name with fallback to standard
 */
export function getBrowserProfile(profile_name?: string): BrowserProfile {
  const name = profile_name ?? process.env.SHANNON_BROWSER_PROFILE ?? 'red_team';
  const profile = BROWSER_PROFILES[name];
  return profile ?? BROWSER_PROFILES.red_team!;
}

/**
 * Create telemetry tracker for browser session
 */
export function createBrowserTelemetry(agent_name: string, workflow_id: string): BrowserTelemetry {
  return {
    agent_name,
    workflow_id,
    navigation_count: 0,
    click_count: 0,
    form_fill_count: 0,
    screenshot_count: 0,
    network_requests: 0,
    console_messages: 0,
    errors: 0,
    start_time: Date.now(),
    last_action_time: Date.now()
  };
}

/**
 * Record browser action in telemetry
 */
export function recordBrowserAction(
  telemetry: BrowserTelemetry,
  action_type: 'navigate' | 'click' | 'fill' | 'screenshot' | 'network' | 'console' | 'error'
): void {
  telemetry.last_action_time = Date.now();
  
  switch (action_type) {
    case 'navigate':
      telemetry.navigation_count++;
      break;
    case 'click':
      telemetry.click_count++;
      break;
    case 'fill':
      telemetry.form_fill_count++;
      break;
    case 'screenshot':
      telemetry.screenshot_count++;
      break;
    case 'network':
      telemetry.network_requests++;
      break;
    case 'console':
      telemetry.console_messages++;
      break;
    case 'error':
      telemetry.errors++;
      break;
  }
}

/**
 * Get browser telemetry summary
 */
export function getBrowserTelemetrySummary(telemetry: BrowserTelemetry): string {
  const elapsed_s = Math.floor((Date.now() - telemetry.start_time) / 1000);
  const idle_s = Math.floor((Date.now() - telemetry.last_action_time) / 1000);
  
  return `Browser session (${telemetry.agent_name}): ${telemetry.navigation_count} nav, ${telemetry.click_count} clicks, ${telemetry.form_fill_count} forms, ${telemetry.screenshot_count} screenshots | ${elapsed_s}s elapsed, ${idle_s}s idle | ${telemetry.errors} errors`;
}
