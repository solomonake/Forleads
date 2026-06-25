#!/usr/bin/env node
// Forleads OS-Scan — open-source state-of-the-art scan for model/architecture decisions.
// Hits HuggingFace, ArXiv, GitHub, and HuggingFace Open LLM Leaderboard.
// Outputs a dated markdown memo under docs/os-scans/ and updates the rolling
// "current picks" file in the user's auto-memory.
//
// Usage:
//   node scripts/os-scan.mjs "topic phrase"
//   node scripts/os-scan.mjs --all              # run the 4 first-run topics
//   node scripts/os-scan.mjs "topic" --hf "..." --arxiv "..." --gh "..."

import { writeFile, mkdir, readFile, access } from 'node:fs/promises';
import { constants as FS } from 'node:fs';
import os from 'node:os';
import path from 'node:path';

const ROOT = process.cwd();
const TODAY = new Date().toISOString().slice(0, 10);
const NOW = new Date().toISOString();
const MEMORY_DIR = path.join(
  os.homedir(),
  '.claude/projects/-Users-preciousmuwanguzi-Desktop-Forleads/memory',
);
const MEMORY_CURRENT = path.join(MEMORY_DIR, 'os-models-current.md');
const MEMORY_INDEX = path.join(MEMORY_DIR, 'MEMORY.md');

const TOPIC_CONFIG = {
  'small open LLM for cited, JSON-output drafting': {
    slug: 'small-open-llm-json-drafting',
    hf: { search: 'instruct', pipeline: 'text-generation' },
    arxiv: 'structured output JSON small language model citation grounding',
    gh: 'structured output LLM JSON',
  },
  'open vector DB + embeddings for lead/H3 spatial memory': {
    slug: 'vector-db-and-embeddings-spatial',
    hf: { search: 'embedding', pipeline: 'feature-extraction' },
    arxiv: 'text embedding retrieval benchmark MTEB',
    gh: 'vector database embeddings',
  },
  'open agent orchestration frameworks 2026': {
    slug: 'agent-orchestration-frameworks',
    // Frameworks aren't HF models — skip the model source for this topic.
    hf: { skip: true },
    arxiv: 'LLM agent orchestration framework multi-agent',
    gh: 'agent framework LLM orchestration',
  },
  'open visual-grounding / OCR for street imagery captioning': {
    slug: 'vision-ocr-street-imagery',
    hf: { search: 'OCR', pipeline: 'image-text-to-text' },
    arxiv: 'vision language OCR scene text captioning grounding',
    gh: 'OCR vision language model',
  },
};

// -------------------------- utils --------------------------
const log = (...a) => console.log('[os-scan]', ...a);
const warn = (...a) => console.warn('[os-scan][warn]', ...a);

function slugify(s) {
  return s
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/(^-|-$)/g, '')
    .slice(0, 60);
}

async function fetchJson(url, headers = {}) {
  const res = await fetch(url, {
    headers: { 'user-agent': 'forleads-os-scan/0.1', accept: 'application/json', ...headers },
  });
  if (!res.ok) throw new Error(`${res.status} ${res.statusText} :: ${url}`);
  return res.json();
}

async function fetchText(url, headers = {}) {
  const res = await fetch(url, {
    headers: { 'user-agent': 'forleads-os-scan/0.1', ...headers },
  });
  if (!res.ok) throw new Error(`${res.status} ${res.statusText} :: ${url}`);
  return res.text();
}

function licenseFromTags(tags = []) {
  const lic = tags.find((t) => typeof t === 'string' && t.startsWith('license:'));
  return lic ? lic.replace('license:', '') : 'unknown';
}

function fmtDate(d) {
  if (!d) return 'unknown';
  return new Date(d).toISOString().slice(0, 10);
}

// -------------------------- sources --------------------------

async function hfModels({ search, pipeline, skip }) {
  if (skip) return [];
  const q = new URLSearchParams({
    search,
    sort: 'downloads',
    direction: '-1',
    limit: '8',
    full: 'true',
  });
  if (pipeline) q.set('pipeline_tag', pipeline);
  const url = `https://huggingface.co/api/models?${q}`;
  const arr = await fetchJson(url);
  return arr.slice(0, 5).map((m) => ({
    source: 'huggingface-model',
    name: m.id,
    url: `https://huggingface.co/${m.id}`,
    downloads: m.downloads ?? 0,
    likes: m.likes ?? 0,
    license: licenseFromTags(m.tags),
    pipeline: m.pipeline_tag,
    lastModified: fmtDate(m.lastModified),
    fetchedAt: TODAY,
  }));
}

