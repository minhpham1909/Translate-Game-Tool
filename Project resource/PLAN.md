# Prioritized Patch Plan: Data Safety First, UX Last

## Summary
Implement the patches in this order: strict project database identity, global TM/glossary with legacy migration, master backup + DB-driven restore, then dense CAT workspace UI. Preserve the existing Ren’Py safety rules: direct overwrite, original `translate ...:` header preservation, indentation preservation, and `.rpyc` deletion after export.

## Key Changes
- **Database Crossover hotfix first**
  - Replace `findExistingDbPath()` so it only resolves `vnt_<GameName>.sqlite` and numbered variants.
  - Remove the `translation_project.sqlite` fallback from project DB lookup.
  - Keep startup default DB behavior only for app boot compatibility, not for project identity.

- **Global TM and glossary**
  - Add `src/main/store/globalDb.ts` using `app.getPath('userData')/db/global_assets.sqlite`.
  - Move active TM/glossary reads and writes to the global DB.
  - On project setup/open, migrate legacy per-project `translation_memory` and `glossaries` rows into global DB if those old tables exist.
  - Conflict rule: manual/approved TM updates may overwrite existing TM; glossary migration does not overwrite existing global glossary rows.
  - Parser auto-fill order: dirty-source detection first, then global TM exact match, then `empty`.
  - Approved block rule: when a user approves a non-empty translation, upsert it into global TM unless it is a dirty-source auto-approval.

- **Backup and restore**
  - Replace timestamp backups with one master backup per file: `<file>.rpy.vnt_orig`, created only before the first normal export if missing.
  - Replace backup-list restore with DB-driven restore: reset all blocks for the file to `translated_text = NULL`, `status = 'empty'`, sync progress, then re-export so `original_text` is written back.
  - Restore API becomes file-based, not backup-path-based.
  - Remove timestamp backup UI. Show a simple “Restore to Original” action per file.
  - Do not expose physical `.vnt_orig` restore in UI, per selected default.

- **Dense CAT UI refactor**
  - Refactor `TranslationCard` from bulky card to compact row.
  - Use a 3-column layout: meta/status, original+translation grid, hover actions.
  - Replace large textarea with `rows={1}` auto-resizing textarea using local React resize logic, no new dependency.
  - Replace large status badges with small status dots/lines and compact warning indicators.
  - Reduce workspace padding/spacing so 10-12 rows fit on a 1080p screen.

## Public API / Type Changes
- Replace renderer IPC:
  - `export.listBackups()` no longer used by UI.
  - `export.restoreBackup(fileId, backupPath)` becomes `export.restoreOriginal(fileId)`.
- Update preload declarations and shared renderer types accordingly.
- Keep `BackupEntry` only if needed for backward compatibility during cleanup; otherwise remove unused references after UI migration.

## Test Plan
- Run `npm run typecheck`.
- Run `npm run lint` if typecheck passes.
- Verify database identity:
  - Create/open two different game folders.
  - Confirm each resolves to its own `vnt_<GameName>.sqlite`.
  - Confirm no new project binds to `translation_project.sqlite`.
- Verify Global TM:
  - Approve a translation in Project A.
  - Open/setup Project B containing the same `original_text`.
  - Confirm the block auto-fills as `approved` without AI.
  - Confirm legacy per-project TM/glossary rows migrate once without crashing when tables are absent.
- Verify restore/export:
  - First export creates exactly one `.vnt_orig`.
  - Repeated export does not create timestamp backups.
  - Restore resets DB state, rewrites original text, syncs progress, and deletes `.rpyc`.
- Verify UX:
  - Rows are compact, hover actions work, multi-select still works.
  - Textarea starts one line high and expands only when content wraps.
  - Empty/draft/approved/warning/modified states remain visually distinguishable.

## Assumptions
- “Important first” means data-corruption and data-loss hotfixes before UX polish.
- Existing project TM/glossary data should be migrated when projects are opened or set up.
- Restore should be DB-driven only; `.vnt_orig` remains a safety copy but is not listed as a restore target.
- The current worktree is the implementation target, while the `D:\Code\...Project resource\*.md` files are patch specifications.
