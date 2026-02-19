// file: src/constants/timeouts.ts
// description: Centralized timeout and heartbeat constants for activities and agent execution
// reference: src/temporal/activities.ts, src/ai/claude-executor.ts

/** Heartbeat interval for Temporal activity (must be less than heartbeatTimeout). */
export const HEARTBEAT_INTERVAL_MS = 2000;

/** Default agent execution timeout (20 minutes). Overridable via SHANNON_AGENT_TIMEOUT_MS. */
export const DEFAULT_AGENT_TIMEOUT_MS = 1_200_000;

/** Heartbeat interval for progress logging when loader is disabled (30s). */
export const PROGRESS_HEARTBEAT_INTERVAL_MS = 30000;
