# App Flows

This file is the screen-level contract for the consumer PWA and the admin backoffice. Each flow should exist as a real screen or overlay, not as one overloaded dashboard view.

## Navigation Model

- Consumer app uses a mobile bottom navigation pattern
- Core destinations are `Home`, `Channels`, `Search`, `Chat`, `Notifications`, and `Me`
- Secondary surfaces are `Location`, `Plus`, and `Settings`
- Admin uses a separate backoffice shell with moderation and finance navigation

## Consumer Flows

### 1. Onboarding

- `loading`: app shell boots, install identity is checked, previous consent is restored
- `ready`: age gate, consent, and location permission are shown in order
- `empty`: no prior state exists, show the first-run explanation
- `error`: location denied or city cannot be resolved, block entry and explain why

### 2. Home

- Default feed opens in the selected city
- Tabs are `Neu`, `Kommentiert`, and `Lauteste`
- Feed cards lead to a post detail view with replies, vote state, tip state, and report action
- Create post opens a dedicated composer overlay
- `empty`: no content in the city yet, show call to create or explore channels
- `error`: city unavailable or feed fetch failed, allow retry

### 3. Channels

- Discover shows city-relevant channels first
- Channel detail opens a channel-scoped feed
- Search inside channels is separate from global search
- Verified or exclusive channels can be surfaced with stronger affordances

### 4. Search

- One query powers grouped results for channels, hashtags, and posts
- Results should respect city, visibility, and moderation rules
- `empty`: no match, show search tips and recent topics
- `error`: backend search unavailable, degrade gracefully to a basic query result set

### 5. Chat

- Incoming chat starts as a request
- Requests can be accepted, declined, or ignored
- Accepted requests become threads with text, read states, block, and report
- Image chat stays behind Plus entitlement
- `empty`: no requests or no active threads, show why chat is quiet

### 6. Notifications

- In-app notification list only for v1
- Items cover replies, votes, chat, tips, creator status, plus, and moderation notices
- Tapping an item deep-links into the related screen or case

### 7. Me

- Shows the user’s own posts, replies, votes, wallet, earnings, plus, creator status, and settings
- No public real-name profile is required
- This screen is the control center for private state, not a vanity profile

### 8. Settings And Secondary Screens

- Location management is visible and explicit
- Plus and creator status have dedicated detail screens
- Safety, legal, and support items live under settings rather than being scattered

## Admin Flows

### Admin Navigation

- Dashboard
- Reports Queue
- Content Inspector
- User Inspector
- Creator Applications
- Ledger Explorer
- Payouts
- Feature Flags
- Audit Trail

### 1. Dashboard

- Shows moderation volume, creator pipeline, ledger status, and city activity at a glance

### 2. Moderation Queue

- Reports open a moderation case
- Case detail shows the target, context, prior actions, and recommended next steps
- Actions include hide, restore, block, escalate, and resolve with reason

### 3. Creator Review

- Applications show KYC status, risk flags, and payout readiness
- Approve, reject, or request changes are separate actions

### 4. Ledger And Payouts

- Ledger view is append-only and searchable
- Payout workflow is visible even when mocked by the fake provider

## Flow Rules

- Every screen needs explicit loading, ready, empty, and error handling where it matters
- Screen transitions should preserve context and not collapse into one giant dashboard
- Financial or moderation actions must always create an audit record
