# NUUDL Deploy Guide

This repo is a monorepo. For a first private deploy, use two apps in Coolify or Hostinger:

- `nuudl-api`
- `nuudl-consumer`

Do not deploy the repo root as a single app.

## Shared rules

- Use the repo root as the checkout path.
- Base directory stays `/`.
- Install dependencies with `npm ci`.
- Set `NIXPACKS_NODE_VERSION=22`.
- Use HTTPS domains for both apps.
- Keep `ALLOW_LOCAL_FALLBACKS=false`.
- Keep `ALLOW_FAKE_PAYMENTS=false`.
- Leave `Port Mappings` empty.
- Leave `Publish Directory` empty for both apps.

## Preflight before you redeploy

Run this locally before you push:

```bash
npm run build:deploy
```

Then push a fresh commit to GitHub and redeploy from Coolify. This avoids chasing an old broken image or an outdated workspace resolution state.

## Local preflight

Before pushing to GitHub, run this from the repo root:

```bash
npm run build:deploy
```

If you also want a full workspace health check:

```bash
npm run typecheck
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
JWT_SECRET=replace-with-a-long-random-secret
NIXPACKS_NODE_VERSION=22
ALLOW_FAKE_PAYMENTS=false
ALLOW_LOCAL_FALLBACKS=false
```

Persistent storage:

- Mount `/app/apps/api/.data`

## Consumer app

App name: `nuudl-consumer`

- Build command: `npm run build:consumer`
- Start command: `npm run start:consumer`
- Port: `3000`

Environment variables:

```env
NUUDL_API_BASE_URL=https://api.your-domain.tld
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
- After changes to deployability scripts or shared package resolution, push a fresh commit before redeploying in Coolify.
