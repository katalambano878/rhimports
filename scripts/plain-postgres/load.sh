#!/usr/bin/env bash
# Apply an export_supabase.py directory to a fleet-postgres database.
# Run ON big-vps:  bash load.sh <export_dir> <database> full|merge
#
# Everything happens in one transaction: a failure leaves the database as it was.
set -euo pipefail

DIR="${1:?export dir}"
DB="${2:?database}"
MODE="${3:?full|merge}"
[[ "$MODE" == full || "$MODE" == merge ]] || { echo "mode must be full or merge"; exit 1; }
[[ "$DB" =~ ^[a-z0-9_]+$ ]] || { echo "bad database name"; exit 1; }

HERE="$(cd "$(dirname "$0")" && pwd)"
STAGE="/tmp/rnh-sync-$$"
SUPABASE_PREFIX="https://kohslpoieqjteblahgxg.supabase.co/storage/v1/"

psql_db() { docker exec -i fleet-postgres psql -X -v ON_ERROR_STOP=1 -U postgres -d "$DB" "$@"; }

docker exec fleet-postgres mkdir -p "$STAGE"
docker exec fleet-postgres chmod 700 "$STAGE"
trap 'docker exec fleet-postgres rm -rf "$STAGE"' EXIT
for f in "$DIR"/*.ndjson; do docker cp "$f" "fleet-postgres:$STAGE/"; done

psql_db -q < "$HERE/02_sync_functions.sql"

{
  echo "BEGIN;"
  echo "SET LOCAL session_replication_role = replica;"
  echo "TRUNCATE rnh_sync.incoming;"
  echo "CREATE TEMP TABLE raw (doc jsonb) ON COMMIT DROP;"
  for f in "$DIR"/*.ndjson; do
    tbl="$(basename "$f" .ndjson)"
    [[ "$tbl" =~ ^(public|auth|storage)\.[a-z_]+$ ]] || { echo "bad table file $f" >&2; exit 1; }
    echo "\\copy raw FROM '$STAGE/$(basename "$f")' WITH (FORMAT csv, QUOTE E'\\x01', DELIMITER E'\\x02')"
    echo "INSERT INTO rnh_sync.incoming SELECT '$tbl', doc FROM raw; TRUNCATE raw;"
  done
  echo "\\echo '-- apply ($MODE)'"
  for f in "$DIR"/*.ndjson; do
    tbl="$(basename "$f" .ndjson)"
    echo "SELECT '$tbl' AS tbl, * FROM rnh_sync.apply('$tbl', '$MODE');"
  done
  # Hosted-storage URLs become host-relative; files are served by /storage/v1 on this app.
  cat <<SQL
DO \$\$
DECLARE c record; n bigint; total bigint := 0;
BEGIN
  FOR c IN
    SELECT table_name, column_name, data_type FROM information_schema.columns
     WHERE table_schema = 'public' AND data_type IN ('text', 'character varying', 'jsonb', 'json', 'ARRAY')
       AND is_generated = 'NEVER'
  LOOP
    IF c.data_type IN ('jsonb', 'json', 'ARRAY') THEN
      EXECUTE format('UPDATE public.%I SET %I = replace(%I::text, %L, %L)::%s WHERE %I::text LIKE %L',
        c.table_name, c.column_name, c.column_name, '$SUPABASE_PREFIX', '/storage/v1/',
        (SELECT format_type(atttypid, atttypmod) FROM pg_attribute WHERE attrelid = ('public.' || quote_ident(c.table_name))::regclass AND attname = c.column_name),
        c.column_name, '%' || '$SUPABASE_PREFIX' || '%');
    ELSE
      EXECUTE format('UPDATE public.%I SET %I = replace(%I, %L, %L) WHERE %I LIKE %L',
        c.table_name, c.column_name, c.column_name, '$SUPABASE_PREFIX', '/storage/v1/',
        c.column_name, '%' || '$SUPABASE_PREFIX' || '%');
    END IF;
    GET DIAGNOSTICS n = ROW_COUNT;
    IF n > 0 THEN RAISE NOTICE 'rewrote storage URLs: %.% (% rows)', c.table_name, c.column_name, n; END IF;
    total := total + n;
  END LOOP;
  RAISE NOTICE 'storage URL rewrites: % rows', total;
END
\$\$;
SELECT setval('public.support_tickets_ticket_number_seq',
              GREATEST((SELECT COALESCE(max(ticket_number), 0) FROM public.support_tickets), 1),
              (SELECT count(*) > 0 FROM public.support_tickets));
TRUNCATE rnh_sync.incoming;
COMMIT;
SQL
} | psql_db

echo "-- row counts after load"
for f in "$DIR"/*.ndjson; do
  tbl="$(basename "$f" .ndjson)"
  printf '%-32s %6s target / %6s exported\n' "$tbl" \
    "$(psql_db -tAc "SELECT count(*) FROM $tbl")" "$(wc -l < "$f" | tr -d ' ')"
done
