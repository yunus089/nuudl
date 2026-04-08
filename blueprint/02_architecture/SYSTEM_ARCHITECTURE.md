# System Architecture

## Topology

- `consumer`: mobile-first Next.js PWA
- `api`: Fastify service for app and admin endpoints
- `admin`: Next.js backoffice for moderation and review
- `shared`: cross-app TypeScript types and seed data
- `realtime`: optional WebSocket fanout layer once live chat and notification pressure need it

## Runtime Principles

- Anonymous install identity is the default auth model
- City context is resolved from location and stored on the install identity
- Adult content is blocked until the adult gate is accepted
- Creator money flows are ledger-based and provider-agnostic
- The server is authoritative for geo, entitlements, moderation, and balances
- Client state is a view over persisted entities, not the source of truth

## Core Services

- Feed service for city-scoped posts and sort modes
- Channel service for discovery, membership, and exclusives
- Search service for channel, hashtag, and text lookup
- Chat service for requests, messages, read states, and block/report
- Wallet service for topups, tips, balances, and earnings
- Moderation service for reports, actions, and audit trail
- Creator service for application, KYC status, and payout readiness
- Notification service for in-app inbox items and status updates
- Payment adapter service for fake provider first, real provider later

## Data Flow

1. User opens the PWA and accepts the adult gate.
2. App registers an install identity and requests location.
3. API maps location to a city context.
4. Feed and channels are loaded for that city.
5. Tips, wallet updates, and moderation actions are written to the ledger and audit log.
6. Search, chat, and notifications consume the same city and entitlement context.

## Deployment Notes

- Keep the consumer app static-friendly and cacheable
- Keep the API stateless except for persistent storage and in-memory dev seed data
- Use environment-backed adapters for payment, AVS, and storage
- Keep admin isolated from consumer-only concerns so moderation and finance can evolve independently
