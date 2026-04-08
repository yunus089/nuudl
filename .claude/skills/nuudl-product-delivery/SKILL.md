---
name: "NUUDL Product Delivery"
description: "Build and refine the NUUDL mobile-only PWA with screenshot-driven UI fidelity, API-first consumer flows, and disciplined verification. Use when implementing screens, closing dead flows, coordinating subagents, or driving parity work in this repo."
---

# NUUDL Product Delivery

## What This Skill Does

Project-specific playbook for shipping NUUDL as a mobile-only PWA with tighter screen fidelity, cleaner product logic, and reliable verification.

## Use This Skill When

- working anywhere in this repository on consumer, API, admin, blueprint, or shared contracts
- driving screenshot parity, UX cleanup, or dead-button reduction
- moving consumer interactions from mock state to real API flows
- coordinating multiple agents on disjoint slices of the product

## Project Defaults

- NUUDL is a **mobile-only PWA**, not an app-store app
- prioritize **functional parity first**, then visual tightening
- prefer **API-backed state** over local demo state whenever the endpoint exists
- keep the UI **dense, utilitarian, and repetitive**, not glossy or dashboard-like
- user-facing branding should say **NUUDL**, never old placeholder branding

## Default Workflow

1. Read the relevant route, provider, shared type, and API route before changing anything.
2. Pick the **smallest user-visible slice** that closes a meaningful gap.
3. Prefer wiring existing endpoints before inventing new UI states.
4. Keep local fallback only when it materially helps preview resilience.
5. Verify touched areas with typecheck/build and a live reachability or smoke test when possible.
6. Report progress with `% gesamt`, `% Kernfluesse`, `% Fidelity`.

## UI Fidelity Rules

- feed, thread, channels, and chat should feel compact and functional
- reduce hero sections, oversized cards, excess shadows, and long copy
- keep top and bottom chrome stable; let the middle content do the work
- trim whitespace before adding new components
- if a screen still feels “custom product UI”, it is probably too far from the target density

## Subagent Playbook

- use explorers for audits, risk scans, and prioritization
- use workers only when write scopes are clearly disjoint
- do not duplicate investigation across agents
- fold subagent findings back into one concrete implementation plan immediately

## Minimum Verification

- `npm run typecheck --workspace @veil/consumer` after consumer changes
- `npm run typecheck --workspace @veil/api` after API changes
- `npm run build --workspace @veil/consumer` after meaningful UI/state changes
- check `http://localhost:3000` and `http://localhost:4000/health` when preview/runtime behavior matters