async function arxivPapers(query) {
  // Relevance sort + AND-of-terms across abstract — better than `all:` + submittedDate
  // (returns the freshest papers loosely overlapping any token) and better than
  // an exact-phrase `abs:"..."` which often returns 0 matches.
  const terms = query
    .split(/\s+/)
    .filter((t) => t.length > 2)
    .slice(0, 6)
    .map((t) => `abs:${t}`)
    .join('+AND+');
  const q = new URLSearchParams({
    sortBy: 'relevance',
    sortOrder: 'descending',
    max_results: '5',
  });
  // search_query has to be unencoded for arXiv's `AND` operator to be honoured.
  const url = `http://export.arxiv.org/api/query?search_query=${terms}&${q}`;
  const xml = await fetchText(url);
  const entries = [...xml.matchAll(/<entry>([\s\S]*?)<\/entry>/g)].map((m) => m[1]);
  return entries.slice(0, 5).map((e) => {
    const grab = (tag) => (e.match(new RegExp(`<${tag}[^>]*>([\\s\\S]*?)<\\/${tag}>`)) || [])[1] || '';
    const link = (e.match(/<id>([\s\S]*?)<\/id>/) || [])[1] || '';
    return {
      source: 'arxiv',
      name: grab('title').replace(/\s+/g, ' ').trim(),
      url: link.trim(),
      published: fmtDate(grab('published').trim()),
      summary: grab('summary').replace(/\s+/g, ' ').trim().slice(0, 280),
      fetchedAt: TODAY,
    };
  });
}

async function githubRepos(query) {
  const sixMonthsAgo = new Date(Date.now() - 1000 * 60 * 60 * 24 * 180)
    .toISOString()
    .slice(0, 10);
  const q = `${query} pushed:>${sixMonthsAgo}`;
  const url = `https://api.github.com/search/repositories?q=${encodeURIComponent(q)}&sort=stars&order=desc&per_page=5`;
  const headers = process.env.GITHUB_TOKEN
    ? { authorization: `Bearer ${process.env.GITHUB_TOKEN}` }
    : {};
  const json = await fetchJson(url, headers);
  return (json.items || []).slice(0, 5).map((r) => ({
    source: 'github',
    name: r.full_name,
    url: r.html_url,
    stars: r.stargazers_count,
    forks: r.forks_count,
    license: r.license?.spdx_id || 'unknown',
    pushedAt: fmtDate(r.pushed_at),
    description: (r.description || '').slice(0, 200),
    fetchedAt: TODAY,
  }));
}

// Open LLM Leaderboard lives in a HF Space; ranked rows are in the
// `open-llm-leaderboard/contents` dataset as parquet, which we won't parse here.
// Honest fallback: return the live URL + a list of recent text-generation models
// (sorted by likes) so the memo cites *something* fresh, not training-cutoff names.
async function openLlmLeaderboard() {
  try {
    const url =
      'https://huggingface.co/api/models?pipeline_tag=text-generation&sort=likes7d&direction=-1&limit=5';
    const arr = await fetchJson(url);
    return {
      leaderboardUrl: 'https://huggingface.co/spaces/open-llm-leaderboard/open_llm_leaderboard',
      note: 'Leaderboard parquet not parsed; trending text-generation models (last 7d likes) shown as proxy.',
      proxy: arr.map((m) => ({
        source: 'hf-leaderboard-proxy',
        name: m.id,
        url: `https://huggingface.co/${m.id}`,
        likes: m.likes ?? 0,
        downloads: m.downloads ?? 0,
        license: licenseFromTags(m.tags),
        lastModified: fmtDate(m.lastModified),
        fetchedAt: TODAY,
      })),
    };
  } catch (e) {
    return {
      leaderboardUrl: 'https://huggingface.co/spaces/open-llm-leaderboard/open_llm_leaderboard',
      note: `Could not fetch proxy data (${e.message}); see leaderboard URL.`,
      proxy: [],
    };
  }
}

// -------------------------- ranking --------------------------

