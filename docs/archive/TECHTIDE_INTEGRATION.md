# Shannon TechTide Integration Guide

**Status**: ✅ Integration Complete  
**Date**: February 9, 2026  
**Integration Pattern**: HTTP-based loose coupling (consistent with TechTide architecture)

---

## Overview

Shannon is now fully integrated into the TechTide ecosystem as an independent security testing service with its own Claude Code-inspired web UI.

```
┌──────────────────────────────────────────────────────────────┐
│                   TechTide Ecosystem                         │
│                                                              │
│  TechTide Dashboard (3000) ──┐                              │
│                               ├──> Molten Gateway (18789)    │
│  Shannon UI (4005) ───────────┘         │                    │
│      │                                   ├─> Mastra (7080)   │
│      │                                   ├─> LangGraph (7081)│
│      │                                   └─> Shannon (4005)  │
│      │                                                        │
│      └──> Temporal Engine (7233) ──> 13 Pentest Agents       │
│                                                              │
└──────────────────────────────────────────────────────────────┘
```

## Ports Assigned

| Service | Port | Protocol | Description |
|---------|------|----------|-------------|
| Shannon UI + API | 4005 | HTTP | Web dashboard + REST endpoints |
| Shannon WebSocket | 4006 | WS | Real-time progress streaming |
| Temporal gRPC | 7233 | gRPC | Docker-internal (not exposed to host) |
| Temporal Dev UI | 8233 | HTTP | Developer workflow debugging |

## Integration Points

### 1. Molten Agent Registry

**Location**: `Molten/agents/configs/shannon.yaml`

Shannon is registered as a security agent in Molten's YAML-driven registry:
- **Domain**: security
- **Framework**: shannon
- **Reports to**: Marc (DevOps Lead)
- **Capabilities**: penetration-testing, vulnerability-analysis, exploit-validation, security-reporting, code-auditing

**Adapter**: `Molten/packages/clawdbot-agent/src/adapters/shannon_adapter.ts`

The Shannon adapter implements `IAgentExecutor` and routes pentest requests to Shannon's API at port 4005.

### 2. TechTide Dashboard Integration

**Location**: `techtide-dashboard/src/lib/constants.ts`

Shannon appears as a service card in the TechTide Dashboard:
- **Icon**: Shield (orange)
- **Health Check**: http://localhost:4005/health
- **Deep Link**: Click the Shannon card to open the full Shannon UI in a new tab

**Color Indicator**: The status dot matches Shannon's state (orange=idle, red=working, green=complete).

### 3. Marc's Security Auditor Enhancement

**Location**: `Molten/agents/langgraph/src/agents/security_auditor.py`

Marc's Security Auditor now has a `delegate_to_shannon` node in its LangGraph pipeline:
- **Static Analysis**: Security Auditor performs SAST, dependency scanning, config audits
- **Dynamic Testing**: Delegates to Shannon for active exploitation via HTTP POST to `/api/pentest/start`
- **Unified Reporting**: Merges static + dynamic findings into comprehensive security posture report

### 4. Bobby's Security Pentester (Delegation Layer)

**Location**: `Molten/agents/clawd/security-pentester/AGENT.md`

Bobby's team has a delegation agent for Shannon coordination:
- Code Reviewer can invoke Shannon before PRs are merged
- Backend Engineer can request security validation for new endpoints
- Results stored in Molten memory (security namespace)

### 5. Docker Compose Unified

**Location**: `Apps/docker-compose.unified.yml`

Shannon service added to the unified Docker Compose:
- Depends on PostgreSQL
- Exposes ports 4005, 4006, 8233
- Connected to `techtide` network
- Health check at `/health`

### 6. PM2 Ecosystem

**Location**: `Apps/ecosystem.config.cjs`

Shannon UI server added to PM2 config for local development:
- **Name**: shannon-ui
- **Script**: bun run server.ts
- **CWD**: `/mnt/c/TechTide/Apps/shannon/ui`

