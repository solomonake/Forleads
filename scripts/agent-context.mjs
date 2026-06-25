import fs from "node:fs";
import path from "node:path";
import { parseArg, readJson, root } from "./agent-lib.mjs";

const intent = parseArg("intent", "general repository improvement");
const risk = parseArg("risk", "medium");
const changedPaths = parseArg("paths", "").split(",").map((value) => value.trim()).filter(Boolean);
const catalog = readJson(".agent/knowledge/catalog.json");
const terms = new Set(
  `${intent} ${changedPaths.join(" ")}`
    .toLowerCase()
    .split(/[^a-z0-9]+/)
    .filter((term) => term.length > 2),
);
const ranked = catalog.entries
  .map((entry) => ({
    entry,
    score: entry.keywords.filter((keyword) => terms.has(keyword.toLowerCase())).length,
  }))
  .filter(({ score }) => score > 0)
  .sort((a, b) => b.score - a.score)
  .slice(0, 6)
  .map(({ entry }) => entry);

const pack = [
  "# Task Context Pack",
  "",
  `- Intent: ${intent}`,
  `- Risk tier: ${risk}`,
  `- Paths: ${changedPaths.join(", ") || "not supplied"}`,
  "- Required lifecycle: orient -> pain -> research -> plan -> classify risk -> implement -> test -> break -> review -> verify -> record -> draft PR",
  "",
  "## Always Read",
  "",
  "- AGENTS.md",
  "- .agent/playbook.md",
  "- .agent/decisions.md",
  "",
  "## Relevant Knowledge",
  "",
  ...ranked.flatMap((entry) => [
    `### ${entry.title}`,
    `- Source: ${entry.url_or_path}`,
    `- Trust: ${entry.trust_grade}; checked ${entry.checked_date}`,
    `- Rule: ${entry.actionable_rule}`,
    "",
  ]),
].join("\n");

const output = parseArg("write", "");
if (output) {
  fs.mkdirSync(path.dirname(path.join(root, output)), { recursive: true });
  fs.writeFileSync(path.join(root, output), pack);
  console.log(output);
} else {
  console.log(pack);
}
