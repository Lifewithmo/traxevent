import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  experimental: {
    serverActions: {
      // Phone photos exceed the 1MB server-action default (ops evidence uploads).
      bodySizeLimit: '10mb',
    },
  },
};

export default nextConfig;
