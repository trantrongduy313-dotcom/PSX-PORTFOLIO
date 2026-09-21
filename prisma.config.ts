import { defineConfig } from "prisma/config";

// Load .env locally — Vercel already injects env vars at build time
if (process.env.NODE_ENV !== "production") {
  await import("dotenv/config").catch(() => {});
}

export default defineConfig({
  schema: "prisma/schema.prisma",
  migrations: {
    path: "prisma/migrations",
    seed: "tsx prisma/seed.ts",
  },
  datasource: {
    url: process.env.DATABASE_URL ?? "",
    // directUrl bypasses PgBouncer for migrations (prisma db push / migrate).
    // Set DIRECT_URL to your Supabase "Direct connection" URL (port 5432).
    // https://supabase.com/docs/guides/database/connecting-to-postgres#direct-connections
    ...(process.env.DIRECT_URL ? { directUrl: process.env.DIRECT_URL } : {}),
  },
});
