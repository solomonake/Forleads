import { spawnSync } from "node:child_process";

const patterns = [
  "src/**/*.ts",
  "src/**/*.tsx",
  "playwright/**/*.ts",
  "playwright.config.ts",
  "vitest.config.ts",
];

const listed = spawnSync("git", ["ls-files", ...patterns], {
  encoding: "utf8",
});

if (listed.status !== 0) {
  process.stderr.write(listed.stderr || "Failed to list lint files\n");
  process.exit(listed.status ?? 1);
}

const files = listed.stdout
  .split("\n")
  .map((file) => file.trim())
  .filter(Boolean);

if (files.length === 0) {
  console.log("[lint] no tracked TypeScript files found");
  process.exit(0);
}

const result = spawnSync(
  "./node_modules/.bin/eslint",
  [...files, "--max-warnings=0", "--cache", "--cache-location", ".eslintcache"],
  {
    encoding: "utf8",
    stdio: "inherit",
  },
);

process.exit(result.status ?? 1);
