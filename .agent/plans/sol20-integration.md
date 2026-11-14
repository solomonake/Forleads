# SOL-20 Farm integration

Goal: integrate existing PR57 with the repair stack and make partial CSV imports recoverable without replaying successful or uncertain writes.

User/value: an agent importing a farm needs trustworthy progress, visible successful leads and a safe next action after throttling or network failure.

Pain evidence: extracted PR57 handler produced 2 writes and no refresh on row-3 geocode failure; 40 writes and no refresh on injected row-41 throttle.

Current to desired: generic error and lost counts become retained progress, refresh on every exit, manual bounded resume after safe failures, and explicit uncertain-write reporting. Navigation preserves PR61 accessibility with PR57 final labels.

Risk: high because existing import writes persistent leads and calls external providers. No schema/auth/provider contract or limit changes.

Seams: src/lib/farm/import.ts (state machine with injected API seams), FarmTable, API retry metadata, Pipeline refresh, page navigation, demo/a11y/CSV browser regressions.

Steps: integrate PR61 into existing PR57 ancestry, resolve accessible nav/selectors, implement conservative import progress, run targeted regressions then high-risk gates and browser checks, independent test-breaker review, update existing PR57, merge approved dependencies in order, deploy and verify.

Acceptance: coordinate control at 50 rows; geocode 429/502 pause without losing prior counts; resume never repeats confirmed writes; POST 429 retries safely after cooldown; ambiguous POST failure is never replayed; malformed CSV reports honestly; refresh failure preserves import counts; Table default and Board/Map navigation work; mobile and axe checks pass.

Break: throttle early and late, empty response, ambiguous geocode, failed write, duplicate rows, repeated clicks, failed refresh, cap overflow and retry timing.

Verification: targeted Vitest, agent:check high (doctor/typecheck/lint/full unit/eval/coverage/build), production-build smoke including mocked CSV UI, demo suite, dependency audit, independent review, final CI and read-only production smoke.

Rollback: revert Farm integration merge to remove import/navigation changes; dependency/basemap repairs remain independent. No migration or environment rollback.

Authority: Solo explicitly assigned integration ownership and authorized merge/deploy in this chat. No spend or account/access changes authorized. Graph copies remain read-only.

Done: exact revision passes gates and independent review; existing PR57 updated/merged after stack; production deployment and read-only smoke verified; Linear evidence posted with remaining authenticated proof limits.
