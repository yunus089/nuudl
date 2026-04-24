# NUUDL Deploy Guide

This repo is a monorepo. For a first private deploy, use two apps in Coolify or Hostinger:

- `nuudl-api`
- `nuudl-consumer`

Do not deploy the repo root as a single app.

For the full switch reference, keep `docs/deploy/BETA_LAUNCH_SWITCHES.md` open during deploy.

## Shared rules

- Use the repo root as the checkout path.
- Base directory stays `/`.
- Install dependencies with `npm ci`.
- Set `NIXPACKS_NODE_VERSION=22`.
- Use HTTPS domains for both apps.
- Keep `ALLOW_LOCAL_FALLBACKS=false`.
- Keep `ALLOW_FAKE_PAYMENTS=false`.
- Keep `API_SEED_PROFILE=clean` for beta invites so no demo posts, reports, chats or wallet entries are bootstrapped.
- For a real closed beta, set `BETA_INVITE_REQUIRED=true` and keep `BETA_INVITE_CODES` secret in the API app only.
- Leave `Port Mappings` empty.
- Leave `Publish Directory` empty for both apps.

## Preflight before you redeploy

Run this locally before you push:

```bash
npm run build:deploy
```

Then push a fresh commit to GitHub and redeploy from Coolify. This avoids chasing an old broken image or an outdated workspace resolution state.

After both apps are deployed, run the read-only beta preflight against the live domains:

```bash
NUUDL_API_BASE_URL=https://api.your-domain.tld NUUDL_CONSUMER_BASE_URL=https://app.your-domain.tld npm run preflight:private-beta
```

Before the first external invites, add `BETA_EXPECT_EMPTY=true` or pass `-- --expect-empty` to fail if posts, replies, chats, reports, ledger entries or uploads already exist.

## Local preflight

Before pushing to GitHub, run this from the repo root:

```bash
npm run build:deploy
```

If you also want a full workspace health check:

```bash
npm run typecheck
```

For a running local API/Consumer pair, use:

```bash
npm run preflight:private-beta -- --expect-empty
```

## API app

App name: `nuudl-api`

- Build command: `npm run build:api`
- Start command: `npm run start:api`
- Port: `4000`

Environment variables:

```env
API_PORT=4000
API_HOST=0.0.0.0
API_LOG_LEVEL=info
API_PUBLIC_BASE_URL=https://api.your-domain.tld
API_UPLOADS_DIR=/app/apps/api/.data/uploads
API_STORAGE_DRIVER=snapshot_file
API_SEED_PROFILE=clean
BETA_INVITE_REQUIRED=true
BETA_INVITE_CODES=replace-with-secret-codes
JWT_SECRET=replace-with-a-long-random-secret
MEDIA_UPLOAD_MAX_BYTES=10485760
RATE_LIMIT_BACKEND=memory
RATE_LIMIT_REDIS_CONNECT_TIMEOUT_MS=750
NIXPACKS_NODE_VERSION=22
ALLOW_FAKE_PAYMENTS=false
ALLOW_LOCAL_FALLBACKS=false
```

Persistent storage:

- Mount `/app/apps/api/.data`
- Keep `API_UPLOADS_DIR` aligned with that mounted path, e.g. `/app/apps/api/.data/uploads`

Database note:

- This first private deploy intentionally uses `API_STORAGE_DRIVER=snapshot_file`.
- After you add a separate Coolify Postgres resource, you can switch the private beta to DB-backed snapshot mode with `API_STORAGE_DRIVER=postgres` and `DATABASE_URL=<internal-postgres-url>`.
- In `postgres` mode the API stores the current `ApiStore` snapshot in the `api_store_snapshots` table. This is the safe Phase A.1 bridge before route-by-route normalized repositories replace the snapshot.
- `API_SEED_PROFILE=clean` only affects fresh bootstrapped state. If a Coolify volume or Postgres DB already contains demo/test posts, wipe that storage before inviting external beta users.
- The Consumer now starts from an empty beta-safe client state. Demo posts/chats/wallet values are only injected when the API fails and `ALLOW_LOCAL_FALLBACKS=true` on loopback.
- To reset local snapshot/uploads before a private beta, run `npm run reset:beta-data -- --confirm-clean-beta`. The script creates a backup under `backups/beta/` before removing local API data.
- Keep `RATE_LIMIT_BACKEND=memory` for the current private beta deploy unless a Coolify Redis resource is already configured and tested.
- To switch later, set `REDIS_URL=<internal-redis-url>` and `RATE_LIMIT_BACKEND=redis`, redeploy the API, then verify `/admin/ops` reports `storage.persistence.rateLimit.status=redis_active`.
- If Redis is unavailable, the API keeps running with process-local memory fallback and `/admin/ops` reports `redis_unavailable_memory_fallback`. Treat that as a warning before inviting more testers.
- Use `GET /admin/ops` with backoffice headers to see the active storage driver, the Postgres target summary and whether normalized repositories are still pending.
- Keep `API_PUBLIC_BASE_URL=https://api.your-domain.tld` on the API so uploaded media always resolves to the public HTTPS origin instead of an internal proxy/http host guess.
- `MEDIA_UPLOAD_MAX_BYTES` should stay conservative for beta; raise it only deliberately and keep an eye on volume size and abuse risk.

## Consumer app

App name: `nuudl-consumer`

- Build command: `npm run build:consumer`
- Start command: `npm run start:consumer`
- Port: `3000`

Environment variables:

```env
NUUDL_API_BASE_URL=https://api.your-domain.tld
NUUDL_CONSUMER_BASE_URL=https://app.your-domain.tld
BETA_INVITE_REQUIRED=true
NIXPACKS_NODE_VERSION=22
ALLOW_LOCAL_FALLBACKS=false
ALLOW_FAKE_PAYMENTS=false
```

## Recommended order

1. Deploy `nuudl-api`
2. Verify `GET /health`
3. Deploy `nuudl-consumer`
4. Verify the landing page and consumer routes

## Notes

- `nuudl-api` uses the built JS entrypoint generated under `apps/api/dist`.
- `nuudl-consumer` uses the existing workspace start wrapper.
- If you want admin later, add it as a third app after the consumer is stable.
- For a non-loopback admin deploy, set `BACKOFFICE_SHARED_SECRET` in the API and set `NUUDL_BACKOFFICE_ID`, `NUUDL_BACKOFFICE_ROLE` and `NUUDL_BACKOFFICE_SHARED_SECRET` in the admin app. The admin proxy now injects this operator session server-side, creates an httpOnly browser session ID and should land on `trusted_proxy_session` instead of trusting browser-sent roles.
- The first trusted operator can bootstrap from `NUUDL_BACKOFFICE_ID` and `NUUDL_BACKOFFICE_ROLE`; after that the stored `backofficeUsers.role` is canonical. Use the Owner role management screen to change roles, disable operators or revoke sessions instead of changing browser headers or expecting env changes to re-elevate an existing user.
- Disabled operators are blocked API-side and active backoffice sessions are revoked. The API blocks self-disable/self-downgrade for the current owner and prevents removing the last active owner. If all owners are still unreachable, use `docs/deploy/BACKOFFICE_BREAK_GLASS.md`, then restart or redeploy the API so the runtime store reloads the recovered owner.
- Local role switching in the admin remains a loopback-only dev fallback and should not be treated as production auth.
- After changes to deployability scripts or shared package resolution, push a fresh commit before redeploying in Coolify.
