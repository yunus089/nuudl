# Beta Operations v1

## Scope

This is the minimum operational baseline for the NUUDL closed beta.

- No external monitoring stack
- No managed backup service
- No alerting pipeline
- Only deterministic, local, production-shaped controls

## Runtime visibility

### API request logging

The API emits structured request completion logs and structured error logs.

Expected fields:

- `requestId`
- `method`
- `route`
- `statusCode`
- `durationMs`
- `ipHash`
- `actorType`
- `backofficeId`
- `backofficeRole`

Secrets are not logged:

- `authorization`
- `x-install-token`

### API health surface

- `GET /health` for simple liveness
- `GET /admin/ops` for backoffice-visible runtime and storage state

`/admin/ops` exposes:

- runtime uptime and process metadata
- counts for sessions, refresh tokens, posts, replies, reports, chats, restrictions, abuse events
- API snapshot file presence, size, and last update
- upload directory presence, file count, byte size, and last update

## Repeatable smoke

Command:

- `npm run smoke:beta`

Assumptions:

- API is reachable on `NUUDL_API_BASE_URL` or `http://localhost:4000`
- Consumer is reachable on `NUUDL_CONSUMER_BASE_URL` or `http://localhost:3000`
- Admin is reachable on `NUUDL_ADMIN_BASE_URL` or `http://localhost:3001`

The smoke covers:

1. service reachability for consumer, admin, API
2. install registration
3. media upload
4. post creation
5. reply creation
6. report creation
7. admin overview read
8. admin security read
9. admin ops read

The script exits non-zero on failure and prints a JSON summary on success.

## Local backup baseline

Command:

- `npm run backup:beta`

Behavior:

- creates a timestamped backup under `backups/beta/`
- copies `apps/api/.data/api-store.json` if present
- copies `apps/api/.data/uploads/` if present
- writes `manifest.json` with snapshot/upload metadata

This is a v1 operational backup, not a disaster-recovery system.

## Restore baseline

1. stop the API process
2. choose a backup folder under `backups/beta/`
3. copy `api-store.json` back to `apps/api/.data/api-store.json`
4. copy `uploads/` back to `apps/api/.data/uploads/`
5. start the API again
6. run `npm run smoke:beta`

## Closed-beta operating rule

Before any beta session or deployment-like change:

1. run `npm run backup:beta`
2. apply the change
3. run `npm run smoke:beta`
4. verify `/admin/ops` and `/admin/security`

## Explicit non-goals

Not part of this v1 ops slice:

- long-term metrics retention
- dashboards outside the built-in admin backoffice
- central log aggregation
- automatic alerting
- scheduled backups
