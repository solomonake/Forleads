# Architecture Decision Register

## ADR-001 - Repository-first agent memory

Status: accepted, 2026-06-25.

Durable instructions, plans, evaluations, and learned failures live in
versioned repository files. Chat transcripts are not a source of truth.

## ADR-002 - One primary agent, conditional specialists

Status: accepted, 2026-06-25.

One agent owns the task. At most three specialist passes are selected from
product, architecture, testing, security, performance/cost, and staff review.
Fixed swarms waste tokens when risk is local.

## ADR-003 - Evidence standard, not flawless claims

Status: accepted, 2026-06-25.

Completion means required evidence passed and uncertainty is disclosed. If a
mandatory gate remains unresolved, agents stop and write a handoff.

## ADR-004 - Revision-bound approval

Status: accepted, 2026-06-25.

Artifact edits persist server-side, rerun compliance, increment a revision, and
invalidate prior approval. Approval and connector idempotency bind to the
reviewed revision.

## ADR-005 - Progressive knowledge disclosure

Status: accepted, 2026-06-25.

The always-loaded contract stays compact. Detailed sources live in a
machine-readable catalog and are selected into task context packs.

## ADR-006 - Full-product build via 12-workstream multi-agent orchestration

Status: accepted, 2026-06-30.

After Friday client launch revealed demo-shaped depth, the path to "full
product" is decomposed into 12 workstreams (WS-A through WS-M, web-only —
no mobile). Phase 0 task packets in `.agent/plans/ws-*.md` are authoritative.
Phase 0 open-decisions resolved in `.agent/decisions/phase-0-resolutions.md`.

Orchestration shape: Phase 0 plan fan-out (done) → Phase 1 mechanical parallel
builds in worktree isolation (WS-B, WS-K, WS-I, WS-M-slice) → Phase 2
decision-gated stacked PRs (WS-A then WS-C/H/G/F; WS-D + WS-E in parallel) →
Phase 3 adversarial-verify (security + fair-housing + test-breaker + perf-cost)
on every PR before merge. WS-J (real send) is last and requires explicit
per-channel founder ack.

Mobile (WS-L) is out of scope until web-product depth is real.
