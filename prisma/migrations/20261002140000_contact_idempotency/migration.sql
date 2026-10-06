CREATE TABLE "IdempotencyRequest" (
    "keyHash" VARCHAR(64) PRIMARY KEY,
    "payloadHash" VARCHAR(64) NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "expiresAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "IdempotencyRequest_hashes_check" CHECK (
        "keyHash" ~ '^[a-f0-9]{64}$' AND "payloadHash" ~ '^[a-f0-9]{64}$')
);
CREATE INDEX "IdempotencyRequest_expiresAt_idx" ON "IdempotencyRequest"("expiresAt");
ALTER TABLE "IdempotencyRequest" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "IdempotencyRequest" FORCE ROW LEVEL SECURITY;
CREATE POLICY "IdempotencyRequest_public_select" ON "IdempotencyRequest" FOR SELECT
USING (current_setting('spm.scope', true) = 'public-contact'
    AND "keyHash" = current_setting('spm.request_key', true));
CREATE POLICY "IdempotencyRequest_public_insert" ON "IdempotencyRequest" FOR INSERT
WITH CHECK (current_setting('spm.scope', true) = 'public-contact'
    AND "keyHash" = current_setting('spm.request_key', true)
    AND "payloadHash" = current_setting('spm.request_payload', true)
    AND "expiresAt" > CURRENT_TIMESTAMP
    AND "expiresAt" <= CURRENT_TIMESTAMP + INTERVAL '7 days 1 minute');
CREATE POLICY "IdempotencyRequest_retention_select" ON "IdempotencyRequest" FOR SELECT
USING (current_setting('spm.scope', true) = 'retention' AND "expiresAt" <= CURRENT_TIMESTAMP);
CREATE POLICY "IdempotencyRequest_retention_delete" ON "IdempotencyRequest" FOR DELETE
USING (current_setting('spm.scope', true) = 'retention' AND "expiresAt" <= CURRENT_TIMESTAMP);
