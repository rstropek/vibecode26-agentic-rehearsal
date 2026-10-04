import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // The e2e dev server builds into its own folder so it can run next to `npm run dev`.
  distDir: process.env.NEXT_DIST_DIR || ".next",
  // Picks its OTLP exporter package with a computed import(), which a bundle cannot resolve, so Node loads it.
  serverExternalPackages: ["@mastra/otel-exporter"],
};

export default nextConfig;
