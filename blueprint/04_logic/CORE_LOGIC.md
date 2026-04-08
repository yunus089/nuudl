# Core Logic

## Identity

- First visit creates an anonymous install identity
- Identity is retained with a signed token or install key
- No public real-name profile is required for normal users
- Payout identity can exist behind the scenes without changing the public anonymous surface

## Location

- Location is mandatory before the main feed is usable
- The first release scopes content by city, not by radius
- City mapping is resolved server-side from the submitted coordinates
- The resolved city becomes the default context for feed, channels, search, and chat discovery

## Feed

- `Neu` sorts newest first
- `Kommentiert` boosts discussion-heavy posts
- `Lauteste` sorts by score
- Pinned and verified posts may appear at the top where allowed
- Feed items always respect city scope and moderation visibility

## Channels And Search

- Channels are discoverable by city and verification state
- Search groups results into channels, hashtags, and posts
- Search never exposes hidden or blocked content to the public result set
- The explorer mode can read other cities only when entitlement allows it

## Adult Gate

- The app starts with an 18+ landing gate
- Adult verification is required before explicit content is shown
- Creator access and earnings require stronger verification than viewer access
- Adult gating is a prerequisite for the content surface, not just a legal checkbox

## Tips and Wallet

- Tips are sent to content items, not to a public creator identity in v1
- Each tip writes `tip_out`, `tip_in`, and `platform_fee` entries
- Wallet balance is the user-facing projection of the underlying ledger
- Fake payment provider is the first adapter, real provider comes later behind the same interface
- A tip can never be represented only as a balance mutation; it must be a business event plus ledger entries

## Moderation

- Reports open a moderation case
- Admin actions can hide, block, or escalate content and users
- Creator approval requires KYC and review before payouts become available
- Every moderation action records actor, case reference, target, reason, and timestamp
- Audit logs are append-only and cover moderation, payouts, entitlements, and high-risk account changes

## Chat

- Chat begins as a request
- Accepted requests become a thread
- Image chat is entitlement-based
- Block and report actions must remain available in every thread
- Threads are read-only artifacts until the request is accepted
- Read states, request state, and block state are all server-owned

## Notifications

- Notifications are in-app first for v1
- High-signal events include replies, chat activity, tip receipts, creator status changes, and moderation notices
- Notification items are derived from product events, not handwritten client state

## Creator And Plus

- Creator access is a gated lifecycle, not a profile toggle
- Plus is an entitlement system with feature flags attached
- v1 should implement the UI and data contracts even if the payment adapter is fake

## State Discipline

- Loading, ready, empty, and error states should be defined per screen
- Critical writes must be idempotent
- Repeated requests should never create duplicate tips, payouts, or creator applications
