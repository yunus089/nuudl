# Anti-Abuse And Security v1

This document defines a pragmatic, production-ready v1 protection layer for NUUDL.

It is intentionally deterministic and rule-based:

- no machine learning
- no third-party anti-fraud vendors
- no enterprise-only controls

The goal is to stop obvious abuse, spam, manipulation, and session misuse from day 1 without forcing a large platform rewrite.

## Scope

- Feed and content system
  - posts
  - replies
  - votes
  - channels
- Identity and session system
  - install identity
  - access and refresh tokens
  - active sessions
- Geo system
  - city scoping
  - geo resolve
  - city switching

## Design Principles

- enforce at the API edge and again in the service layer
- prefer temporary restrictions over hard bans in v1
- make every decision auditable
- keep thresholds configurable
- degrade risky actors before blocking them completely
- keep scoring explainable

## Existing Integration Points

This spec is designed to attach to the current blueprint and scaffold:

- install identity is already the core identity surface in [C:\Users\yunus\Desktop\OJ_neu\blueprint\04_logic\CORE_LOGIC.md](C:/Users/yunus/Desktop/OJ_neu/blueprint/04_logic/CORE_LOGIC.md)
- the server is already authoritative for geo, moderation, entitlements, and balances in [C:\Users\yunus\Desktop\OJ_neu\blueprint\02_architecture\SYSTEM_ARCHITECTURE.md](C:/Users/yunus/Desktop/OJ_neu/blueprint/02_architecture/SYSTEM_ARCHITECTURE.md)
- install registration, geo resolution, posts, replies, votes, reports, chat, creator and checkout routes already exist in [C:\Users\yunus\Desktop\OJ_neu\blueprint\07_api\API_SPEC.md](C:/Users/yunus/Desktop/OJ_neu/blueprint/07_api/API_SPEC.md) and [C:\Users\yunus\Desktop\OJ_neu\apps\api\src\routes.ts](C:/Users/yunus/Desktop/OJ_neu/apps/api/src/routes.ts)
- moderation cases, moderation actions and audit logs already exist in [C:\Users\yunus\Desktop\OJ_neu\blueprint\03_data\DATABASE_SCHEMA.md](C:/Users/yunus/Desktop/OJ_neu/blueprint/03_data/DATABASE_SCHEMA.md) and [C:\Users\yunus\Desktop\OJ_neu\apps\api\src\store.ts](C:/Users/yunus/Desktop/OJ_neu/apps/api/src/store.ts)
- content already has `moderation` state in [C:\Users\yunus\Desktop\OJ_neu\packages\shared\src\types.ts](C:/Users/yunus/Desktop/OJ_neu/packages/shared/src/types.ts)

This spec adds a missing hardening layer around those primitives.

## Required New v1 Concepts

The current scaffold does not yet model these explicitly. v1 should add them in schema and service contracts:

- `refresh_tokens`
- `sessions`
- `install_restrictions`
- `device_risk_state`
- `geo_events`
- `abuse_events`
- `rate_limit_counters` in Redis only

## 1. Rate Limiting Strategy

### Identity Dimensions

Rate limits are evaluated against one or more of:

- `installIdentityId`
- `ipHash`
- `userAgentHash`
- `cityId`
- route name

`ipHash` means a one-way hash of the normalized client IP.
`userAgentHash` means a one-way hash of a normalized user agent string.

### Redis Key Structure

Use fixed, readable keys:

- `rl:global:ip:{ipHash}:{window}`
- `rl:global:install:{installIdentityId}:{window}`
- `rl:route:{routeName}:install:{installIdentityId}:{window}`
- `rl:route:{routeName}:ip:{ipHash}:{window}`
- `rl:route:{routeName}:ua:{userAgentHash}:{window}`
- `rl:route:{routeName}:install_ip:{installIdentityId}:{ipHash}:{window}`
- `rl:geo:switch:install:{installIdentityId}`
- `rl:geo:switch:ip:{ipHash}`
- `rl:vote:target_window:{installIdentityId}:{window}`
- `rl:search:page_depth:{installIdentityId}:{window}`

`window` values:

