# PROJECT SUMMARY: Ren'Py Visual Novel AI Translator

## 1. Tổng Quan Dự Án

**VN Translate Tool** là ứng dụng desktop CAT (Computer-Assisted Translation) mã nguồn mở dành cho dịch thuật Visual Novel engine Ren'Py. Sử dụng AI APIs (Gemini, GPT, Claude) để tự động dịch khối lượng lớn văn bản (100k+ dòng) trong khi vẫn bảo toàn logic game, biến số, tags Ren'Py và cấu trúc indent.

**Công nghệ:** Electron + electron-vite | React 19 + TypeScript + Tailwind CSS | better-sqlite3 | AI APIs (Gemini/OpenAI/Claude)

**Nguyên tắc kiến trúc:** Renderer KHÔNG được truy cập filesystem hoặc DB trực tiếp. Mọi giao tiếp qua `ipcMain` / `ipcRenderer` thông qua `preload` script (`contextBridge`).

---

## 2. Core Domain Rules (Ren'Py)

1. **Indentation là code** — Khoảng trắng đầu dòng phải giữ nguyên khi parse và export
2. **Variable & Tag Preservation** — `[variables]` và `{tags}` không được dịch/xóa; escape chars (`\"`, `\n`) phải bảo toàn
3. **Translation Block Structure** — Dialogue: extract từ `translate <lang> <id>:` block; Strings: extract từ `new "..."` lines
4. **Source = None** — Đọc từ `game/*.rpy` thay vì `tl/None/`
5. **Target ≠ None** — Không cho phép chọn None làm ngôn ngữ đích

---

## 3. Database Schema (SQLite)

Bảng `files`:
- `id`, `file_path`, `file_name`, `total_blocks`, `translated_blocks`, `status`, `updated_at`

Bảng `translation_blocks`:
- `id`, `file_id` (FK), `block_hash`, `block_type` (dialogue|string), `character_id`, `original_text`, `translated_text`, `status` (empty|draft|approved|warning|modified), `indentation`, `line_index`, `translated_by`

Bảng `translation_memory`:
- `id`, `original_text` (UNIQUE), `translated_text`, `usage_count`, `last_used_at`

Bảng `glossaries`:
- `id`, `source_text` (UNIQUE), `target_text`, `notes`, `enabled`, `created_at`

Indexes: `idx_files_status`, `idx_blocks_file_id`, `idx_blocks_status`, `idx_blocks_character`

WAL mode + foreign_keys ON + cache_size=-4000 + synchronous=NORMAL.

---

## 4. Code Structure

### 4.1. File Tree

```
src/
├── shared/
│   └── types.ts
├── main/
│   ├── index.ts
│   ├── ipcHandler.ts
│   ├── api/
│   │   ├── aiService.ts
│   │   ├── errors.ts
│   │   ├── projectIpc.ts
│   │   └── translators/
│   │       └── OpenAICompatibleTranslator.ts
│   ├── parser/
│   │   └── rpyParser.ts
│   ├── services/
│   │   ├── exportService.ts
│   │   ├── glossaryService.ts
│   │   ├── parserService.ts
│   │   ├── searchService.ts
│   │   ├── tmService.ts
│   │   ├── translationEngine.ts
│   │   ├── unpackerService.ts
│   │   └── workspaceService.ts
│   ├── store/
│   │   ├── database.ts
│   │   └── settings.ts
│   ├── utils/
│   │   ├── fileUtils.ts
│   │   ├── ipcBroadcast.ts
│   │   ├── jsonParser.ts
│   │   ├── langDetector.ts
│   │   ├── qaLinter.ts
│   │   ├── regexBlacklist.ts
│   │   ├── selfCorrection.ts
│   │   ├── smartGlossary.ts
│   │   └── unpackBroadcast.ts
│   └── python-tools/
│       └── unpacker.py
├── preload/
│   ├── index.ts
│   └── index.d.ts
└── renderer/
    ├── index.html
    └── src/
        ├── main.tsx
        ├── App.tsx
        ├── env.d.ts
        ├── lib/
        │   └── utils.ts
        ├── assets/
        │   ├── base.css
        │   ├── globals.css
        │   ├── main.css
        │   ├── electron.svg
        │   └── wavy-lines.svg
        ├── context/
        │   ├── NotificationContext.tsx
        │   └── ThemeContext.tsx
        └── components/
            ├── Versions.tsx
            ├── ui/
            │   ├── badge.tsx
            │   ├── button.tsx
            │   ├── dialog.tsx
            │   ├── input.tsx
            │   ├── label.tsx
            │   ├── notification-toast.tsx
            │   ├── progress.tsx
            │   ├── scroll-area.tsx
            │   ├── select.tsx
            │   ├── slider.tsx
            │   ├── switch.tsx
            │   ├── textarea.tsx
            │   └── tooltip.tsx
            ├── screens/
            │   ├── WelcomeScreen.tsx
            │   ├── SetupWizardModal.tsx
            │   ├── ExportModal.tsx
            │   ├── GlossaryModal.tsx
            │   ├── TMManagerModal.tsx
            │   ├── SearchReplaceModal.tsx
            │   ├── QAReportModal.tsx
            │   ├── PreflightModal.tsx
            │   ├── UpdateGameModal.tsx
            │   └── KeyboardShortcutsModal.tsx
            └── cat-tool/
                ├── TopHeader.tsx
                ├── LeftSidebar.tsx
                ├── TranslationWorkspace.tsx
                ├── TranslationCard.tsx
                ├── FloatingActionBar.tsx
                ├── BottomBar.tsx
                └── SettingsModal.tsx
```

