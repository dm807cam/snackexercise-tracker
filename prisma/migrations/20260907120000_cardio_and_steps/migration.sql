-- Cardio and daily steps.
--
-- Purely additive: every new column is nullable or defaulted, so an existing
-- database keeps working and every existing row keeps its current meaning
-- (cardioBias 0 = "this is resistance work", which is what everything in the
-- catalogue was until now). Backfilling the genuinely mixed movements is the
-- seed's job, not this migration's — the seed can be re-run, this cannot.

-- AlterTable
ALTER TABLE "Exercise" ADD COLUMN "cardioBias" REAL NOT NULL DEFAULT 0;
ALTER TABLE "Exercise" ADD COLUMN "mets" REAL;

-- AlterTable
ALTER TABLE "SetEntry" ADD COLUMN "distanceM" REAL;
ALTER TABLE "SetEntry" ADD COLUMN "avgHeartRate" INTEGER;

-- CreateTable
CREATE TABLE "DailyMetric" (
    "localDate" TEXT NOT NULL PRIMARY KEY,
    "steps" INTEGER,
    "source" TEXT NOT NULL DEFAULT 'manual',
    "updatedAt" DATETIME NOT NULL
);
