# Shannon Worker Fixes Applied

**Date:** 2026-02-12
**Status:** ✅ All fixes implemented and compiled

## Issues Fixed

### 1. ✅ `spawn node ENOENT` Error (Primary Blocker)

**Problem:** Claude Agent SDK subprocess spawn failed on Windows because `child_process.spawn("node", ...)` couldn't locate the Node.js binary.

**Fix Applied:** Modified `src/ai/claude-executor.ts` to pass explicit `env` with Node binary directory prepended to PATH:

```typescript
const nodeDir = path.dirname(process.execPath);
const processEnv = {
    ...process.env,
    PATH: `${nodeDir}${path.delimiter}${process.env.PATH || ''}`,
};
```

**Location:** `dist/ai/claude-executor.js` lines 139-145

**Result:** The SDK subprocess now uses the same Node.js binary that runs the worker.

---

### 2. ✅ Temporal Connection Refused During Startup

**Problem:** Worker started before Docker Temporal was healthy, causing repeated `ConnectionRefused` errors.

**Fix Applied:** Added `waitForTemporal()` health check function in `src/temporal/worker.ts`:

```typescript
async function waitForTemporal(address, maxRetries = 30, intervalMs = 2000) {
    // Polls Temporal server with retries before worker startup
}
```

**Location:** `dist/temporal/worker.js` lines 33-52

**Result:** Worker now waits up to 60 seconds for Temporal to be ready before connecting.

---

### 3. ✅ PowerShell Startup Script

**Problem:** Manual startup commands with `&&` syntax don't work in PowerShell.

**Fix Applied:** Created `scripts/start-shannon.ps1` that orchestrates:
1. Docker Temporal startup
2. Health check polling
3. TypeScript build
4. Worker background launch
5. UI background launch

**Location:** `scripts/start-shannon.ps1`

**Result:** Single-command Shannon stack startup with proper error handling.

---

## Verification

### Build Status
✅ TypeScript compilation successful (npm run build)
✅ Both fixes present in compiled JavaScript:
- `dist/ai/claude-executor.js` contains PATH fix
- `dist/temporal/worker.js` contains health check

### How to Test

**Option 1: Use the new startup script (Recommended)**
```powershell
cd C:\TechTide\Apps\shannon
.\scripts\start-shannon.ps1
```

**Option 2: Manual startup**
```powershell
# Terminal 1: Start Temporal
cd C:\TechTide\Apps\shannon
docker compose up -d temporal

# Terminal 2: Start Worker (after Temporal is ready)
npm run temporal:worker

# Terminal 3: Start UI
cd ui
bun run dev
```

**Option 3: Test from Shannon UI**
1. Open http://localhost:4005
2. Enter a target URL (e.g., http://localhost:3000)
3. Start a pentest
4. Worker should pick up the workflow and execute without `spawn node ENOENT` errors

### Expected Behavior

**Before Fixes:**
- ❌ Worker shows `spawn node ENOENT` in activity execution
- ❌ Workflows fail immediately in pre-recon phase
- ❌ Connection refused spam during startup

**After Fixes:**
- ✅ Worker connects cleanly after Temporal health check
- ✅ Activities execute Claude Code agents successfully
- ✅ Workflows progress through all phases (pre-recon → recon → vuln → exploit → report)

---

## Monitoring

### Worker Logs
Watch terminal 93 (or worker window) for:
- `✓ Temporal server ready at localhost:7233` (health check passed)
- `Shannon worker started` (worker polling)
- Activity execution without spawn errors

### Temporal UI
Check http://localhost:8233 for:
- Workflows in "Running" status progressing through activities
- Activity task completions (not failures)
- No `ApplicationFailure: spawn node ENOENT` in failure details

### Shannon UI
Check http://localhost:4005 for:
- WebSocket progress updates
- Phase transitions showing in real-time
- Final report generation

---

## Rollback Instructions

If issues occur, revert to previous version:

```bash
cd C:\TechTide\Apps\shannon
git checkout HEAD~1 src/ai/claude-executor.ts src/temporal/worker.ts
rm scripts/start-shannon.ps1
npm run build
```

---

## Additional Notes

### Windows PATH Resolution
The `spawn node ENOENT` fix works by ensuring the SDK subprocess inherits a PATH that explicitly includes the Node.js binary directory. This is more reliable than relying on Windows' PATH search mechanism in spawned processes.

### Temporal Health Check
The 30-retry × 2-second interval (60s total) matches the typical Docker Temporal startup time. Adjust `maxRetries` in `worker.ts` if needed for slower systems.

### PowerShell Script Compatibility
The startup script requires PowerShell 5.1+ (included in Windows 10+). For PowerShell Core (pwsh), the shebang line enables cross-platform compatibility.

---

**Next Steps:**
1. Test a full pentest workflow end-to-end
2. Monitor worker stability over multiple workflows
3. Verify all 13 Shannon agents execute without errors
