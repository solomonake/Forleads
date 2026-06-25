# Forleads — Hosting & Setup Playbook

Everything here is **optional** — the app runs fully locally in mock mode with `npm install && npm run dev`. Follow these to put it online and turn on real providers.

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
4. **Environment Variables** (Project → Settings → Environment Variables): you can deploy with **none** (mock mode works in prod too). Add keys from `.env.example` as you enable providers. At minimum later:
   - `NEXT_PUBLIC_APP_URL=https://<your-app>.vercel.app`
5. **Deploy.** Every push to `main` redeploys; every PR gets a preview URL.

That's it — the living map is online in mock mode.

---

## 3. Supabase (real persistence + RLS + pgvector)

1. **supabase.com → New project.** Save the project ref, DB password, and the API keys.
2. Apply the schema. Easiest: **SQL Editor → paste & run** these two files in order:
   - `supabase/migrations/0001_init.sql`
   - `supabase/migrations/0002_rls.sql`

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
5. The repository interface (`src/lib/db/repository.ts`) is the seam — the in-memory repo and a Supabase repo implement the same `Repository`. With `FORLEADS_PERSIST=supabase` the app reads the Supabase config; the in-memory fallback keeps it running if creds are partial. (The Supabase-backed repo class is the one remaining wire-up — every method maps 1:1 to a table.)

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

### Other connectors (same pattern — add keys, mock flips to live)
- **Follow Up Boss:** `FOLLOWUPBOSS_API_KEY` (Basic auth, key as username). Notes/tasks/appointments + contact sync.
- **GoHighLevel:** `GHL_API_KEY` + `GHL_LOCATION_ID`.
- **Twilio:** `TWILIO_ACCOUNT_SID` + `TWILIO_AUTH_TOKEN` + `TWILIO_FROM_NUMBER` (approved SMS only).
- **Zapier:** set `ZAPIER_WEBHOOK_URL` to post out; `ZAPIER_WEBHOOK_SECRET` guards the inbound `/api/connectors/zapier/inbound`.
- **Claude (live reasoning):** `ANTHROPIC_API_KEY` + `FORLEADS_AGENT_MODE=live`.

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
| Real persistence | `FORLEADS_PERSIST=supabase`, `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_ANON_KEY`, `SUPABASE_SERVICE_ROLE_KEY` |
| Real Gmail drafts | `GOOGLE_CLIENT_ID/SECRET`, `GOOGLE_REDIRECT_URI` (+ token) |
