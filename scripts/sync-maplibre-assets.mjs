import fs from "node:fs";
import path from "node:path";
import { root } from "./agent-lib.mjs";

// MapLibre v6 is ESM-only. The main module and its CSS are bundled by Next
// (dynamic `import("maplibre-gl")` in MapWorkspace.tsx, CSS in app/layout.tsx).
// Only the web worker needs a static copy: MapLibre resolves it at runtime from
// import.meta.url, which the bundler does not follow, so MapWorkspace calls
// setWorkerUrl() with the path served from public/.
const sourceDir = path.join(root, "node_modules", "maplibre-gl", "dist");
const targetDir = path.join(root, "public", "vendor", "maplibre");

const files = ["maplibre-gl-worker.mjs"];

// Copies written by the v4 UMD setup. They are generated (gitignored) and would
// otherwise keep serving the old, vulnerable bundle from public/.
const legacyFiles = ["maplibre-gl.js", "maplibre-gl.css"];

fs.mkdirSync(targetDir, { recursive: true });
for (const file of files) {
  const source = path.join(sourceDir, file);
  if (!fs.existsSync(source)) {
    const { version } = JSON.parse(
      fs.readFileSync(path.join(root, "node_modules", "maplibre-gl", "package.json"), "utf8"),
    );
    throw new Error(
      `[sync-maplibre-assets] ${file} not found in maplibre-gl@${version}; expected the v6 ESM dist layout`,
    );
  }
  fs.copyFileSync(source, path.join(targetDir, file));
}
for (const file of legacyFiles) {
  fs.rmSync(path.join(targetDir, file), { force: true });
}

console.log(`[sync-maplibre-assets] copied ${files.length} file(s) to ${path.relative(root, targetDir)}`);
