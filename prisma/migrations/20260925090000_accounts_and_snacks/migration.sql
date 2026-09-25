-- Accounts, and the snack planner's tables.
--
-- Until now the database held one person's log with nobody's name on it. This
-- migration gives every row an owner WITHOUT changing what any of it means:
--
--   * If the database already holds anything a person made — entries, days,
--     settings, or movements they added — one account is created to own it:
--     id 'legacy-owner', an admin with a placeholder address and NO password.
--     It cannot sign in. The first visit to /setup claims it by giving it a real
--     address and password, so whoever installed the app keeps their history.
--   * A fresh database gets no such account; /setup simply creates the first
--     admin.
--
-- Every existing entry, day and setting is assigned to that owner, and so is
-- every movement that was added by hand. The seeded catalogue stays unowned —
-- it is the one thing every account shares.
--
-- Everything else here is additive: new tables, and nullable snack-profile
-- columns on Exercise that the seed backfills for catalogue rows it has not
-- been told otherwise about. See docs/adr/0023-accounts-own-their-data.md.

-- CreateTable
CREATE TABLE "User" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "email" TEXT NOT NULL,
    "name" TEXT,
    "passwordHash" TEXT,
    "role" TEXT NOT NULL DEFAULT 'member',
    "disabledAt" DATETIME,
    "lastLoginAt" DATETIME,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL
);

-- The owner of everything logged before accounts existed, if anything was.
-- Timestamps are written the way Prisma writes them ("...T08:15:30.123+00:00"), so the
-- client reads this row exactly as it reads its own.
INSERT INTO "User" ("id", "email", "name", "passwordHash", "role", "createdAt", "updatedAt")
SELECT 'legacy-owner', 'owner@snack.invalid', NULL, NULL, 'admin',
       strftime('%Y-%m-%dT%H:%M:%f+00:00', 'now'), strftime('%Y-%m-%dT%H:%M:%f+00:00', 'now')
WHERE EXISTS (SELECT 1 FROM "SetEntry")
   OR EXISTS (SELECT 1 FROM "DailyMetric")
   OR EXISTS (SELECT 1 FROM "Setting")
   OR EXISTS (SELECT 1 FROM "Exercise" WHERE "isCustom" = 1);

-- CreateTable
CREATE TABLE "Session" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "userId" TEXT NOT NULL,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "expiresAt" DATETIME NOT NULL,
    "lastSeenAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "userAgent" TEXT,
    "ip" TEXT,
    CONSTRAINT "Session_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "ApiToken" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "userId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "tokenHash" TEXT NOT NULL,
    "prefix" TEXT NOT NULL,
    "scopes" TEXT NOT NULL,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "lastUsedAt" DATETIME,
    "expiresAt" DATETIME,
    "revokedAt" DATETIME,
    CONSTRAINT "ApiToken_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "AuthLink" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "purpose" TEXT NOT NULL,
    "tokenHash" TEXT NOT NULL,
    "email" TEXT,
    "userId" TEXT,
    "role" TEXT NOT NULL DEFAULT 'member',
    "createdById" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "expiresAt" DATETIME NOT NULL,
    "usedAt" DATETIME,
    CONSTRAINT "AuthLink_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "AuditEvent" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "at" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "actorId" TEXT,
    "targetId" TEXT,
    "action" TEXT NOT NULL,
    "ip" TEXT,
    "userAgent" TEXT,
    "detail" TEXT
);

-- CreateTable
CREATE TABLE "InstanceSetting" (
    "key" TEXT NOT NULL PRIMARY KEY,
    "value" TEXT NOT NULL
);

-- CreateTable
CREATE TABLE "RateLimit" (
    "key" TEXT NOT NULL PRIMARY KEY,
    "count" INTEGER NOT NULL,
    "resetAt" DATETIME NOT NULL
);

-- CreateTable
CREATE TABLE "JobLease" (
    "name" TEXT NOT NULL PRIMARY KEY,
    "holder" TEXT NOT NULL,
    "expiresAt" DATETIME NOT NULL
);

