import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  output: "standalone",
  serverExternalPackages: ["pdf-parse", "mammoth"],
  typescript: {
    ignoreBuildErrors: true,
  },
};

export default nextConfig;