### 4.2. Chi Tiết Từng File

#### Shared Layer

| File | Vai trò |
|------|---------|
| `src/shared/types.ts` | Định nghĩa toàn bộ TypeScript interfaces dùng chung: `TranslationBlock`, `FileRecord`, `ProjectConfig`, `AppSettings`, `GlossaryRecord`, `BackupEntry`, `ExportFileEntry`, `BlacklistPattern`, `RecentProject`. Hàm tiện ích: `getLanguageLabel()`, `normalizeLanguageCode()`, và `TARGET_LANGUAGES`. |

#### Main Process — Entry & IPC

| File | Vai trò |
|------|---------|
| `src/main/index.ts` | Entry point Electron main process. Tạo `BrowserWindow`, khởi tạo database, register IPC handlers, quản lý app lifecycle (ready, window-all-closed, activate). |
| `src/main/ipcHandler.ts` | Đăng ký tất cả `ipcMain.handle()` cho renderer-to-main communication. Bridge toàn bộ operations: project, glossary, TM, search/replace, workspace, translation engine, AI service, settings, unpack, export, backup. |

#### Main Process — API Layer

| File | Vai trò |
|------|---------|
| `src/main/api/projectIpc.ts` | Quản lý vòng đời project: `setupProject()` (parse .rpy, tạo DB), `openProject()` (load từ DB cũ), `deleteProject()` (xóa DB + recent list + 200ms delay EBUSY fix), `scanAvailableLanguages()` (quét game/tl/). Gọi `recoverOrphanedTasks()` sau init DB. Gọi `vacuumDatabase()` trước close DB khi xóa. |
| `src/main/api/aiService.ts` | Central AI translation manager. Unified interface cho Gemini, OpenAI-compatible, Claude. Hybrid prompt architecture cho dialogue vs string translation. Build context batches, handle AI API calls. Test connection + list models. |
| `src/main/api/errors.ts` | Custom error types: `RateLimitError`, `TokenLimitError`, `ParsingError`, `APIError`. `normalizeError()` helper để Queue Manager xác định chiến lược retry. |
| `src/main/api/translators/OpenAICompatibleTranslator.ts` | Universal adapter cho OpenAI-compatible endpoints (OpenAI, DeepSeek, Grok, OpenRouter, Ollama, vLLM, LM Studio). Dùng native fetch, robust JSON extraction cho LLM responses. |

#### Main Process — Parser

| File | Vai trò |
|------|---------|
| `src/main/parser/rpyParser.ts` | Parse Ren'Py .rpy file → `TranslationBlock[]`. Xử lý dialogue blocks, string blocks, image/system placeholders. `importRpyToDatabase()` (fresh import), `importRpyToDatabaseDiff()` (diff cho game update). |

#### Main Process — Services

