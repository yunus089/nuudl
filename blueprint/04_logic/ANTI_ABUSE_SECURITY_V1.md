# Anti-Abuse And Security v1

## Purpose

This document defines the minimum production-ready anti-abuse and security layer for NUUDL v1.

The goal is not enterprise fraud detection. The goal is deterministic, rule-based protection that blocks obvious spam, rate abuse, session abuse, geo abuse, and vote manipulation from day 1 without introducing unnecessary complexity.

This specification covers:

- Feed and content writes: posts, replies, votes, channels, search
- Identity and session safety: install identity, access tokens, refresh tokens, active sessions
- Geo safety: city-scoped access, city switching, geo resolve abuse

This specification explicitly does not use:

- ML scoring
- External anti-fraud products
- Device fingerprint vendors

## Existing Repo Anchor Points

This spec is designed to attach to structures that already exist in the repo.

- Anonymous install identity is already a first-class concept in [C:\Users\yunus\Desktop\OJ_neu\blueprint\02_architecture\SYSTEM_ARCHITECTURE.md](C:/Users/yunus/Desktop/OJ_neu/blueprint/02_architecture/SYSTEM_ARCHITECTURE.md) and [C:\Users\yunus\Desktop\OJ_neu\packages\shared\src\types.ts](C:/Users/yunus/Desktop/OJ_neu/packages/shared/src/types.ts).
- Moderation state already exists on posts and replies as `visible | flagged | blocked` in [C:\Users\yunus\Desktop\OJ_neu\db\schema.sql](C:/Users/yunus/Desktop/OJ_neu/db/schema.sql) and [C:\Users\yunus\Desktop\OJ_neu\packages\shared\src\types.ts](C:/Users/yunus/Desktop/OJ_neu/packages/shared/src/types.ts).
- Reports, moderation cases, moderation actions, audit logs, and idempotency keys already exist in [C:\Users\yunus\Desktop\OJ_neu\db\schema.sql](C:/Users/yunus/Desktop/OJ_neu/db/schema.sql), [C:\Users\yunus\Desktop\OJ_neu\apps\api\src\store.ts](C:/Users/yunus/Desktop/OJ_neu/apps/api/src/store.ts), and [C:\Users\yunus\Desktop\OJ_neu\apps\api\src\routes.ts](C:/Users/yunus/Desktop/OJ_neu/apps/api/src/routes.ts).
- `POST /install/register`, `POST /geo/resolve`, `POST /posts`, `POST /replies`, `POST /votes`, `GET /search`, and `POST /reports` already exist in [C:\Users\yunus\Desktop\OJ_neu\blueprint\07_api\API_SPEC.md](C:/Users/yunus/Desktop/OJ_neu/blueprint/07_api/API_SPEC.md) and [C:\Users\yunus\Desktop\OJ_neu\apps\api\src\routes.ts](C:/Users/yunus/Desktop/OJ_neu/apps/api/src/routes.ts).
- Critical writes already use idempotency in the API layer via `withIdempotency(...)` in [C:\Users\yunus\Desktop\OJ_neu\apps\api\src\routes.ts](C:/Users/yunus/Desktop/OJ_neu/apps/api/src/routes.ts).

The v1 anti-abuse system should extend these structures, not replace them.

## v1 Security Model

The v1 anti-abuse system has four layers:

1. Request fingerprinting and rate limits in middleware
2. Spam and action heuristics in the service layer
3. Durable restrictions, session state, and geo history in PostgreSQL
4. Auditability for every automated restriction and every manual override

The server remains authoritative for:

- city context
- moderation visibility
- restriction state
- session state
- vote acceptance

The client must never decide whether a write is allowed.

## Required Minimal Persistent Additions

v1 needs a small amount of durable security state in addition to the existing schema.

### 1. `install_security_state`

Purpose: persistent per-install security state.

Required fields:

- `install_identity_id`
- `device_risk_score` integer, default `0`
- `risk_state` enum: `normal | soft_flagged | restricted | locked`
- `last_ip_hash`
- `last_user_agent_hash`
- `last_city_id`
- `last_geo_resolved_at`
- `last_city_switch_at`
- `created_at`
- `updated_at`

