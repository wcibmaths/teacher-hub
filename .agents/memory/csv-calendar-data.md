---
name: WCIB calendar CSV quirks
description: Gotchas when consuming the school calendar CSVs that drive the teacher-hub sidebar
---
- The calendar CSVs (`public/data/wcib_*.csv`, also copied to `data/` for local serving) start with a UTF-8 BOM. Any parser must strip it or the first header column (`term`) is corrupted.
- **Why:** a code review caught the term label breaking because the header key became `\uFEFFterm`.
- **How to apply:** keep the BOM strip in the JS CSV parser; if re-exporting CSVs, they may again carry a BOM.
- Term weeks are Mon–Fri rows; term lengths differ (T1=16, T2=12, T3=11 weeks). Half-term gaps exist mid-term — the sidebar shows "Half-term break" then, not "Starts soon".
- Canonical copies live in the GitHub Pages repo at `wcibmaths.github.io/teacher-hub/data/` — fetchable with curl if the workspace lacks them.
- Site deploys under `/teacher-hub/` on GitHub Pages, so all fetch paths must be relative (`data/...`), never root-absolute.
