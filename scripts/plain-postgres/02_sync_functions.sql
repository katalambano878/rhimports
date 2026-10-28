-- Loader for NDJSON exported by export_supabase.py.
--
-- Rows are staged in rnh_sync.incoming(tbl, doc) and applied per table:
--   full  — target table emptied first, every exported row inserted.
--   merge — rows missing on the target are inserted; existing rows are only
--           overwritten when the source has a newer updated_at, so edits made
--           on this server after cutover are never rolled back.
-- Triggers and FK checks are off while applying (session_replication_role),
-- so updated_at values and trigger-created rows arrive exactly as exported.
-- Run as postgres.

CREATE SCHEMA IF NOT EXISTS rnh_sync;
REVOKE ALL ON SCHEMA rnh_sync FROM PUBLIC;

CREATE TABLE IF NOT EXISTS rnh_sync.incoming (tbl text NOT NULL, doc jsonb NOT NULL);

DROP FUNCTION IF EXISTS rnh_sync.apply(regclass, text);

-- source_tbl is the export's "schema.table" tag; target is resolved from it.
CREATE OR REPLACE FUNCTION rnh_sync.apply(source_tbl text, mode text)
RETURNS TABLE (inserted bigint, updated bigint)
LANGUAGE plpgsql AS $$
DECLARE
  target regclass := source_tbl::regclass;
  cols text;
  pk text;
  has_updated_at boolean;
  set_list text;
  n_before bigint;
  n_affected bigint;
  n_after bigint;
BEGIN
  IF mode NOT IN ('full', 'merge') THEN
    RAISE EXCEPTION 'mode must be full or merge';
  END IF;

  SELECT string_agg(quote_ident(attname), ', ' ORDER BY attnum)
    INTO cols
    FROM pg_attribute
   WHERE attrelid = target AND attnum > 0 AND NOT attisdropped
     AND attgenerated = '' AND attidentity = '';

  SELECT string_agg(quote_ident(a.attname), ', ')
    INTO pk
    FROM pg_index i
    JOIN pg_attribute a ON a.attrelid = i.indrelid AND a.attnum = ANY (i.indkey)
   WHERE i.indrelid = target AND i.indisprimary;

  SELECT EXISTS (SELECT 1 FROM pg_attribute WHERE attrelid = target AND attname = 'updated_at' AND NOT attisdropped)
    INTO has_updated_at;

  EXECUTE format('SELECT count(*) FROM %s', target) INTO n_before;

  IF mode = 'full' THEN
    EXECUTE format('DELETE FROM %s', target);
    EXECUTE format(
      'INSERT INTO %1$s (%2$s) SELECT %2$s FROM rnh_sync.incoming s, jsonb_populate_record(NULL::%1$s, s.doc) WHERE s.tbl = %3$L',
      target, cols, source_tbl);
    GET DIAGNOSTICS n_affected = ROW_COUNT;
    IF n_affected <> (SELECT count(*) FROM rnh_sync.incoming s WHERE s.tbl = source_tbl) THEN
      RAISE EXCEPTION 'full load of % inserted % rows, expected %', source_tbl, n_affected,
        (SELECT count(*) FROM rnh_sync.incoming s WHERE s.tbl = source_tbl);
    END IF;
    RETURN QUERY SELECT n_affected, 0::bigint;
    RETURN;
  END IF;

  IF pk IS NULL THEN
    RAISE EXCEPTION 'table % has no primary key; merge needs one', target;
  END IF;

  SELECT string_agg(format('%1$s = EXCLUDED.%1$s', quote_ident(attname)), ', ')
    INTO set_list
    FROM pg_attribute
   WHERE attrelid = target AND attnum > 0 AND NOT attisdropped
     AND attgenerated = '' AND attidentity = ''
     AND quote_ident(attname) <> ALL (string_to_array(replace(pk, ' ', ''), ','));

  IF has_updated_at AND set_list IS NOT NULL THEN
    EXECUTE format(
      'INSERT INTO %1$s AS t (%2$s) SELECT %2$s FROM rnh_sync.incoming s, jsonb_populate_record(NULL::%1$s, s.doc) WHERE s.tbl = %3$L
       ON CONFLICT (%4$s) DO UPDATE SET %5$s
       WHERE EXCLUDED.updated_at IS DISTINCT FROM t.updated_at AND (t.updated_at IS NULL OR EXCLUDED.updated_at > t.updated_at)',
      target, cols, source_tbl, pk, set_list);
  ELSE
    EXECUTE format(
      'INSERT INTO %1$s (%2$s) SELECT %2$s FROM rnh_sync.incoming s, jsonb_populate_record(NULL::%1$s, s.doc) WHERE s.tbl = %3$L
       ON CONFLICT (%4$s) DO NOTHING',
      target, cols, source_tbl, pk);
  END IF;
  GET DIAGNOSTICS n_affected = ROW_COUNT;
  EXECUTE format('SELECT count(*) FROM %s', target) INTO n_after;
  RETURN QUERY SELECT n_after - n_before, n_affected - (n_after - n_before);
END
$$;