- `10s`
- `1m`
- `10m`
- `1h`
- `24h`

### Endpoint Defaults

#### `POST /install/register`

- per IP: `8 / 10m`
- per IP + userAgentHash: `4 / 10m`
- burst: `2 / 30s`

On exceed:

- first exceed: `429 RATE_LIMIT_EXCEEDED`
- second exceed within `30m`: `429 ACTION_TEMPORARILY_BLOCKED`
- temporary block duration: `30m`

#### `POST /geo/resolve`

- per install identity: `12 / 10m`
- per IP: `30 / 10m`
- burst: `3 / 30s`

On exceed:

- `429 RATE_LIMIT_EXCEEDED`
- if repeated after prior exceed: `30m` geo block and risk score increase

#### `POST /auth/refresh`

- per session: `12 / 10m`
- per install identity: `30 / 1h`
- burst: `4 / 1m`

On exceed:

- `429 RATE_LIMIT_EXCEEDED`
- repeated abuse: mark session suspicious and force re-auth/session reset

#### `POST /posts`

- per install identity: `4 / 1h`
- per install identity: `12 / 24h`
- per IP: `20 / 24h`
- burst: `2 / 10m`

On exceed:

- `429 ACTION_TEMPORARILY_BLOCKED`
- posting block duration:
  - first block: `1h`
  - repeated within `24h`: `24h`

#### `POST /replies`

- per install identity: `12 / 1h`
- per install identity: `40 / 24h`
- per IP: `120 / 24h`
- burst: `4 / 5m`

On exceed:

- `429 ACTION_TEMPORARILY_BLOCKED`
- reply block duration:
  - first block: `30m`
  - repeated within `24h`: `12h`

#### `POST /votes`

- per install identity: `30 / 10m`
- per install identity: `120 / 1h`
- per install identity: `400 / 24h`
- burst: `10 / 1m`

On exceed:

- `429 RATE_LIMIT_EXCEEDED`
- if abusive pattern continues: vote actions are ignored for `1h`

#### `GET /search`

- per install identity: `30 / 1m`
- per IP: `100 / 1m`
- burst: `10 / 10s`

On exceed:

- `429 RATE_LIMIT_EXCEEDED`
- repeated exceed: `15m` search block

### Global Limits

- global per IP: `240 requests / 1m`
- global per install identity: `120 requests / 1m`

These are last-line flood guards.

### Exceed Response

Return:

```json
{
  "error": {
    "code": "RATE_LIMIT_EXCEEDED",
    "message": "Too many requests. Try again later.",
    "details": {
      "route": "POST /posts",
      "retryAfterSeconds": 600
    }
  }
}
```

Use `Retry-After` for temporary blocks.

## 2. Spam Protection Rules

### Post Volume

- max posts per install identity:
  - `4 / hour`
  - `12 / day`
- min cooldown between posts: `120s`

### Reply Volume

- max replies per install identity:
  - `12 / hour`
  - `40 / day`
- min cooldown between replies: `20s`
- max replies into the same post by the same install identity:
  - `5 / hour`
  - `10 / day`

### Hashtags

- max hashtags per post: `5`
- duplicate hashtag values in the same post are collapsed before save
- if more than `5` submitted: reject with `422 SPAM_DETECTED`

### Duplicate Content

For posts:

- identical normalized body by same install identity within `24h`: reject
- similarity window:
  - normalize whitespace
  - lowercase
  - strip repeated punctuation

For replies:

- identical normalized body by same install identity within `2h`: reject
- identical normalized body into same post within `24h`: reject

Duplicate content response:

- `409 SPAM_DETECTED`

### Repeated Low-Variation Content

If an install identity creates:

- `3` posts in `24h` with normalized body similarity `>= 0.9`
- or `5` replies in `2h` with normalized body similarity `>= 0.9`

then:

- reject the newest action
- increment risk score
- if repeated again in same day, apply `posting_block` for `12h`

### Link and Pattern Limits

Default v1:

- max URLs per post: `2`
- max URLs per reply: `1`
- no repeated contact handles more than `2` times in a single body

## 3. Bot And Suspicious Behavior Heuristics

### Device Risk Score

