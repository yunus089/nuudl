# Database Schema Summary

## Core Entities

- `cities`: canonical city records for DACH
- `install_identities`: anonymous account, adult gate, city, and entitlement state
- `channels`: city channels and verified or exclusive flags
- `posts`: feed items with body, media, score, tips, and moderation state
- `replies`: threaded responses with score and tip totals
- `votes`: one vote per install identity per target
- `notifications`: inbox events and system messages
- `creator_applications`: creator KYC and payout state
- `wallet_balances`: available, pending, and lifetime totals
- `ledger_entries`: immutable money movement records
- `tip_events`: tip transactions between sender and recipient
- `moderation_cases`: reports and admin actions
- `moderation_actions`: explicit admin decisions tied to a case
- `audit_logs`: append-only trail for finance, moderation, and access changes
- `chat_requests` and `chat_messages`: DM request and conversation records
- `plus_entitlements` and `feature_flags`: entitlement and rollout state

## Important Constraints

- Install identity is unique per device or browser install
- Votes are unique per target and install identity
- Ledger entries are immutable once written
- Tips must record gross, platform fee, and creator net
- Creator payout readiness requires verified adult state plus admin review
- Wallet balances are a projection of the ledger, not the source of truth
- Moderation decisions must retain actor, target, timestamp, and reason
- Chat requests remain request-gated until accepted

## Suggested Indexes

- `posts(city_id, created_at)`
- `posts(city_id, score)`
- `replies(post_id, created_at)`
- `ledger_entries(install_identity_id, created_at)`
- `notifications(install_identity_id, created_at)`
- `moderation_cases(status, created_at)`
- `chat_requests(recipient_user_id, request_state)`
- `audit_logs(target_type, target_id, created_at)`
