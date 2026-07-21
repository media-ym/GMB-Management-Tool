import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  output: "standalone",
  // Allow ngrok / tunnel URLs to load dev assets (/_next/*) in development
  allowedDevOrigins: [
    "*.ngrok-free.app",
    "*.ngrok-free.dev",
    "*.ngrok.io",
    "*.ngrok.app",
  ],
  // Next.js 16 no longer accepts the `eslint` key in next.config — `bun run lint`
  // is the canonical linter (see package.json). TypeScript build errors are
  // fixed at source rather than suppressed.
  reactStrictMode: false,
  // Allow images from Google and placeholder services
  images: {
    remotePatterns: [
      { protocol: "https", hostname: "placehold.co" },
      { protocol: "https", hostname: "lh3.googleusercontent.com" },
      { protocol: "https", hostname: "maps.googleapis.com" },
      { protocol: "https", hostname: "myfng.in" },
    ],
  },
  // Production headers for security
  async headers() {
    return [
      {
        source: "/(.*)",
        headers: [
          { key: "X-Frame-Options", value: "SAMEORIGIN" },
          { key: "X-Content-Type-Options", value: "nosniff" },
          { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
        ],
      },
    ];
  },
};

export default nextConfig;
