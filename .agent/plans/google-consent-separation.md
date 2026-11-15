# Google consent and verification readiness

Goal: ordinary Google sign-in requests identity only; Gmail/Calendar authorization is an explicit signed-in connector step with truthful granted-scope status.

User/value: CSV import and workspace access should not require mailbox/calendar grants. Current login forces restricted scope consent and an unverified-app warning.

Risk: high (OAuth/session/credentials). Preserve tenant-derived identity, existing grants, state validation, fail-closed approvals and human approval for connector writes.

Scope: auth/google, login/callback, scope-aware session/connector/report status, approval token gate, Google Settings CTA, tests and verification submission checklist. No schema, billing or credential rotation.

Acceptance: identity URL contains no connector scopes/offline grant; Connect requires a current session; signed state binds purpose and account; callback rejects changed account and partial grants; existing grants survive identity re-login; unknown or missing scopes do not show connector ready; approvals require correct scope. Cancelled/invalid state never changes credentials. No actual external write during tests.

Verification: focused regressions, high-risk agent gates, browser sign-in URL and Settings CTA check, independent security review. Cloud declarations saved only with explicit scope authorization. Domain ownership, demonstration video and restricted-scope assessment remain evidence requirements, not fabricated claims.

Rollback: revert the isolated change. Existing Google credentials and schema remain compatible.

Authority: Solo requested needed verification updates. This run prepares code and reviewable configuration; no verification assertions or terms accepted without actual evidence/required approval.
