# BETA OPERATIONS RUNBOOK

## Purpose

This runbook defines the minimal v1 operating procedure for the local/closed-beta NUUDL stack.

It is intentionally pragmatic:

- no external monitoring platform
- no hosted backup system
- no infra orchestration requirement

It focuses on what an operator needs to keep the beta alive and recoverable.

## Services

- Consumer PWA: `http://localhost:3000`
- Admin backoffice: `http://localhost:3001`
- API: `http://localhost:4000`

## Health checks

### Liveness

- API: `GET /health`

Expected response:

```json
{ "ok": true, "service": "veil-api" }
```

### Ops visibility

- Backoffice API overview: `GET /admin/overview`
- Backoffice security: `GET /admin/security`
- Backoffice ops: `GET /admin/ops`

Required headers for backoffice routes:

- `x-admin-id`
- `x-admin-role`

Supported local example:

- `x-admin-id: owner-root`
- `x-admin-role: owner`

## Logging baseline

The API emits structured Fastify logs.

Required v1 fields:

- `service`
- `environment`
- `requestId`
- `method`
- `route`
- `statusCode`
- `durationMs`
- `event`

Expected events:

- `request.received`
- `request.complete`
- `request.failed`

Auth headers must remain redacted in logs.

Runtime log level is configured via:

- `API_LOG_LEVEL`

## Repeatable smoke test

Use:

```bash
npm run smoke:beta
```

The smoke verifies:

- consumer root reachable
- admin root reachable
- API liveness reachable
- install registration works
- media upload works
- post creation works
- reply creation works
- report creation works
- backoffice overview works
- backoffice ops works

For repeatable closed-beta runs, the smoke uses an owner-only maintenance reset:

- `POST /admin/security/install-reset`

This clears install-scoped restrictions, rate-limit counters and risk state for the current smoke install before write checks continue.

The smoke script lives at:

- [scripts/smoke-beta.mjs](C:/Users/yunus/Desktop/OJ_neu/scripts/smoke-beta.mjs)

## Backup procedure

Use:

```bash
npm run backup:beta
```

This copies:

- `apps/api/.data/api-store.json`
- `apps/api/.data/uploads/`

into:

- `backups/beta/<timestamp>/`

and writes a `manifest.json`.

Backup helper:

- [scripts/backup-beta-data.mjs](C:/Users/yunus/Desktop/OJ_neu/scripts/backup-beta-data.mjs)

## Restore procedure

1. Stop the API process.
2. Choose the desired folder in `backups/beta/`.
3. Restore `api-store.json` into `apps/api/.data/`.
4. Restore `uploads/` into `apps/api/.data/`.
5. Start the API again.
6. Run `npm run smoke:beta`.
7. Open admin and verify:
   - `Reports`
   - `Security`
   - `Ops`

## Minimum operator workflow

For each deploy or restart:

1. Start API
2. Start consumer
3. Start admin
4. Run `npm run smoke:beta`
5. Check `Security` and `Ops` in the admin

## What to watch in the admin

### Security

- active restrictions
- flagged installs
- restricted installs
- recent abuse events

### Ops

- API uptime
- snapshot file exists and has a recent timestamp
- uploads directory exists
- active sessions count
- refresh token count
- rate limit counter growth

## Beta failure rules

Treat the beta as degraded when any of the following is true:

- `/health` fails
- `/admin/ops` fails
- snapshot file is missing unexpectedly
- uploads directory disappears unexpectedly
- smoke test fails
- abuse/restriction counts spike without explanation

## Out of scope for v1 B.4

- external dashboards
- centralized log shipping
- automated restore orchestration
- multi-node failover
- managed backup retention
