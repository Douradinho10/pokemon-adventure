/** @type {import('next').NextConfig} */
const nextConfig = {
  distDir: ".local/next",
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
