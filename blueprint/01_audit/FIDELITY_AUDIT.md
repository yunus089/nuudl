# NUUDL Fidelity Audit

## Scope

This audit compares the current scaffold against:

- [Aufgabeninfos.txt](C:/Users/yunus/Desktop/OJ_neu/Aufgabeninfos.txt)
- [Master_Blueprint_ Mobile.txt](C:/Users/yunus/Desktop/oj_kiro/Master_Blueprint_ Mobile.txt)
- Screenshot references in [screens_contact_sheet.png](C:/Users/yunus/Desktop/OJ_neu/screens_contact_sheet.png) and [screens_extracted](C:/Users/yunus/Desktop/OJ_neu/screens_extracted)
- Current implementation in [apps/consumer/app/page.tsx](C:/Users/yunus/Desktop/OJ_neu/apps/consumer/app/page.tsx), [apps/consumer/app/globals.css](C:/Users/yunus/Desktop/OJ_neu/apps/consumer/app/globals.css), [apps/api/src/routes.ts](C:/Users/yunus/Desktop/OJ_neu/apps/api/src/routes.ts), [apps/admin/app/page.tsx](C:/Users/yunus/Desktop/OJ_neu/apps/admin/app/page.tsx), and [packages/shared/src/mock-data.ts](C:/Users/yunus/Desktop/OJ_neu/packages/shared/src/mock-data.ts)

This is not a "general quality" review. It is a parity audit against the reference behavior and UI structure.

## Current Verdict

The project is structurally promising but still far from screenshot-faithful parity.

Current parity estimate:

- App shell and navigation: `3/10`
- Feed and post cards: `2/10`
- Channels and search: `3/10`
- Notifications: `3/10`
- Me / More / Settings: `2/10`
- Plus / paywall: `3/10`
- Data and backend contracts: `6/10`
- Moderation / admin backoffice: `5/10`

Main conclusion:

- The backend and blueprint are moving in the right direction.
- The consumer UI is still architected like a demo shell with themed cards.
- The reference app is denser, flatter, list-driven, and much more repetitive in layout.
- The current UI still invents too much instead of copying screen grammar.

## Screen Inventory From Screenshots

The screenshot set clearly shows these distinct consumer surfaces:

- Home feed with `Top 10` / `Home` toggle
- Feed sort chips: `Neu`, `Kommentiert`, `Lauteste`
- Feed cards with compact metadata, right-side vote rail, and poll cards
- Fullscreen Plus paywall with plans and benefit grid
- Channels list with search field and dense rows
- Search variants with keyboard and result lists
- Notifications list (`Mitteilungen`) as a dense event feed
- More / settings overview with long row lists
- Notification settings with toggles
- Legal / support / about style long-text screens
- Discovery / category / topic grid screens
- Plain utility screens with minimal chrome, not hero cards

The screenshot set also implies these secondary states:

- Empty-ish search state
- Search with active keyboard
- Dense list scroll states
- Toggle-heavy settings states
- Paywall CTA states
- Long-form legal / support content states

## Biggest Fidelity Gaps

### 1. Wrong screen grammar

The current consumer uses large hero cards, metrics, feature tiles, and promotional blocks.

The reference app uses:

- compact top chrome
- dense lists
- repeated row patterns
- dark, flat surfaces
- minimal decorative sections

This is the biggest mismatch.

### 2. Home feed hierarchy is wrong

Reference feed order:

- top utility row
- `Top 10 / Home`
- sort chips
- immediate feed cards

Current app order still inserts oversized promo and dashboard-style content before the feed.

### 3. Feed cards are not copied closely enough

Reference cards are compact and repetitive:

- handle + city + age
- short body
- optional poll block
- minimal reply count
- vote rail on the right

Current cards are too spacious and visually stylized, and they still read like custom components rather than copied list items.

### 4. Bottom navigation is stylistically wrong

The reference bottom nav is visually flat, icon-first, with a centered compose affordance.

Current nav still feels like a modernized component library bar rather than a direct clone of the screenshot pattern.

### 5. Top bar behavior is still off

The screenshot set does not use one generic top bar for all screens.

It varies by surface:

- feed uses upgrade + city + karma
- notifications use title-centric top bar
- channels/search use title + search directly below

Current implementation over-reuses one shell pattern.

### 6. Channels screen is too "discover" oriented

Reference channels screen is mainly:

- title
- local search field
- dense joined/discoverable channel list

Current implementation still mixes search, explorer, growth flags, and discovery concepts in one view.

### 7. Notifications are too card-based

Reference notifications are a plain, dense, vertically stacked event stream.

Current implementation wraps notifications in cards and tabs that add structure not present in the screenshots.

### 8. More / Settings depth is missing

The screenshots show a very long "More" tree with many subsections, toggles, legal pages, and support screens.

Current consumer only hints at that depth.

### 9. Plus paywall is not close enough

Reference paywall is a distinct visual mode:

- stronger color shift
- plan selection as primary interaction
- benefits shown densely
- direct CTA emphasis

