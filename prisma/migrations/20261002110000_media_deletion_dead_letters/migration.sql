-- Existing transactional storage outbox: bound retries and retain poison jobs.
ALTER TABLE "MediaDeletion"
    ADD COLUMN "deadLetterAt" TIMESTAMP(3),
    ADD COLUMN "failureCode" VARCHAR(40);
ALTER TABLE "MediaDeletion" ADD CONSTRAINT "MediaDeletion_failureCode_check"
    CHECK ("failureCode" IS NULL OR "failureCode" IN
        ('STORAGE_DELETE_FAILED', 'OBJECT_REFERENCED', 'LEASE_ATTEMPTS_EXHAUSTED'));
CREATE INDEX "MediaDeletion_deadLetterAt_nextAttemptAt_id_idx"
    ON "MediaDeletion"("deadLetterAt", "nextAttemptAt", "id");
