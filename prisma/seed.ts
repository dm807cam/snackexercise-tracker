/**
 * Idempotent seed. Runs on every container start; only fills in what is missing,
 * so it is safe against an existing database and never clobbers your edits to
 * the catalogue.
 */

import { PrismaBetterSqlite3 } from "@prisma/adapter-better-sqlite3";
import { PrismaClient } from "../generated/prisma/client";
import { EXERCISE_CATALOGUE } from "./exercise-catalogue";
import { slugify } from "../lib/slug";

const adapter = new PrismaBetterSqlite3({
  url: process.env.DATABASE_URL ?? "file:./dev.db",
});
const prisma = new PrismaClient({ adapter });

async function main() {
  let created = 0;

  for (const item of EXERCISE_CATALOGUE) {
    const slug = slugify(item.name);
    const existing = await prisma.exercise.findUnique({ where: { slug } });
    if (existing) continue;

    await prisma.exercise.create({
      data: {
        name: item.name,
        slug,
        category: item.category,
        bodyweight: item.bodyweight ?? false,
        isCustom: false,
        muscles: {
          create: Object.entries(item.muscles).map(([muscle, weight]) => ({
            muscle,
            weight: weight as number,
          })),
        },
      },
    });
    created += 1;
  }

  // The API key may be supplied by environment on first run; after that the
  // value stored in Settings wins, so this never overwrites what you typed.
  const envKey = process.env.OPENROUTER_API_KEY;
  if (envKey) {
    const existing = await prisma.setting.findUnique({ where: { key: "openrouterKey" } });
    if (!existing) {
      await prisma.setting.create({ data: { key: "openrouterKey", value: envKey } });
    }
  }

  console.log(
    `Seed complete: ${created} exercise(s) added, ${EXERCISE_CATALOGUE.length - created} already present.`,
  );
}

main()
  .catch((err) => {
    console.error(err);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