Current Plus sheet is still too mild and too close to the rest of the app styling.

### 10. Too much English, too much product invention

The screenshots are overwhelmingly German and utilitarian.

Current consumer still mixes English labels, invented marketing copy, and explanatory text that the reference app simply does not have.

## Missing States And Screens

These are either missing entirely or too incomplete to claim parity:

- dedicated `Channels` screen separate from generic discovery
- dedicated `Search` screen with search-first layout
- post detail / reply thread screen
- poll interaction state
- dedicated `Mitteilungen` dense list screen
- full `More` menu tree
- nested settings sections
- legal / support / community text screens
- clearer empty states for search and chat
- clearer loading and blocked geolocation states
- report flow from post / reply / chat
- accepted chat detail thread with actual composer affordance
- read-only explorer city states that look like the reference

## Data And Logic Mismatches

The data layer is stronger than the UI, but parity gaps remain.

### Data mismatches

- Shared mock data is still too sparse for screenshot-faithful list density.
- Too many surfaces rely on a few repeated demo entities.
- Search and channels need more realistic row volume.
- Notification data should be denser and more repetitive.
- Settings / legal / support content does not yet have a realistic content model.

### Flow mismatches

- Consumer still does not run primarily from API state.
- Too many UI surfaces are static or mock-only instead of behaving through the intended contracts.
- Home, channels, notifications, wallet, and creator status should be hydrated through `/me`, `/feed`, `/channels`, `/notifications`, `/wallet`, and `/creator/status`.
- Chat request, reply, tip, and report flows are not yet driving the consumer as the primary source of truth.

### State mismatches

- Missing explicit `loading / ready / empty / error / blocked` treatment on many screens
- Missing local row-level interaction states
- Missing optimistic update or replay states for votes, replies, tips, and chat

## Why The Current Build Feels Wrong

The current implementation is trying to be "good product UI".

The reference app is not that. It is more mechanical:

- same chrome repeated
- low variation
- dense rows
- narrow color accents
- very little breathing room
- many screens differ by list content, not by layout invention

To get to 1:1 parity, the team has to stop inventing new visual language and instead reproduce the screenshot grammar literally.

## Team Plan To Reach 1:1 Parity

### Track A: Consumer UI shell

Owner focus:

- build one fixed mobile shell
- per-screen top bar variants
- screenshot-like bottom nav
- central compose control

Deliverables:

- shared shell
- screen-specific headers
- fixed bottom nav
- consistent row/list primitives

### Track B: Screen-by-screen parity

Owner focus:

- rebuild `Home`
- rebuild `Channels`
- rebuild `Search`
- rebuild `Mitteilungen`
- rebuild `More / Settings`
- rebuild `Plus`

Rule:

- no hero invention
- no dashboard metrics unless screenshot proves them
- copy spacing, density, and row rhythm first

### Track C: Data volume and realism

Owner focus:

- expand mock data
- denser channels
- denser notification events
- more post variations
- settings tree content

Rule:

- use data to make screens feel real
- stop reusing a tiny demo set everywhere

### Track D: Consumer behavior fidelity

Owner focus:

- wire consumer to API
- loading and empty states
- report/tip/reply/chat side effects
- creator/wallet state hydration

### Track E: Validation

Owner focus:

- screenshot comparison runs
- browser automation against localhost
- parity checklist by screen

Use the local workflow reference from [skills/webapp-testing/SKILL.md](C:/Users/yunus/Desktop/OJ_neu/skills/webapp-testing/SKILL.md) and [skills/webapp-testing/scripts/with_server.py](C:/Users/yunus/Desktop/OJ_neu/skills/webapp-testing/scripts/with_server.py) for repeatable visual checks.

## Immediate Implementation Order

### Phase 1: Stop the UI drift

1. Replace current feed header and feed body order with the screenshot order.
2. Replace decorative hero cards with compact rows and dense sections.
3. Redesign bottom nav to match screenshot structure.
4. Rebuild channels as a dense searchable list.
5. Rebuild notifications as a plain event list.

### Phase 2: Restore screen separation

1. Split `Channels` and `Search`
2. Split `Me`, `More`, and nested settings
3. Add post detail / reply thread
4. Add separate legal / support text screens

### Phase 3: Make it behave correctly

1. Hydrate consumer via API
2. Add proper loading / empty / error states
3. Hook reply / vote / tip / chat / report actions to API

### Phase 4: Visual validation loop

1. Capture current localhost screenshots
2. Compare against provided references
3. Fix one surface at a time
4. Repeat until shell, density, and behavior match

## Definition Of "Close Enough" For 1:1

We can call the consumer "near-parity" only when:

- home feed header structure matches
- feed card density matches
- channels screen reads as the same screen family
- notifications screen reads as the same screen family
- more/settings tree depth is visible
- plus screen is immediately recognizable as the same paywall pattern
- behavior is driven by the intended routes and state contracts

Right now, the scaffold does not meet that bar.
