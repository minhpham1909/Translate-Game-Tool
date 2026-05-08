# MASTER PROJECT CONTEXT: Ren'Py Visual Novel AI Translator

## 1. Project Overview & Product Vision
Ứng dụng desktop tự động hóa dịch thuật cho các file Ren'Py Visual Novel (`.rpy`). Sử dụng AI APIs (Gemini, GPT, Claude) để dịch khối lượng lớn văn bản (100k+ dòng) trong khi vẫn bảo toàn logic game, biến số và định dạng. Bao gồm các tính năng CAT (Computer-Assisted Translation) nâng cao như Translation Memory, Auto-QA và UI tối ưu cho hậu kỳ biên tập.

## 2. Tech Stack & Environment
- **Framework:** Electron built with `electron-vite`
- **Renderer Process (Frontend):** React 19, TypeScript, Tailwind CSS
- **Main Process (Backend):** Node.js
- **Database:** `better-sqlite3` (Bắt buộc để xử lý 100k+ dòng hiệu quả với FTS5)
- **File System:** `fs-extra` cho các thao tác I/O an toàn
- **AI Integration:** `@google/generative-ai` (Core) + Extensible adapter pattern cho OpenAI/Anthropic
- **Architecture Rule:** Strict isolation. Renderer KHÔNG được truy cập filesystem hoặc DB trực tiếp. Tất cả giao tiếp phải qua `ipcMain` và `ipcRenderer` (exposed qua `preload` script)

## 3. Core Domain Rules (CRITICAL FOR REN'PY)
Vi phạm các quy tắc này sẽ làm crash game của người dùng:

1. **Indentation is Code:** Khoảng trắng đầu dòng (spaces/tabs) của dòng gốc PHẢI được giữ nguyên khi parse và áp dụng chinh xác cho dòng dịch khi export
2. **Variable & Tag Preservation:** 
   - `[variables]` (vd: `[player_name]`) và `{tags}` (vd: `{b}`, `{color=#f00}`) KHÔNG được dịch hoặc xóa
   - Escape characters (`\"`, `\n`) phải được bảo toàn
3. **Translation Block Structure:** Target only `game/tl/` directory files
   - *Dialogue:* Extract strings sau `#` comments trong `translate <language> <id>:` blocks
   - *Strings/UI:* Extract strings từ `new "..."` lines trong `translate <language> strings:` blocks
4. **Source = None Handling:** Khi source language là 'None', đọc file từ `game/*.rpy` thay vì `tl/None/` (vì `tl/None/` thường chỉ chứa file hệ thống)
5. **Target ≠ None:** KHÔNG cho phép chọn None làm target language (None là ngôn ngữ gốc, không phải đích dịch)

## 4. Database Schema & Performance Optimization (SQLite)
Để xử lý 100,000+ dòng không bị lag, Backend phải implement:

