# NUUDL Team Execution Plan

## Goal

Reach screenshot-faithful parity by treating this as a replication program, not as open-ended product design.

## Workstreams

### Workstream 1: Shell And Navigation

Files:

- [apps/consumer/app/page.tsx](C:/Users/yunus/Desktop/OJ_neu/apps/consumer/app/page.tsx)
- [apps/consumer/app/globals.css](C:/Users/yunus/Desktop/OJ_neu/apps/consumer/app/globals.css)

Tasks:

- make one fixed mobile shell
- implement per-screen top bar variants
- implement screenshot-like bottom nav
- add centered compose affordance
- remove card-heavy dashboard feel

Exit criteria:

- feed, channels, notifications, and me all feel like the same app family as the screenshots

### Workstream 2: Screen Rebuilds

Priority order:

1. Home / Feed
2. Channels
3. Notifications
4. More / Settings
5. Search
6. Plus
7. Post detail / replies
8. Chat detail

Rule:

- no new design ideas until parity is visually credible

### Workstream 3: Data And Mock Volume

Files:

- [packages/shared/src/mock-data.ts](C:/Users/yunus/Desktop/OJ_neu/packages/shared/src/mock-data.ts)
- [packages/shared/src/types.ts](C:/Users/yunus/Desktop/OJ_neu/packages/shared/src/types.ts)

Tasks:

- increase channel count
- increase notification count
- add more post card variants
- add more settings tree rows
- add richer legal/support text payloads

Exit criteria:

- screens no longer feel empty or repeated

### Workstream 4: Behavior Wiring

Files:

- [apps/api/src/routes.ts](C:/Users/yunus/Desktop/OJ_neu/apps/api/src/routes.ts)
- [apps/consumer/app/page.tsx](C:/Users/yunus/Desktop/OJ_neu/apps/consumer/app/page.tsx)

Tasks:

- hydrate key screens from API
- connect vote, reply, tip, report, chat actions
- implement loading, empty, error, blocked states

Exit criteria:

- consumer is no longer a mock shell pretending to be interactive

### Workstream 5: Verification

References:

- [skills/webapp-testing/SKILL.md](C:/Users/yunus/Desktop/OJ_neu/skills/webapp-testing/SKILL.md)
- [skills/webapp-testing/scripts/with_server.py](C:/Users/yunus/Desktop/OJ_neu/skills/webapp-testing/scripts/with_server.py)

Tasks:

- capture local screenshots from localhost
- compare each screen against the reference set
- keep a parity checklist per surface

Exit criteria:

- parity claims are backed by repeatable checks

## Sequence

### Pass 1

- shell
- feed
- channels
- notifications

### Pass 2

- more/settings tree
- plus
- search

### Pass 3

- replies
- chat detail
- report flows
- wallet / creator states

### Pass 4

- API hydration
- state handling
- final screenshot comparison loop

## Non-Negotiable Rules

- copy information architecture before improving aesthetics
- copy screen density before adding polish
- copy behavioral states before adding delight
- validate against screenshots every pass
- do not merge discovery, profile, plus, and settings into generic cards again