### 7. Environment Configuration

**Locations**:
- `Molten/.env.ports` - Port registry
- `Apps/.env.shared` - Shared environment template
- `Molten/.env.example` - Molten-specific example

Shannon URLs added to all shared configs.

### 8. Health Monitoring

Shannon is monitored in two places:

1. **Molten Gateway** (`dashboard/gateway-server.ts`)
   - Includes Shannon in cross-repo connectivity health checks
   - Exposed via `/health` endpoint

2. **Validation Script** (`scripts/verify-contracts.ps1`)
   - Port conflict detection (4005, 4006, 8233)
   - Health endpoint check (http://localhost:4005/health)

---

## Shannon UI Architecture

### UI Server (`ui/server.ts`)

Bun + Hono HTTP server serving both static UI and REST API:

**API Endpoints**:
- `GET /` - Serve Shannon UI (index.html)
- `GET /health` - Health status for ecosystem monitoring
- `GET /api/status` - Service status + active workflow count
- `POST /api/pentest/start` - Start new pentest
- `GET /api/pentest/:id/progress` - Query workflow progress
- `GET /api/pentest/history` - List past pentests
- `GET /api/pentest/:id/report` - Fetch completed report

### WebSocket Server (`ui/ws_server.ts`)

Dedicated WebSocket server on port 4006:
- Polls Temporal `getProgress` query every 2 seconds
- Tails `audit-logs/{id}/workflow.log` for new lines
- Streams to connected browsers:
  - `{ type: 'progress', data: PipelineProgress }`
  - `{ type: 'log', line: '...' }`
  - `{ type: 'phase_change', phase: '...', agent: '...' }`
  - `{ type: 'complete' }` or `{ type: 'failed' }`

### Temporal Bridge (`ui/temporal_bridge.ts`)

Thin wrapper around `@temporalio/client`:
- Connects to Temporal at port 7233
- Starts workflows (mirrors `src/temporal/client.ts`)
- Queries `getProgress` for any workflow ID
- Lists workflows via Temporal visibility API

### Frontend (`ui/public/`)

Vanilla HTML/CSS/JS (no framework):
- **index.html** - Single-page layout
- **styles.css** - Claude Code aesthetic + orange/red pulsating animations
- **app.js** - WebSocket client, terminal renderer, pipeline visualization

**State Machine**:
```
Idle (orange, 2s pulse) 
  → Starting (orange flash) 
  → Running (red, 0.8s pulse) 
  → Complete (green, no pulse) | Failed (deep red)
```

**Pipeline Visualization**: Renders all 13 agents as a DAG:
```
pre-recon -> recon -> [ inj-vuln -> inj-exploit
                        xss-vuln -> xss-exploit
                        auth-vuln -> auth-exploit
                        ssrf-vuln -> ssrf-exploit
                        authz-vuln -> authz-exploit ] -> report
```

Each node color reflects agent state:
- Grey = pending
- Orange (pulsing) = running (vuln analysis)
- Red (fast pulse) = exploiting
- Green = complete
- Dark red = failed

---

## Using Shannon

### From TechTide Dashboard

1. Open http://localhost:3000
2. Locate the Shannon service card (orange Shield icon)
3. Click the card to open Shannon UI in a new tab
4. Enter target URL and repository path
5. Click "START PENTEST"
6. Watch the orange-to-red pulsating UI as Shannon works

### From Molten Gateway API

```bash
curl -X POST http://localhost:18789/api/agents/execute \
  -H "Content-Type: application/json" \
  -d '{
    "agent_id": "shannon-pentester",
    "task": {
      "id": "pentest-001",
      "name": "Security Audit",
      "input": {
        "url": "https://staging.example.com",
        "repoPath": "/path/to/source",
        "config": "./configs/example-config.yaml"
      }
    }
  }'
```

Returns:
```json
{
  "workflowId": "shannon-1234567890",
  "ui_url": "http://localhost:4005",
  "progress_url": "http://localhost:4005/api/pentest/shannon-1234567890/progress"
}
```

### From Marc's Security Auditor

Marc's LangGraph Security Auditor automatically delegates to Shannon when active pentesting is required:

```python
# In security_auditor.py workflow
task = {
    "task": "Perform penetration test on staging environment",
    "scope": {
        "target_url": "https://staging.example.com",
        "repo_path": "/mnt/c/TechTide/Apps/MyApp"
    }
}

# Security Auditor detects "penetration test" keyword
# -> Calls delegate_to_shannon() node
# -> HTTP POST to Shannon API
# -> Returns workflow ID in state["shannon_workflow_id"]
```

### Direct Shannon CLI

```bash
cd c:\TechTide\Apps\shannon
./shannon start URL=https://example.com REPO=/path/to/repo
./shannon logs ID=shannon-1234567890
./shannon query ID=shannon-1234567890
```

---

## File Structure Created

```
c:\TechTide\Apps\shannon\
  # Cloned from GitHub
  ├── src/                    # Shannon core agents
  ├── docker-compose.yml      # Temporal + worker containers
  ├── Dockerfile              # Shannon worker image
  ├── .env                    # Environment config (created)
  
  # NEW: Shannon UI (created by integration)
  └── ui/
      ├── server.ts           # Bun + Hono HTTP server
      ├── ws_server.ts        # WebSocket server
      ├── temporal_bridge.ts  # Temporal client wrapper
      ├── public/
      │   ├── index.html      # Shannon web UI
      │   ├── styles.css      # Dark theme + orange/red pulse
      │   ├── app.js          # Frontend logic
      │   └── fonts/          # JetBrains Mono (self-hosted)
      ├── package.json
      ├── tsconfig.json
      └── README.md
```

## Files Modified in Other Repos

### Molten
- `agents/configs/shannon.yaml` - Agent registry config
- `agents/clawd/security-pentester/AGENT.md` - Delegation agent
- `packages/clawdbot-agent/src/adapters/shannon_adapter.ts` - HTTP adapter
- `packages/clawdbot-agent/src/adapters/index.ts` - Export Shannon adapter
- `packages/clawdbot-agent/src/interfaces/agent.ts` - Add "shannon" to AgentFramework type
- `dashboard/gateway-server.ts` - Add Shannon health check + adapter
- `agents/langgraph/src/agents/security_auditor.py` - Shannon delegation node
- `AGENTS.md` - Shannon documentation section
- `.env.example` - Shannon URLs
- `.env.ports` - Shannon port assignments

### Apps Root
- `.env.shared` - Shannon environment variables
- `docker-compose.unified.yml` - Shannon service
- `ecosystem.config.cjs` - Shannon PM2 entry
- `scripts/verify-contracts.ps1` - Shannon port + health checks
- `QUICKSTART.md` - Shannon setup steps
- `TECHTIDE_INTEGRATION.md` - Shannon project description

### TechTide Dashboard
- `src/lib/constants.ts` - Shannon service entry
- `src/app/page.tsx` - Shannon icon + deep link
- `src/components/dashboard/status-card.tsx` - Clickable URL support

---

## Next Steps

### 1. Test Shannon UI (Local)

```bash
# Terminal 1: Start Temporal + Shannon worker (Docker)
cd c:\TechTide\Apps\shannon
docker compose up -d

# Terminal 2: Start Shannon UI server (Bun)
cd c:\TechTide\Apps\shannon\ui
bun run dev

# Browser: Open Shannon UI
start http://localhost:4005
```

Verify:
- UI loads with orange pulsating status badge
- Can enter target URL and repo path
- Start button is enabled
- WebSocket connects (check browser console)

### 2. Test Shannon Pentest (End-to-End)

**Prerequisites**:
- Add `ANTHROPIC_API_KEY` to `shannon/.env`
- Have a test application ready (NOT production)
- Have the source code repository path

**Run a test pentest**:
```bash
cd c:\TechTide\Apps\shannon
./shannon start URL=http://localhost:8080/test-app REPO=c:\path\to\test-repo
```

Monitor progress:
- **Shannon UI**: http://localhost:4005 (watch pipeline nodes turn orange -> red -> green)
- **Temporal UI**: http://localhost:8233 (workflow execution details)
- **Terminal**: `./shannon logs ID=shannon-xxx`

Expected duration: 60-90 minutes  
Expected cost: $40-60 USD (Claude Sonnet 4.5)

### 3. Test TechTide Dashboard Integration

```bash
# Start all TechTide services
cd c:\TechTide\Apps
docker compose -f docker-compose.unified.yml up -d

# Wait 60 seconds for initialization
Start-Sleep 60

# Validate all services
.\scripts\verify-contracts.ps1 -All

# Open dashboard
start http://localhost:3000
```

Verify:
- Shannon service card appears (orange Shield icon)
- Status shows "Online" with latency
- Clicking Shannon card opens http://localhost:4005 in new tab

### 4. Test Agent Delegation

**From Marc's Security Auditor**:

```python
# This happens automatically when Security Auditor detects pentest keywords
from agents.langgraph.src.agents.security_auditor import create_security_auditor

auditor = create_security_auditor()
result = auditor.invoke({
    "task": "Perform penetration test on staging API",
    "scope": {
        "target_url": "https://staging-api.example.com",
        "repo_path": "/mnt/c/TechTide/Apps/MyApp"
    }
})

# Result includes:
# - shannon_workflow_id
# - shannon_results with UI URL
```

**From Molten Gateway API**:

```bash
curl -X POST http://localhost:18789/api/agents/execute \
  -H "Content-Type: application/json" \
  -d '{
    "agent_id": "shannon-pentester",
    "task": {
      "input": {
        "url": "https://staging.example.com",
        "repoPath": "/path/to/source"
      }
    }
  }'
```

### 5. Install Dependencies and Build

Shannon UI dependencies are already installed via `bun install`.

To rebuild Shannon worker containers:
```bash
cd c:\TechTide\Apps\shannon
docker compose build
```

---

## Configuration Files

### Shannon UI Environment (`shannon/ui/.env`)

Create if running UI server standalone:
```bash
SHANNON_PORT=4005
SHANNON_WS_PORT=4006
TEMPORAL_ADDRESS=localhost:7233
```

### Shannon Core Environment (`shannon/.env`)

Already created from `.env.example`. Add your API key:
```bash
ANTHROPIC_API_KEY=sk-ant-api03-YOUR_KEY_HERE
CLAUDE_CODE_MAX_OUTPUT_TOKENS=64000
```

---

## Shannon UI Features

### Visual Design
- **Claude Code aesthetic**: Dark near-black background (`#0A0A0A`), JetBrains Mono font
- **Pulsating identity**: Orange (`#FF6B00`) idle state with 2-second pulse; shifts to bright red (`#FF0000`) with 0.8-second pulse when working
- **Terminal-first layout**: No distracting UI chrome, focus on the pentest output
- **Real-time pipeline DAG**: All 13 agents visualized with live color updates

### Terminal Panel
- Auto-scrolling monospace output (5000-line buffer)
- Color-coded log lines:
  - Phase headers: Orange
  - Findings: Red
  - Completion: Green
  - Errors: Dark red
- Timestamp prefix on each line
- Click-to-copy individual lines
- Scroll lock toggle (pause auto-scroll to read)

### Metrics Bar
- **Elapsed**: Real-time duration since pentest started
- **Agents**: X/13 agents completed
- **Cost**: Total USD spent (aggregated from agent metrics)
- **Turns**: Total conversation turns across all agents

---

## Memory Integration

Shannon findings are stored in Molten's unified memory system:

**Namespace**: `security`  
**Tier**: `long_term` (permanent storage, 1% decay)

**Store a finding**:
```javascript
const { createMemoryClient } = require('../../core/memory-client');
const memory = createMemoryClient('shannon-pentester');

await memory.store(
  `Critical: SQL injection in /api/users endpoint - Full DB exfil possible`,
  {
    type: 'vulnerability',
    tier: 'long_term',
    namespace: 'security',
    importance: 1.0
  }
);
```

**Query past findings**:
```javascript
const results = await memory.search('SQL injection', {
  limit: 10,
  mode: 'hybrid',
  tier: 'long_term'
});
```

---

## Troubleshooting

### Shannon UI Won't Start

```bash
# Check if port 4005 is already in use
netstat -an | findstr "4005"

# Check Bun installation
bun --version

# Reinstall dependencies
cd c:\TechTide\Apps\shannon\ui
rm -rf node_modules bun.lock
bun install
```

### WebSocket Connection Failed

```bash
# Check if WebSocket server is running
netstat -an | findstr "4006"

# Check browser console for connection errors
# Ensure SHANNON_WS_PORT=4006 in .env
```

### Temporal Connection Error

```bash
# Check if Temporal container is running
docker compose ps

# Check Temporal health
docker compose exec temporal temporal operator cluster health --address localhost:7233

# Restart Temporal
docker compose restart temporal
```

### Shannon Can't Find Workflow Logs

Shannon stores logs in `audit-logs/{hostname}_{workflowId}/workflow.log`. If logs aren't streaming:

1. Check if audit-logs directory exists and is writable
2. Verify the workflow is actually running (check Temporal UI at port 8233)
3. Check Shannon worker logs: `docker compose logs worker`

---

## Security Considerations

### Shannon is NOT for Production

⚠️ **CRITICAL**: Shannon performs active exploitation attacks. Never point it at production environments.

Acceptable targets:
- Local development environments
- Staging environments (isolated from production data)
- Sandboxed test environments
- Intentionally vulnerable test apps (OWASP Juice Shop, crAPI, etc.)

### API Key Security

Shannon requires an Anthropic API key with access to Claude Sonnet 4.5. Estimated cost per full pentest: $40-60 USD.

- Store API key in `shannon/.env` (never commit)
- Never expose Shannon API publicly (port 4005 should be localhost-only)
- Rotate API keys regularly
- Monitor usage via Anthropic Console

### Report Storage

Shannon stores all exploit evidence in `audit-logs/`:
- Reports contain sensitive vulnerability details
- Proof-of-Concept exploits may include actual payloads
- Mark reports as confidential
- Store in secure location, not public repos
- Add `audit-logs/` to `.gitignore`

---

## Performance Benchmarks

Shannon has achieved **96.15% success rate** on the XBOW benchmark.

**Typical Pentest Metrics**:
- Duration: 60-90 minutes
- Cost: $40-60 USD
- Agents: 13 total
- Turns: 150-300 (varies by app complexity)
- Token usage: ~2-3M tokens (input + output combined)

**Sample Results** (from OWASP Juice Shop):
- 20+ critical vulnerabilities found
- 100% exploitable (no false positives)
- Complete auth bypass + DB exfiltration
- Full privilege escalation
- SSRF for internal network recon

---

## References

- **Shannon GitHub**: https://github.com/Alexi5000/shannon
- **Shannon UI**: http://localhost:4005
- **Temporal UI**: http://localhost:8233
- **TechTide Dashboard**: http://localhost:3000
- **Molten Gateway**: http://localhost:18789
- **Molten AGENTS.md**: Comprehensive agent index
- **Shannon AGENT.md**: Delegation agent definition

---

## Support

For Shannon-specific issues:
- Shannon GitHub Issues: https://github.com/Alexi5000/shannon/issues
- Shannon Discord: (via Keygraph)

For TechTide integration issues:
- Check Molten agent registry: http://localhost:18789/api/agents
- Verify health: `.\scripts\verify-contracts.ps1 -HealthCheck`
- Review logs: `docker compose logs shannon`
