# OS-Scan — open vector DB + embeddings for lead/H3 spatial memory

- **Date:** 2026-06-24
- **Generated at:** 2026-06-24T15:50:30.258Z
- **Stale after:** 2026-07-24 (>30 days = re-scan)
- **Queries:** HF `embedding` (pipeline=feature-extraction) · ArXiv `text embedding retrieval benchmark MTEB` · GitHub `vector database embeddings`

## Top 3 picks

### 1. Qwen/Qwen3-Embedding-0.6B
- **Source:** [huggingface-model](https://huggingface.co/Qwen/Qwen3-Embedding-0.6B) (fetched 2026-06-24)
- **License:** apache-2.0
- **Downloads:** 10,685,055 · **Likes:** 1078 · **Last modified:** 2026-04-20
- **Why it ranks here:** highest composite score among returned models for this query as of 2026-06-24.
- **Integration cost (estimate):** ~40–120 LOC: embedding wrapper + cache layer + insert into existing repo.

### 2. jinaai/jina-embeddings-v3
- **Source:** [huggingface-model](https://huggingface.co/jinaai/jina-embeddings-v3) (fetched 2026-06-24)
- **License:** cc-by-nc-4.0
- **Downloads:** 3,158,745 · **Likes:** 1147 · **Last modified:** 2026-04-08
- **Why it ranks here:** highest composite score among returned models for this query as of 2026-06-24.
- **Integration cost (estimate):** ~40–120 LOC: embedding wrapper + cache layer + insert into existing repo.

### 3. Qwen/Qwen3-Embedding-8B
- **Source:** [huggingface-model](https://huggingface.co/Qwen/Qwen3-Embedding-8B) (fetched 2026-06-24)
- **License:** apache-2.0
- **Downloads:** 2,433,314 · **Likes:** 716 · **Last modified:** 2025-07-07
- **Why it ranks here:** highest composite score among returned models for this query as of 2026-06-24.
- **Integration cost (estimate):** ~40–120 LOC: embedding wrapper + cache layer + insert into existing repo.

## Recommended next step
Wire a *throwaway* spike adapter for **Qwen/Qwen3-Embedding-0.6B** behind the existing provider interface (`src/lib/providers` or `src/lib/agents`), gated by an env flag. Run it against one Forleads loop end-to-end (note → draft) and compare grounded-output rate + cost against the current Claude path. Decide go/no-go after one afternoon.

## HuggingFace models (top 5 by downloads)
1. [Qwen/Qwen3-Embedding-0.6B](https://huggingface.co/Qwen/Qwen3-Embedding-0.6B) — 10,685,055 dl · 1078 likes · license=apache-2.0 · pipeline=feature-extraction · last modified 2026-04-20 _(fetched 2026-06-24)_
2. [jinaai/jina-embeddings-v3](https://huggingface.co/jinaai/jina-embeddings-v3) — 3,158,745 dl · 1147 likes · license=cc-by-nc-4.0 · pipeline=feature-extraction · last modified 2026-04-08 _(fetched 2026-06-24)_
3. [Qwen/Qwen3-Embedding-8B](https://huggingface.co/Qwen/Qwen3-Embedding-8B) — 2,433,314 dl · 716 likes · license=apache-2.0 · pipeline=feature-extraction · last modified 2025-07-07 _(fetched 2026-06-24)_
4. [Qwen/Qwen3-Embedding-4B](https://huggingface.co/Qwen/Qwen3-Embedding-4B) — 2,390,918 dl · 291 likes · license=apache-2.0 · pipeline=feature-extraction · last modified 2025-06-20 _(fetched 2026-06-24)_
5. [ibm-granite/granite-embedding-small-english-r2](https://huggingface.co/ibm-granite/granite-embedding-small-english-r2) — 2,213,729 dl · 73 likes · license=apache-2.0 · pipeline=feature-extraction · last modified 2026-01-21 _(fetched 2026-06-24)_

## ArXiv (most recent matches)
1. [FaMTEB: Massive Text Embedding Benchmark in Persian Language](http://arxiv.org/abs/2502.11571v2) — published 2025-02-17 _(fetched 2026-06-24)_
   > In this paper, we introduce a comprehensive benchmark for Persian (Farsi) text embeddings, built upon the Massive Text Embedding Benchmark (MTEB). Our benchmark includes 63 datasets spanning seven different tasks: classification, clustering, pair classification, reranking, retrie…
2. [PL-MTEB: Polish Massive Text Embedding Benchmark](http://arxiv.org/abs/2405.10138v2) — published 2024-05-16 _(fetched 2026-06-24)_
   > In this paper, we introduce the Polish Massive Text Embedding Benchmark (PL-MTEB), a comprehensive benchmark for text embeddings in the Polish language. PL-MTEB comprises 30 diverse NLP tasks across five categories: classification, clustering, pair classification, information ret…
3. [Text Embeddings by Weakly-Supervised Contrastive Pre-training](http://arxiv.org/abs/2212.03533v2) — published 2022-12-07 _(fetched 2026-06-24)_
   > This paper presents E5, a family of state-of-the-art text embeddings that transfer well to a wide range of tasks. The model is trained in a contrastive manner with weak supervision signals from our curated large-scale text pair dataset (called CCPairs). E5 can be readily used as …
4. [Do We Need Domain-Specific Embedding Models? An Empirical Investigation](http://arxiv.org/abs/2409.18511v4) — published 2024-09-27 _(fetched 2026-06-24)_
   > Embedding models play a crucial role in representing and retrieving information across various NLP applications. Recent advancements in Large Language Models (LLMs) have further enhanced the performance of embedding models, which are trained on massive amounts of text covering al…
5. [Improving embedding with contrastive fine-tuning on small datasets with expert-augmented scores](http://arxiv.org/abs/2408.11868v1) — published 2024-08-19 _(fetched 2026-06-24)_
   > This paper presents an approach to improve text embedding models through contrastive fine-tuning on small datasets augmented with expert scores. It focuses on enhancing semantic textual similarity tasks and addressing text retrieval problems. The proposed method uses soft labels …

## GitHub (top 5 by stars, pushed in last 180d)
1. [hegelai/prompttools](https://github.com/hegelai/prompttools) — 3,040 ★ · license=Apache-2.0 · last push 2026-02-11 _(fetched 2026-06-24)_
   > Open-source tools for prompt testing and experimentation, with support for both LLMs (e.g. OpenAI, LLaMA) and vector databases (e.g. Chroma, Weaviate, LanceDB).
2. [philippgille/chromem-go](https://github.com/philippgille/chromem-go) — 1,006 ★ · license=MPL-2.0 · last push 2026-05-17 _(fetched 2026-06-24)_
   > Embeddable vector database for Go with Chroma-like interface and zero third-party dependencies. In-memory with optional persistence.
3. [sqliteai/sqlite-vector](https://github.com/sqliteai/sqlite-vector) — 978 ★ · license=NOASSERTION · last push 2026-05-30 _(fetched 2026-06-24)_
   > SQLite-Vector is a cross-platform, ultra-efficient SQLite extension that brings vector search capabilities to your embedded database.
4. [ArcadeData/arcadedb](https://github.com/ArcadeData/arcadedb) — 966 ★ · license=Apache-2.0 · last push 2026-06-24 _(fetched 2026-06-24)_
   > ArcadeDB Multi-Model Database, one DBMS that supports SQL, Cypher, Gremlin, HTTP/JSON, MongoDB and Redis. ArcadeDB is a conceptual fork of OrientDB, the first Multi-Model DBMS. ArcadeDB supports Vecto
5. [orneryd/NornicDB](https://github.com/orneryd/NornicDB) — 788 ★ · license=MIT · last push 2026-06-24 _(fetched 2026-06-24)_
   > Nornicdb is a distributed low-latency, Graph+Vector, Temporal MVCC with all sub-ms HNSW search, graph traversal, and writes. Using Neo4j Bolt/Cypher and qdrant's gRPC means you can switch with no chan

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