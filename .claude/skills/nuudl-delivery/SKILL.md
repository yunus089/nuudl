---
name: "NUUDL Delivery"
description: "Build and refine the NUUDL mobile-only PWA across consumer, API, admin, and shared contracts with strict screenshot fidelity, API-state consistency, mobile-first navigation, and verification gates. Use when implementing features, fixing UI/API drift, planning parallel agent lanes, or validating parity in this repository."
---

# NUUDL Delivery

Use this skill when working in the `OJ_neu` repository.

## What This Skill Does

This skill keeps NUUDL work aligned to the actual product target:

- mobile-only consumer PWA
- screenshot-faithful structure and density
- API-backed behavior over misleading local-only state
- stable consumer shell and navigation
- explicit verification after each vertical slice

## Current Product Contract

- Consumer is mobile-only. Desktop is secondary and may show a hint instead of a full experience.
- The target is parity in information architecture, density, hierarchy, and state progression before visual invention.
- The consumer must stay denser, flatter, and more list-driven than a generic dashboard app.
- If a flow can be API-backed without blocking delivery, prefer that over local mock state.
- Local preview stability matters: stale service-worker or chunk behavior on `localhost` is a real regression.

Read these files before larger changes:

- `../../../README.md`
- `../../../PARITY_PLAN.md`
- `../../../blueprint/README.md`

For API/state work, also read:

- `../../../apps/api/src/routes.ts`
- `../../../apps/consumer/app/_lib/consumer-api.ts`
- `../../../packages/shared/src/types.ts`

## Working Rules

- Do not add marketing sections, metrics tiles, or novelty UI unless the reference structure clearly supports them.
- Keep the top bar, bottom nav, and scroll regions structurally stable.
- Prefer dense lists over custom cards.
- Prefer one dominant action per screen.
- Treat screenshots as contracts, not inspiration.
- Treat shared mock data as placeholder content, not final interaction truth.

## Default Delivery Flow

1. Identify the affected lane:
   - shell/navigation
   - feed/thread
   - discovery/channels/search
   - inbox/chat/notifications
   - me/settings/wallet/plus/creator
   - API/contracts/state
   - verification
2. Read only the directly relevant files.
3. If the task is large, split bounded sub-problems across sub-agents with narrow scopes.
4. Implement the smallest vertical slice that closes a real product gap.
5. Verify with typechecks/builds and at least one runtime or endpoint smoke check.
6. Report percentages for:
   - overall delivery
   - core flows
   - fidelity

## Sub-Agent Lanes

Use sub-agents for bounded analysis, not vague parallelism.

- Shell specialist: top bar, bottom nav, sticky regions, sheets
- Feed specialist: dense feed rows, vote rail, composer, thread hierarchy
- Discovery specialist: channels/search grouping, dense rows, empty/loading/error states
- Inbox/chat specialist: requests vs threads, previews, message state
- Me/settings specialist: wallet, plus, creator, settings structure
- API/state specialist: provider, consumer API client, route contracts, shared types
- Verification specialist: regression checks, stale preview issues, parity checklist

## Verification Minimum

For consumer changes:

- `npm run typecheck --workspace @veil/consumer`
- `npm run build --workspace @veil/consumer`
- confirm `http://localhost:3000/?v=<stamp>` returns `200`

For API changes:

- `npm run typecheck --workspace @veil/api`
- if routes changed, smoke the affected endpoint on `http://localhost:4000`

For cross-slice changes:

- verify consumer and API are both reachable
- verify the changed flow end-to-end at least once

## Local Preview Notes

- Prefer a local dev server on `3000` for ongoing UI work.
- Prefer a local API dev server on `4000` for ongoing backend work.
- On `localhost`, stale chunks or a stale service worker are productively treated as bugs. If the preview looks old, use a versioned URL such as `http://localhost:3000/?v=next` and confirm the fresh page is actually being served.

## Good Outcomes

A change is good only if it improves one or more of these without regressing the others:

- fidelity
- navigation predictability
- state consistency
- end-to-end flow realism
- verification confidence
