# NUUDL Parity Plan

## Purpose

This file is the execution plan for moving the current consumer scaffold toward screenshot-faithful parity. The target is not "inspired by". The target is "same information architecture, same screen density, same interaction hierarchy, same state progression, then rebrand safely."

## Current Assessment

- Visual parity: low
- Screen parity: low
- Interaction parity: low
- Logic parity: medium-low
- Data/model groundwork: medium

The current consumer app is still too dashboard-like, too verbose, too card-heavy, and too custom. The reference app is denser, flatter, more list-driven, and much stricter about navigation, hierarchy, and state transitions.

## Team Lanes

- Orchestrator
  Own the screenshot matrix, parity checklist, acceptance criteria, and sequencing.
- Frontend Shell Specialist
  Rebuild top bar, bottom nav, floating composer, and screen container behavior.
- Feed Specialist
  Rebuild home feed, Top 10 vs Home toggle, sort pills, vote rail, dense post cards, and poll cards.
- Discovery Specialist
  Rebuild channels/search structure, dense channel rows, and search-first discovery state.
- Inbox/Chat Specialist
  Rebuild notifications list, chat requests, thread previews, and message screen states.
- Profile/Settings Specialist
  Rebuild Me, More, wallet, plus, creator, and settings screens as reference-faithful list screens.
- Logic/API Specialist
  Wire screen states to API contracts and remove fake local-only behavior where it distorts the product.
- Verification Specialist
  Capture current vs target screenshots, run browser checks, and enforce a parity checklist per screen.

## Mandatory Working Rules

- No new "marketing cards" unless a screenshot clearly shows them.
- No metrics tiles on consumer screens unless the reference clearly uses them.
- Prefer dense lists over bespoke cards.
- Prefer one dominant action per screen.
- Keep top bar and bottom nav structurally stable across screens.
- Match spacing rhythm, row density, and visual weight before inventing new UI.
- Treat screenshots as product contracts, not loose inspiration.

## Execution Order

### Phase 0: Reference Lock

- Extract a screen inventory from the screenshots.
- Mark each screen as `must match structure`, `must match behavior`, or `later`.
- Freeze a parity checklist before more UI code is written.

### Phase 1: Shell Fidelity

- Lock the app shell layout.
- Fix sticky header, sticky bottom nav, and internal scroll regions.
- Add one screen container system and one sheet container system.
- Stop mixing unrelated flows on one screen.

### Phase 2: Core Screen Fidelity

- Feed
- Channels
- Notifications
- More/Settings
- Plus
- Location

These matter most because they dominate the screenshots and define the product feel.

### Phase 3: Logic Fidelity

- Feed sorting and state
- Channel discovery state
- Search grouping
- Notification grouping
- Chat request vs thread state
- Wallet and creator status state

### Phase 4: API and Data Fidelity

- Replace local-only screen state with API-backed view models where possible.
- Align screen empty/loading/error states with the richer blueprint.
- Use shared data only as placeholder content, not as the final interaction layer.

### Phase 5: Verification

- Browser screenshot capture per screen
- Side-by-side screenshot review
- Per-screen parity score
- Regression list for shell, spacing, density, and navigation

## First Concrete Cut

1. Strip the consumer of non-reference hero sections and metrics.
2. Rebuild the feed screen to match the screenshot structure exactly.
3. Rebuild the channels screen as a dense list with search.
4. Rebuild notifications as a dense icon/text/time list.
5. Rebuild the top and bottom navigation to stay visually stable across these screens.

## Definition Of Better

The next version is better only if:

- the first viewport of `Feed`, `Channels`, and `Notifications` immediately resembles the screenshots,
- the app shell feels like one product rather than several prototype cards,
- the user can predict where actions live without scanning the whole page,
- the UI is denser, calmer, and less self-invented than the current build.
