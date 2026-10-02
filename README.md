# IncidentHub

IncidentHub is a multi-tenant reliability app. It checks HTTP services on a schedule, opens one incident when a failure threshold is reached, and keeps the timeline from detection through resolution.

This repository covers the monitoring loop, on-call, escalation, public status pages, postmortems, audit, live updates, maintenance windows, SLOs, runbooks, a dependency graph, incident correlation, API keys, and outbound webhooks. Free, Pro, and Business limits are enforced. Pro and Business checkout stay idle until the matching Stripe price is configured, and a Stripe webhook then sets the organization plan. Email, Slack, GitHub issues, Stripe checkout, and a model-written brief run only when their credentials are configured. Without those credentials the incident brief is taken from the timeline, email rows stay skipped, and checkout reports that billing is not connected.

## Architecture

```text
React app  --REST-->  API (Express)
                         |
                         +--> MongoDB
                         |
                         +--> Redis (optional, BullMQ)
                         |
Worker process ----------+--> HTTP checks --> incident rules
                         +--> delayed escalation steps
```

The API and the monitoring worker are separate processes. A health check never runs inside an HTTP request handler. The worker leases a due monitor in MongoDB, runs the check, then releases the lease.

When `REDIS_URL` is set, the worker enqueues due checks and delayed escalation steps on BullMQ. When it is unset, checks stay on the in-process loop and the API keeps the escalation wait with a process timer. That timer is lost if the API restarts. Acknowledging an incident cancels the wait, and the step itself runs only if the incident is still `OPEN`.

Every organization-owned record carries `organizationId`. Middleware loads the membership from the database on each request. The JWT is not treated as proof of the current role.

Incident status only moves through an explicit state machine:

```text
OPEN -> ACKNOWLEDGED -> INVESTIGATING -> MITIGATED -> RESOLVED
```

`OPEN` can also resolve directly. A resolved incident cannot be reopened.

Monitor incidents are idempotent. A partial unique index allows one non-resolved monitor incident per service. If two checks cross the threshold together, the duplicate insert loses and attaches to the existing incident.

Severity is calculated:

- service down + critical → SEV-1
- service down + high → SEV-2
- service down + medium or low → SEV-3
- latency above the threshold → SEV-4

Free-plan limits live in one map (`monitoring.services.max`, `teams.max`, `members.max`) instead of scattered plan-name checks.

## Local setup

Requirements: Node.js 20+, Docker.

```bash
docker compose up -d
cp backend/.env.example backend/.env
npm install
npm test
npm run dev
```

The app is at http://localhost:5173. The API listens on `0.0.0.0:4000`.

`npm run dev` starts the API, the monitoring worker, and the frontend.

A local probe at `GET /api/demo/probe` returns HTTP 200 until you post `{ "mode": "down" }`. It is disabled in production. Point a service at `http://127.0.0.1:4000/api/demo/probe`, set the failure threshold to 1, simulate a failure, and run a check.

## Environment

See `backend/.env.example`.

- `PORT`
- `MONGODB_URI`
- `JWT_SECRET` (required, at least 32 characters, in production)
- `JWT_EXPIRES_IN`
- `CLIENT_ORIGIN`
- `REDIS_URL` (optional, `redis://127.0.0.1:6379` when Redis is running)

Email notifications are stored as skipped until SMTP is configured. In-app notifications are delivered immediately.

## Tests

```bash
npm test
```

Unit tests cover the state machine, severity, uptime, MTTA/MTTR, thresholds, on-call rotation, and escalation decisions. Integration tests cover registration, cross-organization access, the viewer role, one-incident idempotency, the free-plan service limit, and escalation that stops after acknowledgement. Tests do not require Redis.

## API shape

Success:

```json
{ "success": true, "data": {}, "message": "Incident created" }
```

Error:

```json
{ "success": false, "error": { "code": "INCIDENT_NOT_FOUND", "message": "Incident does not exist" } }
```

Main routes: `/api/auth/register`, `/api/auth/login`, `/api/organization`, `/api/members`, `/api/teams`, `/api/services`, `/api/incidents`, `/api/notifications`, `/api/dashboard`, `/api/health`, `/api/health/db`.
