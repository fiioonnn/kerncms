import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  output: "standalone",
  serverExternalPackages: ["sharp"],
  // The AI skill route reads these files at runtime.
  outputFileTracingIncludes: {
    "/kern-skill/[...path]": ["./skills/kerncms-astro/**/*", "./docs/kern-contract.md"],
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
