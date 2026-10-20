import type { NextConfig } from 'next';

const nextConfig: NextConfig = {
  serverExternalPackages: ['chokidar', 'mailparser', 'mammoth', 'unpdf'],
};

export default nextConfig;
