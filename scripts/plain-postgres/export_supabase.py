#!/usr/bin/env python3
"""Export RNH Imports data from hosted Supabase as NDJSON (one file per table).

Reads through the Supabase Management API SQL endpoint, so auth.users keeps
its bcrypt hashes. Output contains customer PII and password hashes — write it
somewhere private and delete it after loading.

  python3 -I export_supabase.py <out_dir>

Token: ~/.config/supabase/crytoatm-access-token (or SUPABASE_ACCESS_TOKEN).
"""
import json
import os
import sys
import urllib.request
from pathlib import Path

PROJECT_REF = "kohslpoieqjteblahgxg"
PAGE = 5000  # every RNH table fits in one statement, so each table is read consistently
EXTRA_TABLES = ["auth.users", "auth.identities", "storage.buckets", "storage.objects"]


def token() -> str:
    env = os.environ.get("SUPABASE_ACCESS_TOKEN")
    if env:
        return env.strip()
    return Path("~/.config/supabase/crytoatm-access-token").expanduser().read_text().strip()


def sql(query: str):
    req = urllib.request.Request(
        f"https://api.supabase.com/v1/projects/{PROJECT_REF}/database/query",
        data=json.dumps({"query": query}).encode(),
        headers={
            "Authorization": f"Bearer {token()}",
            "Content-Type": "application/json",
            "User-Agent": "rnh-plain-postgres-migration/1.0",
        },
        method="POST",
    )
    with urllib.request.urlopen(req, timeout=120) as resp:
        return json.loads(resp.read())


def main() -> int:
    out = Path(sys.argv[1])
    out.mkdir(parents=True, exist_ok=True)
    os.chmod(out, 0o700)

    tables = [
        r["t"]
        for r in sql(
            "select 'public.'||table_name t from information_schema.tables "
            "where table_schema='public' and table_type='BASE TABLE' order by 1"
        )
    ] + EXTRA_TABLES

    manifest = {}
    # One consistent snapshot is not available over this API, so record the
    # start time: a later merge pass re-reads anything that changed after it.
    manifest["_exported_at"] = sql("select now()::text t")[0]["t"]
    for table in tables:
        total = sql(f"select count(*)::int n from {table}")[0]["n"]
        path = out / f"{table}.ndjson"
        written = 0
        with open(path, "w") as fh:
            offset = 0
            while offset < total:
                rows = sql(
                    f"select to_jsonb(t) doc from {table} t order by ctid "
                    f"limit {PAGE} offset {offset}"
                )
                for row in rows:
                    fh.write(json.dumps(row["doc"], ensure_ascii=False, separators=(",", ":")) + "\n")
                written += len(rows)
                offset += PAGE
                if not rows:
                    break
        os.chmod(path, 0o600)
        manifest[table] = {"source_count": total, "exported": written}
        flag = "" if written == total else "  <-- count changed during export"
        print(f"{table:32} {written:6}/{total}{flag}")

    (out / "manifest.json").write_text(json.dumps(manifest, indent=2))
    return 0


if __name__ == "__main__":
    sys.exit(main())
