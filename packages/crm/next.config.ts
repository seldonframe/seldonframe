import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  reactCompiler: true,
  allowedDevOrigins: ["localhost", "127.0.0.1", "127.0.0.1:54345"],
  experimental: {
    serverActions: {
      allowedOrigins: ["localhost", "127.0.0.1", "127.0.0.1:54345"],
    },
  },
};

export default nextConfig;
