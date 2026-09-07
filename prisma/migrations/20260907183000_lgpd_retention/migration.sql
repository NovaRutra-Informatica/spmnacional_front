-- Retenção LGPD: os marcadores são opcionais e sem valor padrão para que a
-- alteração de tabela não reescreva registros existentes. A rotina preenche
-- esses campos somente depois de concluir a anonimização.
ALTER TABLE "AuditLog"
    ADD COLUMN IF NOT EXISTS "anonymizedAt" TIMESTAMP(3);

ALTER TABLE "Atendimento"
    ADD COLUMN IF NOT EXISTS "anonymizedAt" TIMESTAMP(3);

ALTER TABLE "ContactMessage"
    ADD COLUMN IF NOT EXISTS "encryptedAt" TIMESTAMP(3);

-- Índices usados pelos lotes. Mantemos os índices simples já existentes para
-- não alterar planos de consulta de outras telas durante a implantação.
CREATE INDEX IF NOT EXISTS "User_inviteExpiresAt_idx"
    ON "User"("inviteExpiresAt");

CREATE INDEX IF NOT EXISTS "User_resetExpiresAt_idx"
    ON "User"("resetExpiresAt");

CREATE INDEX IF NOT EXISTS "Session_revokedAt_idx"
    ON "Session"("revokedAt");

CREATE INDEX IF NOT EXISTS "LoginAttempt_createdAt_idx"
    ON "LoginAttempt"("createdAt");

CREATE INDEX IF NOT EXISTS "AuditLog_createdAt_anonymizedAt_idx"
    ON "AuditLog"("createdAt", "anonymizedAt");

CREATE INDEX IF NOT EXISTS "ContactMessage_updatedAt_idx"
    ON "ContactMessage"("updatedAt");

CREATE INDEX IF NOT EXISTS "ContactMessage_encryptedAt_idx"
    ON "ContactMessage"("encryptedAt");

CREATE INDEX IF NOT EXISTS "NewsletterSubscriber_createdAt_idx"
    ON "NewsletterSubscriber"("createdAt");

CREATE INDEX IF NOT EXISTS "NewsletterSubscriber_confirmExpiresAt_idx"
    ON "NewsletterSubscriber"("confirmExpiresAt");

CREATE INDEX IF NOT EXISTS "NewsletterSubscriber_unsubscribedAt_idx"
    ON "NewsletterSubscriber"("unsubscribedAt");

CREATE INDEX IF NOT EXISTS "Atendimento_retencaoAte_anonymizedAt_idx"
    ON "Atendimento"("retencaoAte", "anonymizedAt");

CREATE INDEX IF NOT EXISTS "Atendimento_updatedAt_anonymizedAt_idx"
    ON "Atendimento"("updatedAt", "anonymizedAt");
