import type { NextConfig } from "next";
import { withSentryConfig } from "@sentry/nextjs";

const nextConfig: NextConfig = {
  images: {
    remotePatterns: [
      {
        protocol: "https",
        hostname: "lh3.googleusercontent.com",
      },
    ],
  },
  experimental: {
    staleTimes: {
      dynamic: 60, // cache RSC payload 60s — tránh reload khi chuyển trang trong sidebar
    },
  },
};

export default withSentryConfig(nextConfig, {
  // Sentry organization + project (set these after creating project at sentry.io)
  org: process.env.SENTRY_ORG,
  project: process.env.SENTRY_PROJECT,

  // Suppress Sentry CLI output during build
  silent: !process.env.CI,

  // Upload source maps to Sentry for readable stack traces in production.
  // Requires SENTRY_AUTH_TOKEN env var in Vercel settings.
  widenClientFileUpload: true,
  sourcemaps: { deleteSourcemapsAfterUpload: true },

  // Disable Sentry logger to keep build output clean
  disableLogger: true,

  // Auto-instrument Next.js server components and API routes
  autoInstrumentServerFunctions: true,
});
