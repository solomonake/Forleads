# Forleads — Hosting & Setup Playbook

Local development runs in deterministic mock mode with `npm install && npm run dev`.
Production is different: mock connector writes are disabled by default, so an
unconfigured integration is shown as **setup required** and fails closed.

Order I recommend: **1) Git/GitHub → 2) Vercel (web is live) → 3) Supabase (real persistence) → 4) Google OAuth (real Gmail drafts) → 5) other connectors as needed.**

---

## 1. Git + GitHub (and automatic from now on)

### One-time: create the repo and push

```bash
# from the project root: /Users/preciousmuwanguzi/Desktop/Forleads
git add -A
git commit -m "Forleads: production vertical slice"

# create the GitHub repo + push in one step (needs the GitHub CLI, see below)
gh repo create forleads --private --source=. --remote=origin --push
```

If you don't have the GitHub CLI:

```bash
brew install gh        # macOS
gh auth login          # choose GitHub.com → HTTPS → login with browser
```

(Or create an empty repo on github.com, then:)

```bash
git remote add origin https://github.com/<you>/forleads.git
git branch -M main
git push -u origin main
```

### "Automatic from now on" — how to set it up in the Claude Code harness

Claude Code can't silently push on its own (by design — commits/pushes are gated). There are two clean ways to make it feel automatic:

**Option A — A git hook that pushes after every commit (fully automatic).**

```bash
mkdir -p .git/hooks
cat > .git/hooks/post-commit <<'EOF'
#!/bin/sh
# Auto-push every commit to origin/<current-branch> in the background.
branch=$(git rev-parse --abbrev-ref HEAD)
git push -q origin "$branch" >/dev/null 2>&1 &
EOF
chmod +x .git/hooks/post-commit
```

Now any time *you* (or I) run `git commit`, it auto-pushes. Nothing else to remember.

**Option B — Tell me the standing rule, and I'll follow it.** Say:
> "From now on, after any change you finish, commit and push to a feature branch and open a PR."

I'll honor that for the rest of our sessions (and it's saved to memory). I branch off `main`, commit with a co-author trailer, push, and open a PR with `gh`. You review and merge.

**Recommended workflow** (so `main` stays clean and Vercel previews work):

```bash
git checkout -b feature/<thing>
# ...changes...
git commit -m "..."        # post-commit hook pushes automatically (Option A)
gh pr create --fill        # open a PR; Vercel auto-builds a preview URL
```

> Note: a Claude Code "settings.json hook" runs *Claude's* tools (e.g. lint on save) — it can't push to GitHub. For auto-push, use the **git** `post-commit` hook above. I can wire it for you if you say the word.

---

## 2. Vercel (deploy the web app)

1. Push to GitHub (step 1).
2. Go to **vercel.com → Add New → Project → Import** your `forleads` repo.
3. Framework preset: **Next.js** (auto-detected). Build command `next build`, output auto. No changes needed.
4. **Environment Variables** (Project → Settings → Environment Variables):
   configure the live persistence and provider values from `.env.example`.
   Production does not treat missing connector credentials as successful writes.
   At minimum:
   - `NEXT_PUBLIC_APP_URL=https://<your-app>.vercel.app`
5. **Deploy.** Every push to `main` redeploys; every PR gets a preview URL.

The deployment can now start, but it is client-ready only when `/api/health`
returns `ok:true` and the Connector Hub shows the integrations needed by that
client as `connected · live`.

---

## 3. Supabase (real persistence + RLS + pgvector)

1. **supabase.com → New project.** Save the project ref, DB password, and the API keys.
2. Apply every file in `supabase/migrations/` in numeric order. Do not stop
   after the first two; health checks require the later revision,
   idempotency, credential, memory, and reviewed-CRM-binding columns.

   Or with the Supabase CLI:
   ```bash
   brew install supabase/tap/supabase
   supabase link --project-ref <your-ref>
   supabase db push        # applies supabase/migrations/*
   ```
3. **Enable extensions** (the SQL does `create extension` for `postgis`, `vector`, `uuid-ossp`; if a fresh project blocks them, enable PostGIS + pgvector under Database → Extensions first).
4. Copy keys into Vercel env (and `.env.local` for local):
   ```
   NEXT_PUBLIC_SUPABASE_URL=https://<ref>.supabase.co
   NEXT_PUBLIC_SUPABASE_ANON_KEY=<anon key>
   SUPABASE_SERVICE_ROLE_KEY=<service role key>   # server-only, never NEXT_PUBLIC
   FORLEADS_PERSIST=supabase
   ```
5. The repository interface (`src/lib/db/repository.ts`) is the seam — the
   in-memory repo and implemented Supabase repo share the same contract. When
   `FORLEADS_PERSIST=supabase` is selected, missing server credentials fail
   closed; the app never accepts apparently durable work into process memory.
   Confirm `/api/health` returns 200 after the migration and deployment.

> Free-tier note: Supabase pauses a project after ~7 days idle. Add a cron ping (Vercel Cron or GitHub Action hitting `/api/leads`) during active use.

---

## 4. Google OAuth (turn the Gmail draft path live)

