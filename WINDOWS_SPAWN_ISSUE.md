# Shannon Windows Spawn Issue - Root Cause Analysis

**Date:** 2026-02-12  
**Status:** ❌ BLOCKED - Claude Agent SDK incompatible with Windows subprocess spawning  
**Severity:** Critical - Shannon cannot execute pentests on Windows

---

## Problem Summary

The `@anthropic-ai/claude-agent-sdk` package cannot spawn subprocesses on Windows, preventing Shannon from executing any pentest agents. Multiple approaches attempted, all failed.

## Root Cause

The SDK uses `child_process.spawn()` to launch a Node.js subprocess running `cli.js`. On Windows, this fails with various `ENOENT` errors depending on the spawn configuration:

| Spawn Config | Error | Reason |
|--------------|-------|--------|
| `spawn("node", ...)` | `spawn node ENOENT` | Windows can't resolve "node" via PATH without shell |
| `spawn("node", ..., { shell: true })` | `spawn C:\Windows\system32\cmd.exe ENOENT` | Can't locate cmd.exe (permissions/context issue) |
| `spawn("C:\\Program Files\\nodejs\\node.exe", ...)` | `spawn C:\Program Files\nodejs\node.exe ENOENT` | Spaces in path break spawn without shell |
| `spawn("C:\\PROGRA~1\\nodejs\\node.exe", ...)` | Not tested | Would require modifying process.execPath |

## Attempted Fixes

### 1. ✅ Worker PATH Fix
**File:** `src/temporal/worker.ts`  
**Change:** Set `process.env.PATH` to include Node.js directory globally  
**Result:** ✅ Successfully applied, but didn't fix SDK spawn

### 2. ✅ Executor ENV Fix
**File:** `src/ai/claude-executor.ts`  
**Change:** Pass explicit `env` with PATH to SDK `query()` call  
**Result:** ✅ Successfully applied, but didn't fix SDK spawn

### 3. ✅ SDK Shell Patch  
**File:** `node_modules/@anthropic-ai/claude-agent-sdk/sdk.mjs`  
**Change:** Added `shell: true` to spawn options  
**Result:** ❌ Changed error from "spawn node" to "spawn cmd.exe"

### 4. ✅ SDK Absolute Path Patch
**File:** `node_modules/@anthropic-ai/claude-agent-sdk/sdk.mjs`  
**Change:** Use `process.execPath` instead of `"node"`  
**Result:** ❌ Spaces in path cause ENOENT

### 5. ✅ SDK COMSPEC Shell Patch
**File:** `node_modules/@anthropic-ai/claude-agent-sdk/sdk.mjs`  
**Change:** Use `process.env.COMSPEC` for shell path  
**Result:** ❌ Still can't find cmd.exe

## Test Results

Direct SDK test (`test-sdk-spawn.mjs`) consistently fails:

```
Error: Failed to spawn Claude Code process: spawn C:\Windows\system32\cmd.exe ENOENT
```

This proves the issue is in the SDK itself, not in Shannon's integration code.

---

## Solutions

### Option 1: Use WSL2 for Shannon Worker (Recommended)

Run the Shannon Temporal worker in WSL2 instead of native Windows:

**Pros:**
- Linux subprocess spawning works correctly
- Native Docker integration
- Better performance for Claude CLI

**Cons:**
- Requires WSL2 setup
- File I/O slower for Windows paths (/mnt/c/...)

**Implementation:**
```bash
# In WSL2
cd ~/shannon  # or /mnt/c/TechTide/Apps/shannon
npm run temporal:worker
```

### Option 2: Replace Claude Agent SDK

Use Anthropic API directly instead of the agent SDK:

**Pros:**
- No subprocess spawning required
- More control over execution
- Platform-independent

**Cons:**
- Requires reimplementing MCP server integration
- Requires manual tool execution logic
- More complex codebase

**Estimated Effort:** 3-5 days of development

### Option 3: Use Claude Desktop App API

Integrate with Claude Desktop app via its API:

**Pros:**
- Native Windows support
- UI for debugging
- Managed by Anthropic

**Cons:**
- Requires Claude Desktop installation
- May have rate limits
- Less automation control

**Estimated Effort:** 1-2 days of development

### Option 4: Containerize Everything

Run Shannon entirely in Docker (not just Temporal):

**Pros:**
- Consistent Linux environment
- Easy deployment
- Works on any OS

**Cons:**
- Slower file I/O for repos
- More complex setup
- Docker-in-Docker for browser testing

**Estimated Effort:** 2-3 days of development

---

## Recommended Path Forward

**Immediate (Today):**
1. Run Shannon worker in WSL2
2. Test end-to-end pentest execution
3. Document WSL2 setup in README

**Short-term (This Week):**
1. Create Docker Compose setup for entire Shannon stack
2. Test Docker deployment
3. Update deployment scripts

**Long-term (Next Sprint):**
1. Evaluate replacing Claude Agent SDK with direct API
2. Implement if benefits outweigh costs
3. Maintain both paths for flexibility

---

## Files Modified (Can be Reverted)

| File | Purpose | Status |
|------|---------|--------|
| `src/temporal/worker.ts` | PATH initialization | ✅ Keep (useful for WSL2 too) |
| `src/ai/claude-executor.ts` | ENV passing | ✅ Keep (doesn't hurt) |
| `node_modules/@anthropic-ai/claude-agent-sdk/sdk.mjs` | Multiple spawn patches | ⚠️ Revert or keep for reference |
| `test-sdk-spawn.mjs` | SDK test script | 🗑️ Can delete after WSL2 test |

---

## Next Steps

1. **Test in WSL2:** Verify Shannon works correctly in Linux environment
2. **Document Setup:** Create WSL2 setup guide for team  
3. **Update Scripts:** Modify start scripts to detect OS and recommend WSL2 on Windows
4. **Issue Tracking:** File issue with @anthropic-ai/claude-agent-sdk maintainers

---

## Contact

For questions about this issue, contact the Shannon team or refer to:
- SDK GitHub: https://github.com/anthropics/anthropic-sdk-typescript
- Shannon Docs: `docs/SHANNON_INTEGRATION.md`
- Temporal Docs: `docs/SHANNON_E2E_VERIFICATION.md`
