-- ProhouseStagingDBMigrateFresh.sql
--
-- Destructive staging-only reset for the ClawHouse Agent Board Ledger database.
-- Keeps the schema and truncates every public base table.
--
-- Usage:
--   psql "$AGENT_BOARD_LEDGER_DATABASE_URL" -v ON_ERROR_STOP=1 -f apps/agent-board-ledger/scripts/sql/ProhouseStagingDBMigrateFresh.sql

BEGIN;

DO $$
DECLARE
  table_list text;
BEGIN
  IF current_database() <> 'clawhouse_staging' THEN
    RAISE EXCEPTION 'Refusing to reset database %. Expected clawhouse_staging.', current_database();
  END IF;

  SELECT string_agg(format('public.%I', table_name), ', ' ORDER BY table_name)
    INTO table_list
  FROM information_schema.tables
  WHERE table_schema = 'public'
    AND table_type = 'BASE TABLE';

  IF table_list IS NULL THEN
    RAISE EXCEPTION 'No public base tables found.';
  END IF;

  EXECUTE 'TRUNCATE TABLE ' || table_list || ' RESTART IDENTITY CASCADE';
END $$;

COMMIT;

SELECT 'after_fresh_reset' AS phase, current_database() AS database_name, current_user AS database_user;

WITH tables AS (
  SELECT table_name
  FROM information_schema.tables
  WHERE table_schema = 'public'
    AND table_type = 'BASE TABLE'
)
SELECT
  table_name,
  (xpath(
    '/row/c/text()',
    query_to_xml(format('SELECT count(*) AS c FROM public.%I', table_name), false, true, '')
  ))[1]::text::int AS row_count
FROM tables
ORDER BY table_name;
