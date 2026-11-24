# Progress Status â€” SCHOOL EXAM CARD GENERATOR

**Version:** 1.3.1 | **Date:** 2026-11-24

## Improvements in this pass

- The app opens without a login screen for temporary inspection, and cloud writes are explicitly disabled in that mode.
- Added school-defined level cards, then class/rombel cards for each level. Added duplicate class protection and removed directory-based class import.
- Reworked Excel import feedback, file/worksheet/header handling, row validation, size limit, and save failure rollback. CSV parsing now works without external libraries, including quoted values, semicolon delimiters, UTF-8, and Windows-1252.
- Optimized bulk photos into smaller JPEGs with progress feedback and explicit storage-limit errors.
- Added school-team footer, refined responsive styling and motion, and added QR elements bound to Excel fields.
- Aligned card preview and print photo crop/text/background; improved A4/A5/custom print sizing, overflow prevention, cut marks, and repair for old overflowing print settings.
- Added a built-in Node static server and parent-folder npm scripts; no npm install required to start locally.

## Production status

- The current no-login setting stores state in each browser's localStorage. It is not a shared cloud workspace. A public static deployment would expose the app page to anyone but would not synchronize school data across devices.
- Supabase migration remains a foundation. Photos/templates do not yet use Storage, normalized tables are not used by app workflows, and concurrent edits are not merged.
- No live public hosting or live Supabase project was configured in this pass. Do not onboard schools until the production checklist in `TODO.md` is complete and privacy/isolation tests pass.

## Latest requested refinements
- Fixed print-mode CSS so the nested print sheet survives hiding the app chrome.
- Exported PDF card text as vector text; student photos remain source images and are captured separately at high resolution.
- Added automatic edge-background removal for school logos and raised processing resolution to preserve detail.
- Added per-class clearing of Excel, roster, and photos while retaining the class room.
- Footer credit is editable in src/app.js at the FOOTER_CREDIT constant.



## Print page reference integration
- Adapted the reference's photo-folder, paper/orientation, margin/gap, capacity, and fit-to-grid settings to the active class and existing card template.
- Kept Excel import in Data Siswa; added an export preset containing print options only.
- Removed cut-mark display, QR size, and logo visibility controls from the print page.