### 2. `install_restrictions`

Purpose: durable action restrictions owned by the server.

Required fields:

- `id`
- `install_identity_id`
- `restriction_type`
- `source` enum: `system | admin`
- `reason_code`
- `note`
- `created_at`
- `expires_at`
- `cleared_at`
- `metadata`

Allowed `restriction_type` values for v1:

- `posting_block`
- `reply_block`
- `vote_block`
- `chat_request_block`
- `read_only`
- `geo_lock`

### 3. `install_sessions`

Purpose: refresh token family and session rotation.

Required fields:

- `id`
- `install_identity_id`
- `refresh_token_hash`
- `token_family_id`
- `replaced_by_session_id`
- `ip_hash`
- `user_agent_hash`
- `created_at`
- `last_seen_at`
- `expires_at`
- `revoked_at`
- `revoke_reason`

### 4. `geo_events`

Purpose: accepted and rejected geo transitions.

Required fields:

- `id`
- `install_identity_id`
- `from_city_id`
- `to_city_id`
- `ip_hash`
- `user_agent_hash`
- `distance_km`
- `elapsed_seconds`
- `result` enum: `accepted | rejected`
- `reason_code`
- `created_at`

No additional v1 table is required for raw rate counters. Those stay in Redis.

## Request Fingerprinting

Every request must derive the following server-side fields before business logic runs:

- `installIdentityId`
- `ipHash`
- `userAgentHash`
- `ipPrefixHash`
- `routeKey`

### Hashing Rules

- Raw IP addresses must not be stored in Redis or Postgres.
- `ipHash` is `HMAC_SHA256(ip, ABUSE_HASH_SECRET)`.
- `userAgentHash` is `HMAC_SHA256(normalized_user_agent, ABUSE_HASH_SECRET)`.
- `ipPrefixHash` is:
  - IPv4: `/24`
  - IPv6: `/56`
  - hashed with the same HMAC secret

### Route Keys

Use normalized route keys for Redis:

- `install_register`
- `geo_resolve`
- `auth_refresh`
- `feed_search`
- `posts_create`
- `replies_create`
- `votes_create`

## Rate Limiting Strategy

Rate limiting is split into:

- global IP limits
- per-install limits
- per-endpoint limits
- cooldown keys for mutation endpoints

### Enforcement Order

1. global IP limit
2. endpoint IP limit
3. endpoint install limit
4. install+ip+ua composite limit
5. action cooldown

The first limit hit ends the request.

### Redis Key Structure

Use this format:

`abuse:v1:<kind>:<routeKey>:<window>:<subject>`

Kinds:

- `gip` = global IP limit
- `eip` = endpoint IP limit
- `eid` = endpoint install limit
- `ecm` = endpoint composite limit
- `cd` = cooldown
- `dup` = duplicate-content fingerprint
- `vcluster` = vote cluster by IP prefix

Subjects:

- `ip:<ipHash>`
- `install:<installIdentityId>`
- `combo:<installIdentityId>:<ipHash>:<userAgentHash>`
- `prefix:<ipPrefixHash>:<targetType>:<targetId>`

Examples:

- `abuse:v1:eid:posts_create:1h:install:install-001`
- `abuse:v1:eip:search:1m:ip:6c0b...`
- `abuse:v1:ecm:geo_resolve:10m:combo:install-001:6c0b...:91fe...`
- `abuse:v1:cd:posts_create:45s:install:install-001`

### Default Endpoint Limits

| Endpoint | Install limit | IP limit | Composite limit | Cooldown |
| --- | --- | --- | --- | --- |
| `POST /posts` | `5 / hour`, `20 / day` | `15 / hour`, `60 / day` | `5 / hour` | `45s` |
| `POST /replies` | `20 / hour`, `80 / day` | `60 / hour`, `240 / day` | `20 / hour` | `12s` |
| `POST /votes` | `20 / minute`, `120 / hour` | `60 / minute`, `360 / hour` | `20 / minute` | `1s` |
| `GET /search` | `30 / minute` | `120 / minute` | `30 / minute` | none |
| `POST /install/register` | `3 / hour / install key`, `6 / day / install key` | `8 / 10 min`, `30 / day` | `6 / 10 min` | none |
| `POST /geo/resolve` | `12 / 10 min`, `40 / day` | `30 / 10 min`, `120 / day` | `12 / 10 min` | `30s` for accepted city changes |
| `POST /auth/refresh` | `8 / 15 min / session`, `60 / day / install` | `40 / 15 min` | `8 / 15 min` | none |

