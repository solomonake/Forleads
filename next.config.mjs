import { fileURLToPath } from "node:url";

/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  // Git worktrees put a second lockfile above this directory; without an
  // explicit root Next picks the PARENT repo and watches every worktree,
  // which starves dev/build on low-memory machines.
  outputFileTracingRoot: fileURLToPath(new URL(".", import.meta.url)),
  // Type safety is enforced by `npm run typecheck` (tsc --noEmit) and lint by
  // `npm run lint`; we don't re-run them inside `next build` so the production
  // build never blocks on ESLint's interactive first-run setup.
  eslint: { ignoreDuringBuilds: true },
  typescript: { ignoreBuildErrors: false },
};

export default nextConfig;
