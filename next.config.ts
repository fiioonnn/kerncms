import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  output: "standalone",
  serverExternalPackages: ["sharp"],
  // The AI skill route reads these files at runtime.
  outputFileTracingIncludes: {
    "/kern-skill/[...path]": ["./skills/kerncms-astro/**/*", "./docs/kern-contract.md"],
    "/mcp": ["./skills/kerncms-astro/**/*", "./docs/kern-contract.md"],
  },
  // The overlay is loaded by every site's preview under a fixed name: always revalidate (cheap via ETag),
  // so a fix reaches open editors on the next reload instead of after the CDN/browser cache expires.
  async headers() {
    return [{ source: "/kern-overlay.js", headers: [{ key: "Cache-Control", value: "no-cache" }] }];
  },
  experimental: {
    serverActions: { bodySizeLimit: "4mb" },
  },
  turbopack: {
    rules: {
      "*.css": {
        loaders: ["@tailwindcss/turbopack"],
        as: "*.css",
      },
    },
  },
};

export default nextConfig;