### Global Limits

| Subject | Limit |
| --- | --- |
| IP | `180 requests / minute`, `2,500 / day` |
| Install identity | `90 requests / minute`, `1,200 / day` |

### Behavior On Limit Exceeded

- Return `429 RATE_LIMIT_EXCEEDED`
- Include `retry_after_seconds`
- Include `route_key`
- Do not create content, votes, or reports

If the same install identity hits the same endpoint limit 3 times inside 15 minutes:

- add `+4` risk score
- write an audit log entry

If the same install identity hits the same endpoint limit 6 times inside 60 minutes:

- create a temporary restriction:
  - `posting_block` for post abuse
  - `reply_block` for reply abuse
  - `vote_block` for vote abuse
  - `geo_lock` for geo abuse

Default temporary block duration:

- `30 minutes` for search or geo abuse
- `2 hours` for post or reply abuse
- `6 hours` for vote abuse

## Spam Protection Rules

### Post Limits

- Maximum `5` posts per hour
- Maximum `20` posts per day
- Minimum cooldown between posts: `45 seconds`
- Maximum body length: `600` characters
- Maximum hashtags per post: `5`

### Reply Limits

- Maximum `20` replies per hour
- Maximum `80` replies per day
- Minimum cooldown between replies: `12 seconds`
- Maximum body length: `300` characters
- Replies are not monetized and must never be treated as tip targets

### Search Limits

- Maximum query length: `80` characters
- Empty query is allowed but may only return default city-scoped discovery results
- Excessive repeated search with the same query counts toward rate limits

### Duplicate Content Detection

Duplicate checks apply after trimming and normalization:

- lowercase
- collapse repeated whitespace
- trim punctuation-only prefix or suffix noise
- normalize repeated separators

v1 duplicate rules:

- same install identity
- same target class (`post` or `reply`)
- same normalized text
- inside the configured duplicate window

Default duplicate windows:

- Posts: reject identical normalized text within `6 hours`
- Replies: reject identical normalized text within `30 minutes`

Escalation:

- first duplicate hit: return `422 SPAM_DETECTED`
- second duplicate hit within 24 hours: `+3` risk score
- third duplicate hit within 24 hours: `posting_block` or `reply_block` for `2 hours`

### Cooldown Rules

| Action | Minimum time |
| --- | --- |
| post create | `45s` |
| reply create | `12s` |
| vote create | `1s` |
| accepted city switch | `30m` |

## Bot And Suspicious Behavior Heuristics

`device_risk_score` is an integer from `0` to `100`.

It only changes through deterministic events.

### Risk Score Adjustments

| Event | Score change |
| --- | --- |
| 3 or more new sessions from same `ipHash + userAgentHash` in 30 min | `+8` |
| 5 or more new sessions from same `ipHash` in 24 h | `+12` |
| refresh token rotation faster than `1 / 10s` for the same session 3 times | `+6` |
| refresh token reuse detected | `+20` |
| same endpoint limit hit 3 times in 15 min | `+4` |
| same endpoint limit hit 6 times in 60 min | `+8` |
| global request limit hit | `+6` |
| rejected city switch due cooldown | `+4` |
| rejected city switch due impossible jump | `+10` |
| repeated suspicious vote cluster event | `+8` |

### Risk Score Decay

To keep v1 simple:

- score decays by `-5` every 24 hours without new suspicious events
- minimum score is `0`
- decay is applied lazily on the next security-relevant request

### Thresholds

| Score | State | Action |
| --- | --- | --- |
| `0-14` | normal | no automatic restriction |
| `15-24` | soft flagged | audit only, moderation-visible security flag |
| `25-39` | restricted | temporary action block based on trigger |
| `40+` | locked | `read_only` for `12 hours` and moderation review item |