| File | Vai trò |
|------|---------|
| `src/main/services/parserService.ts` | Orchestrator parse: `parseProject()` (quét dir + gọi rpyParser + áp dụng dirty source hotfix), `parseProjectDiff()` (diff game version), `previewDiff()` (dry run). Xử lý source=None. |
| `src/main/services/exportService.ts` | Export translations → .rpy files. `exportFile()`: write permission check, backup `.backup_[timestamp]`, Trojan Horse export (giữ nguyên header), Direct Overwrite, xóa .rpyc. `exportAllFiles()`, `exportSelectedFiles()`, `getFilesWithChanges()`, `listBackups()`, `restoreFileBackup()`. |
| `src/main/services/translationEngine.ts` | Core translation engine: queue management, batch AI calls, retry logic (exponential backoff), error categorization, self-correction, blacklist filtering, glossary injection, QA linting, TM check. Skip approved blocks tự động. |
| `src/main/services/glossaryService.ts` | CRUD cho glossary entries (`glossaries` table): `getAllGlossaries()`, `addGlossary()`, `updateGlossary()`, `deleteGlossary()`, `setGlossaryEnabled()`. |
| `src/main/services/tmService.ts` | Translation Memory service: `getTMMemory()`, `deleteTMMemory()`, `clearUnusedTM()`, `searchTM()` (fuzzy match). |
| `src/main/services/searchService.ts` | Full-text search qua SQLite. Hỗ trợ match case, whole word, regex modes, batch replace. |
| `src/main/services/workspaceService.ts` | Workspace queries: `getFiles()` (file list), `getBlocks()` (blocks by file_id with filters), `updateBlockTranslation()`, `approveBlock()`, `revertBlock()`. |
| `src/main/services/unpackerService.ts` | Phát hiện .rpa archives và .rpyc compiled scripts, spawn Python subprocess (`unpacker.py`) để extract/decompile. `installUnpackerDeps()`. |

#### Main Process — Store

| File | Vai trò |
|------|---------|
| `src/main/store/database.ts` | SQLite manager (better-sqlite3). `initDatabase()` (per-project DB, WAL mode, schema setup, integrity check), `getDatabase()`, `closeDatabase()` (wal_checkpoint TRUNCATE), `recoverOrphanedTasks()` (reset translating→empty), `vacuumDatabase()` (VACUUM reclaim space). |
| `src/main/store/settings.ts` | Global settings (electron-store): AppSettings (providers, blacklist, prompt templates, TM, theme, custom DB folder), ProjectConfig per project, migrate legacy schema. |

#### Main Process — Utils

| File | Vai trò |
|------|---------|
| `src/main/utils/fileUtils.ts` | `scanDirectoryForRpy()` (recursive scan .rpy), `readFileLines()` (read file → string[], UTF-8), `writeFileLines()` (string[] → write file, UTF-8). |
| `src/main/utils/ipcBroadcast.ts` | `broadcastToAllWindows()` — IPC broadcast events tới mọi BrowserWindow. Helpers cho engine progress và system log events. |
| `src/main/utils/jsonParser.ts` | Robust JSON parser cho LLM responses: xử lý markdown fences, conversational filler, malformed output. `extractJsonArray()` là primary export. |
| `src/main/utils/langDetector.ts` | Heuristic language detection (không thư viện ngoài). Phát hiện Vietnamese (diacritics), Japanese (kana/kanji). Dùng để skip "dirty source" blocks. |
| `src/main/utils/qaLinter.ts` | QA Linter: validate brackets, quotes, HTML-like tags, Ren'Py text tags consistency, glossary compliance, length overflow. Trả về `QAIssue[]`. |
| `src/main/utils/regexBlacklist.ts` | Regex blacklist: auto-skip non-translatable strings (empty, image placeholders, numbers, punctuation-only). Tiết kiệm tokens. |
| `src/main/utils/selfCorrection.ts` | AI Self-Correction engine: categorize linter errors by severity, progressive correction prompts (attempt 0/1/2), `shouldRetry()` decision logic. |
| `src/main/utils/smartGlossary.ts` | Smart Glossary Injection: filter glossary terms relevant to current batch, case-insensitive substring match, word-boundary awareness. |
| `src/main/utils/unpackBroadcast.ts` | IPC event broadcasting cho unpacker progress. `UnpackProgressEvent` interface + `emitUnpackProgress()`. |

#### Python Tools

| File | Vai trò |
|------|---------|
| `src/main/python-tools/unpacker.py` | Python script unpack .rpa (rpatool) + decompile .rpyc (unrpyc). Invoked as subprocess bởi unpackerService. |

