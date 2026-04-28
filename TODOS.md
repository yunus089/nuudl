# TODOS

Deferred decisions and future scope items from /plan-ceo-review (2026-04-27).

---

## Deferred from Beta Scope

### Ephemerality Toggle
Creator can choose post lifetime: permanent / 24h / 72h.

**Why deferred**: Adds product surface area before we know if anyone will post at all.
The question "how long should my post last?" only matters after someone posts.

**When to revisit**: After first 30-day retention data. Look for: do users delete posts
manually? Do they ask for it in feedback? If yes — implement. If not mentioned — skip.

**Implementation notes**: Needs a `expires_at` column on posts, a cron/worker that
marks posts expired, and a composer UI toggle. Backend estimated ~1 day, UI ~half day.

---

## Future Scope (Phase 2)

### Real Payment Integration
Providers to evaluate: CCBill, SegPay, Verotel.
Expected fees: 10-15% per transaction.
Expected timeline: 4-8 weeks of compliance/onboarding (EU adult content underwriting
can take 60-90 days — pre-scout in Week 2 even if not executing yet).

Gate: complete CSAM compliance and reach Phase 2 DAU gate first.

### Second City Expansion
Hamburg or Berlin — pick based on Jodel NSFW activity at time of expansion.
Use same manual seeding playbook: 100 recruits, invite flywheel, same approach.

### Native App Wrapper
Evaluate only if PWA install drop-off exceeds 50% from first 10 recruits.
Capacitor or similar — estimated ~1 week implementation.

### Optional Private Key Export
For beta users who clear browser data: allow exporting anonymous identity key.
Low priority — document the limitation in onboarding instead for beta.

---

## Compliance / Legal Backlog

### NetzDG Pipeline
NetzDG is legally required for platforms >1M users. Not required at beta scale, but
advisable to architect early. Add a structured report-reason + response-tracking system.

### GDPR Audit
PWA anonymity model needs GDPR review — specifically: what counts as personal data
when identity is install-key-based? Get clarity before Phase 2 expansion.

---

## Engineering Backlog (Post-Beta)

### Invite Gate End-to-End Test
Full flow: valid env code → `/install/register` → install session issued.
Currently only format rejection is tested (http-guards.test.ts). A broken gate
would be caught immediately by the first recruit who can't log in, but a regression
test would catch it in CI before deploy.
File: `apps/api/test/http-guards.test.ts` or new `invite-flows.test.ts`. ~20 lines.

### Presence Store Multi-Instance Refactor
Current in-memory presence fallback in `rate-limit-store.ts` is per-process.
If API runs on multiple instances (Phase 2 horizontal scaling), in-memory counts
diverge per instance — each instance only knows about its own users.
Redis path already handles this correctly (shared state).
At Phase 2, require Redis for presence (remove memory fallback for presence only,
or accept that memory fallback shows per-instance counts).
Evaluate when moving to multi-instance Coolify deploy.

## Design Backlog (Post-Parity)

### Profile-Less Creator Page
Persistent anonymous creator view: all posts from one identity in a city feed.
No follower count, no name, no bio. Just the posts. For Phase 2 when tips need
a destination.

### Tip Flow
UI for tipping a creator: anonymous sender, visible tip to creator's identity.
Requires payment integration to be real. Fake tip flow already exists for validation.