### Restriction Mapping

| Trigger | Restriction |
| --- | --- |
| post spam or duplicate posts | `posting_block` |
| reply spam or duplicate replies | `reply_block` |
| vote abuse or vote cluster abuse | `vote_block` |
| severe or repeated mixed abuse | `read_only` |
| repeated geo abuse | `geo_lock` |

### Moderation Integration

Automated restrictions must produce:

- an `audit_logs` entry with action `security.restrict_install`
- an internal moderation case if risk reaches `40+`

Use `moderation_cases.targetType = "user"` for automatic restriction review.

## Vote Manipulation Protection

### Core Rules

Votes are already unique per install identity and target in the schema. v1 adds abuse protection before vote writes are accepted.

### Vote Rate Limits

- Maximum `20` votes per minute per install identity
- Maximum `120` votes per hour per install identity
- Maximum `60` votes per minute per IP hash
- Maximum `12` votes across distinct targets in `60 seconds` per install identity

### Same Prefix Cluster Protection

To reduce coordinated voting from one network block:

- Track per target and per `ipPrefixHash`
- Reject once more than `4` votes from the same prefix hit the same target inside `10 minutes`

Redis key:

`abuse:v1:vcluster:<targetType>:<targetId>:10m:prefix:<ipPrefixHash>`

Behavior:

- first 4 votes: normal
- vote 5 and above in the same 10-minute window: reject with `403 SUSPICIOUS_ACTIVITY`
- add `+8` risk score to the current install identity
- if the same install identity triggers this twice in 24 hours: `vote_block` for `6 hours`

### Consistent Score Logic

v1 does not use shadow weights or partial damping.

A suspicious vote is either:

- fully accepted and applied to the aggregate score
- fully rejected and not stored

This keeps `posts.score`, `replies.score`, and `votes` consistent.

### Optional Damping Flag

If a dampening mode is desired later, it must be config-driven and off by default:

- `VOTE_MANIPULATION_MODE=block | ignore`
- default: `block`

`ignore` means:

- do not write the vote row
- do not change aggregate score
- still emit `403 SUSPICIOUS_ACTIVITY`

## Geo Misuse Protection

Geo safety applies to `POST /geo/resolve` and any route that persists a city change.

### Accepted City Switching Rules

- Minimum time between accepted city changes: `30 minutes`
- Maximum accepted city switches: `3 per 24 hours`
- City change is only accepted after server-side city resolution

### Unrealistic Jump Rules

Reject a city change if either condition is true:

- centroid distance is greater than `150 km` and elapsed time since last accepted switch is less than `60 minutes`
- centroid distance is greater than `500 km` and elapsed time is less than `6 hours`

### Behavior

On rejection:

- do not update `install_identities.city_id`
- return `403 SUSPICIOUS_ACTIVITY`
- write a `geo_events` row with `result = rejected`
- add risk score:
  - cooldown-only violation: `+4`
  - unrealistic jump: `+10`

If 3 geo rejections occur in 24 hours:

- create `geo_lock` for `12 hours`
- keep the last accepted city as the only allowed city context

## Token And Session Security

This section defines the session model for the planned v1 refresh-token flow.

### Session Rules

- Access tokens are short-lived and stateless
- Refresh tokens are long-lived, stored hashed, and single-use
- Every refresh rotates the refresh token
- Refresh token reuse revokes the whole token family

### Default TTLs

| Token | TTL |
| --- | --- |
| access token | `15 minutes` |
| refresh token inactivity TTL | `7 days` |
| refresh token absolute TTL | `30 days` |

### Strict Rotation

On every `POST /auth/refresh`:

1. validate presented token hash against one active `install_sessions` row
2. revoke current session row
3. create new session row in the same token family
4. return new access token and new refresh token

### Reuse Detection

If an already-rotated or revoked refresh token is presented:

- revoke all active sessions in the token family
- revoke all active sessions for that install identity
- return `403 SUSPICIOUS_ACTIVITY`
- add `+20` risk score
- create `read_only` for `1 hour`
- require full re-registration or explicit re-auth bootstrap