-- CreateTable
CREATE TABLE "TrainingContext" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "userId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "kind" TEXT NOT NULL,
    "equipment" TEXT NOT NULL DEFAULT '',
    "quiet" BOOLEAN NOT NULL DEFAULT false,
    "floor" BOOLEAN NOT NULL DEFAULT true,
    "sweat" INTEGER NOT NULL DEFAULT 2,
    "sortOrder" INTEGER NOT NULL DEFAULT 0,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "TrainingContext_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "Snack" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "userId" TEXT NOT NULL,
    "localDate" TEXT NOT NULL,
    "contextId" TEXT,
    "trigger" TEXT NOT NULL DEFAULT 'now',
    "status" TEXT NOT NULL DEFAULT 'proposed',
    "minutes" INTEGER NOT NULL,
    "plan" TEXT NOT NULL,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "startedAt" DATETIME,
    "finishedAt" DATETIME,
    CONSTRAINT "Snack_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "Snack_contextId_fkey" FOREIGN KEY ("contextId") REFERENCES "TrainingContext" ("id") ON DELETE SET NULL ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "ExercisePreference" (
    "userId" TEXT NOT NULL,
    "exerciseId" TEXT NOT NULL,
    "done" INTEGER NOT NULL DEFAULT 0,
    "skipped" INTEGER NOT NULL DEFAULT 0,
    "swapped" INTEGER NOT NULL DEFAULT 0,
    "blocked" BOOLEAN NOT NULL DEFAULT false,
    "updatedAt" DATETIME NOT NULL,

    PRIMARY KEY ("userId", "exerciseId"),
    CONSTRAINT "ExercisePreference_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "ExercisePreference_exerciseId_fkey" FOREIGN KEY ("exerciseId") REFERENCES "Exercise" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "PushSubscription" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "userId" TEXT NOT NULL,
    "endpoint" TEXT NOT NULL,
    "p256dh" TEXT NOT NULL,
    "auth" TEXT NOT NULL,
    "userAgent" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "lastSuccessAt" DATETIME,
    "failures" INTEGER NOT NULL DEFAULT 0,
    CONSTRAINT "PushSubscription_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "Nudge" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "userId" TEXT NOT NULL,
    "localDate" TEXT NOT NULL,
    "slot" INTEGER NOT NULL,
    "attempt" INTEGER NOT NULL DEFAULT 0,
    "sentAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "delivered" INTEGER NOT NULL DEFAULT 0,
    "snackId" TEXT,
    CONSTRAINT "Nudge_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "Nudge_snackId_fkey" FOREIGN KEY ("snackId") REFERENCES "Snack" ("id") ON DELETE SET NULL ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "BusyBlock" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "userId" TEXT NOT NULL,
    "days" INTEGER NOT NULL,
    "startMin" INTEGER NOT NULL,
    "endMin" INTEGER NOT NULL,
    "label" TEXT,
    CONSTRAINT "BusyBlock_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- RedefineTables
PRAGMA defer_foreign_keys=ON;
PRAGMA foreign_keys=OFF;
CREATE TABLE "new_DailyMetric" (
    "userId" TEXT NOT NULL,
    "localDate" TEXT NOT NULL,
    "steps" INTEGER,
    "activeMinutes" INTEGER,
    "source" TEXT NOT NULL DEFAULT 'manual',
    "updatedAt" DATETIME NOT NULL,

    PRIMARY KEY ("userId", "localDate"),
    CONSTRAINT "DailyMetric_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);
INSERT INTO "new_DailyMetric" ("userId", "activeMinutes", "localDate", "source", "steps", "updatedAt") SELECT 'legacy-owner', "activeMinutes", "localDate", "source", "steps", "updatedAt" FROM "DailyMetric";
DROP TABLE "DailyMetric";
ALTER TABLE "new_DailyMetric" RENAME TO "DailyMetric";
CREATE TABLE "new_Exercise" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "ownerId" TEXT,
    "name" TEXT NOT NULL,
    "slug" TEXT NOT NULL,
    "category" TEXT NOT NULL DEFAULT 'other',
    "bodyweight" BOOLEAN NOT NULL DEFAULT false,
    "isCustom" BOOLEAN NOT NULL DEFAULT false,
    "archived" BOOLEAN NOT NULL DEFAULT false,
    "cardioBias" REAL NOT NULL DEFAULT 0,
    "mets" REAL,
    "equipment" TEXT,
    "load" TEXT,
    "impact" INTEGER,
    "floor" BOOLEAN,
    "sweat" INTEGER,
    "snackReps" TEXT,
    "snackSeconds" INTEGER,
    "unilateral" BOOLEAN,
    "cues" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "Exercise_ownerId_fkey" FOREIGN KEY ("ownerId") REFERENCES "User" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);
