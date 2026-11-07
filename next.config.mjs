import { fileURLToPath } from "node:url";
import { PHASE_DEVELOPMENT_SERVER } from "next/constants.js";
import { securityHeaders } from "./security-headers.mjs";

/** @type {(phase: string) => import('next').NextConfig} */
const nextConfig = (phase) => ({
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
  // Security headers on every route; the main CSP is report-only for now.
  // See security-headers.mjs for the policy and how to enforce it.
  async headers() {
    return [
      {
        source: "/:path*",
        headers: securityHeaders({ dev: phase === PHASE_DEVELOPMENT_SERVER }),
      },
    ];
  },
});

export default nextConfig;