#### Preload Layer

| File | Vai trò |
|------|---------|
| `src/preload/index.ts` | contextBridge expose `window.api` cho renderer. Wrapper tất cả IPC channels: project, blocks, translation engine, AI, glossary, TM, search/replace, settings, unpack, export, system. |
| `src/preload/index.d.ts` | TypeScript declarations cho `window.api` + `ElectronAPI` interface. Định nghĩa `WorkspaceFile`, `WorkspaceBlock`, `PreflightResult`, `QAIssue` types. |

#### Renderer — Entry & Core

| File | Vai trò |
|------|---------|
| `src/renderer/index.html` | HTML entry point. Load Inter + JetBrains Mono fonts. `<div id="root">` + import main.tsx. |
| `src/renderer/src/main.tsx` | React entry point. Import globals.css, render `<App />` trong StrictMode. |
| `src/renderer/src/App.tsx` | Root component. Orchestrate WelcomeScreen ↔ CATWorkspace. Quản lý modal state (SetupWizard, Preflight, Export, QA Report, TM Manager, Glossary, Search/Replace, Keyboard Shortcuts, Update Game, Settings). Xử lý project loading, file selection, block editing, batch operations, keyboard shortcuts. |
| `src/renderer/src/env.d.ts` | Vite client type reference. |
| `src/renderer/src/lib/utils.ts` | `cn()` function: merge Tailwind CSS classes (clsx + tailwind-merge). |

#### Renderer — Context

| File | Vai trò |
|------|---------|
| `src/renderer/src/context/NotificationContext.tsx` | Global notification/toast system. `addNotification()`, `removeNotification()`, `confirm()` (promise-based confirm dialog thay thế window.confirm()). success/error/warning/info types. |
| `src/renderer/src/context/ThemeContext.tsx` | Theme management (dark/light/system). Persist qua localStorage, apply `dark`/`light` class lên `<html>`. |

#### Renderer — Screens

| File | Vai trò |
|------|---------|
| `src/renderer/src/components/screens/WelcomeScreen.tsx` | Welcome/home screen: New Project button, Open Project button, recent projects list (progress bars), API key warning. |
| `src/renderer/src/components/screens/SetupWizardModal.tsx` | 3-step wizard: Step 1 (game folder), Step 2 (source language scan từ tl/), Step 3 (target language + confirm parse). |
| `src/renderer/src/components/screens/ExportModal.tsx` | Export modal: file list (progress bars), export options (approved only), progress bar, terminal log, backup list + restore. |
| `src/renderer/src/components/screens/GlossaryModal.tsx` | Glossary management: search, add/edit/delete terms, toggle enable/disable, inline editing. |
| `src/renderer/src/components/screens/TMManagerModal.tsx` | Translation Memory manager: list entries, search, delete, clear unused. |
| `src/renderer/src/components/screens/SearchReplaceModal.tsx` | Search/replace modal: match case, whole word, regex modes, match count, prev/next, batch replace. |
| `src/renderer/src/components/screens/QAReportModal.tsx` | QA Linter report: tag format errors table, clickable navigation tới block. |
| `src/renderer/src/components/screens/PreflightModal.tsx` | Pre-flight confirmation: pending block count, estimated characters, estimated USD cost. |
| `src/renderer/src/components/screens/UpdateGameModal.tsx` | 4-step game update flow: instructions → select new folder → preview diff → apply. |
| `src/renderer/src/components/screens/KeyboardShortcutsModal.tsx` | Keyboard shortcuts reference, grouped by category với `<kbd>` styling. |

#### Renderer — CAT Tool

| File | Vai trò |
|------|---------|
| `src/renderer/src/components/cat-tool/TopHeader.tsx` | Top bar: breadcrumb (game folder / file name), action buttons (QA, Search, Settings, Export, Glossary, TM, Shortcuts, Update Game, Back), theme toggle. |
| `src/renderer/src/components/cat-tool/LeftSidebar.tsx` | File explorer sidebar: .rpy files list với progress bars + status icons, filter by filename, language info, file count summary. |
| `src/renderer/src/components/cat-tool/TranslationWorkspace.tsx` | Main workspace: filter tabs (all/empty/draft/approved/warning/skipped), virtualized TranslationCard list (scroll-to-render ~20 items). |
| `src/renderer/src/components/cat-tool/TranslationCard.tsx` | Translation block card: original text (left), translation textarea (right), status badge, warning messages, action buttons (AI Translate, Revert, Approve). 500ms debounce. |
| `src/renderer/src/components/cat-tool/FloatingActionBar.tsx` | Floating toolbar khi multi-select: batch translate, batch approve, select all, clear selection. |
| `src/renderer/src/components/cat-tool/BottomBar.tsx` | Status bar: translation progress (X/Y, %), estimated API cost, collapsible console terminal (real-time IPC logs). |
| `src/renderer/src/components/cat-tool/SettingsModal.tsx` | Settings modal (4 tabs): AI & API (provider, keys, models, base URL, custom headers), Prompt & Logic (system prompt, glossary prompts, blacklist), TM (enable, fuzzy threshold), System (theme, custom DB folder). |

