import type { NextConfig } from "next";

/**
 * Static export for GitHub Pages.
 *
 * NEXT_PUBLIC_BASE_PATH is the repo sub-path the site is served from, e.g. "/medaker".
 * The deploy workflow derives it from the repository name (empty for <user>.github.io).
 * Locally it is unset, so `npm run dev` / `npm run build` work at the root.
 * next/image and metadata icons do NOT get basePath automatically — use withBasePath().
 */
const basePath = process.env.NEXT_PUBLIC_BASE_PATH?.replace(/\/$/, "") || undefined;

const nextConfig: NextConfig = {
  output: "export",
  basePath,
  // Emit /route/index.html so GitHub Pages resolves nested routes without a server.
  trailingSlash: true,
  images: { unoptimized: true },
};

export default nextConfig;
