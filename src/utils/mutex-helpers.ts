// file: src/utils/mutex-helpers.ts
// description: Helper to run async code under session mutex (lock/unlock in one call)
// reference: src/utils/concurrency.ts, src/audit/audit-session.ts

import { SessionMutex } from './concurrency.js';

const session_mutex = new SessionMutex();

/**
 * Run an async function while holding the session mutex for the given sessionId.
 * Lock is always released in a finally block.
 */
export async function with_mutex<T>(session_id: string, fn: () => Promise<T>): Promise<T> {
  const unlock = await session_mutex.lock(session_id);
  try {
    return await fn();
  } finally {
    unlock();
  }
}