#### Renderer — UI Primitives (Radix-based)

| File | Vai trò |
|------|---------|
| `components/ui/dialog.tsx` | Radix Dialog (trigger, portal, overlay, content, header, footer, title, description) |
| `components/ui/button.tsx` | Button (default/destructive/outline/secondary/ghost/link variants, sizes) |
| `components/ui/badge.tsx` | Badge (default/secondary/destructive/outline) |
| `components/ui/input.tsx` | Input primitive |
| `components/ui/textarea.tsx` | Textarea (resize-none) |
| `components/ui/label.tsx` | Radix Label |
| `components/ui/select.tsx` | Radix Select (group, value, trigger, content, label, item, separator, scroll) |
| `components/ui/switch.tsx` | Radix Switch toggle |
| `components/ui/slider.tsx` | Radix Slider (Temperature, Fuzzy threshold) |
| `components/ui/progress.tsx` | Radix Progress bar (custom indicatorClassName) |
| `components/ui/scroll-area.tsx` | Radix ScrollArea (custom scrollbar) |
| `components/ui/tooltip.tsx` | Radix Tooltip (provider, trigger, content) |
| `components/ui/notification-toast.tsx` | Toast notification (top-right, stack, auto-dismiss, progress bar, color-coded) |

---

## 5. Luồng Chạy (Application Flow)

### 5.1. Khởi động App
```
main/index.ts
  └─ initDatabase() → database.ts (WAL mode, schema setup, FTS cleanup)
  └─ registerIpcHandlers() → ipcHandler.ts
  └─ createWindow() → load renderer/index.html
```

### 5.2. Tạo Project Mới (Setup Wizard)
```
WelcomeScreen → SetupWizardModal
  └─ Step 1: User chọn game folder
  └─ Step 2: scanAvailableLanguages() → quét game/tl/ → list source languages
  └─ Step 3: User chọn target language → setupProject()
       └─ projectIpc.ts: validate (target ≠ source, target ≠ None, folder exists)
       └─ initDatabase() → tạo per-project DB (vnt_<GameName>.sqlite)
       └─ recoverOrphanedTasks() → reset blocks kẹt
       └─ parserService.parseProject()
            └─ getAllFiles() → quét .rpy files
            └─ rpyParser.parseRpyFile() → parse từng file
            └─ applyDirtySourceHotfix() → auto-approve nếu đã dịch
            └─ importRpyToDatabase() → batch insert vào DB
       └─ saveProjectConfig() + addRecentProject()
```

### 5.3. Open Project
```
WelcomeScreen → Open recent project → openProject()
  └─ projectIpc.ts: initDatabase() (load existing DB, không parse lại)
  └─ recoverOrphanedTasks()
  └─ addRecentProject()
  └─ CATWorkspace render: LeftSidebar (files) → TranslationWorkspace (blocks)
```

### 5.4. Translation Flow
```
User click "AI Translate" (single block) hoặc "Translate All" (batch)
  └─ PreflightModal: tính toán chi phí
  └─ translationEngine.ts:
       1. Lấy blocks có status = 'empty'
       2. Skip blocks 'approved' (nếu Translate All)
       3. Kiểm tra Translation Memory (TM)
       4. regexBlacklist filter
       5. Smart Glossary injection
       6. Batch gửi AI API (với retry logic)
       7. jsonParser.extractJsonArray() → parse response
       8. qaLinter → validate tags consistency
       9. selfCorrection → nếu lỗi, gửi lại prompt correction
      10. Update DB: translated_text + status (draft/approved/warning)
      11. Broadcast progress qua IPC → BottomBar console
```

