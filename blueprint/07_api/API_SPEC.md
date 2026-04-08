# API Spec

## API Discipline

- JSON only
- Mobile-first payloads
- Cursor or token pagination for list endpoints
- Server is authoritative for geo, entitlements, moderation, and balances
- Critical writes must accept an idempotency key
- Provider-facing actions must be adapter-driven, not hard-coded to one vendor

## Standard Headers

- `Authorization: Bearer <access_token>` for admin and any session-bound routes
- `Content-Type: application/json`
- `Idempotency-Key: <uuid>` for topups, tips, checkout, and other critical writes
- `X-App-Version: <semver>` for compatibility tracking

## Standard Error Shape

```json
{
  "error": {
    "code": "GEO_REQUIRED",
    "message": "Location is required before feed access.",
    "details": {}
  }
}
```

## Common Error Codes

- `GEO_REQUIRED`
- `UNSUPPORTED_CITY`
- `AGE_GATE_REQUIRED`
- `ENTITLEMENT_REQUIRED`
- `MODERATION_BLOCKED`
- `INSUFFICIENT_WALLET_BALANCE`
- `CREATOR_NOT_ELIGIBLE`
- `IDEMPOTENCY_CONFLICT`
- `VALIDATION_ERROR`
- `NOT_FOUND`

## Consumer Endpoints

- `POST /install/register`
- `POST /geo/resolve`
- `GET /feed`
- `GET /channels`
- `GET /search`
- `POST /posts`
- `POST /replies`
- `POST /votes`
- `POST /chat/requests`
- `GET /notifications`
- `POST /reports`

## Monetization Endpoints

- `POST /wallet/topups`
- `GET /wallet`
- `POST /tips`
- `POST /creator/apply`
- `GET /creator/status`
- `GET /earnings`
- `POST /plus/checkout`

## Admin Endpoints

- `GET /admin/reports`
- `POST /admin/moderation/actions`
- `GET /admin/creator-applications`
- `POST /admin/creator-approvals`
- `GET /admin/ledger`
- `POST /admin/payouts`

## Shared Request Rules

- Every request is scoped by install identity or admin session
- Location-dependent routes require a city context
- Tip and payout routes must be adapter-driven and provider-agnostic
- Search and feed routes must hide blocked or moderated items unless the caller is authorized to see them
- Payment, creator, and moderation writes should be safe to retry

## Endpoint Notes

- `POST /install/register` creates or refreshes the anonymous install identity
- `POST /geo/resolve` maps coordinates to a canonical city context
- `GET /feed` returns city-scoped feed items with cursor pagination
- `GET /channels` returns discoverable channels for the current city
- `GET /search` returns grouped channel, hashtag, and post results
- `POST /posts`, `POST /replies`, and `POST /votes` are moderation-aware writes
- `POST /chat/requests` starts the gated chat flow
- `GET /notifications` is in-app only in v1
- `POST /reports` creates a moderation case
- `POST /wallet/topups`, `POST /tips`, and `POST /plus/checkout` must be idempotent
- `POST /creator/apply` and `POST /admin/creator-approvals` are separate lifecycle stages
- `GET /admin/ledger` and `GET /admin/reports` are internal review tools, not consumer APIs

## Response Shape

- Keep list endpoints paginated
- Return `403` for gate failures and missing entitlements
- Return `409` for duplicate votes, duplicate creator submissions, and repeated payment writes
- Return `422` for validation errors when the request is structurally valid but business-invalid
