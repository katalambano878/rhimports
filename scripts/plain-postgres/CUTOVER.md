# RNH Imports — cutover from Supabase/Vercel to big-vps

Target: Coolify app `rnhimports` (uuid `brmlw6wegv8o9vkgyrhsjonv`) on big-vps,
database `store_rhimports` on `fleet-postgres`, files in
`/data/fleet/storage/rhimports` (mounted at `/app/storage`).
Staging: app `rnhimports-staging` (`qsjzvnf4ncfsz6qbsuanzc8g`), database
`store_rhimports_staging`, its own signing keys.

Both apps build from the `staging/plain-postgres` branch. Do not merge it to
`main` before the DNS switch: Vercel still builds `main` for the live site.

## Done (2026-10-28)
1. Staging passed the API tests and the admin click-through.
2. Backups of `store_rhimports`: `/data/fleet/dumps/supabase-move/pre-*.dump`.
3. `01_rls_roles.sql` and `02_sync_functions.sql` applied to `store_rhimports`.
4. Full load from Supabase (export 10:09 UTC); all 35 tables match live by
   content digest; all 164 storage objects on disk.
5. Production deployed on https://rnhimports.169-58-8-203.sslip.io and tested;
   test records removed.

## DNS switch
1. Point the build at the real site and rebuild (about 5 minutes):
   - `python3 -I set_envs.py brmlw6wegv8o9vkgyrhsjonv https://www.rnhimports.com store_rhimports rnhimports`
   - set the app's domains to
     `https://www.rnhimports.com,https://rnhimports.com,https://rnhimports.169-58-8-203.sslip.io`
   - deploy.
2. Re-export live and run `load.sh <dir> store_rhimports merge` to pick up
   orders placed since the full load.
3. DNS at Namecheap (TTL 60):
   - `@`   A     `216.198.79.1` → `169.58.8.203`
   - `www` CNAME `…vercel-dns-017.com` → A `169.58.8.203`
   - Leave MX, `send` and `resend._domainkey` records untouched.
4. Once Let's Encrypt certificates are issued, re-run the export and
   `load.sh <dir> store_rhimports merge` to pick up orders that reached Supabase
   while DNS was switching. Repeat until nothing new arrives.
5. Merge `staging/plain-postgres` into `main`, disconnect the Vercel project,
   and switch the app's branch to `main`. (Moolre/Hubtel callback URLs are
   built from the site address per payment, so nothing changes there.)

## Rollback
Point the two DNS records back at Vercel. Supabase is untouched by the cutover,
so the old site keeps working; merge any orders taken on big-vps back manually.