### 5.5. Export Translation
```
ExportModal → exportFile() hoặc exportAllFiles()
  └── exportService.ts:
       1. Xác định sourcePath + targetPath (Direct Overwrite)
       2. Write Permission Pre-flight Check (.vnt_write_test)
       3. Backup: copy file → .backup_[timestamp]
       4. Đọc source line-by-line
       5. Trojan Horse: GIỮ NGUYÊN header, CHỈ thay text
            - Dialogue: giữ translate <lang> <id>: header
            - Strings: giữ old "...", thay new "..."
       6. Ghi đè file (utf8)
       7. Xóa .rpyc (force Ren'Py recompile)
       8. Update file status = 'completed'
```

### 5.6. Xóa Project
```
WelcomeScreen → Delete → confirm dialog
  └── deleteProject():
       1. Xóa khỏi recent list
       2. vacuumDatabase() → reclaim disk space
       3. closeDatabase() (wal_checkpoint TRUNCATE)
       4. 200ms delay (EBUSY fix)
       5. Xóa .sqlite + .sqlite-wal + .sqlite-shm
       6. (Optional) Xóa tl/{target}/
```

### 5.7. Update Game (Diff)
```
User có bản game mới → UpdateGameModal
  └── parserService.previewDiff() → dry run
  └── parserService.parseProjectDiff() → diff real
       └── rpyParser.importRpyToDatabaseDiff()
       └── Blocks mới → status = 'empty'
       └── Blocks thay đổi → status = 'modified' (giữ translated_text cũ)
       └── Blocks xóa → xóa khỏi DB
```

---

## 6. Các Bản Vá (Hotfixes)

### 6.1. Trojan Horse Export (Header Preservation)

**Vấn đề:** Khi export, exporter thay đổi header `translate english start_123:` → `translate vietnamese start_123:`. Ren'Py không tìm thấy block `translate english:` → fallback về ngôn ngữ gốc.

**Giải pháp:** GIỮ NGUYÊN header gốc, CHỈ thay nội dung text bên trong (original_text → translated_text từ SQLite). Dialogue blocks: giữ header, thay dòng hội thoại. String blocks: giữ `old "..."`, thay `new "..."`.

**File:** `src/main/services/exportService.ts`

**Rule:** "Outer shell (Header) = Source Language. Inner content (String) = Target Language."

### 6.2. RPYC Deletion (Force Recompilation)

**Vấn đề:** Ren'Py ưu tiên `.rpyc` (compiled) hơn `.rpy` (source). Ghi đè .rpy không đủ → game vẫn hiển thị ngôn ngữ cũ.

**Giải pháp:** Sau khi ghi đè .rpy thành công, xóa file .rpyc tương ứng (`targetPath + 'c'`) để Ren'Py buộc recompile từ .rpy mới.

**File:** `src/main/services/exportService.ts` (sau bước write file)

### 6.3. Dirty Source Hotfix (Pre-translated Files)

**Vấn đề:** Direct Overwrite strategy → file game đã bị sửa bởi lần translate trước. Parser trích xuất text tiếng Việt đưa vào `original_text` với status `empty`. User click "Translate All" → AI dịch tiếng Việt → tiếng Việt, lãng phí tokens + hallucination.

**Giải pháp:**
1. **Parser layer** (`parserService.ts`): Sau khi parse, chạy `isAlreadyTranslated()` cho mỗi block. Nếu text đã ở target language → set `status = 'approved'`, `translated_text = original_text`.
2. **Safety net** (`translationEngine.ts`): Khi pull batch, double-check lại.

**File mới:** `src/main/utils/langDetector.ts` — heuristic regex detection (Vietnamese diacritics, Japanese kana/kanji).

### 6.4. Direct Overwrite Strategy

**Vấn đề:** Export tạo thư mục `tl/{target}/` mới, gây lỗi cấu trúc Ren'Py project.

**Giải pháp:** Target path = Source path (ghi đè chính nó). KHÔNG tạo thư mục mới. LUÔN backup `.backup_[timestamp]` trước khi ghi.

**File:** `src/main/services/exportService.ts`

### 6.5. Source = None Handling

**Vấn đề:** Khi source language là 'None' (ngôn ngữ gốc), đọc từ `tl/None/` sẽ sai vì `tl/None/` chỉ chứa file hệ thống.

