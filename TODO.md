# Remaining production gates

- [ ] Move photos, school logos, and template backgrounds into private Supabase Storage with signed URL hydration.
- [ ] Replace JSON snapshots with transactional writes to normalized folder, student, and template records.
- [ ] Add conflict detection/version checks, save error UI, retry queue, and recovery for concurrent operators.
- [ ] Add individual operator accounts/roles, password reset, MFA option, rate limits, and trusted audit identity.
- [ ] Add license administration/revocation UI and school rename/login migration.
- [ ] Add data retention, backup/restore, deletion/export, privacy policy, and operational monitoring.
- [ ] Run SQL migration against a fresh Supabase project and verify RLS/storage isolation with two tenants.
- [ ] Run unit/E2E checks for auth, import, editor drag/drop, photo upload, realtime, and browser print.
- [ ] Calibrate A4/A5/custom page layouts and PDF dimensions on target printers.
