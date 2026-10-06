-- Executar SOMENTE após revisão/aprovação, conectado ao banco correto como
-- administrador SQL. Migrações iniciais devem existir e pertencer a owner_role.
-- psql ... -v owner_role=spm -v runtime_role=spm_app -f infra/sql/provision-runtime-role.sql
-- Não recebe senha por parâmetro: use \password spm_app na sessão interativa.
\set ON_ERROR_STOP on

SELECT :'owner_role' <> :'runtime_role' AS separate_roles \gset
\if :separate_roles
\else
    \echo 'ERRO: proprietário/migrador e runtime devem ser papéis diferentes.'
    \quit 1
\endif

BEGIN;

-- Falha deliberadamente se o papel já existir: não altera privilégios de uma
-- identidade desconhecida. Para migração de conta existente, revisar manualmente.
SELECT format('CREATE ROLE %I LOGIN NOSUPERUSER NOCREATEDB NOCREATEROLE NOREPLICATION NOBYPASSRLS', :'runtime_role') \gexec

SELECT format('GRANT CONNECT ON DATABASE %I TO %I', current_database(), :'runtime_role') \gexec
REVOKE CREATE ON SCHEMA public FROM PUBLIC;
SELECT format('GRANT USAGE ON SCHEMA public TO %I', :'runtime_role') \gexec
SELECT format('GRANT SELECT, INSERT, UPDATE, DELETE ON ALL TABLES IN SCHEMA public TO %I', :'runtime_role') \gexec
SELECT format('GRANT USAGE, SELECT ON ALL SEQUENCES IN SCHEMA public TO %I', :'runtime_role') \gexec
SELECT format('REVOKE ALL ON TABLE public._prisma_migrations FROM %I', :'runtime_role') \gexec

-- Cobrem futuras tabelas criadas pelo MESMO proprietário das migrações.
SELECT format('ALTER DEFAULT PRIVILEGES FOR ROLE %I IN SCHEMA public GRANT SELECT, INSERT, UPDATE, DELETE ON TABLES TO %I', :'owner_role', :'runtime_role') \gexec
SELECT format('ALTER DEFAULT PRIVILEGES FOR ROLE %I IN SCHEMA public GRANT USAGE, SELECT ON SEQUENCES TO %I', :'owner_role', :'runtime_role') \gexec

COMMIT;
\echo 'Papel criado sem senha. Defina-a com \password na sessão interativa; não passe senha no histórico/argumentos.'
