/** @type {import('next').NextConfig} */
import { dirname } from "node:path";
import { fileURLToPath } from "node:url";

// Use a custom distDir only for local development on machines where
// `.next` inside synced folders (OneDrive) causes instability.
const isCI = !!process.env.CI || !!process.env.VERCEL;
const repoRoot = dirname(fileURLToPath(new URL(".", import.meta.url)));

const SOCKET_PORT = process.env.SOCKET_SERVER_PORT || "4001";

const nextConfig = {
  ...(isCI ? {} : { distDir: ".local/next", outputFileTracingRoot: repoRoot }),
  eslint: {
    ignoreDuringBuilds: true,
  },
  typescript: {
    ignoreBuildErrors: true,
  },
  images: {
    unoptimized: true,
  },
  allowedDevOrigins: [
    "*.replit.dev",
    "*.repl.co",
    "*.janeway.replit.dev",
  ],
  // Proxy socket.io and multiplayer REST through Next.js so the browser
  // can reach the local socket server from Replit (or any proxied environment)
  async rewrites() {
    return [
      {
        source: "/socket.io/:path*",
        destination: `http://127.0.0.1:${SOCKET_PORT}/socket.io/:path*`,
      },
      {
        source: "/multiplayer/:path*",
        destination: `http://127.0.0.1:${SOCKET_PORT}/multiplayer/:path*`,
      },
    ];
  },
  webpack: (config, { dev }) => {
    if (dev) {
      config.watchOptions = {
        ...(config.watchOptions || {}),
        ignored: ["**/.local/**", "**/.next_broken_*/**"],
      };
    }
    return config;
  },
};

export default nextConfig;