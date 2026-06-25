# Live-only production

**Goal:** Production may degrade to explicit setup-required or grade-D gaps, but
must never report a successful connector write or grounded fact that came from a
mock/demo adapter.

**User/business pain:** A client can currently approve an action without the
required connector credentials and receive a mock success. That makes the UI
look operational while no external system changed.

**Risk:** high — connectors, provider configuration, production behavior.

## Desired behavior

- Local development and tests keep deterministic mocks.
- Production connector factories disable mock success by default.
- Missing credentials fail closed with a useful setup-required error.
- Connector Hub labels missing integrations as setup required, not mock mode.
- Workspace seed rows use `needs_setup` when production mock writes are disabled.
- `/api/health` exposes whether production mock behavior is allowed and reports
  any core provider mode violations.
- Documentation no longer claims that an unconfigured production deployment is
  client-ready.

## Non-goals

- Buying or selecting a paid market-data provider.
- Removing mock adapters from tests or local development.
- Auto-sending email/SMS without human approval.

## Acceptance

- Missing Google/CRM/SMS/webhook credentials cannot create a successful external
  write in production policy mode.
- Configured live connectors continue unchanged.
- Unit tests cover fail-closed behavior.
- Typecheck, lint, tests, coverage, build, and relevant E2E gates pass.
