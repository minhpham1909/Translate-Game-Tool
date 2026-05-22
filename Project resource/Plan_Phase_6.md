# Phase 6 Plan - Complete App Functionality (Production-Ready)

## 0) Overall Objectives

- Move the app from "works" to "stable for large-scale translation projects".
- Combine two strengths: strong automation (Vortex-like) + detailed post-editing workspace (CAT tool).
- Optimize token/cost usage, preserve translation quality, and deliver a Vietnam-first UX.

---

## 1) Solo Execution Principles

- Scope discipline over feature volume.
- Ship in vertical slices that can be tested end-to-end.
- Keep rollback simple: one feature flag or one reversible migration at a time.
- Every completed slice must include smoke test evidence.

---

## 2) Non-Goals (Out of Scope for Phase 6)

- Multi-user collaboration and cloud sync.
- Marketplace/plugin ecosystem expansion.
- Advanced analytics dashboards beyond core token/cost telemetry.
- New language packs beyond VN-first production scope.

---

## 3) Implementation Priority (Build Order)

1. Token Optimizer
2. Automation Translate
3. Export Translate (Vortex-like)
4. Global DB + Restore + Global Data Center GUI
5. Natural 18+ Translation & Safety
6. Block Visibility Engine (noise filtering) + Search Optimization
7. Full Vietnamese Localization
8. Tutorial/Onboarding
9. Mock Data Cleanup + end-to-end hardening

---

## 4) Workstreams (Scope Summary)

### A) Token Optimizer
- Goal: reduce wasted tokens and cost without lowering quality.
- MVP Must Have:
  - TokenEstimator
  - BatchPlanner by token budget
  - Basic context/glossary throttling
  - Token telemetry table
- Nice to Have:
  - Provider-specific adaptive token calibration
  - Dynamic budget strategy by scene type
- Rollback: disable token planner via config and fall back to current line-count batching.

### B) Automation Translate
- Goal: stable file/project automation with pause/resume/retry.
- MVP Must Have:
  - Queue state machine
  - Checkpoint resume
  - Retry matrix by error type
- Nice to Have:
  - Smart ETA prediction
  - Throughput auto-tuning
- Rollback: disable checkpoint runner and keep current queue flow.

### C) Export Translate (Vortex-like)
- Goal: export to `game/tl/vietnamese/...` by default.
- MVP Must Have:
  - `vortex_like` export mode as default
  - Ren'Py-safe writer validation
  - `.rpyc` cleanup
- Nice to Have:
  - Export profile presets per game
- Rollback: switch default mode back to legacy export.

### D) Global DB + Smart Resource Hub + Restore
- Goal: user-controllable global TM/Glossary with safe clear/restore.
- MVP Must Have:
  - Global Data Center (TM + Glossary basic tabs)
  - Clear by scope + safety confirmation
  - Restore DB state + regenerate export files
- Nice to Have:
  - Soft-delete recovery center
  - Advanced stats/history
- Rollback: hide GUI module and keep current direct service behavior.

### E) Natural 18+ Translation & Safety
- Goal: natural phrasing for sensitive content with lower reject rate.
- MVP Must Have:
  - Style profiles (`soft/neutral/direct`)
  - Safety fallback chain
- Nice to Have:
  - Naturalness scoring/rephrase automation
- Rollback: lock style to neutral and disable advanced retry profiles.

### F) Block Visibility Engine (Noise Filter)
- Goal: hide non-valuable blocks by default to reduce token waste.
- MVP Must Have:
  - Classifier + visibility fields
  - Hidden tab + reason badges
  - Queue/preflight/search hidden handling
- Nice to Have:
  - Confidence explainability panel
- Rollback: set all blocks to visible and bypass filter in runtime.

### G) Search Optimization
- Goal: fast single-block lookup and safe replace-all.
- MVP Must Have:
  - Search by block id/hash/line
  - Optimized global search
  - Replace one/all with preview
- Nice to Have:
  - Undo stack for multi-step replace sessions
- Rollback: disable replace-all preview and use legacy search path.

### H) Full Vietnamese Localization
- Goal: full Vietnamese user-facing product.
- MVP Must Have:
  - Core flow strings fully Vietnamese
  - Standardized VN formatting
- Nice to Have:
  - Optional i18n scaffolding for future language additions
- Rollback: keep locale fallback to current mixed strings if needed.

### I) Tutorial/Onboarding
- Goal: first-time users can complete setup + first translation without external docs.
- MVP Must Have:
  - First-run wizard
  - Guided core actions
- Nice to Have:
  - Contextual tips coverage for every modal
- Rollback: keep setup wizard only, hide guided tour.

### J) Mock Data Cleanup + Hardening
- Goal: remove mock flows and connect real services end-to-end.
- MVP Must Have:
  - Search/TM/QA/Token/Log connect to real data
  - Error handling standardization
- Nice to Have:
  - Broader automated test suite
- Rollback: feature-toggle new panels while preserving old stable views.

---

## 5) Execution Task Board (Ready-to-Code)

Status legend: `TODO`, `DOING`, `DONE`, `BLOCKED`
Effort legend: `S` (0.5-1 day), `M` (1-3 days), `L` (3+ days)
Priority legend: `P0` critical, `P1` high, `P2` medium

### Milestone M1 - Token + Queue (A+B)

