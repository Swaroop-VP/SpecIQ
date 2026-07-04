import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  output: 'export',
  // Disable image optimization because GitHub Pages doesn't support it
  images: { unoptimized: true },
  webpack: (config) => {
    config.resolve.fallback = { fs: false, path: false, crypto: false };
    config.resolve.alias = {
        ...config.resolve.alias,
        "onnxruntime-node$": false,
    };
    return config;
  }
};

export default nextConfig;
