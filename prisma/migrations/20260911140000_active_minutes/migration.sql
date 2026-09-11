-- Brisk minutes, as the phone reports them.
--
-- Additive and nullable. Every existing day keeps its meaning: with no active
-- minutes recorded, all of a day's above-baseline steps are credited at the
-- incidental walking rate, which is what a bare daily step total actually
-- describes. Reporting active minutes is how a day earns the brisk rate.

-- AlterTable
ALTER TABLE "DailyMetric" ADD COLUMN "activeMinutes" INTEGER;
