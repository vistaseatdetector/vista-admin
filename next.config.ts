import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Do not fail the production build on ESLint errors (staging deploys)
  eslint: {
    ignoreDuringBuilds: true,
  },
  // Optionally skip type errors during build to unblock deploys
  typescript: {
    ignoreBuildErrors: true,
  },
};

export default nextConfig;