function rankPicks({ hf, gh }) {
  const items = [];
  for (const m of hf) {
    const score = Math.log10((m.downloads || 0) + 1) * 10 + (m.likes || 0) * 0.05;
    items.push({ ...m, score, kind: 'model' });
  }
  for (const r of gh) {
    const score = Math.log10((r.stars || 0) + 1) * 12;
    items.push({ ...r, score, kind: 'repo' });
  }
  // dedupe by normalised name tail
  const seen = new Set();
  const deduped = [];
  for (const i of items.sort((a, b) => b.score - a.score)) {
    const key = (i.name || '').toLowerCase().split('/').pop();
    if (seen.has(key)) continue;
    seen.add(key);
    deduped.push(i);
  }
  return deduped.slice(0, 3);
}

function integrationCostEstimate(pick) {
  if (pick.kind === 'model' && pick.pipeline === 'text-generation') {
    return '~80–200 LOC: HF Inference / vLLM client + prompt template + JSON-mode validator.';
  }
  if (pick.kind === 'model' && pick.pipeline === 'feature-extraction') {
    return '~40–120 LOC: embedding wrapper + cache layer + insert into existing repo.';
  }
  if (pick.kind === 'model' && pick.pipeline === 'image-text-to-text') {
    return '~150–300 LOC: server route + image preprocess + structured prompt.';
  }
  if (pick.kind === 'repo') {
    return '~200–600 LOC: framework adapter + wire-up into src/lib (verify against repo README).';
  }
  return '~100–250 LOC (estimate; verify against README).';
}

// -------------------------- memo --------------------------

function renderMemo({ topic, config, picks, hf, arxiv, gh, leaderboard, errors }) {
  const lines = [];
  lines.push(`# OS-Scan — ${topic}`);
  lines.push('');
  lines.push(`- **Date:** ${TODAY}`);
  lines.push(`- **Generated at:** ${NOW}`);
  lines.push(`- **Stale after:** ${new Date(Date.now() + 30 * 86400000).toISOString().slice(0, 10)} (>30 days = re-scan)`);
  lines.push(`- **Queries:** HF \`${config.hf.search}\` (pipeline=${config.hf.pipeline || 'any'}) · ArXiv \`${config.arxiv}\` · GitHub \`${config.gh}\``);
  lines.push('');

  // Top 3 picks
  lines.push('## Top 3 picks');
  if (picks.length === 0) {
    lines.push('_No picks — all sources returned empty. See Honest gaps below._');
  } else {
    picks.forEach((p, i) => {
      lines.push('');
      lines.push(`### ${i + 1}. ${p.name}`);
      lines.push(`- **Source:** [${p.source}](${p.url}) (fetched ${p.fetchedAt})`);
      lines.push(`- **License:** ${p.license || 'unknown'}`);
      if (p.kind === 'model') {
        lines.push(`- **Downloads:** ${p.downloads?.toLocaleString?.() ?? p.downloads} · **Likes:** ${p.likes} · **Last modified:** ${p.lastModified}`);
      } else {
        lines.push(`- **Stars:** ${p.stars?.toLocaleString?.() ?? p.stars} · **Forks:** ${p.forks} · **Last push:** ${p.pushedAt}`);
        if (p.description) lines.push(`- **What it is:** ${p.description}`);
      }
      lines.push(`- **Why it ranks here:** highest composite score among returned ${p.kind === 'model' ? 'models' : 'repos'} for this query as of ${TODAY}.`);
      lines.push(`- **Integration cost (estimate):** ${integrationCostEstimate(p)}`);
    });
  }
  lines.push('');

  // Recommended next step
  lines.push('## Recommended next step');
  if (picks[0]) {
    lines.push(`Wire a *throwaway* spike adapter for **${picks[0].name}** behind the existing provider interface (\`src/lib/providers\` or \`src/lib/agents\`), gated by an env flag. Run it against one Forleads loop end-to-end (note → draft) and compare grounded-output rate + cost against the current Claude path. Decide go/no-go after one afternoon.`);
  } else {
    lines.push('All sources empty — broaden queries and re-run before committing to any architecture decision.');
  }
  lines.push('');

  // Raw findings
  lines.push('## HuggingFace models (top 5 by downloads)');
  if (hf.length === 0) lines.push('_none returned_');
  hf.forEach((m, i) => {
    lines.push(`${i + 1}. [${m.name}](${m.url}) — ${m.downloads.toLocaleString()} dl · ${m.likes} likes · license=${m.license} · pipeline=${m.pipeline || 'n/a'} · last modified ${m.lastModified} _(fetched ${m.fetchedAt})_`);
  });
  lines.push('');

  lines.push('## ArXiv (most recent matches)');
  if (arxiv.length === 0) lines.push('_none returned_');
  arxiv.forEach((p, i) => {
    lines.push(`${i + 1}. [${p.name}](${p.url}) — published ${p.published} _(fetched ${p.fetchedAt})_`);
    if (p.summary) lines.push(`   > ${p.summary}…`);
  });
  lines.push('');

  lines.push('## GitHub (top 5 by stars, pushed in last 180d)');
  if (gh.length === 0) lines.push('_none returned_');
  gh.forEach((r, i) => {
    lines.push(`${i + 1}. [${r.name}](${r.url}) — ${r.stars.toLocaleString()} ★ · license=${r.license} · last push ${r.pushedAt} _(fetched ${r.fetchedAt})_`);
    if (r.description) lines.push(`   > ${r.description}`);
  });
  lines.push('');

  lines.push('## HuggingFace Open LLM Leaderboard');
  lines.push(`- Live board: ${leaderboard.leaderboardUrl}`);
  lines.push(`- _${leaderboard.note}_`);
  if (leaderboard.proxy?.length) {
    leaderboard.proxy.forEach((m, i) => {
      lines.push(`${i + 1}. [${m.name}](${m.url}) — ${m.likes} likes · ${m.downloads.toLocaleString()} dl · license=${m.license} · last modified ${m.lastModified} _(fetched ${m.fetchedAt})_`);
    });
  }
  lines.push('');

  if (errors.length) {
    lines.push('## Honest gaps');
    errors.forEach((e) => lines.push(`- ${e}`));
    lines.push('');
  }

  lines.push('---');
  lines.push('_Generated by `npm run os:scan`. Every claim above carries a source URL and a fetch date — no model name comes from training cutoff._');
  return lines.join('\n');
}

