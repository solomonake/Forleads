import fs from "node:fs";
import path from "node:path";
import { parseArg, readJson, root } from "./agent-lib.mjs";

const catalog = readJson(".agent/knowledge/catalog.json");
const now = Date.now();
const maxAgeDays = Number(parseArg("max-age-days", "45"));
const findings = [];
for (const entry of catalog.entries) {
  const ageDays = Math.floor((now - new Date(entry.checked_date).getTime()) / 86400000);
  if (ageDays > maxAgeDays) findings.push(`${entry.id}: source check is ${ageDays} days old`);
  if (!entry.actionable_rule) findings.push(`${entry.id}: missing actionable rule`);
  if (!entry.url_or_path || !entry.author || !entry.trust_grade) {
    findings.push(`${entry.id}: incomplete provenance`);
  }
  if (!Array.isArray(entry.contradictions)) findings.push(`${entry.id}: contradictions must be an array`);
}

const report = `# Monthly Knowledge Audit

- Generated: ${new Date().toISOString()}
- Catalog version: ${catalog.version}
- Entries reviewed: ${catalog.entries.length}
- Maximum freshness age: ${maxAgeDays} days

## Findings

${findings.length ? findings.map((finding) => `- ${finding}`).join("\n") : "- No stale or structurally unsupported entries found."}

This report proposes review work only. It never silently changes source claims.
`;
const output = parseArg("report", "");
if (output) {
  const target = path.join(root, output);
  fs.mkdirSync(path.dirname(target), { recursive: true });
  fs.writeFileSync(target, report);
}
console.log(report);
process.exit(findings.length ? 1 : 0);
