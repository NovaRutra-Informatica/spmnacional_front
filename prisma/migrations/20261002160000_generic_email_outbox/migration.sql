CREATE TYPE "GenericEmailKind" AS ENUM ('USER_INVITE', 'NEWSLETTER_CONFIRMATION');
ALTER TABLE "User" ADD COLUMN "notificationVersion" INTEGER NOT NULL DEFAULT 0;
ALTER TABLE "User" ADD CONSTRAINT "User_notificationVersion_check" CHECK ("notificationVersion" >= 0);
CREATE TABLE "GenericEmailJob" (
    id TEXT PRIMARY KEY,
    kind "GenericEmailKind" NOT NULL,
    "userId" TEXT,
    "newsletterSubscriberId" TEXT,
    "versionHash" VARCHAR(64) NOT NULL,
    "payloadEncrypted" TEXT NOT NULL,
    "expiresAt" TIMESTAMP(3) NOT NULL,
    attempts INTEGER NOT NULL DEFAULT 0,
    "nextAttemptAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "leaseToken" TEXT,
    "leaseUntil" TIMESTAMP(3),
    "deadLetterAt" TIMESTAMP(3),
    "processedAt" TIMESTAMP(3),
    "failureCode" VARCHAR(40),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "GenericEmailJob_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"(id) ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "GenericEmailJob_newsletterSubscriberId_fkey" FOREIGN KEY ("newsletterSubscriberId") REFERENCES "NewsletterSubscriber"(id) ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "GenericEmailJob_source_check" CHECK (
        (kind = 'USER_INVITE' AND "userId" IS NOT NULL AND "newsletterSubscriberId" IS NULL)
        OR (kind = 'NEWSLETTER_CONFIRMATION' AND "userId" IS NULL AND "newsletterSubscriberId" IS NOT NULL)),
    CONSTRAINT "GenericEmailJob_attempts_check" CHECK (attempts >= 0),
    CONSTRAINT "GenericEmailJob_failureCode_check" CHECK ("failureCode" IS NULL OR "failureCode" IN ('SMTP_SEND_FAILED', 'PAYLOAD_INVALID')),
    CONSTRAINT "GenericEmailJob_versionHash_check" CHECK ("versionHash" ~ '^[a-f0-9]{64}$'),
    CONSTRAINT "GenericEmailJob_payload_check" CHECK (octet_length("payloadEncrypted") <= 16384 AND "payloadEncrypted" ~ '^v1\.[A-Za-z0-9_-]{16}\.[A-Za-z0-9_-]{22}\.[A-Za-z0-9_-]+$'),
    CONSTRAINT "GenericEmailJob_expiry_check" CHECK ("expiresAt" > "createdAt" AND "expiresAt" <= "createdAt" + INTERVAL '7 days 1 minute'
        AND (kind <> 'NEWSLETTER_CONFIRMATION' OR "expiresAt" <= "createdAt" + INTERVAL '24 hours 1 minute'))
);
CREATE UNIQUE INDEX "GenericEmailJob_kind_versionHash_key" ON "GenericEmailJob"(kind, "versionHash");
CREATE INDEX "GenericEmailJob_processedAt_deadLetterAt_nextAttemptAt_id_idx" ON "GenericEmailJob"("processedAt", "deadLetterAt", "nextAttemptAt", id);
CREATE INDEX "GenericEmailJob_expiresAt_idx" ON "GenericEmailJob"("expiresAt");
CREATE INDEX "GenericEmailJob_userId_idx" ON "GenericEmailJob"("userId");
CREATE INDEX "GenericEmailJob_newsletterSubscriberId_idx" ON "GenericEmailJob"("newsletterSubscriberId");
ALTER TABLE "GenericEmailJob" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "GenericEmailJob" FORCE ROW LEVEL SECURITY;
CREATE POLICY "GenericEmailJob_actor_insert" ON "GenericEmailJob" FOR INSERT WITH CHECK (
    current_setting('spm.scope', true) = 'actor' AND kind = 'USER_INVITE'
    AND attempts = 0 AND "leaseToken" IS NULL AND "leaseUntil" IS NULL
    AND "deadLetterAt" IS NULL AND "processedAt" IS NULL AND "failureCode" IS NULL
    AND EXISTS (SELECT 1 FROM "User" actor JOIN "Role" r ON r.id = actor."roleId"
        JOIN "RolePermission" p ON p."roleId" = r.id AND p."permissionKey" = 'usuarios'
        JOIN "User" target ON target.id = "GenericEmailJob"."userId"
        JOIN "Role" tr ON tr.id = target."roleId"
        WHERE actor.id = current_setting('spm.actor_id', true) AND actor.status = 'ATIVO'
        AND (r.key = 'admin' OR (actor."regionalId" IS NOT NULL AND actor."regionalId" = target."regionalId" AND tr.key <> 'admin')))
);
CREATE POLICY "GenericEmailJob_public_newsletter_insert" ON "GenericEmailJob" FOR INSERT WITH CHECK (
    current_setting('spm.scope', true) = 'public-newsletter' AND kind = 'NEWSLETTER_CONFIRMATION'
    AND "newsletterSubscriberId" = current_setting('spm.subscriber_id', true)
    AND "versionHash" = current_setting('spm.subscriber_token', true)
    AND attempts = 0 AND "leaseToken" IS NULL AND "leaseUntil" IS NULL
    AND "deadLetterAt" IS NULL AND "processedAt" IS NULL AND "failureCode" IS NULL
    AND EXISTS (SELECT 1 FROM "NewsletterSubscriber" s WHERE s.id = "GenericEmailJob"."newsletterSubscriberId"
        AND s."confirmTokenHash" = "GenericEmailJob"."versionHash" AND NOT s.confirmed AND s."unsubscribedAt" IS NULL)
);
-- These bounded reads are needed by INSERT RETURNING. Source mutations remain
-- restricted by the server facade and existing authorization contract.
CREATE POLICY "GenericEmailJob_actor_returning" ON "GenericEmailJob" FOR SELECT USING (
    current_setting('spm.scope', true) = 'actor' AND kind = 'USER_INVITE'
    AND EXISTS (SELECT 1 FROM "User" actor JOIN "Role" r ON r.id = actor."roleId"
        JOIN "RolePermission" p ON p."roleId" = r.id AND p."permissionKey" = 'usuarios'
        JOIN "User" target ON target.id = "GenericEmailJob"."userId"
        JOIN "Role" tr ON tr.id = target."roleId"
        WHERE actor.id = current_setting('spm.actor_id', true) AND actor.status = 'ATIVO'
        AND (r.key = 'admin' OR (actor."regionalId" IS NOT NULL AND actor."regionalId" = target."regionalId" AND tr.key <> 'admin')))
);
CREATE POLICY "GenericEmailJob_public_newsletter_returning" ON "GenericEmailJob" FOR SELECT USING (
    current_setting('spm.scope', true) = 'public-newsletter' AND kind = 'NEWSLETTER_CONFIRMATION'
    AND "newsletterSubscriberId" = current_setting('spm.subscriber_id', true)
    AND "versionHash" = current_setting('spm.subscriber_token', true)
);
CREATE POLICY "GenericEmailJob_worker" ON "GenericEmailJob" FOR ALL
USING (current_setting('spm.scope', true) = 'generic-mail') WITH CHECK (current_setting('spm.scope', true) = 'generic-mail');
CREATE POLICY "GenericEmailJob_retention_select" ON "GenericEmailJob" FOR SELECT
USING (current_setting('spm.scope', true) = 'retention' AND "expiresAt" <= CURRENT_TIMESTAMP);
CREATE POLICY "GenericEmailJob_retention_delete" ON "GenericEmailJob" FOR DELETE
USING (current_setting('spm.scope', true) = 'retention' AND "expiresAt" <= CURRENT_TIMESTAMP);