### Maximum Active Sessions

- Maximum `3` active sessions per install identity
- On new session creation above the limit:
  - revoke the oldest active session
  - write an audit log entry

### Unusual Session Patterns

Add risk when:

- more than `2` active sessions exist with different `userAgentHash` values inside `24 hours`: `+6`
- more than `5` new sessions are created for one install identity inside `24 hours`: `+10`

## API Misuse Protection

### Global Rules

- Every request goes through a global IP limiter
- Every authenticated consumer request goes through an install limiter
- Endpoint-specific rate limits run after auth and install extraction

### Endpoint Flooding

If a single `ipHash` sends more than `30` requests to the same route inside `10 seconds`:

- block that route for that IP for `5 minutes`
- return `429 RATE_LIMIT_EXCEEDED`
- add `+6` risk to any install identity attached to the requests

### Pagination Abuse

For any paginated list endpoint:

- max `limit` is `50`
- repeated identical cursor requests more than `10` times in `5 minutes` return `429 RATE_LIMIT_EXCEEDED`
- pagination requests still count toward route rate limits

### Active Restriction Behavior

If an install identity has an active restriction:

| Restriction | Blocked endpoints |
| --- | --- |
| `posting_block` | `POST /posts` |
| `reply_block` | `POST /replies` |
| `vote_block` | `POST /votes` |
| `chat_request_block` | `POST /chat/requests` |
| `read_only` | all consumer write endpoints except safe session cleanup |
| `geo_lock` | `POST /geo/resolve` when result would change city |

Response:

- status `423`
- code `ACTION_TEMPORARILY_BLOCKED`
- include `restriction_type`
- include `retry_after_seconds`

## Content Safety v1

### Text Length

Enforce at the API layer:

- post body max length: `600`
- reply body max length: `300`
- chat message body max length: `400`
- search query max length: `80`

### Hashtags

- Maximum `5` hashtags per post
- Replies do not use hashtags

### Basic Forbidden Pattern Filters

These are simple regex-based checks, fully config-driven.

Default enabled filters:

- email addresses
- phone numbers
- IBAN-like bank strings
- more than `3` URLs in one post

Default action:

- set `moderation_state = flagged`
- keep content out of feed, search, and channel lists
- create audit log entry `security.flag_content`
- do not auto-delete

### Automatic Moderation State Changes

Apply `moderation = flagged` automatically when:

- forbidden pattern filter matches
- duplicate content trigger fires 3 times in 24 hours for the same install identity
- install identity is in `read_only` and still attempts content writes through a recovered or stale client

`blocked` remains an admin or high-confidence system action, not a first-pass spam heuristic.

## Integration

## 1. Middleware

Middleware responsibilities:

- derive `installIdentityId`, `ipHash`, `userAgentHash`, `ipPrefixHash`
- enforce global and endpoint rate limits
- load active restrictions for the install identity
- reject blocked actions before they hit the service layer

Middleware must not:

- mutate business entities
- compute duplicate content
- update moderation state

## 2. Service Layer

Service-layer responsibilities:

- text normalization and duplicate detection
- cooldown enforcement
- risk score mutation
- geo jump validation
- vote cluster validation
- session rotation and reuse detection
- audit log writes for automated security actions

## 3. Database

PostgreSQL responsibilities:

- durable restrictions
- durable session family state
- durable geo event history
- durable audit trail
- durable moderation state on content

Redis responsibilities:

- high-frequency rate counters
- cooldown windows
- duplicate fingerprints
- vote cluster counters

## 4. Audit

Every automatic security action must write to `audit_logs`.

Required audit actions:

- `security.rate_limit_hit`
- `security.spam_rejected`
- `security.flag_content`
- `security.restrict_install`
- `security.geo_rejected`
- `security.session_reuse_detected`
- `security.vote_cluster_rejected`

## Configuration

All thresholds must be environment-backed and overrideable.

### Required Config Keys

