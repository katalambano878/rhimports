# RNH Imports — cutover from Supabase/Vercel to big-vps

Target: Coolify app on big-vps, database `store_rhimports` on `fleet-postgres`,
files in `/data/fleet/storage/rhimports` (mounted at `/app/storage`).

## Before the cutover
1. Staging (`store_rhimports_staging`, https://rnhimports-staging.169-58-8-203.sslip.io)
   passes the API tests and the admin click-through.
2. Backup of `store_rhimports`: `/data/fleet/dumps/supabase-move/pre-plainpg-*.dump`.
3. `01_rls_roles.sql` applied to `store_rhimports`.

## Cutover
1. Export live: `python3 -I export_supabase.py <private dir>` (Mac; token in
   `~/.config/supabase/crytoatm-access-token`).
2. Copy to big-vps `/root/rnh-migration/`, then
   `bash load.sh <dir> store_rhimports full`.
3. Verify: row counts and the per-table content digests match live.
4. Sync any storage objects uploaded since the last sync.
5. Deploy the production app; check it on its sslip URL.
6. DNS at Namecheap (TTL 60):
   - `@`   A     `216.198.79.1` → `169.58.8.203`
   - `www` CNAME `…vercel-dns-017.com` → A `169.58.8.203`
   - Leave MX, `send` and `resend._domainkey` records untouched.
7. Once Let's Encrypt certificates are issued, re-run the export and
   `load.sh <dir> store_rhimports merge` to pick up orders that reached Supabase
   while DNS was switching. Repeat until nothing new arrives.

## Rollback
Point the two DNS records back at Vercel. Supabase is untouched by the cutover,
so the old site keeps working; merge any orders taken on big-vps back manually.
