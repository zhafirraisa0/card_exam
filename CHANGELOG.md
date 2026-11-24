# Changelog — SCHOOL EXAM CARD GENERATOR

## [1.3.1] — 2026-11-24

- Added open local inspection mode, grade and class cards, and removed directory import for class folders.
- Reworked Excel/CSV import diagnostics, added native CSV decoding and import validation.
- Optimized batch photos, added QR card elements, improved physical print layout validation and preview alignment.
- Added developer footer, refined motion/responsive styles, and a dependency-free Node server with a parent-folder launcher.

## [1.3.0-cloud-foundation] — 2026-11-24

- Added Supabase school login, tenant schema/RLS, activation-code checks, cloud snapshots, realtime refresh, and activity records.
- Added sync status in the header/dashboard and rendered-card PDF export.
- Added Supabase setup and deployment notes. Storage workflows, normalized writes, conflict resolution, and production security remain outstanding.

## [1.2.0] — 2026-11-24

- Added five-group navigation without removing legacy routes.
- Added folder search/level filtering and matched-photo coverage.
- Print waits for images and fonts; sheet sizing and last-page break behavior improved.
- Added reduced-motion and subtle interaction layer.
- Added Netlify SPA fallback and basic response headers.
- Added school slug/ID metadata and legacy storage migration.
- Declared Node ES module mode.

Known: the v1.2.0 build stored data in localStorage and did not provide cloud sync or secure multi-tenancy.

## 1.3.1 — Print and workspace refinement
- Ensure default template variables bind to the active class Excel columns and preserve manual bindings.
- Print preview reflects the class-selected edited template; student photos are optional.
- Remove misleading school-wide dashboard totals and clarify the active workspace and class.
- Keep workspace navigation visible while scrolling, reduce editor width pressure on laptop screens, and remove route-level blink animation.
- Correct developer credit to Zafir, Raisa, Adhitya, Lukietok.


## 1.3.1 — Requested print, class, and logo fixes
- Corrected print stylesheet ancestor hiding that caused blank print sheets.
- Reworked PDF card output to draw template text as vector text; photos and logos are embedded separately.
- Added class-specific data clearing without deleting the class room.
- Dashboard now displays only registered grade levels; schools define their own grade levels before adding class rooms.
- Preserved logo detail at higher resolution during automatic edge-background removal.


## 1.3.1 — Print page integration from school reference
- Added optional folder-of-photos upload for the active class and automatic matching to its imported Excel roster.
- Added A4, F4, A5, and custom sheet sizing with orientation, margin, card gap, card dimensions, automatic capacity, and automatic fitted card sizing.
- Removed print controls for Excel upload, QR size, cut marks, and school-logo display; Excel remains on the student page.
- Added JSON export for print configuration only; student and photo data are excluded.
- Passed calculated print dimensions to PDF so PDF and browser print use the same card capacity and size.