Maintain integer `device_risk_score` per install identity.

Base:

- new install: `0`

Adjustments:

- `+15` if more than `3` new sessions are created in `1h`
- `+20` if more than `2` refresh token reuse events occur in `24h`
- `+10` if route flood exceeds global limit once
- `+25` if route flood exceeds global limit `3` times in `1h`
- `+10` for each rejected unrealistic geo jump
- `+8` if city changes exceed allowed cooldown
- `+12` if duplicate-content rejection happens `3` times in `24h`
- `+12` if vote-rate guard is exceeded twice in `1h`
- `+20` if same IP hash creates `> 4` install identities in `24h`

Decay:

- `-10` every `24h` without a new abuse event
- minimum score `0`

### Thresholds

- `0-29`: normal
- `30-49`: soft-flagged
- `50-79`: restricted
- `80+`: hard temporary restriction

### Soft-Flagging

At `30+`:

- mark install identity `flagged`
- require stricter rate limits
- add audit event
- do not show any user-facing warning yet

### Automatic Temporary Restrictions

At `50+`:

- set restriction `posting_block` for `12h`
- downgrade to `read_only = false`, but no posts/replies/chat requests
- keep reading, search, notifications, wallet read access

At `80+`:

- set restriction `read_only` for `24h`
- reject posts, replies, votes, chat requests, geo switching

### Restriction Model

v1 restriction types:

- `posting_block`
- `reply_block`
- `vote_block`
- `chat_request_block`
- `geo_switch_block`
- `read_only`

Each restriction record must store:

- `installIdentityId`
- `type`
- `reasonCode`
- `startsAt`
- `endsAt`
- `triggerSource`
- `metadata`

## 4. Protection Against Vote Manipulation

### Vote Rate Limits

- max votes by install identity:
  - `10 / 1m`
  - `30 / 10m`
  - `120 / 1h`
  - `400 / 24h`

### Spread Guard

If an install identity votes on:

- more than `20` distinct posts within `10m`
- or more than `50` distinct posts within `1h`

then:

- additional votes are accepted at the API edge but ignored for score calculation for `1h`
- audit event is recorded
- risk score `+12`

### Same-Network Coordination Heuristic

If within `10m`:

- `>= 5` install identities from the same `/24` IP prefix
- vote on the same target
- with the same direction

then:

- first `3` votes count normally
- additional votes from that IP prefix on that target during that window are dampened to weight `0`
- store a `vote_dampened` abuse event

This avoids score inflation without requiring immediate bans.

### Score Consistency

- persisted `votes` table remains one vote per identity per target
- feed score uses `effective_vote_weight`
- if a vote is dampened, the stored vote exists but `effective_vote_weight = 0`
- changing a dampened vote updates the record, but does not restore weight during the active dampening window

## 5. Geo Misuse

### City Switch Rules

Initial city resolution during onboarding is allowed immediately.

After initial registration:

- minimum time between accepted city switches: `24h`
- max accepted city switches: `2 / 7d`

### Unrealistic Jump Detection

Track geo events with:

- `installIdentityId`
- `resolvedCityId`
- `lat`
- `lng`
- `resolvedAt`

Reject geo resolve or city switch if:

- distance between last accepted city and new city is `> 250 km`
- and elapsed time is `< 120m`

Example:

- Muenchen -> Berlin in `15m` = reject
- Muenchen -> Wien in `10m` = reject

### Behavior On Invalid Geo Change

- return `409 SUSPICIOUS_ACTIVITY`
- do not update city
- increment risk score by `10`
- on repeated invalid geo changes `>= 3 / 24h`, apply `geo_switch_block` for `24h`

### Geo Resolve Abuse

If `/geo/resolve` is called:

- more than `12 / 10m` by one install identity
- or `30 / 10m` by one IP

then:

- reject with `429 RATE_LIMIT_EXCEEDED`
- if repeated within `1h`, risk score `+8`

## 6. Token And Session Security

### Token Model

v1 should use:

- short-lived access token
  - default TTL: `15m`
- rotating refresh token
  - default TTL: `30d`
- one refresh token family per session

### Refresh Token Rotation

On refresh:

