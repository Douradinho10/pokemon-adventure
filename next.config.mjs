/** @type {import('next').NextConfig} */
import { dirname } from "node:path"
import { fileURLToPath } from "node:url"

// Use a custom distDir only for local development on machines where
// `.next` inside synced folders (OneDrive) causes instability.
const isCI = !!process.env.CI || !!process.env.VERCEL
const repoRoot = dirname(fileURLToPath(new URL(".", import.meta.url)))
const nextConfig = {
  ...(isCI ? {} : { distDir: ".local/next" }),
  outputFileTracingRoot: repoRoot,
  eslint: {
    ignoreDuringBuilds: true,
  },
  typescript: {
    ignoreBuildErrors: true,
  },
  images: {
    unoptimized: true,
  },
  allowedDevOrigins: ["*"],
  webpack: (config, { dev }) => {
    if (dev) {
      config.watchOptions = {
        ...(config.watchOptions || {}),
        ignored: ["**/.local/**", "**/.next_broken_*/**"],
      }
    }

    return config
  },
}

export default nextConfig