**Giải pháp:** Khi source = None, đọc từ `game/*.rpy` thay vì `tl/None/`. Áp dụng ở cả parser, diff, preview và export.

**Files:** `parserService.ts`, `exportService.ts`

### 6.6. Skip Approved Blocks

**Vấn đề:** Khi chọn "Select All" để dịch, AI gọi lại các block đã `approved`, lãng phí API costs.

**Giải pháp:** Tự động lọc bỏ block `status = 'approved'` khi gọi `translateBatchByBlockIds()`. Log `[AI] Skipped X already-approved block(s)`.

**File:** `src/main/services/translationEngine.ts`

### 6.7. Orphaned Tasks Recovery

**Vấn đề:** App crash/force close trong khi AI queue đang chạy → block kẹt ở `translating`/`in_progress` vĩnh viễn.

**Giải pháp:** Khi load project (setup hoặc open), chạy `UPDATE translation_blocks SET status = 'empty' WHERE status IN ('translating', 'in_progress')`.

**File:** `src/main/store/database.ts` (hàm `recoverOrphanedTasks()`), gọi từ `projectIpc.ts`

### 6.8. Database Vacuuming

**Vấn đề:** FTS5 + WAL mode → DB file phình to do frequent updates/deletes.

**Giải pháp:** Gọi `VACUUM` sau khi hard delete project để reclaim disk space.

**File:** `src/main/store/database.ts` (hàm `vacuumDatabase()`), gọi từ `projectIpc.ts`

### 6.9. Write Permission Pre-flight Check

**Vấn đề:** Game trong `C:\Program Files` từ chối ghi nếu không Admin rights → export thất bại giữa chừng.

**Giải pháp:** Trước export, tạo file `.vnt_write_test` trong target directory → nếu lỗi EPERM/EACCES → abort với message: "Write permission denied. Please run the app as Administrator or move the game folder to a different location."

**File:** `src/main/services/exportService.ts`

### 6.10. Hard Delete Project

**Vấn đề:** Xóa project không đúng cách để lại DB file + WAL/SHM + EBUSY error.

**Giải pháp:**
1. Đóng DB bằng `closeDatabase()` (có `wal_checkpoint(TRUNCATE)`)
2. `await new Promise(resolve => setTimeout(resolve, 200))` — OS release file locks
3. Xóa `.sqlite` + `.sqlite-wal` + `.sqlite-shm`
4. Dùng NotificationContext confirm dialog (không `window.confirm()`)

**File:** `src/main/api/projectIpc.ts` (hàm `deleteProject()`)

### 6.11. NotificationContext + Confirm Dialog

**Vấn đề:** `window.confirm()` không consistent với theme app, không có loading state.

**Giải pháp:** Custom confirm dialog trong NotificationContext. Hỗ trợ loading state, success/error messages, promise-based API (`notify.confirm()`).

**File:** `src/renderer/src/context/NotificationContext.tsx`

---

## 7. Build & Development

```bash
npm run dev            # Development with HMR
npm run build          # Build for production
npm run typecheck      # TypeScript type checking
npm run typecheck:node # Main process only
npm run typecheck:web  # Renderer process only
```

---

## 8. Validation Rules Summary

| Rule | Trạng thái |
|------|-----------|
| Target ≠ Source | ✅ |
| Target ≠ None (None là ngôn ngữ gốc) | ✅ |
| Game folder tồn tại | ✅ |
| Source folder hợp lệ (xử lý case None) | ✅ |
| Database đóng trước khi xóa (wal_checkpoint TRUNCATE) | ✅ |
| 200ms delay sau đóng DB (EBUSY) | ✅ |
| Dùng NotificationContext thay vì window.confirm() | ✅ |
| Direct Overwrite: target = source path | ✅ |
| Trojan Horse: giữ nguyên header gốc | ✅ |
| Backup `.backup_[timestamp]` trước ghi đè | ✅ |
| Xóa .rpyc sau export (force recompile) | ✅ |
| Dirty Source Hotfix (langDetector) | ✅ |
| Skip Approved blocks khi Translate All | ✅ |
| Orphaned Tasks Recovery (reset translating→empty) | ✅ |
| Database Vacuuming sau delete project | ✅ |
| Write Permission Pre-flight Check | ✅ |
| Strict UTF-8 encoding cho mọi fs I/O | ✅ |
