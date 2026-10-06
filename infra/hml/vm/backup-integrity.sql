-- Counts and hashes only: row contents never leave PostgreSQL.
\set ON_ERROR_STOP on
BEGIN READ ONLY;
SET LOCAL TIME ZONE 'UTC';
SET LOCAL datestyle = 'ISO, YMD';
SET LOCAL intervalstyle = 'postgres';
SET LOCAL extra_float_digits = 3;
SET LOCAL bytea_output = 'hex';
SET LOCAL work_mem = '2MB';
-- Foreign table data and large objects require a separate verification procedure.
DO $$ BEGIN
    IF EXISTS (SELECT 1 FROM pg_largeobject_metadata)
       OR EXISTS (SELECT 1 FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace
                  WHERE c.relkind='f' AND n.nspname !~ '^pg_' AND n.nspname <> 'information_schema') THEN
        RAISE EXCEPTION 'Unsupported external data or large objects';
    END IF;
END $$;
SELECT format($query$
WITH hashed AS (
    SELECT encode(sha256(convert_to(to_jsonb(t)::text, 'UTF8')), 'hex') AS h FROM %I.%I t
), numbered AS (
    SELECT h, row_number() OVER (ORDER BY h) AS n FROM hashed
), chunks AS (
    SELECT (n-1)/1024 AS chunk, count(*) AS rows,
           encode(sha256(convert_to(string_agg(h, '' ORDER BY n), 'UTF8')), 'hex') AS hash
    FROM numbered GROUP BY (n-1)/1024
)
SELECT jsonb_build_object('kind', 'table', 'schema', %L, 'name', %L,
    'rows', COALESCE(sum(rows), 0)::bigint,
    'sha256', encode(sha256(convert_to(COALESCE(string_agg(hash, '' ORDER BY chunk), ''), 'UTF8')), 'hex'))
FROM chunks;
$query$, n.nspname, c.relname, n.nspname, c.relname)
FROM pg_class c JOIN pg_namespace n ON n.oid = c.relnamespace
WHERE c.relkind IN ('r', 'p', 'm') AND NOT c.relispartition
  AND n.nspname !~ '^pg_' AND n.nspname <> 'information_schema'
ORDER BY n.nspname, c.relname
\gexec
SELECT format($query$
SELECT jsonb_build_object('kind', 'sequence', 'schema', %L, 'name', %L,
                         'last_value', last_value::text, 'is_called', is_called) FROM %I.%I;
$query$, n.nspname, c.relname, n.nspname, c.relname)
FROM pg_class c JOIN pg_namespace n ON n.oid = c.relnamespace
WHERE c.relkind = 'S' AND n.nspname !~ '^pg_' AND n.nspname <> 'information_schema'
ORDER BY n.nspname, c.relname
\gexec
COMMIT;
