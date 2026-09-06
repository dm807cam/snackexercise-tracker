import path from "node:path";
import { defineConfig } from "prisma/config";

// Runtime connections are made in lib/db.ts via the better-sqlite3 driver
// adapter; this file only tells the Prisma CLI where the schema and database
// are for `migrate` and `db seed`.
export default defineConfig({
  schema: path.join("prisma", "schema.prisma"),
  datasource: { url: process.env.DATABASE_URL ?? "file:./dev.db" },
  migrations: { seed: "tsx prisma/seed.ts" },
});
