# Plan: Fix tenant-scoped workspace seed identities

**Goal:** A signed-in production user can provision their workspace and create a
lead without colliding with the demo tenant's loop or connector rows.

**Why / value:** `/api/lead` is the first client workflow. A tenant identity
collision makes the production app unusable even though live geocoding and all
required environment variables are healthy.

**User / job:** A real-estate agent searches a real address and expects Forleads
to persist the lead, run grounded scouts, and render evidence.

**Pain evidence:** Production request `184d42a2-7b06-4451-b7d6-91b446b97250`
returned HTTP 500 with
`duplicate key value violates unique constraint "connector_account_pkey"` from
`SupabaseRepository.upsertConnectorAccount()`.

**Current → desired behavior:** Seed slugs are globally stable and collide
between workspaces → non-demo workspace seed IDs include the owning agent ID,
while legacy demo IDs remain stable for migration compatibility.

**Non-goals:** This task does not add paid property-data providers, change
connector credentials, or remove mock adapters used by local tests.

**Risk tier:** Critical. This changes tenant-boundary identifiers on the
production workspace-provisioning path.

**Context links:** `AGENTS.md`, `.agent/playbook.md`,
`src/lib/auth/agent.ts`, `src/lib/db/seed.ts`,
`src/lib/loops/definitions.ts`, `src/lib/db/repository.ts`.

**Seams & exact files:** Add one workspace seed-ID helper; consume it in default
loop and connector provisioning; fix the in-memory connector-account key; add a
two-tenant regression test and record the production gotcha.

**Steps:**
1. Generate stable IDs scoped by `agent_id` for non-demo seeded resources.
2. Preserve legacy demo IDs so existing production rows are not orphaned.
3. Key in-memory connector accounts by tenant plus provider.
4. Provision demo plus two user workspaces in a regression test and assert
   complete, non-overlapping loops/connectors.
5. Run targeted tests, critical agent gate, and production build.
6. Deploy through a reviewed PR and reproduce the live address flow.

**Acceptance scenarios:** First user provisions; second user provisions; repeat
provisioning is idempotent; demo records keep their historical IDs; every
workspace retains all default loops and connector accounts.

**Break plan:** Provision workspaces in different orders, provision one twice,
and assert no cross-tenant IDs or overwritten in-memory rows.

**Verification evidence:** `npm test -- src/lib/db/seed.test.ts`,
`npm run agent:check -- --risk=critical`, `npm run build`, then a signed-in
production address search returning `/api/lead` 200.

**Cost / context budget:** No paid API calls. One Nominatim/OSM production probe
after deploy.

**Risks / gotchas:** Do not change the UUID derivation algorithm for historical
seed rows. Do not mutate existing demo rows in place.

**Human-in-the-loop:** No new secret is required for this incident. Merge and
production deploy are explicitly requested in the incident prompt.

**Done criteria:** Regression test proves tenant isolation; mandatory gates pass;
fix is on `main`; production address search renders grounded evidence without a
500; playbook records the failure pattern.
