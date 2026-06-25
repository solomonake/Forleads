# OS-Scan — open visual-grounding / OCR for street imagery captioning

- **Date:** 2026-06-24
- **Generated at:** 2026-06-24T15:50:30.258Z
- **Stale after:** 2026-07-24 (>30 days = re-scan)
- **Queries:** HF `OCR` (pipeline=image-text-to-text) · ArXiv `vision language OCR scene text captioning grounding` · GitHub `OCR vision language model`

## Top 3 picks

### 1. deepseek-ai/DeepSeek-OCR
- **Source:** [huggingface-model](https://huggingface.co/deepseek-ai/DeepSeek-OCR) (fetched 2026-06-24)
- **License:** mit
- **Downloads:** 2,271,753 · **Likes:** 3285 · **Last modified:** 2025-11-04
- **Why it ranks here:** highest composite score among returned models for this query as of 2026-06-24.
- **Integration cost (estimate):** ~150–300 LOC: server route + image preprocess + structured prompt.

### 2. zai-org/GLM-OCR
- **Source:** [huggingface-model](https://huggingface.co/zai-org/GLM-OCR) (fetched 2026-06-24)
- **License:** mit
- **Downloads:** 3,269,957 · **Likes:** 1861 · **Last modified:** 2026-05-19
- **Why it ranks here:** highest composite score among returned models for this query as of 2026-06-24.
- **Integration cost (estimate):** ~150–300 LOC: server route + image preprocess + structured prompt.

### 3. deepseek-ai/DeepSeek-OCR-2
- **Source:** [huggingface-model](https://huggingface.co/deepseek-ai/DeepSeek-OCR-2) (fetched 2026-06-24)
- **License:** apache-2.0
- **Downloads:** 2,934,613 · **Likes:** 999 · **Last modified:** 2026-02-03
- **Why it ranks here:** highest composite score among returned models for this query as of 2026-06-24.
- **Integration cost (estimate):** ~150–300 LOC: server route + image preprocess + structured prompt.

## Recommended next step
Wire a *throwaway* spike adapter for **deepseek-ai/DeepSeek-OCR** behind the existing provider interface (`src/lib/providers` or `src/lib/agents`), gated by an env flag. Run it against one Forleads loop end-to-end (note → draft) and compare grounded-output rate + cost against the current Claude path. Decide go/no-go after one afternoon.

## HuggingFace models (top 5 by downloads)
1. [zai-org/GLM-OCR](https://huggingface.co/zai-org/GLM-OCR) — 3,269,957 dl · 1861 likes · license=mit · pipeline=image-text-to-text · last modified 2026-05-19 _(fetched 2026-06-24)_
2. [deepseek-ai/DeepSeek-OCR-2](https://huggingface.co/deepseek-ai/DeepSeek-OCR-2) — 2,934,613 dl · 999 likes · license=apache-2.0 · pipeline=image-text-to-text · last modified 2026-02-03 _(fetched 2026-06-24)_
3. [deepseek-ai/DeepSeek-OCR](https://huggingface.co/deepseek-ai/DeepSeek-OCR) — 2,271,753 dl · 3285 likes · license=mit · pipeline=image-text-to-text · last modified 2025-11-04 _(fetched 2026-06-24)_
4. [datalab-to/chandra-ocr-2](https://huggingface.co/datalab-to/chandra-ocr-2) — 1,881,612 dl · 406 likes · license=openrail · pipeline=image-text-to-text · last modified 2026-03-18 _(fetched 2026-06-24)_
5. [datalab-to/surya-ocr-2](https://huggingface.co/datalab-to/surya-ocr-2) — 377,341 dl · 64 likes · license=openrail · pipeline=image-text-to-text · last modified 2026-05-27 _(fetched 2026-06-24)_

## ArXiv (most recent matches)
1. [TAP: Text-Aware Pre-training for Text-VQA and Text-Caption](http://arxiv.org/abs/2012.04638v1) — published 2020-12-08 _(fetched 2026-06-24)_
   > In this paper, we propose Text-Aware Pre-training (TAP) for Text-VQA and Text-Caption tasks. These two tasks aim at reading and understanding scene text in images for question answering and image caption generation, respectively. In contrast to the conventional vision-language pr…
2. [PreSTU: Pre-Training for Scene-Text Understanding](http://arxiv.org/abs/2209.05534v3) — published 2022-09-12 _(fetched 2026-06-24)_
   > The ability to recognize and reason about text embedded in visual inputs is often lacking in vision-and-language (V&amp;L) models, perhaps because V&amp;L pre-training methods have often failed to include such an ability in their training objective. In this paper, we propose PreS…
3. [Text-VQA Aug: Pipelined Harnessing of Large Multimodal Models for Automated Synthesis](http://arxiv.org/abs/2511.02046v1) — published 2025-11-03 _(fetched 2026-06-24)_
   > Creation of large-scale databases for Visual Question Answering tasks pertaining to the text data in a scene (text-VQA) involves skilful human annotation, which is tedious and challenging. With the advent of foundation models that handle vision and language modalities, and with t…
4. [Simple is not Easy: A Simple Strong Baseline for TextVQA and TextCaps](http://arxiv.org/abs/2012.05153v1) — published 2020-12-09 _(fetched 2026-06-24)_
   > Texts appearing in daily scenes that can be recognized by OCR (Optical Character Recognition) tools contain significant information, such as street name, product brand and prices. Two tasks -- text-based visual question answering and text-based image captioning, with a text exten…
5. [GIT: A Generative Image-to-text Transformer for Vision and Language](http://arxiv.org/abs/2205.14100v5) — published 2022-05-27 _(fetched 2026-06-24)_
   > In this paper, we design and train a Generative Image-to-text Transformer, GIT, to unify vision-language tasks such as image/video captioning and question answering. While generative models provide a consistent network architecture between pre-training and fine-tuning, existing w…

## GitHub (top 5 by stars, pushed in last 180d)
1. [rednote-hilab/dots.ocr](https://github.com/rednote-hilab/dots.ocr) — 8,959 ★ · license=MIT · last push 2026-03-24 _(fetched 2026-06-24)_
   > Multilingual Document Layout Parsing in a Single Vision-Language Model
2. [jamjamjon/usls](https://github.com/jamjamjon/usls) — 426 ★ · license=MIT · last push 2026-06-16 _(fetched 2026-06-24)_
   > A Rust library integrated with ONNXRuntime, providing a collection of Computer Vison and Vision-Language models such as YOLO, FastVLM, and more.
3. [Roots-Automation/GutenOCR](https://github.com/Roots-Automation/GutenOCR) — 189 ★ · license=Apache-2.0 · last push 2026-06-24 _(fetched 2026-06-24)_
   > Open-source tools for training and evaluating Vision Language Models for OCR
4. [PRITHIVSAKTHIUR/Multimodal-Outpost-Notebooks](https://github.com/PRITHIVSAKTHIUR/Multimodal-Outpost-Notebooks) — 30 ★ · license=Apache-2.0 · last push 2026-05-12 _(fetched 2026-06-24)_
   > This repository contains a curated collection of notebooks for implementing state-of-the-art multimodal Vision-Language Models (VLMs).
5. [DocTron-hub/OCRVerse](https://github.com/DocTron-hub/OCRVerse) — 30 ★ · license=Apache-2.0 · last push 2026-02-04 _(fetched 2026-06-24)_
   > OCRVerse: Towards Holistic OCR in End-to-End Vision-Language Models

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