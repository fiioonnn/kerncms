import type { NextConfig } from "next";
import { readFileSync } from "fs";

const appVersion = JSON.parse(readFileSync("./package.json", "utf-8")).version;

const nextConfig: NextConfig = {
  env: {
    NEXT_PUBLIC_APP_VERSION: appVersion,
  },
  output: 'standalone',
  serverExternalPackages: ['geoip-lite'],
  experimental: {
    proxyClientMaxBodySize: '50mb',
  },
};

export default nextConfig;
