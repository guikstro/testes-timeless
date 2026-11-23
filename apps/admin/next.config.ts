import path from "node:path";
import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  reactStrictMode: true,
  // Monorepo: a raiz do rastreamento de arquivos é a pasta do pnpm-workspace.
  outputFileTracingRoot: path.join(__dirname, "../.."),
};

export default nextConfig;
