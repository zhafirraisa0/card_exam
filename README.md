# SCHOOL EXAM CARD GENERATOR

Static browser application with a Supabase cloud workspace option. The existing card editor, five main navigation groups, class folders, Excel import, photo matching, and browser print layout remain in the application. Cloud sign-in uses a single shared Supabase Auth account per school; each operator supplies a display name for the activity log.

**Current access setting:** the app currently skips login for inspection (`DEV_BYPASS_AUTH = true`) and saves data in the current browser only. Hosting this version makes the web page reachable, but does not make school data cloud-synced or shared between people. Student names, photos, and CBT credentials must not be treated as a public shared workspace in this setting. Restore login and finish the production checklist before onboarding schools.

## Architecture

```text
Operator laptop A â”€â”                         â”Œâ”€ Supabase Auth (shared school login)
Operator laptop B â”€â”¼â”€ HTTPS + anon key â”€â”€â”€â”€â”€â”€â”¼â”€ PostgreSQL (RLS by schools.owner_id)
Operator laptop C â”€â”˜                         â”œâ”€ workspace_snapshots (current app state)
                                             â”œâ”€ tenant tables (normalized schema for migration)
                                             â””â”€ private photo/template Storage buckets
```

The current application synchronizes its complete workspace as one `workspace_snapshots.payload` JSON document and subscribes to snapshot changes. It does **not yet** write photos to the Storage buckets or use the normalized student/folder/template tables. This keeps the existing app model working but has database row-size, concurrency, and large-photo limits. It is a cloud foundation, not yet a production-hardened commercial SaaS release.

## Supabase setup

1. Create a Supabase project and copy its Project URL and publishable (anon) key.
2. Open **SQL Editor**, paste all of `schema.sql`, and run it once.
3. In **Authentication â†’ Providers â†’ Email**, disable email confirmations. The app creates a synthetic login email from the unique school name; no mailbox exists for that address.
4. In **Project Settings â†’ API**, enable Realtime for `workspace_snapshots` (or add it to `supabase_realtime` publication).
5. Copy `.env.example` to a private deployment note, then place the URL and anon key in `src/config.js`. The browser config is public; never put a service-role key there.
6. Deploy the folder `school-exam-card-generator` to Netlify with publish directory `.`. `netlify.toml` and `_redirects` are included. Alternatively serve it locally with `npm start`.
7. Register a school, then sign in on another device with the same school name and password. Each device can enter a different operator display name.

### Activation codes

When `activation_codes` contains at least one active code, registration requires a valid code. Generate a random code outside the database, calculate its SHA-256 hex digest, then add only the digest:

```sql
insert into public.activation_codes(code_hash,label,max_uses)
values (encode(extensions.digest('REPLACE-WITH-LONG-RANDOM-CODE','sha256'),'hex'),'School license',1);
```

Give the original code to the purchasing school. If there are no active activation codes, registration is open. SQL owners should create codes; do not expose database owner credentials to customers.

## Deployment and account handoff

Use a school-specific workspace password and transfer it through a private channel. Operators share that school credential and identify themselves in the operator-name field. Rotate the shared password when staff leave. Since operators share one Auth identity, the log's operator label is an audit hint, not cryptographic identity; use individual accounts before relying on it for compliance. Keep Supabase project ownership with the application operator, use database backups, and never share the service-role key.

## Print and PDF

Browser print uses the HTML card preview and waits for images and fonts. PDF export draws card text and geometry as vector content, embeds uploaded photos/logos/background artwork as images, and uses the same calculated card size and sheet capacity as the preview. Export configuration downloads only paper, orientation, margin, gap, card size, and capacity settings; it does not contain student data or photos. Print at 100% / Actual size on the target printer.

## Local development

From the extracted parent folder, run `npm start`; from the project subfolder, run the same command. The app includes a small built-in Node static server and needs no `npm install`. Open the printed address. If port 3000 is occupied, it automatically tries the next free port through 3010.

For temporary local testing without login, `src/app.js` has `DEV_BYPASS_AUTH = true`. This uses browser localStorage and does not sync to Supabase. Set it to `false` to restore cloud authentication.

Automated checks are available with `npm test`. Latest local verification: `npm test`, JavaScript syntax checks, and HTTP smoke checks passed. No live Supabase deployment or physical-printer verification was run.


