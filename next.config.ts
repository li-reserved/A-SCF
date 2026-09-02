import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  reactStrictMode: true,
  distDir: process.env.NEXT_DIST_DIR || ".next",
  outputFileTracingRoot: process.cwd(),
  async redirects() {
    return [
      { source: "/index.html", destination: "/", permanent: true },
      { source: "/segment-leaders.html", destination: "/leaders", permanent: true },
      { source: "/security-analysis.html", destination: "/security", permanent: true },
    ];
  },
};

export default nextConfig;
