# Shannon UI - Autonomous AI Pentester Dashboard

Claude Code-inspired web interface for Shannon with real-time workflow visualization.

## Features

- **Dark terminal aesthetic** - Near-black background, JetBrains Mono font, minimal chrome
- **Orange-to-red pulsating theme** - Orange idle state (2s pulse) shifts to red when working (0.8s pulse)
- **13-agent pipeline visualization** - Real-time DAG rendering of pentest phases
- **Live terminal output** - Auto-scrolling log stream with color-coded findings
- **WebSocket streaming** - Real-time progress updates from Temporal workflows
- **Metrics dashboard** - Elapsed time, agent progress, cost, and turn count

## Tech Stack

- **Server**: Bun + Hono (port 4005)
- **WebSocket**: ws library (port 4006)
- **Temporal Client**: @temporalio/client SDK
- **Frontend**: Vanilla HTML/CSS/JS (no React)
- **Font**: JetBrains Mono (self-hosted)

## Setup

```bash
cd shannon/ui
bun install
```

## Development

```bash
# Start UI server (also starts WebSocket server)
bun run dev

# Build for production
bun run build
bun run start
```

The UI will be available at:
- **Web UI**: http://localhost:4005
- **WebSocket**: ws://localhost:4006

## Environment Variables

Create `.env` in `shannon/ui/`:

```bash
SHANNON_PORT=4005
SHANNON_WS_PORT=4006
TEMPORAL_ADDRESS=localhost:7233
```

## API Endpoints

| Endpoint | Method | Description |
|----------|--------|-------------|
| `/` | GET | Serve Shannon UI |
| `/health` | GET | Health status (for TechTide ecosystem) |
| `/api/status` | GET | Service status + active workflow count |
| `/api/pentest/start` | POST | Start a new pentest |
| `/api/pentest/:id/progress` | GET | Query workflow progress |
| `/api/pentest/history` | GET | List past pentests |
| `/api/pentest/:id/report` | GET | Fetch completed report |

## WebSocket Protocol

**Subscribe to workflow:**
```javascript
ws.send(JSON.stringify({
  type: 'subscribe',
  workflowId: 'shannon-1234567890'
}));
```

**Server messages:**
- `{ type: 'progress', data: PipelineProgress }` - Progress update every 2s
- `{ type: 'log', line: '...' }` - New log line
- `{ type: 'phase_change', phase: '...', agent: '...' }` - Phase transition
- `{ type: 'complete', reportPath: '...' }` - Workflow complete
- `{ type: 'failed', error: '...' }` - Workflow failed

## Color System

- Background: `#0A0A0A` (near-black)
- Panels: `#111111` with `#1a1a1a` borders
- Text: `#E0E0E0` (primary), `#666666` (secondary)
- Accent IDLE: `#FF6B00` (orange, 2s pulse)
- Accent WORKING: `#FF0000` (red, 0.8s pulse)
- Accent COMPLETE: `#00CC66` (green, no pulse)
- Accent ERROR: `#CC0000` (deep red, no pulse)

## Integration with TechTide

The Shannon UI is independent but connected:
- TechTide Dashboard (port 3000) links to Shannon UI and monitors health
- Molten Gateway (port 18789) includes Shannon in agent registry
- Marc's Security Auditor delegates active pentesting to Shannon
- Results feed into Molten memory system (security namespace)

## Directory Structure

```
shannon/ui/
  server.ts          # Main HTTP server (Hono + Bun)
  ws_server.ts       # WebSocket server for real-time streaming
  temporal_bridge.ts # Temporal client wrapper
  public/
    index.html       # Main UI page
    styles.css       # Dark theme + pulsating animations
    app.js           # Frontend logic (WebSocket client, pipeline viz)
    fonts/           # JetBrains Mono (self-hosted)
  package.json
  tsconfig.json
  README.md
```

## Usage

1. Ensure Shannon's Temporal + worker containers are running:
   ```bash
   cd ../
   ./shannon start URL=https://example.com REPO=/path/to/repo
   ```

2. Start the UI server (separate process):
   ```bash
   cd ui
   bun run dev
   ```

3. Open http://localhost:4005 in your browser

4. Enter target URL and repository path

5. Click "START PENTEST" and watch Shannon work in real-time

## Notes

- Shannon UI polls Temporal's `getProgress` query every 2 seconds
- Terminal output is tailed from `audit-logs/{id}/workflow.log`
- Pipeline nodes update colors based on agent status
- Orange glow indicates analysis phase, red glow indicates active exploitation
- Maximum terminal scrollback: 5000 lines
