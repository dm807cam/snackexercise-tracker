/**
 * Idempotent seed. Runs on every container start; only fills in what is missing,
 * so it is safe against an existing database and never clobbers your edits to
 * the catalogue.
 *
 * Four jobs, in order:
 *   1. Add any catalogue movement that is not there yet.
 *   2. Describe catalogue movements that have no snack profile yet — the ones
 *      that predate the snack planner. A profile an admin has since edited is
 *      left alone, because "no profile yet" is exactly `equipment IS NULL`.
 *   3. Backfill cardio weightings on movements that predate cardio.
 *   4. Carry environment settings into the database: a shared OpenRouter key,
 *      and — for an unattended first boot — the first admin account.
 */

import { prisma } from "../lib/db";
import { CARDIO_BIAS_BACKFILL, EXERCISE_CATALOGUE, type CatalogueEntry } from "./exercise-catalogue";
import { slugify } from "../lib/slug";

function profileColumns(item: CatalogueEntry) {
  const snack = item.snack;
  return {
    equipment: snack.equipment,
    load: snack.load ?? null,
    impact: snack.impact,
    floor: snack.floor,
    sweat: snack.sweat,
    snackReps: snack.reps ?? null,
    snackSeconds: snack.seconds ?? null,
    unilateral: snack.unilateral ?? false,
    cues: snack.cues?.join("\n") ?? null,
  };
}

async function seedCatalogue() {
  let created = 0;
  let described = 0;

  for (const item of EXERCISE_CATALOGUE) {
    const slug = slugify(item.name);
    const existing = await prisma.exercise.findFirst({ where: { ownerId: null, slug } });

    if (!existing) {
      await prisma.exercise.create({
        data: {
          name: item.name,
          slug,
          category: item.category,
          bodyweight: item.bodyweight ?? false,
          cardioBias: item.cardioBias ?? 0,
          mets: item.mets ?? null,
          isCustom: false,
          ...profileColumns(item),
          muscles: {
            create: Object.entries(item.muscles).map(([muscle, weight]) => ({
              muscle,
              weight: weight as number,
            })),
          },
        },
      });
      created += 1;
      continue;
    }

    if (existing.equipment === null) {
      await prisma.exercise.update({ where: { id: existing.id }, data: profileColumns(item) });
      described += 1;
    }
  }

  // Movements that predate the cardio feature and are genuinely part aerobic.
  // Only applied to rows still at the untouched defaults (bias 0, no METs):
  // once this has run, `mets` is set, so a second pass leaves the row alone and
  // anything since adjusted in Settings survives.
  let backfilled = 0;
  for (const item of CARDIO_BIAS_BACKFILL) {
    const { count } = await prisma.exercise.updateMany({
      where: { ownerId: null, slug: slugify(item.name), cardioBias: 0, mets: null },
      data: { cardioBias: item.cardioBias, mets: item.mets },
    });
    backfilled += count;
  }

  console.log(
    `Seed: ${created} exercise(s) added, ${EXERCISE_CATALOGUE.length - created} already present` +
      `${described > 0 ? `, ${described} given a snack profile` : ""}` +
      `${backfilled > 0 ? `, ${backfilled} given a cardio weighting` : ""}.`,
  );
}

async function seedInstance() {
  // A key supplied by environment becomes the instance's SHARED key on first
  // run — shared because a container-level variable was never one person's.
  // After that the admin console owns it, so this never overwrites a choice.
  const envKey = process.env.OPENROUTER_API_KEY?.trim();
  if (envKey) {
    const existing = await prisma.instanceSetting.findUnique({ where: { key: "openrouterKey" } });
    if (!existing) {
      await prisma.instanceSetting.create({ data: { key: "openrouterKey", value: envKey } });
      console.log("Seed: shared OpenRouter key stored from OPENROUTER_API_KEY.");
    }
  }

  // Imported lazily: the account code pulls in the hashing and the planner's
  // presets, which the catalogue pass above does not need.
  const { config } = await import("../lib/config");
  const admin = config.bootstrapAdmin;
  if (!admin) return;

  const { AccountError, createFirstAdmin, needsSetup } = await import("../lib/auth/accounts");
  // Only ever on a first boot. Re-applying ADMIN_PASSWORD on every start would
  // silently undo a password changed in the app, and leave the credential
  // living in the compose file forever.
  if (!(await needsSetup(prisma))) return;

  try {
    const { user, claimedLegacy } = await createFirstAdmin(admin);
    console.log(
      `Seed: admin ${user.email} created from ADMIN_EMAIL` +
        `${claimedLegacy ? ", and given the log that predates accounts" : ""}.` +
        " Remove ADMIN_PASSWORD from the environment now; it is not read again.",
    );
  } catch (error) {
    if (error instanceof AccountError) {
      console.error(`Seed: could not create the admin from ADMIN_EMAIL — ${error.message}`);
      return;
    }
    throw error;
  }
}

async function main() {
  await seedCatalogue();
  await seedInstance();
}

main()
  .catch((err) => {
    console.error(err);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
