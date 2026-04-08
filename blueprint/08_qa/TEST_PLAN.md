# QA Test Plan

## Test Strategy

- Validate the consumer flow screen by screen, not just as a single shell
- Validate money and moderation with state transitions and audit records
- Validate repeatability for idempotent writes
- Validate mobile-only constraints on both iPhone Safari and Android Chrome

## Smoke Tests

- Run `npm run smoke:beta` against the local closed-beta stack before manual QA

- Open landing page and accept the 18+ gate
- Register install identity
- Deny location and verify the app blocks feed access
- Grant location and verify city resolution

## Feed Tests

- Load `Neu`, `Kommentiert`, and `Lauteste`
- Confirm the selected city is reflected in content
- Confirm channel search and text search both return expected results
- Confirm hidden or blocked content does not leak into public results
- Confirm empty and error states render distinct copy

## Flow Tests

- Walk the onboarding flow from first visit to city selection
- Open each bottom-nav destination and verify it is a separate screen or overlay
- Verify post detail, composer, and settings are not collapsed into the home shell
- Verify the admin shell has its own navigation and does not reuse consumer chrome

## Monetization Tests

- Create a fake wallet topup
- Send a tip to a post and verify ledger entries
- Confirm platform fee math is correct
- Confirm creator earnings stay locked until review passes
- Retry the same tip or topup request and verify idempotency behavior

## Moderation Tests

- Report a post and open a moderation case
- Hide a post through admin action
- Approve and reject a creator application
- Verify the audit trail records the action
- Confirm a moderated item disappears from public feed and search
- Confirm admin actions record actor, reason, and timestamp

## Chat Tests

- Send a chat request
- Accept and reject a request
- Verify image chat is blocked without the right entitlement
- Verify read state updates after a message is opened
- Verify block and report remain available in active threads

## PWA Tests

- Install the app from a mobile browser
- Verify the app shell renders without desktop-specific layout assumptions
- Confirm the manifest and icon links are present
- Confirm the app still boots when storage is cleared
- Confirm navigation remains usable after refresh and deep-link entry
