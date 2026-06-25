# Claude adapter

Read and follow `AGENTS.md` first. The operating system is model-neutral.

- Treat `.agent/` and `docs/` as durable knowledge, not chat history.
- Create a task packet and risk tier before substantial implementation.
- Keep context narrow: search first and use `npm run agent:context`.
- Run `npm run agent:check -- --risk=<tier>` before proposing a push.
- Never merge, deploy, spend, mutate production, or communicate externally
  without explicit human approval.
- If proof is incomplete, stop and run `npm run agent:handoff`.
