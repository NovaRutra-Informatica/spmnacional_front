CREATE TABLE "MediaDeletion" (
    "id" TEXT NOT NULL,
    "storageKey" TEXT NOT NULL,
    "attempts" INTEGER NOT NULL DEFAULT 0,
    "nextAttemptAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "leaseToken" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "MediaDeletion_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "MediaDeletion_storageKey_key" ON "MediaDeletion"("storageKey");
CREATE INDEX "MediaDeletion_nextAttemptAt_idx" ON "MediaDeletion"("nextAttemptAt");
