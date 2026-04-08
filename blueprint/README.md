# NUUDL Blueprint

This folder is the source of truth for the first implementation pass of the product.

## Product Intent

- Mobile-only PWA
- Anonymous by default
- City-scoped social feed
- 18+ gated experience
- Creator tips and wallet ledger
- Admin moderation, creator review, and auditability

## Included Docs

- `00_master/PROJECT_SCOPE.md`
- `00_master/OPEN_QUESTIONS.md`
- `02_architecture/SYSTEM_ARCHITECTURE.md`
- `03_data/DATABASE_SCHEMA.md`
- `04_logic/CORE_LOGIC.md`
- `04_logic/ANTI_ABUSE_SECURITY_V1.md`
- `05_flows/APP_FLOWS.md`
- `06_implementation/SCAFFOLD_TODO.md`
- `07_api/API_SPEC.md`
- `08_qa/TEST_PLAN.md`
- `08_qa/BETA_OPERATIONS_RUNBOOK.md`
- `09_future/REBRAND_NOTES.md`
- `11_ops/BETA_OPERATIONS_V1.md`

## Implementation Rule

Build for behavioral parity first, but do it in the right order: identity and geo gating, then feed and discovery, then chat and notifications, then money and creator flows, then moderation and audit, then hardening.
