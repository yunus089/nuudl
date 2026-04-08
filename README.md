# NUUDL Scaffold

This repository contains two implementation artifacts for the mobile-only anonymous geo-community product:

- `blueprint/` for the implementation-ready product, architecture, API, and QA documents
- `apps/` + `packages/` for the runnable scaffold of the consumer PWA, admin backoffice, and API

## Workspace layout

- `apps/consumer`: mobile-only Next.js PWA shell for the end-user experience
- `apps/admin`: Next.js backoffice for moderation, creator review, and ledger workflows
- `apps/api`: Fastify API scaffold with in-memory routes matching the initial contracts
- `packages/shared`: cross-app TypeScript types and seeded mock data
- `db/schema.sql`: PostgreSQL + PostGIS schema draft for the persistent implementation

## Getting started

1. Copy `.env.example` to `.env`
2. Install dependencies with `npm install`
3. Run the services you need:
   - `npm run dev:consumer`
   - `npm run dev:admin`
   - `npm run dev:api`

## Beta Ops

- `npm run smoke:beta` runs a repeatable closed-beta smoke against the local API, consumer, and admin services
- `npm run backup:beta` copies the API snapshot and uploaded media into a timestamped local backup under `backups/beta/`
- [blueprint/08_qa/BETA_OPERATIONS_RUNBOOK.md](C:/Users/yunus/Desktop/OJ_neu/blueprint/08_qa/BETA_OPERATIONS_RUNBOOK.md) documents health checks, smoke flow, backup and restore

## Current state

This is intentionally a scaffold, not the full production implementation. The repository already includes:

- mobile-first UI shells for the consumer and admin flows
- shared contracts for install identity, feed, channels, chat, tips, creator applications, and moderation
- a Fastify API implementing the agreed v1 endpoints against a persisted local beta store
- a SQL schema draft for the later PostgreSQL/PostGIS migration
- a blueprint package that can be handed to another engineer or agent as the source of truth
