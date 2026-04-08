# Project Scope

## Goal

Build a mobile-only PWA for anonymous adult community posting with city-based scope, creator tips, moderation, and a wallet-ledger system.

## Product Principles

- Location is mandatory before the main app is usable
- Public identity stays anonymous by default
- City-first scoping beats radius-based feeds in v1
- Adult content is a first-class product mode, not mixed with SFW defaults
- Monetization is content-anchored, not profile-anchored
- Critical flows must be auditable, reversible, and adapter-driven
- Branding, copy, and visuals stay replaceable from day one

## In Scope

- 18+ landing gate plus content gate
- Anonymous install-based identity
- Mandatory location with city mapping
- Feed tabs: `Neu`, `Kommentiert`, `Lauteste`
- Channels, search, replies, votes, pins
- Notifications and chat requests
- Wallet, tips, earnings, and platform cut tracking
- Creator application flow with KYC review
- Admin moderation backoffice and audit trail
- Fake payment provider abstraction with easy swap to a real provider later
- Content and moderation states that survive reloads and admin actions

## Out of Scope For v1

- Desktop consumer experience
- Native app store packaging
- Voice messages
- Video uploads
- Web push
- Real payment production integration for adult monetization
- Offline posting
- Public follower/following graph
- Voice or video messaging

## Success Criteria

- The app can be installed as a PWA on mobile browsers
- Users can enter anonymously after the adult gate
- City-scoped content loads from the selected location
- Tips create correct ledger entries
- Moderation and creator review are visible in the admin area
- Actions that affect money, visibility, or access produce an audit trail
