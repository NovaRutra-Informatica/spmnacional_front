ALTER TABLE "Session" ADD COLUMN "authMethod" TEXT NOT NULL DEFAULT 'LEGACY',
    ADD COLUMN "googleSub" TEXT,
    ADD COLUMN "workspaceDomain" TEXT;

-- No previous session proves it was established under the Workspace-only policy.
UPDATE "Session" SET "revokedAt" = CURRENT_TIMESTAMP WHERE "revokedAt" IS NULL;