// -------------------------- memory file --------------------------

async function updateMemoryCurrent({ topic, slug, picks, memoPath }) {
  let existing = '';
  try {
    await access(MEMORY_DIR, FS.F_OK);
  } catch {
    warn('memory dir missing; skipping os-models-current.md update');
    return;
  }
  try {
    existing = await readFile(MEMORY_CURRENT, 'utf8');
  } catch {
    existing = '';
  }

  const frontmatter = `---
name: os-models-current
description: Current best-in-class open-source picks per Forleads topic. Each entry carries its scan date — re-scan if >30 days old.
metadata:
  type: reference
---

`;

  // strip any old block for this slug
  const blockHeader = `<!-- topic:${slug} -->`;
  const blockEnd = `<!-- /topic:${slug} -->`;
  const stripped = existing
    .replace(/^---[\s\S]*?---\s*/m, '') // drop old frontmatter; we rewrite it
    .replace(new RegExp(`${blockHeader}[\\s\\S]*?${blockEnd}\\n?`), '')
    .trim();

  const pickList = picks.length
    ? picks
        .map(
          (p, i) =>
            `${i + 1}. [${p.name}](${p.url}) — license=${p.license || 'unknown'} · ${p.kind === 'model' ? `${p.downloads?.toLocaleString?.() || 0} dl` : `${p.stars?.toLocaleString?.() || 0} ★`}`,
        )
        .join('\n')
    : '_no picks returned this scan_';

  const block = `${blockHeader}
## ${topic}

- **Last scanned:** ${TODAY}
- **Stale after:** ${new Date(Date.now() + 30 * 86400000).toISOString().slice(0, 10)}
- **Memo:** [${path.relative(ROOT, memoPath)}](${path.relative(ROOT, memoPath)})

**Current picks:**
${pickList}
${blockEnd}
`;

  const body = `${stripped ? stripped + '\n\n' : ''}${block}`.trim() + '\n';
  await writeFile(MEMORY_CURRENT, frontmatter + body, 'utf8');
  log(`memory updated: ${MEMORY_CURRENT}`);

  // ensure MEMORY.md index has a line pointing at this file
  try {
    let idx = await readFile(MEMORY_INDEX, 'utf8');
    if (!idx.includes('os-models-current.md')) {
      const line = '- [OS-Scan current picks](os-models-current.md) — current open-source picks per topic with scan dates (>30d = stale)';
      if (idx.endsWith('\n')) idx += line + '\n';
      else idx += '\n' + line + '\n';
      await writeFile(MEMORY_INDEX, idx, 'utf8');
      log('MEMORY.md index updated');
    }
  } catch (e) {
    warn(`could not update MEMORY.md index: ${e.message}`);
  }
}

