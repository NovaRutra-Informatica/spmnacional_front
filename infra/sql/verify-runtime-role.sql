-- Somente leitura. Execute após provisionamento e depois de novas migrações.
-- psql ... -v runtime_role=spm_app -f infra/sql/verify-runtime-role.sql
\set ON_ERROR_STOP on
SELECT
    NOT rolcreatedb AND NOT rolcreaterole AND NOT rolsuper AND NOT rolreplication AND NOT rolbypassrls
    AND NOT has_schema_privilege(oid, 'public', 'CREATE')
    AND NOT has_database_privilege(oid, current_database(), 'CREATE')
    AND NOT has_table_privilege(oid, 'public._prisma_migrations', 'INSERT,UPDATE,DELETE,TRUNCATE')
    AND NOT EXISTS (SELECT 1 FROM pg_auth_members membership WHERE membership.member = pg_roles.oid)
    AS runtime_restricted
FROM pg_roles WHERE rolname = :'runtime_role' \gset
\if :runtime_restricted
    \echo 'OK: runtime sem DDL, sem privilégios administrativos e sem escrita nas migrações.'
\else
    \echo 'ERRO: papel runtime possui privilégios inesperados; não liberar produção.'
    \quit 1
\endif
