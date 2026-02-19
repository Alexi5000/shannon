// file: src/utils/session-metadata.ts
// description: Factory for building SessionMetadata from activity/workflow input
// reference: src/audit/utils.ts, src/temporal/activities.ts

import type { SessionMetadata } from '../audit/utils.js';

export interface BuildSessionMetadataOptions {
  workflowId: string;
  webUrl: string;
  repoPath: string;
  outputPath?: string;
}

/**
 * Build session metadata for audit session initialization.
 * Replaces repeated inline object construction in activities and workflow logging.
 */
export function build_session_metadata(options: BuildSessionMetadataOptions): SessionMetadata {
  const { workflowId, webUrl, repoPath, outputPath } = options;
  return {
    id: workflowId,
    webUrl,
    repoPath,
    ...(outputPath && { outputPath }),
  };
}
