# Test Report

## Automated checks
- `npm test` — PASS. Covers Excel/CSV parsing, folder isolation, photo matching, automatic/manual bindings, A4/A5/F4/custom print geometry, automatic capacity, fitted card sizing, visible print output, optional folder-photo picker, per-class clearing, vector PDF text, and dashboard levels.
- `node --check` across 26 JavaScript files in `src` and `tests` — PASS.
- Built-in server HTTP smoke check — PASS (`GET /` and the print-page module returned 200).

## Manual/browser checks
- No real browser print dialog or physical printer was available for visual calibration. Verify the target paper size at 100% / Actual size before a production print run.
- Photo, logo, and uploaded background artwork remain raster image sources; vector card text and layout remain sharp in exported PDF.
- The app remains in local test mode (`DEV_BYPASS_AUTH=true`) and stores data in this browser. It is not yet a shared public school workspace.
