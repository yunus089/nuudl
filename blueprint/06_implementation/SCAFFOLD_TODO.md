# Scaffold Todo

This is the implementation order for the first scaffold. Build in this order so dependencies stay stable and the app remains testable after each phase.

## Phase 0 - Foundations

- Set up shared types, config, and seed data
- Keep the app monorepo structure stable
- Add the fake payment adapter contract
- Define error codes, response shapes, and idempotency rules

## Phase 1 - Access And Identity

- Implement install registration
- Implement age gate and legal consent
- Implement location permission and server-side city resolution
- Block entry until city context exists

## Phase 2 - Core Consumer Shell

- Build the mobile app shell and navigation
- Ship `Home`, `Channels`, `Search`, `Chat`, `Notifications`, and `Me` as real screens
- Add composer, post detail, and overlay screens
- Add loading, empty, and error states for each primary screen

## Phase 3 - Feed And Discovery

- Implement city-scoped home feed
- Implement channel feed and channel discovery
- Add grouped search across channels, hashtags, and posts
- Add vote, pin, and visibility rules

## Phase 4 - Chat And Notifications

- Implement chat requests
- Convert accepted requests into active threads
- Add text messages, read states, and block/report actions
- Add in-app notifications and badge counts

## Phase 5 - Wallet, Tips, Creator, Plus

- Implement wallet snapshot and immutable ledger entries
- Implement fake topups and tips with platform cut math
- Implement creator application and review states
- Implement Plus entitlements and the checkout placeholder

## Phase 6 - Moderation And Audit

- Implement reports and moderation cases
- Add admin actions with reasons and audit logs
- Add creator approval and payout review flows
- Add ledger inspection and case history in the admin backoffice

## Phase 7 - Hardening

- Add smoke tests and E2E coverage
- Add rate limiting and abuse protection
- Add observability and error tracking hooks
- Prepare adapter seams for real payment, AVS, KYC, and media scanning providers

## Output Order

1. Foundation and identity
2. Feed and discovery
3. Chat and notifications
4. Wallet and creator flows
5. Moderation and admin
6. Hardening and tests