- current refresh token is invalidated immediately
- a new refresh token is issued
- the old token is marked `rotated`

### Refresh Token Reuse

If a previously rotated or revoked refresh token is reused:

- revoke the full session family
- delete all access tokens for that session
- mark abuse event `refresh_token_reuse`
- increment risk score by `20`
- if repeated, revoke all active sessions for the install identity

Response:

- `401 SUSPICIOUS_ACTIVITY`

### Maximum Active Sessions

For v1:

- max active sessions per install identity: `3`

If a fourth session is created:

- revoke the oldest active session
- record audit event

### Unusual Session Pattern

If one install identity creates:

- more than `3` sessions in `1h`
- or sessions from `> 2` IP hashes in `1h`

then:

- risk score `+15`
- if already soft-flagged, require full session reset

## 7. API Misuse

### Global Abuse Controls

Apply both:

- per IP global limit
- per install identity global limit

### Endpoint Flooding

If a route exceeds its local limit twice in the same `10m` window:

- escalate to route-specific temporary block
- write abuse event

### Pagination Abuse

List routes with pagination must also enforce:

- max `cursor/page` advances per minute: `30`
- max requested page size:
  - default `50`
  - absolute max `100`

If client asks above maximum:

- clamp to max
- log abuse event after `3` repeated attempts in `1h`

### Uniform Error Behavior

Use:

- `429` for rate-based blocks
- `403` for current temporary action restrictions
- `401` for invalid or reused tokens
- `409` for suspicious state conflicts

## 8. Content Security v1

### Text Length

Default limits:

- max post body length: `1200`
- max reply body length: `400`
- max chat message body length: `1000`
- min non-whitespace body length for posts and replies: `3`

### Pattern Filters

Apply deterministic pattern matching before save:

- repeated invite phrases for off-platform migration
- obvious scam phrases
- known disallowed underage terms
- repeated contact handle spam

v1 action:

- if high-confidence blocked pattern: reject with `422 SPAM_DETECTED`
- if suspicious but not hard-blocked: set `moderation_state = flagged`

### Moderation Auto-State

Set `moderation = flagged` automatically when:

- content trips repeated suspicious pattern rule
- install identity is currently soft-flagged and posts external-contact-heavy content
- content body is duplicated across multiple channels or posts inside `24h`

Blocked content remains:

- hidden from public feed/search
- visible to moderation tools only

## 9. Integration

### Middleware

Middleware responsibilities:

- normalize client IP
- hash IP and user agent
- load session/install identity context
- run global and route-level rate limits
- attach rate-limit metadata to request context
- reject blocked routes before handler executes

### Service Layer

Service-layer responsibilities:

- action-specific cooldowns
- duplicate-content checks
- risk score changes
- vote dampening
- geo switch rules
- refresh token rotation and reuse checks
- moderation auto-flagging

### Database

Database responsibilities:

- persist abuse-relevant events and restrictions
- persist session and refresh-token state
- persist geo event history
- persist moderation state changes
- persist audit trail

### Redis

Redis responsibilities:

- all short-window rate-limit counters
- temporary flood counters
- vote coordination windows
- short-lived geo-switch locks

Do not use Redis as the source of truth for long-duration restrictions.

## 10. Configuration

All limits must be config-backed.

### Required Config Groups

- `rate_limits.*`
- `cooldowns.*`
- `spam.*`
- `risk_scoring.*`
- `geo.*`
- `sessions.*`
- `content_safety.*`

### Suggested Default Config

