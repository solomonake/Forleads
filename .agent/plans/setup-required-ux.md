# Plan: Setup Required UX

**Goal:** Make connector setup failures in the Action Inbox clear and actionable.

**Why / value:** A real agent should know that approval did not create an external draft/task because a provider must be connected first.

**User / job:** An agent clicks approve and needs either a real connector result or a clear next step.

**Pain evidence:** The API now returns `connector_setup_required`, but the client `ApiError` drops that code and the inbox only checks status.

**Current -> desired behavior:** Current UI shows a generic setup string for all 424s. Desired behavior: server error codes survive client parsing and setup-required approval errors use explicit Connector Hub wording.

**Risk tier:** medium, because this is UI/error handling around high-risk connector writes.

**Steps:** Preserve `code` in `ApiError`, update tests, and use it in `ActionInbox`.

**Verification evidence:** Focused UI/API helper tests plus typecheck/lint and high-risk gate before merge.
