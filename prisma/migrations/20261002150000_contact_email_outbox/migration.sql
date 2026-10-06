CREATE TYPE "ContactEmailKind" AS ENUM ('NOTIFICATION', 'ACKNOWLEDGEMENT');
CREATE TABLE "ContactEmailJob" (
    id TEXT PRIMARY KEY,
    "contactMessageId" TEXT NOT NULL,
    kind "ContactEmailKind" NOT NULL,
    attempts INTEGER NOT NULL DEFAULT 0,
    "nextAttemptAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "leaseToken" TEXT,
    "leaseUntil" TIMESTAMP(3),
    "deadLetterAt" TIMESTAMP(3),
    "processedAt" TIMESTAMP(3),
    "failureCode" VARCHAR(40),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "ContactEmailJob_contactMessageId_fkey" FOREIGN KEY ("contactMessageId") REFERENCES "ContactMessage"(id) ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "ContactEmailJob_failureCode_check" CHECK ("failureCode" IS NULL OR "failureCode" IN ('SMTP_SEND_FAILED', 'MESSAGE_MISSING')),
    CONSTRAINT "ContactEmailJob_attempts_check" CHECK (attempts >= 0)
);
CREATE UNIQUE INDEX "ContactEmailJob_contactMessageId_kind_key" ON "ContactEmailJob"("contactMessageId", kind);
CREATE INDEX "ContactEmailJob_processedAt_deadLetterAt_nextAttemptAt_id_idx"
    ON "ContactEmailJob"("processedAt", "deadLetterAt", "nextAttemptAt", id);
ALTER TABLE "ContactEmailJob" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "ContactEmailJob" FORCE ROW LEVEL SECURITY;
CREATE POLICY "ContactEmailJob_public_insert" ON "ContactEmailJob" FOR INSERT
WITH CHECK (current_setting('spm.scope', true) = 'public-contact'
    AND "contactMessageId" = current_setting('spm.contact_id', true)
    AND attempts = 0 AND "leaseToken" IS NULL AND "leaseUntil" IS NULL
    AND "deadLetterAt" IS NULL AND "processedAt" IS NULL AND "failureCode" IS NULL
    AND EXISTS (SELECT 1 FROM "ContactMessage" c WHERE c.id = "contactMessageId"));
CREATE POLICY "ContactEmailJob_mail_worker" ON "ContactEmailJob" FOR ALL
USING (current_setting('spm.scope', true) = 'contact-mail')
WITH CHECK (current_setting('spm.scope', true) = 'contact-mail');
CREATE POLICY "ContactMessage_mail_worker" ON "ContactMessage" FOR SELECT
USING (current_setting('spm.scope', true) = 'contact-mail' AND EXISTS (
    SELECT 1 FROM "ContactEmailJob" j WHERE j."contactMessageId" = "ContactMessage".id
));
