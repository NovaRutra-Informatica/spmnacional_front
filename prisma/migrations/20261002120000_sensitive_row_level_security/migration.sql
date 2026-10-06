-- Public editorial queries remain public. Sensitive PII tables require a
-- transaction-local server scope, with authorization rechecked in PostgreSQL.
-- A database sequence allocates unique reference numbers across regionals,
-- without exposing records outside the actor's RLS scope to count them.
CREATE SEQUENCE "Atendimento_codigo_seq";
SELECT setval('"Atendimento_codigo_seq"', COALESCE(MAX(split_part(codigo, '-', 3)::bigint), 0) + 1, false)
FROM "Atendimento" WHERE codigo ~ '^ATD-[0-9]{4}-[0-9]{1,18}$';
ALTER TABLE "Atendimento" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "Atendimento" FORCE ROW LEVEL SECURITY;
ALTER TABLE "AtendimentoEncaminhamento" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "AtendimentoEncaminhamento" FORCE ROW LEVEL SECURITY;
ALTER TABLE "ContactMessage" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "ContactMessage" FORCE ROW LEVEL SECURITY;

CREATE POLICY "Atendimento_actor" ON "Atendimento" FOR ALL
USING (
    current_setting('spm.scope', true) = 'actor' AND EXISTS (
        SELECT 1 FROM "User" u JOIN "Role" r ON r.id = u."roleId"
        JOIN "RolePermission" p ON p."roleId" = r.id AND p."permissionKey" = 'atendimentos'
        WHERE u.id = current_setting('spm.actor_id', true) AND u.status = 'ATIVO'
          AND (r.key = 'admin' OR u."regionalId" = "Atendimento"."regionalId")
    )
)
WITH CHECK (
    current_setting('spm.scope', true) = 'actor' AND EXISTS (
        SELECT 1 FROM "User" u JOIN "Role" r ON r.id = u."roleId"
        JOIN "RolePermission" p ON p."roleId" = r.id AND p."permissionKey" = 'atendimentos'
        WHERE u.id = current_setting('spm.actor_id', true) AND u.status = 'ATIVO'
          AND (r.key = 'admin' OR u."regionalId" = "Atendimento"."regionalId")
    )
);
CREATE POLICY "Atendimento_retention" ON "Atendimento" FOR ALL
USING (current_setting('spm.scope', true) = 'retention')
WITH CHECK (current_setting('spm.scope', true) = 'retention');

CREATE POLICY "Encaminhamento_actor" ON "AtendimentoEncaminhamento" FOR ALL
USING (current_setting('spm.scope', true) = 'actor' AND EXISTS (
    SELECT 1 FROM "Atendimento" a WHERE a.id = "AtendimentoEncaminhamento"."atendimentoId"
))
WITH CHECK (current_setting('spm.scope', true) = 'actor' AND EXISTS (
    SELECT 1 FROM "Atendimento" a WHERE a.id = "AtendimentoEncaminhamento"."atendimentoId"
));
CREATE POLICY "Encaminhamento_retention" ON "AtendimentoEncaminhamento" FOR ALL
USING (current_setting('spm.scope', true) = 'retention')
WITH CHECK (current_setting('spm.scope', true) = 'retention');

CREATE POLICY "ContactMessage_actor" ON "ContactMessage" FOR ALL
USING (
    current_setting('spm.scope', true) = 'actor' AND EXISTS (
        SELECT 1 FROM "User" u JOIN "Role" r ON r.id = u."roleId"
        JOIN "RolePermission" p ON p."roleId" = r.id AND p."permissionKey" = 'atendimentos'
        WHERE u.id = current_setting('spm.actor_id', true) AND u.status = 'ATIVO'
          AND (r.key = 'admin' OR u.id = "ContactMessage"."assignedToId")
    )
)
WITH CHECK (
    current_setting('spm.scope', true) = 'actor' AND EXISTS (
        SELECT 1 FROM "User" u JOIN "Role" r ON r.id = u."roleId"
        JOIN "RolePermission" p ON p."roleId" = r.id AND p."permissionKey" = 'atendimentos'
        WHERE u.id = current_setting('spm.actor_id', true) AND u.status = 'ATIVO'
          AND (r.key = 'admin' OR u.id = "ContactMessage"."assignedToId")
    )
);
CREATE POLICY "ContactMessage_public_insert" ON "ContactMessage" FOR INSERT
WITH CHECK (current_setting('spm.scope', true) = 'public-contact'
    AND id = current_setting('spm.contact_id', true)
    AND "encryptedAt" IS NOT NULL AND "assignedToId" IS NULL
    AND status = 'NOVA' AND "respondedAt" IS NULL AND "internalNote" IS NULL
    AND ip IS NULL AND "userAgent" IS NULL);
-- INSERT RETURNING can see only the exact new UUID selected by the server,
-- rather than exposing all messages to the anonymous form context.
CREATE POLICY "ContactMessage_public_returning" ON "ContactMessage" FOR SELECT
USING (current_setting('spm.scope', true) = 'public-contact'
    AND id = current_setting('spm.contact_id', true));
CREATE POLICY "ContactMessage_retention" ON "ContactMessage" FOR ALL
USING (current_setting('spm.scope', true) = 'retention')
WITH CHECK (current_setting('spm.scope', true) = 'retention');