| Key | Default |
| --- | --- |
| `ABUSE_HASH_SECRET` | required |
| `RL_GLOBAL_IP_PER_MINUTE` | `180` |
| `RL_GLOBAL_INSTALL_PER_MINUTE` | `90` |
| `RL_POSTS_PER_HOUR` | `5` |
| `RL_POSTS_PER_DAY` | `20` |
| `RL_REPLIES_PER_HOUR` | `20` |
| `RL_REPLIES_PER_DAY` | `80` |
| `RL_VOTES_PER_MINUTE` | `20` |
| `RL_VOTES_PER_HOUR` | `120` |
| `RL_SEARCH_PER_MINUTE` | `30` |
| `RL_INSTALL_REGISTER_PER_10M_IP` | `8` |
| `RL_GEO_RESOLVE_PER_10M_INSTALL` | `12` |
| `RL_AUTH_REFRESH_PER_15M_SESSION` | `8` |
| `COOLDOWN_POST_SECONDS` | `45` |
| `COOLDOWN_REPLY_SECONDS` | `12` |
| `COOLDOWN_VOTE_SECONDS` | `1` |
| `COOLDOWN_CITY_SWITCH_SECONDS` | `1800` |
| `DUPLICATE_POST_WINDOW_SECONDS` | `21600` |
| `DUPLICATE_REPLY_WINDOW_SECONDS` | `1800` |
| `RISK_SOFT_FLAG_THRESHOLD` | `15` |
| `RISK_RESTRICT_THRESHOLD` | `25` |
| `RISK_LOCK_THRESHOLD` | `40` |
| `RISK_DECAY_PER_DAY` | `5` |
| `SESSION_MAX_ACTIVE_PER_INSTALL` | `3` |
| `SESSION_ACCESS_TTL_SECONDS` | `900` |
| `SESSION_REFRESH_IDLE_TTL_SECONDS` | `604800` |
| `SESSION_REFRESH_ABSOLUTE_TTL_SECONDS` | `2592000` |
| `GEO_MAX_SWITCHES_PER_DAY` | `3` |
| `GEO_NEAR_JUMP_KM` | `150` |
| `GEO_NEAR_JUMP_MIN_SECONDS` | `3600` |
| `GEO_FAR_JUMP_KM` | `500` |
| `GEO_FAR_JUMP_MIN_SECONDS` | `21600` |
| `MAX_POST_BODY_LENGTH` | `600` |
| `MAX_REPLY_BODY_LENGTH` | `300` |
| `MAX_CHAT_BODY_LENGTH` | `400` |
| `MAX_SEARCH_QUERY_LENGTH` | `80` |
| `MAX_HASHTAGS_PER_POST` | `5` |
| `VOTE_CLUSTER_PREFIX_LIMIT` | `4` |
| `VOTE_CLUSTER_WINDOW_SECONDS` | `600` |
| `VOTE_MANIPULATION_MODE` | `block` |

## Error Codes

These codes extend the existing API error shape and are required for anti-abuse v1.

| Code | HTTP status | Meaning |
| --- | --- | --- |
| `RATE_LIMIT_EXCEEDED` | `429` | request blocked by rate limit |
| `SPAM_DETECTED` | `422` | request rejected by duplicate or spam rule |
| `SUSPICIOUS_ACTIVITY` | `403` | request matches security heuristic or suspicious session/geo/vote behavior |
| `ACTION_TEMPORARILY_BLOCKED` | `423` | install identity has an active temporary restriction |

### Required Error Details

`RATE_LIMIT_EXCEEDED` details:

- `route_key`
- `window`
- `retry_after_seconds`

`SPAM_DETECTED` details:

- `reason`
- `window_seconds`

`SUSPICIOUS_ACTIVITY` details:

- `reason`
- `risk_score`

`ACTION_TEMPORARILY_BLOCKED` details:

- `restriction_type`
- `retry_after_seconds`

## v1 Implementation Notes

- Start with Redis counters plus the four minimal Postgres additions in this document.
- Do not build generalized policy engines.
- Do not build score-weighted vote damping in v1.
- Do not build behavioral ML.
- Use auditability everywhere a system rule changes user access, visibility, or session state.

The guiding rule for v1 is simple:

If a request is abusive, reject it early.
If a pattern repeats, increase risk.
If risk crosses a threshold, apply a temporary server-owned restriction and record it.
