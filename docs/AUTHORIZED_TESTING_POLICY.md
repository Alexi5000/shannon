# Shannon Authorized Testing Policy

**Effective Date**: February 11, 2026  
**Document Version**: 1.0  
**Owner**: TechTide Security Team

---

## Purpose

This document establishes the authorized testing policy for Shannon, TechTide's autonomous AI penetration testing system. Shannon performs active exploitation attacks and must only operate on explicitly authorized targets under controlled conditions.

---

## Authorized Testing Scope

### ✅ AUTHORIZED Targets

Shannon MAY be used on:

1. **Local Development Environments**
   - localhost / 127.0.0.1
   - Internal development VMs
   - Personal dev machines

2. **Staging Environments**
   - staging.*, *-staging.*, *.staging.*
   - Requires explicit authorization token
   - Must be listed in `configs/target-allowlist.json`

3. **QA and Sandbox Environments**
   - qa.*, sandbox.*, test.*
   - Isolated from production data
   - Explicit authorization required

4. **Intentionally Vulnerable Applications**
   - OWASP Juice Shop
   - crAPI (Completely Ridiculous API)
   - DVWA (Damn Vulnerable Web Application)
   - Local pentest practice labs

### ❌ PROHIBITED Targets

Shannon MUST NOT be used on:

1. **Production Environments**
   - Any live customer-facing application
   - Production APIs serving real users
   - Production databases with real data

2. **Unauthorized Third-Party Sites**
   - Competitor websites
   - Public websites without written permission
   - Any site not owned/controlled by TechTide

3. **Critical Infrastructure**
   - Payment processing systems (unless isolated test environment)
   - Healthcare systems with PHI
   - Financial systems with real accounts

---

## Authorization Requirements

### Allowlist Configuration

All authorized targets must be registered in `configs/target-allowlist.json`:

```json
{
  "url": "https://staging.example.com",
  "authorized_by": "security-lead",
  "authorization_token": "unique-token-here",
  "expires_at": "2026-12-31T23:59:59.000Z",
  "scope": "staging",
  "notes": "Quarterly security audit"
}
```

### Required Fields

- `url`: Target URL or pattern
- `authorized_by`: Person/team granting authorization
- `authorization_token`: Unique token for this authorization
- `expires_at`: ISO 8601 expiration timestamp
- `scope`: One of: `dev`, `staging`, `qa`, `sandbox`

### Authorization Token Usage

Include token in pentest requests:

```bash
curl -X POST http://localhost:4005/api/pentest/start \
  -H "Content-Type: application/json" \
  -d '{
    "url": "https://staging.example.com",
    "authorizationToken": "shannon-staging-2026"
  }'
```

---

## Safety Controls

### 1. Production Blocking

Shannon automatically blocks URLs that appear to be production:

- No `staging|dev|qa|sandbox|test|local` in hostname
- Matches `api.domain.com` without staging prefix
- Heuristic detection of production patterns

**Override**: Not allowed. Production testing requires separate approval process.

### 2. Emergency Stop

Immediately terminate all or specific workflows:

```bash
# Stop all workflows
curl -X POST http://localhost:4005/api/pentest/emergency-stop \
  -H "Content-Type: application/json" \
  -d '{ "reason": "Incident detected" }'

# Stop specific workflow
curl -X POST http://localhost:4005/api/pentest/emergency-stop \
  -H "Content-Type: application/json" \
  -d '{
    "workflowId": "shannon-1234567890",
    "reason": "Target became unstable"
  }'
```

### 3. Audit Logging

All authorization decisions and pentest activity logged:

- Target authorization checks → `audit-logs/{workflow}/authorization.log`
- Workflow events → `audit-logs/{workflow}/workflow.log`
- Agent actions → `audit-logs/{workflow}/agent-{name}.log`

### 4. Scope Enforcement

Each authorization has a scope (`dev`, `staging`, `qa`, `sandbox`). Shannon respects scope limitations and will not escalate beyond authorized boundaries.

---

## Red-Team Mode

Shannon's "red-team mode" means:

- **Aggressive Testing**: No artificial limitations on exploit techniques
- **Full OWASP Coverage**: Tests all vulnerability categories
- **Proven Exploits**: Only reports what can be actively exploited
- **Realistic Attack Scenarios**: Mimics real attacker behavior

Red-team mode does NOT mean:

- ❌ Testing without authorization
- ❌ Bypassing safety controls
- ❌ Ignoring scope boundaries
- ❌ Unlimited resource consumption

---

## Compliance and Legal

### Legal Authorization

Before adding a target to the allowlist:

1. **Written Authorization**: Obtain written permission from system owner
2. **Scope Definition**: Define exact URLs/endpoints authorized for testing
3. **Timing Agreement**: Agree on testing windows if applicable
4. **Notification Protocol**: Establish incident notification procedures

### Documentation Requirements

For each authorized target:

- Authorization letter (stored in `audit-logs/authorizations/`)
- Scope document
- Contact information for emergency escalation
- Expiration date (max 90 days recommended)

### Incident Response

If Shannon causes unintended impact:

1. **Immediate Stop**: Use emergency stop endpoint
2. **Notify Owner**: Contact system owner immediately
3. **Document Incident**: Record what happened in incident log
4. **Review Controls**: Assess why controls didn't prevent the issue

---

## Example Usage Patterns

### Authorized Staging Pentest

```bash
# 1. Add to allowlist (configs/target-allowlist.json)
# 2. Start pentest with authorization token
curl -X POST http://localhost:4005/api/pentest/start \
  -d '{
    "url": "https://staging.myapp.com",
    "repoPath": "/path/to/source",
    "authorizationToken": "staging-auth-token-2026",
    "mode": "white_box"
  }'
```

### Local Development Testing

```bash
# Local targets auto-authorized
curl -X POST http://localhost:4005/api/pentest/start \
  -d '{
    "url": "http://localhost:3000",
    "mode": "black_box"
  }'
```

### Emergency Stop During Testing

```bash
# If target becomes unstable or incident occurs
curl -X POST http://localhost:4005/api/pentest/emergency-stop \
  -d '{
    "workflowId": "shannon-1234567890",
    "reason": "Service degradation detected on target"
  }'
```

---

## Policy Updates

This policy is reviewed quarterly. Propose changes via pull request to `shannon/docs/AUTHORIZED_TESTING_POLICY.md`.

**Last Review**: February 11, 2026  
**Next Review**: May 11, 2026