```text
rate_limits.global.ip_per_minute = 240
rate_limits.global.install_per_minute = 120

rate_limits.install_register.per_10m_ip = 8
rate_limits.install_register.per_10m_ip_ua = 4

rate_limits.geo_resolve.per_10m_install = 12
rate_limits.geo_resolve.per_10m_ip = 30

rate_limits.auth_refresh.per_10m_session = 12
rate_limits.auth_refresh.per_1h_install = 30

rate_limits.posts.per_hour = 4
rate_limits.posts.per_day = 12

rate_limits.replies.per_hour = 12
rate_limits.replies.per_day = 40

rate_limits.votes.per_minute = 10
rate_limits.votes.per_10m = 30
rate_limits.votes.per_hour = 120
rate_limits.votes.per_day = 400

rate_limits.search.per_minute_install = 30
rate_limits.search.per_minute_ip = 100

cooldowns.posts.seconds = 120
cooldowns.replies.seconds = 20
cooldowns.city_switch.hours = 24

spam.max_hashtags_per_post = 5
spam.max_urls_per_post = 2
spam.max_urls_per_reply = 1

risk_scoring.soft_flag_threshold = 30
risk_scoring.restricted_threshold = 50
risk_scoring.read_only_threshold = 80

geo.max_switches_per_7d = 2
geo.unrealistic_jump_km = 250
geo.unrealistic_jump_minutes = 120

sessions.max_active_per_install = 3
sessions.access_token_ttl_minutes = 15
sessions.refresh_token_ttl_days = 30

content_safety.max_post_length = 1200
content_safety.max_reply_length = 400
content_safety.max_chat_length = 1000
```

## 11. Error Codes

Add these to the common API error catalog:

- `RATE_LIMIT_EXCEEDED`
- `SPAM_DETECTED`
- `SUSPICIOUS_ACTIVITY`
- `ACTION_TEMPORARILY_BLOCKED`
- `SESSION_REVOKED`
- `GEO_SWITCH_COOLDOWN`
- `GEO_ANOMALY_DETECTED`

### Canonical Meanings

#### `RATE_LIMIT_EXCEEDED`

- window-based or burst-based limit exceeded
- usually `429`

#### `SPAM_DETECTED`

- content duplication
- hashtag overage
- blocked phrase or repetitive spam pattern
- usually `409` or `422`

#### `SUSPICIOUS_ACTIVITY`

- token reuse
- invalid geo pattern
- route flooding tied to abuse heuristics
- usually `401` or `409`

#### `ACTION_TEMPORARILY_BLOCKED`

- install identity is temporarily blocked from a specific action
- usually `403`

## 12. Minimal v1 Data Additions

### Database Tables

Add:

- `sessions`
  - `id`
  - `install_identity_id`
  - `ip_hash`
  - `user_agent_hash`
  - `created_at`
  - `last_seen_at`
  - `revoked_at`
- `refresh_tokens`
  - `id`
  - `session_id`
  - `token_hash`
  - `family_id`
  - `status`
  - `issued_at`
  - `rotated_at`
  - `expires_at`
- `install_restrictions`
  - `id`
  - `install_identity_id`
  - `restriction_type`
  - `reason_code`
  - `starts_at`
  - `ends_at`
  - `metadata`
- `device_risk_state`
  - `install_identity_id`
  - `risk_score`
  - `risk_level`
  - `last_event_at`
- `geo_events`
  - `id`
  - `install_identity_id`
  - `city_id`
  - `lat`
  - `lng`
  - `accepted`
  - `reason_code`
  - `created_at`
- `abuse_events`
  - `id`
  - `install_identity_id`
  - `session_id`
  - `ip_hash`
  - `event_type`
  - `severity`
  - `metadata`
  - `created_at`

### Audit Coverage

Also write audit events for:

- restriction applied
- restriction expired automatically
- refresh token reuse detected
- session family revoked
- vote dampening activated
- geo anomaly rejected

## 13. Rollout Order

Implement in this order:

1. middleware rate limits and unified error codes
2. post/reply/search/vote spam guards
3. install restrictions and risk score
4. geo switch cooldown and anomaly checks
5. sessions and refresh token rotation
6. vote dampening and same-prefix coordination guard
7. audit and admin visibility for abuse events

## 14. Non-Goals For v1

These are explicitly out of scope:

- ML classification
- device fingerprint vendors
- behavioral biometrics
- carrier intelligence
- external fraud scoring services
- permanent automated bans without review
- real-time graph analysis

## 15. Outcome

If implemented as specified, v1 will:

- stop simple spam floods
- make duplicate posting expensive
- make vote brigading materially less effective
- prevent naive geo hopping
- harden session refresh behavior
- give moderation and audit systems a usable abuse trail

This is sufficient for a strong v1 baseline and small-launch operations without overbuilding.
