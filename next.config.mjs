/** @type {import('next').NextConfig} */
<<<<<<< HEAD
import { dirname } from "node:path"
import { fileURLToPath } from "node:url"

// Use a custom distDir only for local development on machines where
// `.next` inside synced folders (OneDrive) causes instability.
const isCI = !!process.env.CI || !!process.env.VERCEL
const repoRoot = dirname(fileURLToPath(new URL(".", import.meta.url)))
const nextConfig = {
  ...(isCI ? {} : { distDir: ".local/next", outputFileTracingRoot: repoRoot }),
=======
const nextConfig = {
>>>>>>> 9883fc10e705824f59221faae96322d35263043c
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
