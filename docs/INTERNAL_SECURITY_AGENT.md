# Shannon as Internal Security Agent

Shannon acts as the TechTide internal security agent: it keeps systems safe and watches for security threats.

## Molten Memory Integration

- **Namespace**: `security`
- **Bridge**: `src/integrations/molten-memory-bridge.ts` pushes workflow completion and vulnerability findings to Molten memory.
- **Wiring**: `logWorkflowComplete` in `src/temporal/activities.ts` calls `push_workflow_results()` after each pentest so that:
  - Workflow summaries (status, duration, cost, agent count) are stored in the `security` namespace.
  - Extracted findings from the report are ingested for later retrieval by Axel and other agents.

Set `MOLTEN_MEMORY_API_URL=http://localhost:18790/api/memories` (Molten Bun Gateway) so the bridge can reach the memory API.

## Target Allowlist

`configs/target-allowlist.json` includes:

- Localhost and 127.0.0.1 for development.
- A historical techtideai.io entry retained for audit; production blocking prevents execution.
- Internal stack URLs (4001 DevENV Kanban, 4002 OrcaFlow, 4003 DevENV ORCA, 18790 Molten Gateway) for internal security scans.

Only targets on the allowlist can be tested. Entries with a configured token require an exact token match, including localhost entries. Production URLs are blocked when `production_block_enabled` is true.

## Scheduled Internal Scans

To run periodic internal pentests (e.g. weekly):

1. Use Temporal's schedule API to start `pentestPipelineWorkflow` on a cron (e.g. `0 0 * * 0` for weekly Sunday midnight).
2. In `src/temporal/client.ts` (or a separate scheduler script), create a schedule that invokes the workflow with internal targets from the allowlist (e.g. `http://localhost:18790`, `http://localhost:4002`).
3. Ensure the Temporal worker is running so scheduled workflows execute.

Example (pseudocode) for adding a schedule via Temporal CLI or SDK:

```ts
// Create schedule: run pentest every Sunday 00:00
await client.workflow.start({
  workflowId: 'shannon-internal-weekly',
  taskQueue: 'shannon',
  workflowType: pentestPipelineWorkflow,
  args: [{ webUrl: 'http://localhost:18790', repoPath: null }],
  cronSchedule: '0 0 * * 0',
});
```

## Dashboard and Control Plane

- **Shannon status**: `GET http://localhost:4005/api/status` (or `GET http://localhost:4005/health`).
- **Recent findings**: Query Molten memory `security` namespace via `GET http://localhost:18790/api/memories/search?namespace=security` (or from the techtide-dashboard Security tab when implemented).
- **Trigger from Axel**: Bobby's Security Pentester and Marc's Security Auditor delegate to Shannon via the Molten Gateway adapter; see `docs/SHANNON_INTEGRATION.md` in the Molten repo.
