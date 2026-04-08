import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  distDir: process.env.NEXT_DIST_DIR || ".next-dev",
  reactStrictMode: true,
  transpilePackages: ["@veil/shared"],
};

export default nextConfig;