// -------------------------- orchestration --------------------------

async function runOne(topic, overrides = {}) {
  const config = TOPIC_CONFIG[topic] || {
    slug: slugify(topic),
    hf: { search: topic.split(' ').slice(0, 3).join(' '), pipeline: undefined },
    arxiv: topic,
    gh: topic,
  };
  if (overrides.hf) config.hf = { ...config.hf, search: overrides.hf };
  if (overrides.arxiv) config.arxiv = overrides.arxiv;
  if (overrides.gh) config.gh = overrides.gh;

  log(`scanning: ${topic}`);

  const errors = [];
  const settled = await Promise.allSettled([
    hfModels(config.hf),
    arxivPapers(config.arxiv),
    githubRepos(config.gh),
    openLlmLeaderboard(),
  ]);
  const [hfR, arxivR, ghR, lbR] = settled;
  const hf = hfR.status === 'fulfilled' ? hfR.value : (errors.push(`HuggingFace fetch failed: ${hfR.reason?.message}`), []);
  const arxiv = arxivR.status === 'fulfilled' ? arxivR.value : (errors.push(`ArXiv fetch failed: ${arxivR.reason?.message}`), []);
  const gh = ghR.status === 'fulfilled' ? ghR.value : (errors.push(`GitHub fetch failed: ${ghR.reason?.message}`), []);
  const leaderboard = lbR.status === 'fulfilled' ? lbR.value : { leaderboardUrl: 'https://huggingface.co/spaces/open-llm-leaderboard/open_llm_leaderboard', note: `fetch failed: ${lbR.reason?.message}`, proxy: [] };

  const picks = rankPicks({ hf, gh });
  const memo = renderMemo({ topic, config, picks, hf, arxiv, gh, leaderboard, errors });

  const outDir = path.join(ROOT, 'docs/os-scans');
  await mkdir(outDir, { recursive: true });
  const memoPath = path.join(outDir, `${TODAY}-${config.slug}.md`);
  await writeFile(memoPath, memo, 'utf8');
  log(`memo written: ${path.relative(ROOT, memoPath)}`);

  await updateMemoryCurrent({ topic, slug: config.slug, picks, memoPath });

  return { topic, slug: config.slug, memoPath, picks: picks.length, errors };
}

async function main() {
  const args = process.argv.slice(2);
  if (args.length === 0 || args[0] === '--help' || args[0] === '-h') {
    console.log(`Forleads OS-Scan
Usage:
  node scripts/os-scan.mjs "topic phrase"
  node scripts/os-scan.mjs --all
  node scripts/os-scan.mjs "topic" --hf "..." --arxiv "..." --gh "..."`);
    process.exit(0);
  }

  if (args[0] === '--all') {
    const results = [];
    for (const t of Object.keys(TOPIC_CONFIG)) {
      try {
        results.push(await runOne(t));
      } catch (e) {
        warn(`topic failed: ${t} :: ${e.message}`);
      }
    }
    console.table(results.map((r) => ({ topic: r.topic.slice(0, 40), picks: r.picks, errors: r.errors.length, memo: path.relative(ROOT, r.memoPath) })));
    return;
  }

  const topic = args[0];
  const overrides = {};
  for (let i = 1; i < args.length - 1; i += 2) {
    const k = args[i].replace(/^--/, '');
    overrides[k] = args[i + 1];
  }
  const r = await runOne(topic, overrides);
  console.table([{ topic: r.topic.slice(0, 40), picks: r.picks, errors: r.errors.length, memo: path.relative(ROOT, r.memoPath) }]);
}

main().catch((e) => {
  console.error('[os-scan] fatal:', e);
  process.exit(1);
});