- `P6-M1-01` [P0][M][TODO] Create token telemetry schema + migration.
- `P6-M1-02` [P0][M][TODO] Implement TokenEstimator service per provider.
- `P6-M1-03` [P0][M][TODO] Implement BatchPlanner (token budget split).
- `P6-M1-04` [P1][S][TODO] Add config flags for token planner on/off.
- `P6-M1-05` [P0][M][TODO] Build queue state machine (`idle/running/paused/stopped/error/done`).
- `P6-M1-06` [P0][M][TODO] Add checkpoint persistence (`file_id/last_block_id/config`).
- `P6-M1-07` [P1][S][TODO] Implement retry matrix + backoff policy table.
- `P6-M1-08` [P1][S][TODO] Add runtime metrics (speed, ETA, token/file).
- `P6-M1-09` [P0][S][TODO] Smoke test M1 and freeze baseline metrics.

Dependencies:
- `P6-M1-03` depends on `P6-M1-02`.
- `P6-M1-08` depends on `P6-M1-01` and `P6-M1-05`.

### Milestone M2 - Export + Global Data Center + Restore (C+D)

- `P6-M2-01` [P0][M][TODO] Add export mode contract (`vortex_like`, `legacy_overwrite`).
- `P6-M2-02` [P0][L][TODO] Implement `vortex_like` writer path mapping to `tl/vietnamese`.
- `P6-M2-03` [P0][M][TODO] Add pre-export validator (tags/vars/escape/header checks).
- `P6-M2-04` [P1][S][TODO] Add `.rpyc` cleanup policy for vortex-like export.
- `P6-M2-05` [P0][M][TODO] Build Global Data Center TM tab (list/search/edit/delete/enable).
- `P6-M2-06` [P0][M][TODO] Build Glossary tab with same controls.
- `P6-M2-07` [P0][M][TODO] Implement clear-by-scope flow + two-step confirmation.
- `P6-M2-08` [P1][M][TODO] Add snapshot-before-clear and restore entrypoint.
- `P6-M2-09` [P0][S][TODO] Smoke test M2 on one real game sample.

Dependencies:
- `P6-M2-02` depends on `P6-M2-01`.
- `P6-M2-07` depends on `P6-M2-05` and `P6-M2-06`.

### Milestone M3 - 18+ Naturalness + Block Visibility + Search (E+F+G)

- `P6-M3-01` [P1][M][TODO] Add translation style profiles (`soft/neutral/direct`).
- `P6-M3-02` [P1][M][TODO] Implement safety fallback chain for rejected outputs.
- `P6-M3-03` [P0][M][TODO] Add DB migration for `visibility/hidden_reason/manual_override`.
- `P6-M3-04` [P0][L][TODO] Implement block classifier (`dialogue/ui_text/format_token/symbol_only/numeric_only/script_meta/mixed`).
- `P6-M3-05` [P0][M][TODO] Add Hidden tab UI + reason badges + unhide action.
- `P6-M3-06` [P0][M][TODO] Integrate visibility behavior into queue/preflight/search.
- `P6-M3-07` [P1][M][TODO] Implement fast single-block search (`id/hash/line`).
- `P6-M3-08` [P1][M][TODO] Implement global search + replace one/all with preview.
- `P6-M3-09` [P0][S][TODO] Run mandatory classifier test cases (including format token sample).

Dependencies:
- `P6-M3-05` and `P6-M3-06` depend on `P6-M3-03` and `P6-M3-04`.
- `P6-M3-08` depends on `P6-M3-06`.

### Milestone M4 - Full VI + Tutorial + Mock Cleanup (H+I+J)

- `P6-M4-01` [P1][M][TODO] Move all core flow strings into i18n layer.
- `P6-M4-02` [P1][M][TODO] Complete Vietnamese localization for all core screens/modals/errors.
- `P6-M4-03` [P2][M][TODO] Build first-run wizard (provider + API test + preflight).
- `P6-M4-04` [P2][S][TODO] Add guided tour for core flow actions.
- `P6-M4-05` [P0][M][TODO] Replace Search modal mock data with real IPC/service calls.
- `P6-M4-06` [P0][M][TODO] Replace TM manager mock data with real data/services.
- `P6-M4-07` [P0][M][TODO] Replace QA report mock data with real linter source.
- `P6-M4-08` [P1][S][TODO] Standardize user-facing error handling patterns.
- `P6-M4-09` [P0][S][TODO] Final smoke test + release checklist pass.

Dependencies:
- `P6-M4-02` depends on `P6-M4-01`.
- `P6-M4-09` depends on all M4 tasks.

---

## 6) Mandatory Smoke Test Checklist (Run at end of each milestone)

1. Open existing project and confirm file/block load is correct.
2. Run translation on one medium file and verify queue status transitions.
3. Verify token/cost/progress metrics update in UI.
4. Validate glossary/TM application on repeated lines.
5. Export translated file and verify Ren'Py formatting integrity.
6. Run restore flow and verify DB + output consistency.
7. Run search/replace and verify expected block updates.
8. Verify no crash on malformed/edge-case lines.
9. Run `typecheck` and `lint`.
10. Confirm no regressions in previous milestone core flow.

---

## 7) Definition of Done - Phase 6

- Default export to `tl/vietnamese` is stable and correct.
- Large-file queue runs are stable and resumable.
- Token/cost reductions are proven by telemetry.
- Global DB GUI management + safe clear/restore workflows are available.
- Noise filtering is reliable with `Hidden` tab and measurable token-waste reduction.
- User-facing UI is fully Vietnamese.
- No mock data remains in core translation workflows.

---

## 8) First Coding Sprint Recommendation (Immediate Next Step)

Start with `M1` tasks in this exact order:
1. `P6-M1-01`
2. `P6-M1-02`
3. `P6-M1-03`
4. `P6-M1-05`
5. `P6-M1-06`
6. `P6-M1-07`
7. `P6-M1-08`
8. `P6-M1-09`

Reason: this sequence gives fast measurable value (token + queue stability) and de-risks all later milestones.
