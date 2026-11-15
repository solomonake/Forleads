# Google OAuth verification packet

Prepared November 14, 2026. This is an evidence checklist, not a declaration that Google approved Forleads.

## Product and scope boundaries

Ordinary sign-in uses only openid, email and profile. Settings offers a separate Google Workspace connection for Gmail draft management and Calendar events. Connector consent is bound to the current signed-in Google account. Identity-only callbacks do not replace existing connector tokens. New grants require all requested connector permissions; partial grants preserve the previous credential. Existing partial grants are enforced against the specific action before connector routing.

The Google Cloud project is forleads-500307. Its production OAuth client was matched in the console to the app. Homepage, privacy and terms are already configured at https://forleads.vercel.app. Do not invent domain ownership verification or a completed Google review.

## Declarations to reconcile

- openid
- https://www.googleapis.com/auth/userinfo.email
- https://www.googleapis.com/auth/userinfo.profile
- https://www.googleapis.com/auth/gmail.compose
- https://www.googleapis.com/auth/calendar.events

The connector scopes match current production requests. Saving the Cloud Data Access declarations requires Solo's specific confirmation requested in chat. Do not add other scopes. Declaring a scope is not a user's grant and does not make it approved by Google.

## Draft scope justifications for reviewer approval

Gmail compose: Forleads prepares an email artifact from the agent's lead/workspace inputs. An authenticated agent reviews and approves that artifact revision before the server creates or updates a Gmail draft. The implementation uses users/me/drafts endpoints. The permission itself also allows sending according to Google's definition; Forleads' implementation limits its own behavior to drafts. Do not describe Google's scope as technically draft-only. Audit all call sites before submitting this justification.

Calendar events: After the agent reviews a prepared calendar artifact and approves its revision, the connector creates a Calendar event. The scope is requested only through the optional Settings connection. Do not claim narrower Google permission than the scope actually grants.

## Evidence still required before scope-review submission

1. Google's branding check reported that the homepage is not registered to the owner. A URL-prefix Search Console property and public HTML-tag challenge were prepared for the owner account. The tag is staged in layout metadata, not deployed. Solo must specifically approve publishing the tag and completing ownership verification. Google instructed waiting 24 hours after verification before retrying branding. Confirm homepage/domain ownership in Search Console with an account holding the required project role. A configured authorized-domain entry is not proof of ownership.
2. Review the privacy text against actual token storage, retention/deletion, AI/provider data flows and Limited Use. Do not attest to compliance from an automated check.
3. Deploy and verify the identity/connector separation, including ordinary sign-in, cancellation, partial consent and existing-credential behavior. Never click past a security warning on the user's behalf.
4. Record a truthful demonstration of each connector permission, with test-only contacts/data and an explicitly approved external draft/event write. Show the consent request and the feature using the scope; do not use mock results as live evidence.
5. Determine applicability and requirements of restricted-scope security assessment. No assessor purchase, paid engagement, certification or deadline is authorized by this document.
6. Review the exact final application answers and attachments before submission. No invented video URL, domain verification, security assessment, policy approval or deletion proof.

## Primary sources

- https://developers.google.com/identity/protocols/oauth2/web-server
- https://developers.google.com/identity/protocols/oauth2/production-readiness/brand-verification
- https://developers.google.com/identity/protocols/oauth2/production-readiness/restricted-scope-verification
- https://developers.google.com/workspace/gmail/api/auth/scopes

## Rollback

Revert the consent-separation change. No schema or secret rotation is needed. Existing server-side Google credentials stay intact. Cloud declarations and Google approval status are separate from the application deployment.
