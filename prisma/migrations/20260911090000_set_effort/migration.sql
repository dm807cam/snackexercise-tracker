-- How close a set was to failure.
--
-- Additive and nullable, so an existing database keeps working and every row
-- already in it keeps its current meaning. Null is "the user did not say"
-- rather than a level of its own: lib/effort.ts counts an unlabelled set as a
-- hard one precisely so that adding this column does not restate a year of
-- history, and the stats page reports the labelled fraction so that assumption
-- is visible instead of silent.

-- AlterTable
ALTER TABLE "SetEntry" ADD COLUMN "effort" TEXT;
