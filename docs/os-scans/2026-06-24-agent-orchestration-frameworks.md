# OS-Scan — open agent orchestration frameworks 2026

- **Date:** 2026-06-24
- **Generated at:** 2026-06-24T15:50:30.258Z
- **Stale after:** 2026-07-24 (>30 days = re-scan)
- **Queries:** HF `undefined` (pipeline=any) · ArXiv `LLM agent orchestration framework multi-agent` · GitHub `agent framework LLM orchestration`

## Top 3 picks

### 1. deepset-ai/haystack
- **Source:** [github](https://github.com/deepset-ai/haystack) (fetched 2026-06-24)
- **License:** Apache-2.0
- **Stars:** 25,679 · **Forks:** 2878 · **Last push:** 2026-06-24
- **What it is:** Open-source AI orchestration framework for building context-engineered, production-ready LLM applications. Design modular pipelines and agent workflows with explicit control over retrieval, routing, m
- **Why it ranks here:** highest composite score among returned repos for this query as of 2026-06-24.
- **Integration cost (estimate):** ~200–600 LOC: framework adapter + wire-up into src/lib (verify against repo README).

### 2. open-multi-agent/open-multi-agent
- **Source:** [github](https://github.com/open-multi-agent/open-multi-agent) (fetched 2026-06-24)
- **License:** MIT
- **Stars:** 6,427 · **Forks:** 2398 · **Last push:** 2026-06-24
- **What it is:** TypeScript multi-agent orchestration framework. Describe a goal, a coordinator decomposes it into a task DAG that runs on any LLM: Claude, ChatGPT, Gemini, DeepSeek, or local models.
- **Why it ranks here:** highest composite score among returned repos for this query as of 2026-06-24.
- **Integration cost (estimate):** ~200–600 LOC: framework adapter + wire-up into src/lib (verify against repo README).

### 3. omnigent-ai/omnigent
- **Source:** [github](https://github.com/omnigent-ai/omnigent) (fetched 2026-06-24)
- **License:** Apache-2.0
- **Stars:** 4,667 · **Forks:** 551 · **Last push:** 2026-06-24
- **What it is:** Omnigent is an open-source AI agent framework and meta-harness: orchestrate Claude Code, Codex, Cursor, Pi, and custom agents — swap harnesses without rewriting, enforce policies and sandboxing, and c
- **Why it ranks here:** highest composite score among returned repos for this query as of 2026-06-24.
- **Integration cost (estimate):** ~200–600 LOC: framework adapter + wire-up into src/lib (verify against repo README).

## Recommended next step
Wire a *throwaway* spike adapter for **deepset-ai/haystack** behind the existing provider interface (`src/lib/providers` or `src/lib/agents`), gated by an env flag. Run it against one Forleads loop end-to-end (note → draft) and compare grounded-output rate + cost against the current Claude path. Decide go/no-go after one afternoon.

## HuggingFace models (top 5 by downloads)
_none returned_

## ArXiv (most recent matches)
1. [Reward Modeling for Multi-Agent Orchestration](http://arxiv.org/abs/2606.13598v1) — published 2026-06-11 _(fetched 2026-06-24)_
   > Multi-Agent Systems (MAS) built on Large Language Models (LLMs) require effective orchestration to coordinate specialized agents, yet training such orchestrators is hindered by limited supervision and high computational cost. We propose Orchestration Reward Modeling (OrchRM), a s…
2. [Orchestrator: Active Inference for Multi-Agent Systems in Long-Horizon Tasks](http://arxiv.org/abs/2509.05651v1) — published 2025-09-06 _(fetched 2026-06-24)_
   > Complex, non-linear tasks challenge LLM-enhanced multi-agent systems (MAS) due to partial observability and suboptimal coordination. We propose Orchestrator, a novel MAS framework that leverages attention-inspired self-emergent coordination and reflective benchmarking to optimize…
3. [Understanding Bugs in Modern Agentic Frameworks: A Study of Symptoms, Root Causes, and Triggering Conditions](http://arxiv.org/abs/2604.08906v2) — published 2026-04-10 _(fetched 2026-06-24)_
   > Modern agentic frameworks (e.g., CrewAI and AutoGen) have evolved into complex, autonomous multi-agent systems, introducing unique reliability challenges beyond earlier pipeline-based LLM libraries. However, existing empirical studies focus on earlier LLM libraries or task-level …
4. [Self-Organizing Agent Network for LLM-based Workflow Automation](http://arxiv.org/abs/2508.13732v2) — published 2025-08-19 _(fetched 2026-06-24)_
   > Recent multi-agent frameworks built upon large language models (LLMs) have demonstrated remarkable capabilities in complex task planning. However, in real-world enterprise environments, business workflows are typically composed through modularization and reuse of numerous subproc…
5. [Multi-Agent LLM Orchestration Achieves Deterministic, High-Quality Decision Support for Incident Response](http://arxiv.org/abs/2511.15755v2) — published 2025-11-19 _(fetched 2026-06-24)_
   > Large language models (LLMs) promise to accelerate incident response in production systems, yet single-agent approaches generate vague, unusable recommendations. We present MyAntFarm.ai, a reproducible containerized framework demonstrating that multi-agent orchestration fundament…

## GitHub (top 5 by stars, pushed in last 180d)
1. [deepset-ai/haystack](https://github.com/deepset-ai/haystack) — 25,679 ★ · license=Apache-2.0 · last push 2026-06-24 _(fetched 2026-06-24)_
   > Open-source AI orchestration framework for building context-engineered, production-ready LLM applications. Design modular pipelines and agent workflows with explicit control over retrieval, routing, m
2. [open-multi-agent/open-multi-agent](https://github.com/open-multi-agent/open-multi-agent) — 6,427 ★ · license=MIT · last push 2026-06-24 _(fetched 2026-06-24)_
   > TypeScript multi-agent orchestration framework. Describe a goal, a coordinator decomposes it into a task DAG that runs on any LLM: Claude, ChatGPT, Gemini, DeepSeek, or local models.
3. [omnigent-ai/omnigent](https://github.com/omnigent-ai/omnigent) — 4,667 ★ · license=Apache-2.0 · last push 2026-06-24 _(fetched 2026-06-24)_
   > Omnigent is an open-source AI agent framework and meta-harness: orchestrate Claude Code, Codex, Cursor, Pi, and custom agents — swap harnesses without rewriting, enforce policies and sandboxing, and c
4. [dynamiq-ai/dynamiq](https://github.com/dynamiq-ai/dynamiq) — 1,057 ★ · license=Apache-2.0 · last push 2026-06-24 _(fetched 2026-06-24)_
   > Dynamiq is an orchestration framework for agentic AI and LLM applications
5. [swarmclawai/swarmclaw](https://github.com/swarmclawai/swarmclaw) — 591 ★ · license=MIT · last push 2026-06-11 _(fetched 2026-06-24)_
   > Open-source self-hosted AI agent runtime and multi-agent framework for autonomous agent swarms. Agent memory, MCP tools, schedules, delegation, and 23+ LLM providers (Claude, GPT, Gemini, OpenRouter,

## HuggingFace Open LLM Leaderboard
- Live board: https://huggingface.co/spaces/open-llm-leaderboard/open_llm_leaderboard
- _Leaderboard parquet not parsed; trending text-generation models (last 7d likes) shown as proxy._
1. [zai-org/GLM-5.2](https://huggingface.co/zai-org/GLM-5.2) — 2300 likes · 57,186 dl · license=mit · last modified unknown _(fetched 2026-06-24)_
2. [yuxinlu1/gemma-4-12B-coder-fable5-composer2.5-v1-GGUF](https://huggingface.co/yuxinlu1/gemma-4-12B-coder-fable5-composer2.5-v1-GGUF) — 2277 likes · 483,139 dl · license=apache-2.0 · last modified unknown _(fetched 2026-06-24)_
3. [yuxinlu1/gemma-4-12B-agentic-fable5-composer2.5-v2-3.5x-tau2-GGUF](https://huggingface.co/yuxinlu1/gemma-4-12B-agentic-fable5-composer2.5-v2-3.5x-tau2-GGUF) — 499 likes · 138,704 dl · license=apache-2.0 · last modified unknown _(fetched 2026-06-24)_
4. [WeiboAI/VibeThinker-3B](https://huggingface.co/WeiboAI/VibeThinker-3B) — 684 likes · 49,569 dl · license=mit · last modified unknown _(fetched 2026-06-24)_
5. [unsloth/GLM-5.2-GGUF](https://huggingface.co/unsloth/GLM-5.2-GGUF) — 333 likes · 76,971 dl · license=mit · last modified unknown _(fetched 2026-06-24)_

---
_Generated by `npm run os:scan`. Every claim above carries a source URL and a fetch date — no model name comes from training cutoff._