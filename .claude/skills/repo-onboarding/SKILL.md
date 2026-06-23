---
name: repo-onboarding
description: Use at the START of work in any repository, or whenever you need to push, deploy, or wire up a new service. Teaches the agent how to learn an unfamiliar codebase, set up git/GitHub correctly (new or existing), figure out the right commit/push identity and commands, and PROMPT THE USER for anything it can't discover (GitHub URL, Supabase URL/keys, OAuth creds, deploy targets). Records what it learns into a per-repo notes file so it gets better every time it returns.
---

# Repo Onboarding & Push/Deploy Skill

You are an agent dropped into a working environment. Before you can safely ship, you must
**learn the place** and **never guess** about destructive or outward-facing actions (pushing,
deploying, sending). This skill makes you capable and self-improving in any repo.

## Operating principle
Discover first, ask second, act third. Anything you can read (files, git, env names) you discover.
Anything secret or outward-facing (a GitHub URL, an API key, a deploy target) you **ask the user
for with exact steps on how to get it**. Then you act, and you **write down what you learned** so
the next session starts smarter.

---

## Step 1 — Learn the codebase (read-only, no changes)
Run these and read the results before touching anything:

```bash
ls -la                      # what kind of project is this?
cat README.md 2>/dev/null   # how the humans describe it
cat CLAUDE.md 2>/dev/null   # standing instructions for agents (OBEY THESE)
git status 2>/dev/null      # is this a git repo? clean or dirty?
git log --oneline -10 2>/dev/null   # how do commits look here? message style?
git remote -v 2>/dev/null   # is there a GitHub remote already?
git config user.name; git config user.email   # who commits here?
cat package.json 2>/dev/null || cat pyproject.toml 2>/dev/null || cat go.mod 2>/dev/null
```

Identify: language/framework, package manager (npm/pnpm/yarn/pip/poetry/cargo), the
build/test/lint commands, and the host (Vercel/Netlify/Supabase/Railway — look for config files
like `vercel.json`, `netlify.toml`, `supabase/`, `Dockerfile`).

Then read the per-repo memory if it exists (Step 6): `.agent/onboarding-notes.md`.

## Step 2 — Decide the git situation (the decision tree)

| What you find | What it means | What to do |
|---|---|---|
| No `.git` directory | Brand-new, not version controlled | `git init`, then ask the user for the GitHub URL (Step 3) |
| `.git` exists, no remote | Local repo, never pushed | Ask the user for the GitHub URL, `git remote add origin <url>` |
| Remote exists | Already connected | Just commit + push to the right branch |
| No `user.name`/`user.email` | Git identity unset | Ask the user, or use the project's stated identity; set with `git config` |
| On `main`/`master` | Default branch | Prefer a feature branch for changes (`git checkout -b feature/x`) |

**Never** force-push, rewrite history, or push to `main` without the user's say-so.

## Step 3 — Things only the USER can give you → ASK, with steps
When you need any of these, STOP and ask the user, and **tell them exactly how to get it**:

- **GitHub repo URL** — "Create a repo at github.com/new (or paste an existing URL). It looks like
  `https://github.com/<you>/<repo>.git`."
- **Git push auth** — if `git push` hangs, the credential helper isn't set. Tell them:
  `gh auth login` then `gh auth setup-git` (GitHub CLI), or create a Personal Access Token.
- **Commit identity / email** — "What name + email should commits use here?" (Don't assume.)
- **Supabase** — "Create a project at supabase.com. I need the `Project URL` and `anon key` from
  Settings → API. The `service_role` key is secret — put it in your host's env vars, don't paste it
  in chat."
- **Deploy target** — "Vercel (vercel.com/new → import the repo) for web apps; Netlify or Railway
  otherwise. Which do you want?"
- **OAuth / API keys** (Google, Stripe, etc.) — give the console URL and the exact redirect URIs /
  scopes to register.

Use the AskUserQuestion tool when the choice is genuinely theirs (host, identity, token storage).

## Step 4 — Commit & push (the safe sequence)
```bash
git add -A
git commit -m "<clear message matching this repo's style>"   # add a Co-Authored-By trailer if the repo uses one
# push:
git push -u origin <branch>
```
If `git push` hangs with no output → it's waiting on credentials. Fix with `gh auth setup-git`
(if gh is authed) or have the user set a PAT. Verify it landed:
`git ls-remote origin refs/heads/<branch>` should equal `git rev-parse HEAD`.

**Make it automatic (if the user wants):** add a post-commit hook so every commit self-pushes:
```bash
mkdir -p .git/hooks
printf '#!/bin/sh\nbranch=$(git rev-parse --abbrev-ref HEAD)\ngit push -q origin "$branch" >/dev/null 2>&1 &\n' > .git/hooks/post-commit
chmod +x .git/hooks/post-commit
```

## Step 5 — Verify before claiming done
Run the repo's own gates (whatever exists): `typecheck`, `lint`, `test`, `build`. Don't say
"done" unless they pass. If the production build is heavy and stalls locally (memory), note that it
will build on the host's CI and verify the app another way (run dev + smoke-test the real endpoints).

## Step 6 — LEARN: write down what you discovered (so you improve)
Create/update `.agent/onboarding-notes.md` at the repo root with what you learned, so the next
session (you or another agent) starts smart:

```markdown
# Agent onboarding notes — <repo>
- Stack: <e.g. Next.js 14 + TS, npm>
- Commands: install=`npm i`, test=`npm test`, build=`npm run build`, typecheck=`npm run typecheck`
- Git: remote=<url>, default branch=<main>, identity=<name/email>, auto-push hook=<yes/no>
- Host: <Vercel + Supabase>, deploy=<how>
- Gotchas: <e.g. prod build stalls locally on low RAM; build on Vercel instead>
- Secrets needed (ask user, never store here): <GITHUB_URL, SUPABASE_URL/anon, GOOGLE_CLIENT_ID...>
- What worked / what to do better next time: <notes>
```
Append a dated line each session under "What worked / do better." This file is the skill's memory;
keep it short and factual. Never put secret VALUES in it — only the NAMES of what's needed.

---

## The mental model (so you act correctly)
- **Git = save points.** `commit` = a labeled save on your machine. `push` = upload saves to GitHub
  so they're backed up and others (and deploy hosts) can see them.
- **A "remote" is the GitHub address.** No remote = your saves are local only.
- **Credentials = the key to upload.** Without them `push` just waits. `gh auth setup-git` lends git
  the GitHub CLI's key.
- **Deploy host (Vercel) watches GitHub.** Every push to `main` → it rebuilds and publishes. Every
  PR → a preview link. So "ship" = push, and the host does the rest.
- **Secrets live in the host's env vars, never in code or chat.** The app reads them at runtime.
