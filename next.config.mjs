/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  // Type safety is enforced by `npm run typecheck` (tsc --noEmit) and lint by
  // `npm run lint`; we don't re-run them inside `next build` so the production
  // build never blocks on ESLint's interactive first-run setup.
  eslint: { ignoreDuringBuilds: true },
  typescript: { ignoreBuildErrors: false },
};

export default nextConfig;