-- A movement somebody added by hand was that person's; the seeded catalogue is
-- everybody's.
INSERT INTO "new_Exercise" ("ownerId", "archived", "bodyweight", "cardioBias", "category", "createdAt", "id", "isCustom", "mets", "name", "slug") SELECT CASE WHEN "isCustom" = 1 THEN 'legacy-owner' ELSE NULL END, "archived", "bodyweight", "cardioBias", "category", "createdAt", "id", "isCustom", "mets", "name", "slug" FROM "Exercise";
DROP TABLE "Exercise";
ALTER TABLE "new_Exercise" RENAME TO "Exercise";
CREATE INDEX "Exercise_ownerId_idx" ON "Exercise"("ownerId");
CREATE UNIQUE INDEX "Exercise_ownerId_slug_key" ON "Exercise"("ownerId", "slug");
CREATE UNIQUE INDEX "Exercise_ownerId_name_key" ON "Exercise"("ownerId", "name");
CREATE UNIQUE INDEX "Exercise_catalogue_slug_key" ON "Exercise"("slug") WHERE "ownerId" IS NULL;
CREATE UNIQUE INDEX "Exercise_catalogue_name_key" ON "Exercise"("name") WHERE "ownerId" IS NULL;
CREATE TABLE "new_SetEntry" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "userId" TEXT NOT NULL,
    "performedAt" DATETIME NOT NULL,
    "localDate" TEXT NOT NULL,
    "exerciseId" TEXT NOT NULL,
    "sets" INTEGER NOT NULL DEFAULT 1,
    "reps" INTEGER,
    "weightKg" REAL,
    "durationSec" INTEGER,
    "distanceM" REAL,
    "avgHeartRate" INTEGER,
    "effort" TEXT,
    "notes" TEXT,
    "source" TEXT NOT NULL DEFAULT 'manual',
    "snackId" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "SetEntry_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "SetEntry_exerciseId_fkey" FOREIGN KEY ("exerciseId") REFERENCES "Exercise" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "SetEntry_snackId_fkey" FOREIGN KEY ("snackId") REFERENCES "Snack" ("id") ON DELETE SET NULL ON UPDATE CASCADE
);
INSERT INTO "new_SetEntry" ("userId", "avgHeartRate", "createdAt", "distanceM", "durationSec", "effort", "exerciseId", "id", "localDate", "notes", "performedAt", "reps", "sets", "source", "weightKg") SELECT 'legacy-owner', "avgHeartRate", "createdAt", "distanceM", "durationSec", "effort", "exerciseId", "id", "localDate", "notes", "performedAt", "reps", "sets", "source", "weightKg" FROM "SetEntry";
DROP TABLE "SetEntry";
ALTER TABLE "new_SetEntry" RENAME TO "SetEntry";
CREATE INDEX "SetEntry_userId_localDate_idx" ON "SetEntry"("userId", "localDate");
CREATE INDEX "SetEntry_userId_performedAt_idx" ON "SetEntry"("userId", "performedAt");
CREATE INDEX "SetEntry_userId_exerciseId_idx" ON "SetEntry"("userId", "exerciseId");
CREATE INDEX "SetEntry_exerciseId_idx" ON "SetEntry"("exerciseId");
CREATE INDEX "SetEntry_snackId_idx" ON "SetEntry"("snackId");
CREATE TABLE "new_Setting" (
    "userId" TEXT NOT NULL,
    "key" TEXT NOT NULL,
    "value" TEXT NOT NULL,

    PRIMARY KEY ("userId", "key"),
    CONSTRAINT "Setting_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);
-- Including an OpenRouter key, which stays its owner's: making it everybody's
-- would spend one person's credit on another's dictation without asking.
INSERT INTO "new_Setting" ("userId", "key", "value") SELECT 'legacy-owner', "key", "value" FROM "Setting";
DROP TABLE "Setting";
ALTER TABLE "new_Setting" RENAME TO "Setting";
PRAGMA foreign_keys=ON;
PRAGMA defer_foreign_keys=OFF;

-- CreateIndex
CREATE UNIQUE INDEX "User_email_key" ON "User"("email");

-- CreateIndex
CREATE INDEX "Session_userId_idx" ON "Session"("userId");

-- CreateIndex
CREATE INDEX "Session_expiresAt_idx" ON "Session"("expiresAt");

-- CreateIndex
CREATE UNIQUE INDEX "ApiToken_tokenHash_key" ON "ApiToken"("tokenHash");

-- CreateIndex
CREATE INDEX "ApiToken_userId_idx" ON "ApiToken"("userId");

-- CreateIndex
CREATE UNIQUE INDEX "AuthLink_tokenHash_key" ON "AuthLink"("tokenHash");

-- CreateIndex
CREATE INDEX "AuthLink_expiresAt_idx" ON "AuthLink"("expiresAt");

-- CreateIndex
CREATE INDEX "AuditEvent_at_idx" ON "AuditEvent"("at");

-- CreateIndex
CREATE INDEX "AuditEvent_actorId_at_idx" ON "AuditEvent"("actorId", "at");

-- CreateIndex
CREATE INDEX "AuditEvent_targetId_at_idx" ON "AuditEvent"("targetId", "at");

-- CreateIndex
CREATE INDEX "RateLimit_resetAt_idx" ON "RateLimit"("resetAt");

-- CreateIndex
CREATE INDEX "TrainingContext_userId_idx" ON "TrainingContext"("userId");

-- CreateIndex
CREATE UNIQUE INDEX "TrainingContext_userId_name_key" ON "TrainingContext"("userId", "name");

-- CreateIndex
CREATE INDEX "Snack_userId_localDate_idx" ON "Snack"("userId", "localDate");

-- CreateIndex
CREATE INDEX "Snack_userId_status_idx" ON "Snack"("userId", "status");

-- CreateIndex
CREATE UNIQUE INDEX "PushSubscription_endpoint_key" ON "PushSubscription"("endpoint");

-- CreateIndex
CREATE INDEX "PushSubscription_userId_idx" ON "PushSubscription"("userId");

-- CreateIndex
CREATE UNIQUE INDEX "Nudge_snackId_key" ON "Nudge"("snackId");

-- CreateIndex
CREATE INDEX "Nudge_sentAt_idx" ON "Nudge"("sentAt");

-- CreateIndex
CREATE UNIQUE INDEX "Nudge_userId_localDate_slot_attempt_key" ON "Nudge"("userId", "localDate", "slot", "attempt");

-- CreateIndex
CREATE INDEX "BusyBlock_userId_idx" ON "BusyBlock"("userId");