- **Indexing:** Tạo DB indexes trên `status`, `file_name`, và `block_id`
- **Full-Text Search (FTS5):** Enable FTS5 cho global search cực nhanh trên original và translated texts
- **Transactions:** Wrap batch updates/inserts trong `BEGIN TRANSACTION; ... COMMIT;`
- **Data Model (TranslationBlock):**
  - `id` (PK)
  - `file_name` (vd: "script.rpy")
  - `block_id` (Ren'Py hash)
  - `type` ("dialogue" | "string")
  - `character_id` (vd: "e" - để filter)
  - `original_text`
  - `translated_text`
  - `status` ("empty" | "draft" | "approved" | "warning" | "modified")
  - `indentation` (string of spaces)
  - `line_index` (integer)

## 5. Key System Modules & Features

### 5.1. Project Management
- **Create Project:** Setup wizard với 3 bước (Game folder → Source/Target language → Confirm)
- **Open Project:** Load từ existing DB, KHÔNG parse lại (bảo toàn bản dịch)
- **Delete Project (Hard Delete):**
  - Xóa khỏi recent list ✅
  - Xóa database file (.sqlite, .sqlite-wal, .sqlite-shm) ✅
  - Đóng database trước khi xóa (tránh EBUSY error) ✅
  - Hỏi user có muốn xóa cả file dịch trong `tl/{target}/` ✅
- **Update Game:** Diff game version, preserve existing translations, mark changed blocks as 'modified'
- **Validation:**
  - Target ≠ Source ✅
  - Target ≠ None ✅
  - Game folder tồn tại ✅
  - Source folder hợp lệ (xử lý riêng case None) ✅

### 5.2. Parser & Auto-Tagging
- **parseProject():** Đọc `.rpy` files line-by-line
  - Xử lý case source = None: Quét từ `game/*.rpy` thay vì `tl/None/` ✅
- **parseProjectDiff():** Parse bản game mới và diff với DB cũ ✅
- **previewDiff():** Xem trước thay đổi không modify DB ✅
- **Contextual Awareness:** Auto-tag parsed blocks dựa trên context (vd: blocks trong `screens.rpy` hoặc `strings` blocks được tag là `UI/Menu`; blocks có character ID được tag là `Dialogue`)

### 5.3. Translation Engine & Background Queue
- **Translation Memory (TM):** Trước khi gọi API, kiểm tra TM database. Nếu có exact match, auto-fill để tiết kiệm API costs
- **Background Worker:** Hàng đợi lấy các dòng có `status = 'empty'`, batch chúng (vd: 20 dòng cho context), gửi đến AI, và xử lý rate limiting (Delay/Retry on 429 errors)
- **Multi-Model Support:** UI settings để input API keys và nút "Test Connection" validation
- **Self-Correction:** Tự động sửa lỗi dịch (enable/disable trong Settings)
- **Smart Glossary:** Áp dụng glossary khi dịch (enable/disable trong Settings)
- **Q&A Linter:** Kiểm tra số lượng `[` và `{` trong original vs translation. Nếu không khớp, flag dòng với `[WARNING]` status để review thủ công
- **Skip Approved Blocks:** Khi chọn "Select All" để dịch, TỰ ĐỘNG bỏ qua (skip) các block có `status = 'approved'` (không gọi AI lại) ✅

### 5.4. Frontend UX & Rendering (Performance Critical)
- **Virtual Scrolling:** Sử dụng `react-window` hoặc `react-virtualized` để render lists. KHÔNG bao giờ render 10,000+ DOM nodes cùng lúc
- **Pagination:** Fetch data từ SQLite qua IPC sử dụng `LIMIT` và `OFFSET` hoặc Cursor-based pagination
- **Debounce:** Input fields cho manual editing phải sử dụng 500ms debounce trước khi trigger IPC DB update
- **Filters & Navigation:** Tree View sidebar cho files. Tabs cho filtering statuses (`All`, `Pending`, `Drafts`)

### 5.5. Safe Export & Direct Overwrite (HOTFIX)
- **Pre-flight Analyzer:** Tính toán tổng số pending characters và ước tính API token cost trước khi bắt đầu bulk translation
- **Direct Overwrite Strategy (NEW):** 
  - Target path = Source path (ghi đè chính nó, KHÔNG tạo thư mục tl/{target}/ mới) ✅
  - Rule 1: `targetLanguage` CHỈ dùng để sửa Ren'Py header và làm prompt cho AI
  - Rule 2: Nếu source = `english`, export trực tiếp vào `game/tl/english/` ✅
  - Rule 3: Nếu source = `None`, export trực tiếp vào `game/` ✅
  - Rule 4: LUÔN backup file gốc thành `.backup_[timestamp]` trước khi ghi đè ✅
- **Trojan Horse Export (CRITICAL):** 
  - **GIỮ NGUYÊN header gốc** (vd: `translate english start_123:`) - KHÔNG được thay đổi ✅
  - **CHỈ thay** nội dung text bên trong (original_text → translated_text) ✅
  - **Dialogue:** Giữ nguyên `translate english:`, thay dòng text hội thoại ✅
  - **Strings:** Giữ nguyên `old "..."`, thay `new "..."` bằng bản dịch ✅
  - **Lý do:** Ren'Py tìm block theo header gốc. Đổi header → Ren'Py không tìm thấy → Fallback ngôn ngữ gốc ✅
- **RPYC Deletion (NEW):** Xóa `.rpyc` sau khi export để force recompilation ✅
  - Ren'Py ưu tiên `.rpyc` hơn `.rpy` → Phải xóa để game dùng bản dịch mới
- **Cross-Translation:** Khi target ≠ source, chuyển đổi header `translate source:` thành `translate target:`
- **Safe Exporting:** Khi export, the system MUST:
  1. Backup source file thành `[filename].rpy.backup_[timestamp]` ✅
  2. Re-read source line-by-line và inject các bản dịch `approved` hoặc `draft` từ DB với exact indentation ✅
  3. Ghi đè trực tiếp vào file gốc (Direct Overwrite) ✅
  4. Xóa `.rpyc` cũ để Ren'Py recompile ✅

### 5.6. Notification System
- **NotificationContext:** Quản lý toast notifications toàn ứng dụng ✅
- **Confirm Dialog:** Custom dialog thay thế `window.confirm()`, nhất quán với theme ✅
- **System Log Console:** Real-time terminal UI ở dưới màn hình nhận IPC events (vd: `[INFO] Parsing...`, `[SUCCESS] Batch translated`)

### 5.7. Settings & Configuration
- **Multi-Provider Support:** Gemini, OpenAI Compatible (GPT, DeepSeek, Grok), Claude
- **Migrate Settings:** Tự động migrate từ schema cũ (apiKeys, activeProvider) sang mới (providers.{gemini,openai_compatible,claude}) ✅
- **Theme:** Dark/Light/System
- **Translation Settings:** Temperature, batch size, concurrent requests, cost warning threshold
- **Advanced Features:** Regex blacklist, self-correction, length check, context window size
- **Database Storage:** Custom folder cho SQLite database

### 5.8. Unpacker Service
- **scanCompiledFiles:** Quét game folder tìm file `.rpa` và `.rpyc`
- **runUnpacker:** Tự động unpack `.rpa` và decompile `.rpyc` thành `.rpy`
- **installUnpackerDeps:** Cài đặt dependencies (rupy, python, etc.)

## 6. File Structure & Key Files

### Main Process (Backend)
- `src/main/index.ts` - Entry point, create window, init database, register IPC handlers
- `src/main/ipcHandler.ts` - Tất cả IPC handlers, expose functions cho renderer
- `src/main/api/projectIpc.ts` - Project management (setup, open, delete, scan languages)
- `src/main/api/aiService.ts` - AI service factory, test connection, list models
- `src/main/services/parserService.ts` - Parse `.rpy` files, diff game versions (xử lý source=None ✅)
- `src/main/services/exportService.ts` - Export translations to `tl/{target}/` (xử lý source=None ✅)
- `src/main/services/translationEngine.ts` - Background translation queue
- `src/main/services/glossaryService.ts` - Smart glossary management
- `src/main/services/tmService.ts` - Translation memory
- `src/main/services/searchService.ts` - Global FTS5 search
- `src/main/services/workspaceService.ts` - Workspace operations
- `src/main/services/unpackerService.ts` - Unpack `.rpa`/decompile `.rpyc`
- `src/main/store/database.ts` - SQLite initialization, per-project DB, closeDatabase() ✅
- `src/main/store/settings.ts` - Settings management, migrate legacy schema ✅

### Renderer Process (Frontend)
- `src/renderer/src/App.tsx` - Root component, coordinate WelcomeScreen/CATWorkspace, handle Delete Project ✅
- `src/renderer/src/context/NotificationContext.tsx` - Notification provider + Confirm Dialog ✅
- `src/renderer/src/context/ThemeContext.tsx` - Theme provider
- `src/renderer/src/components/screens/WelcomeScreen.tsx` - Welcome screen, Recent Projects, Delete button ✅
- `src/renderer/src/components/screens/SetupWizardModal.tsx` - 3-step project setup
- `src/renderer/src/components/screens/CATWorkspace.tsx` - Main workspace layout
- `src/renderer/src/components/cat-tool/LeftSidebar.tsx` - File list with progress
- `src/renderer/src/components/cat-tool/TranslationWorkspace.tsx` - Virtualized translation cards
- `src/renderer/src/components/cat-tool/TranslationCard.tsx` - Individual translation block
- `src/renderer/src/components/cat-tool/TopHeader.tsx` - Top bar with project info
- `src/renderer/src/components/cat-tool/BottomBar.tsx` - Progress, API cost, terminal
- `src/renderer/src/components/cat-tool/SettingsModal.tsx` - Settings UI (đã xóa Language Patch ✅)
- `src/renderer/src/components/screens/*.tsx` - Various modals (Export, Update Game, TM Manager, etc.)

### Preload & Types
- `src/preload/index.ts` - Expose IPC methods to renderer ✅
- `src/preload/index.d.ts` - TypeScript declarations ✅
- `src/shared/types.ts` - Shared types, TARGET_LANGUAGES, normalizeLanguageCode ✅

## 7. Recent Major Changes

### Removed: Language Patch Feature
- Xóa hoàn toàn `generateLanguagePatch`, `removeLanguagePatch`, `updateLanguagePatch` khỏi `exportService.ts`
- Xóa IPC handlers, preload references, UI Settings, types
- **Lý do:** Gây lỗi Ren'Py syntax liên tục, không tương thích 100% với mọi game
- **Hướng mới:** Export chuẩn vào `tl/{target}/`, ghi đè file có sẵn, không tạo file mới

### Added: Source = None Handling
- **exportService.ts:** Khi source = None, đọc từ `game/*.rpy` thay vì `tl/None/` ✅
- **parserService.ts:** `parseProject()`, `parseProjectDiff()`, `previewDiff()` xử lý source = None ✅

### Added: Skip Approved Blocks (Translation Engine)
- **translationEngine.ts:** Khi gọi `translateBatchByBlockIds()`, TỰ ĐỘNG lọc bỏ block `status = 'approved'` ✅
- Không lãng phí API costs cho các block đã dịch xong ✅
- Log info: `[AI] Skipped X already-approved block(s)` ✅

### HOTFIX: Direct Overwrite Strategy
- **exportService.ts:** 
  - Target path = Source path (ghi đè chính nó) ✅
  - Xóa `path.join(gameDir, 'tl', targetLanguage)` → target = source ✅
  - LUÔN backup `.backup_[timestamp]` trước khi ghi đè ✅
  - Xóa `fs.ensureDir()` (không cần tạo thư mục mới) ✅
- **database.ts:** Thêm `wal_checkpoint(TRUNCATE)` trước khi đóng DB ✅
- **projectIpc.ts (deleteProject):**
  - Chuyển sang async function ✅
  - Thêm `await new Promise(resolve => setTimeout(resolve, 200))` (CRITICAL FIX cho EBUSY) ✅
  - Đóng DB trước khi xóa file ✅

### HOTFIX: Trojan Horse Export (Header Preservation)
- **exportService.ts:** 
  - **QUAN TRỌNG**: GIỮ NGUYÊN header gốc (vd: `translate english start_123:`) ✅
  - **CHỈ thay** nội dung text bên trong (original_text → translated_text) ✅
  - Xóa mọi logic thay thế `sourceLanguage` bằng `targetLanguage` trong header ✅
  - **Dialogue blocks:** Giữ nguyên header, chỉ thay dòng text hội thoại ✅
  - **String blocks:** Giữ nguyên dòng `old "..."`, thay dòng `new "..."` bằng bản dịch ✅
  - **Lý do:** Ren'Py tìm block theo header gốc. Nếu đổi header → Ren'Py không tìm thấy → Fallback về ngôn ngữ gốc ✅

### HOTFIX: RPYC Deletion (Force Recompilation)
- **exportService.ts:** Thêm xóa `.rpyc` sau khi export ✅
  - Xác định `rpycPath = targetPath + 'c'`
  - Nếu tồn tại → `await fs.remove(rpycPath)`
  - Ren'Py sẽ buộc recompile từ `.rpy` mới thay vì dùng `.rpyc` cũ
- **Lý do:** Ren'Py ưu tiên `.rpyc` (compiled) hơn `.rpy` (source) → Phải xóa `.rpyc` để game hiển thị bản dịch mới
- **projectIpc.ts:** Kiểm tra source folder hợp lệ, xử lý riêng case None ✅

### Added: Hard Delete Project
- Xóa khỏi recent list ✅
- Xóa database file (.sqlite, .sqlite-wal, .sqlite-shm) ✅
- Đóng database trước khi xóa (closeDatabase()) để tránh EBUSY error ✅
- Hỏi user qua NotificationContext Confirm Dialog ✅

### Added: NotificationContext with Confirm Dialog
- Thay thế `window.confirm()` bằng custom dialog ✅
- Tương thích với theme của app ✅
- Có loading state, success/error messages ✅

## 8. Instructions for AI Agent
- ALWAYS write clean, typed TypeScript code
- Implement UI components using Tailwind CSS utility classes
- For DB operations, always use parameterized queries to prevent SQL injection and ensure stability with special characters
- Wait for user instructions on which specific module to build first
- **CRITICAL:** Khi export, LUÔN dùng Direct Overwrite (target = source path), KHÔNG tạo thư mục tl/{target}/ mới
- **CRITICAL:** GIỮ NGUYÊN header Ren'Py gốc (VD: `translate english:`), KHÔNG được thay đổi source/target language trong header (Trojan Horse Strategy)
- **NEW:** Khi xử lý source/target language, LUÔN kiểm tra case None (source = None: đọc từ game/; target ≠ None: chặn chọn None)
- **NEW:** Khi delete project, NHỚ:
  - Đóng database bằng closeDatabase() (có wal_checkpoint)
  - Thêm 200ms delay (setTimeout) để OS release file locks (tránh EBUSY)
  - Xóa cả .sqlite, .sqlite-wal, .sqlite-shm
- **NEW:** Không sử dụng `window.confirm()`, dùng `notify.confirm()` từ NotificationContext
- **NEW:** Khi dịch "Select All", TỰ ĐỘNG skip block đã `approved` (không gọi lại AI) ✅
- **NEW:** Xử lý JSON truncation: Nếu thiếu `]`, thử thêm `"]` để salvage ✅

## 9. Build & Development
```bash
npm run dev        # Development with HMR
npm run build      # Build for production
npm run typecheck  # TypeScript type checking
```

## 10. Validation Rules Summary
- ✅ Target ≠ Source
- ✅ Target ≠ None (None là ngôn ngữ gốc, không phải đích dịch)
- ✅ Game folder tồn tại
- ✅ Source folder hợp lệ (xử lý riêng case None)
- ✅ Database được đóng trước khi xóa (closeDatabase với wal_checkpoint)
- ✅ 200ms delay sau khi đóng DB (tránh EBUSY - CRITICAL)
- ✅ Sử dụng NotificationContext thay vì window.confirm()
- ✅ Direct Overwrite: target = source path (KHÔNG tạo file mới)
- ✅ LUÔN backup `.backup_[timestamp]` trước khi ghi đè
