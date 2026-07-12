import fs from "node:fs";
import path from "node:path";
import { root } from "./agent-lib.mjs";

const sourceDir = path.join(root, "node_modules", "maplibre-gl", "dist");
const targetDir = path.join(root, "public", "vendor", "maplibre");

const files = ["maplibre-gl.js", "maplibre-gl.css"];

fs.mkdirSync(targetDir, { recursive: true });
for (const file of files) {
  fs.copyFileSync(path.join(sourceDir, file), path.join(targetDir, file));
}

console.log(`[sync-maplibre-assets] copied ${files.length} files to ${path.relative(root, targetDir)}`);