This is the "ready in my drafts" magic. The MIME/base64url + `drafts.create` call is already implemented (`src/lib/connectors/gmail.ts`); you just supply a token.

1. **console.cloud.google.com** → new project → **APIs & Services**.
2. Enable **Gmail API** and **Google Calendar API**.
3. **OAuth consent screen**: External, add yourself as a test user. Scopes (minimal):
   - `https://www.googleapis.com/auth/gmail.compose` (drafts only — not full mailbox)
   - `https://www.googleapis.com/auth/calendar.events`
4. **Credentials → Create OAuth client ID → Web application**. Authorized redirect URI:
   - `http://localhost:3000/api/auth/google/callback` (local)
   - `https://<your-app>.vercel.app/api/auth/google/callback` (prod)
5. Put the client id/secret in env:
   ```
   GOOGLE_CLIENT_ID=...
   GOOGLE_CLIENT_SECRET=...
   GOOGLE_REDIRECT_URI=https://<your-app>.vercel.app/api/auth/google/callback
   ```
6. Complete the OAuth flow from the Account bar. The callback encrypts Google
   tokens into the server-side `connector_credential` store; the browser cookie
   carries only an opaque credential reference. Refreshes rotate the encrypted
   record in place.

Connector Hub will then show **Google · connected · live** and approvals create real Gmail drafts.

### Other connectors — capability truth, not key-presence badges

- **Follow Up Boss:** first register Forleads with FUB and deploy the issued
  `FOLLOWUPBOSS_SYSTEM_NAME` and `FOLLOWUPBOSS_SYSTEM_KEY`. Each agent then
  saves their own API key in **Connect**, passes the identity test, runs the
  exact-address person overlay, records channel permission, and proves one
  person-bound note and task in the real account. See
  `docs/operator-setup-guide.md`. API-key presence alone never flips this live;
  appointments are not routed to FUB.
- **GoHighLevel:** blocked. Do not add `GHL_API_KEY` or `GHL_LOCATION_ID` until
  tenant-scoped contact import and person-bound writes ship.
- **Twilio:** blocked. Do not add credentials until consent/revocation, DNC,
  quiet-hours, A2P, sender scope, and delivery callbacks ship.
- **Zapier:** `ZAPIER_WEBHOOK_URL` enables the approval-gated outbound bridge.
  Keep it single-environment until tenant-bound routing ships;
  `ZAPIER_WEBHOOK_SECRET` only guards the current inbound endpoint.
- **Claude (live reasoning):** `ANTHROPIC_API_KEY` plus
  `FORLEADS_AGENT_MODE=live`; verify a real model response separately from the
  configured mode.

---

## 5. What to test, and the feedback I want

**Local smoke (2 min):** `npm run dev` → ⌘K → "12 Oak Street" → cards stream → note "Knocked, no answer" → Draft it → Why? → Approve. Then check **Action Inbox**, **Loop Studio → Run now**, **Connector Hub**, **Weekly Report**.

**Things to deliberately probe:**
1. **Does the fly-to → streaming-cards moment feel magical or laggy?** (timing is in `MapWorkspace.tsx`.)
2. **Grade honesty:** confirm Market shows **D** with an honest gap, not a fake number. Find any naked number → that's a bug.
3. **Compliance fail-closed:** draft something with "great for families" or "near churches" → must be **blocked**, not just warned. Confirm "kids' bikes" is stripped (see Agent Trace → Excluded).
4. **Idempotency:** approve the same artifact revision twice → second is
   `deduped`, including after an application cold start.
5. **Auditability:** every draft has a "Why this happened" trace; every loop run shows its planner steps.

**Feedback that moves the product most:**
- Emotional: did the first 10 seconds feel like "the map did my homework"?
- Trust: are the grades legible and believable? Would you repeat a card to a seller?
- Copy: is the drafted email good enough to send with one edit?
- Gaps: which connector you'd want live first; which loop you'd actually run daily.
- Any moment it felt like a generic dashboard instead of a spatial agent.

Send me: the address you tried, a screenshot of the Lead Rail + a draft, and your answers to the five above. I'll tune from there.

---

## Appendix — env var cheat sheet

| Goal | Set |
|---|---|
| Run locally, $0 | nothing (mock) |
| Live Claude reasoning | `FORLEADS_AGENT_MODE=live`, `ANTHROPIC_API_KEY` |
| Real geocoding | `FORLEADS_GEOCODER=photon-nominatim`, `PHOTON_URL`, `NOMINATIM_URL` |
| Real OSM facts | `FORLEADS_PROPERTY_PROVIDER=osm` |
| Real street imagery | `FORLEADS_IMAGERY_PROVIDER=mapillary`, `MAPILLARY_TOKEN` |
| Agent-owned property photos | `OPERATOR_PROPERTY_MEDIA_URL` or `FIELD_PHOTO_MANIFEST_URL` pointing to a JSON/CSV manifest with image URL, address or coordinates, captured date, and rights/license |
| Real persistence | `FORLEADS_PERSIST=supabase`, `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_ANON_KEY`, `SUPABASE_SERVICE_ROLE_KEY` |
| Real Gmail drafts | `GOOGLE_CLIENT_ID/SECRET`, `GOOGLE_REDIRECT_URI` (+ token) |
