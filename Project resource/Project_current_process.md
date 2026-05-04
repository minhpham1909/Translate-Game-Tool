# 📊 PROJECT CURRENT PROCESS — VN Translator

> **Tổng hợp trạng thái thực tế của dự án tại thời điểm 2026-05-04**
> Dựa trên việc đọc trực tiếp toàn bộ source code (không chỉ log tiến độ).

---

## 1. TỔNG QUAN

**Tên dự án:** VN Translator (Ren'Py Visual Novel AI Translator)
**Framework:** Electron + electron-vite + React 19 + TypeScript + Tailwind CSS
**Database:** better-sqlite3 (WAL mode, FTS5)
**Settings:** electron-store (JSON file)
**AI Providers:** Gemini, GPT/OpenAI, Claude, DeepSeek, Grok (Adapter Pattern)

---

## 2. TIẾN ĐỘ TỔNG THỂ

| Phase | Trạng thái | Mô tả |
|-------|-----------|-------|
| Phase 0: Database & Nền tảng | ✅ HOÀN THÀNH | SQLite schema, tables, triggers, FTS5 |
| Phase 1: Rpy Parser | ✅ HOÀN THÀNH | State Machine parser, Cross-Translation support |
| Phase 2: Translation Engine | ✅ HOÀN THÀNH | AI Service (5 providers), Queue, TM cache, Rate limit |
| Phase 3: Utilities & Export | ✅ HOÀN THÀNH | QA Linter, Export Service, Project Setup |
| Phase 4E: IPC Bridge + UI | ⚠️ MỘT PHẦN | IPC handlers đầy đủ, UI components đầy đủ, nhưng nhiều modal chưa nối API thật |
| Phase 5: Hoàn thiện & Polish | 🔒 CHƯA BẮT ĐẦU | — |

---

## 3. BACKEND (Main Process) — CHI TIẾT TỪNG MODULE

### 3.1 Database (`src/main/store/database.ts`)
- ✅ Khởi tạo SQLite trong `app.getPath('userData')/db/translation_project.sqlite`
- ✅ 6 bảng: `files`, `translation_blocks`, `translation_memory`, `blocks_fts` (FTS5), `glossaries`
- ✅ 3 triggers auto-sync FTS table
- ✅ Migration check: cột `translated_by` tự động thêm nếu thiếu
- ✅ WAL mode + Foreign Keys ON

### 3.2 Settings (`src/main/store/settings.ts`)
- ✅ `electron-store` lưu 3 nhóm: `settings` (AppSettings), `project` (ProjectConfig), `recentProjects`
- ✅ 5 nhóm settings: AI & API, Prompting, Queue, TM, System UI
- ✅ CRUD cho ProjectConfig, RecentProjects (tối đa 8 projects)
- ✅ Default: `gemini`, `gemini-2.5-flash`, temperature 0.2, batchSize 20

### 3.3 Parser (`src/main/parser/rpyParser.ts` + `src/main/services/parserService.ts`)
- ✅ State Machine parser: 3 trạng thái (OUTSIDE, IN_DIALOGUE_BLOCK, IN_STRING_BLOCK)
- ✅ Cross-Translation: Bỏ qua dòng comment (`#`), trích xuất dòng active string
- ✅ Bảo toàn `indentation` (critical cho Ren'Py)
- ✅ Hỗ trợ `dialogue` blocks (có character_id, block_hash) và `string` blocks (new/old)
- ✅ Import vào DB qua Transaction (Bulk Insert)
- ✅ `parserService.parseProject()`: Quét đệ quy thư mục `game/tl/<sourceLanguage>/*.rpy`
- ✅ Reset workspace tables trước khi parse lại

### 3.4 AI Service (`src/main/api/aiService.ts`)
- ✅ Adapter Pattern: interface `IAITranslator`
- ✅ 5 Translator implementations:
  - `GeminiTranslator` — dùng `@google/generative-ai`, JSON schema response
  - `GPTTranslator` — OpenAI API compatible (hỗ trợ custom endpoint)
  - `ClaudeTranslator` — Anthropic API
  - `DeepSeekTranslator` — DeepSeek API
  - `GrokTranslator` — xAI API
- ✅ Hybrid Prompting: Part A (hardcoded technical rules) + Part B (user custom prompt + glossary)
- ✅ `AIService.listModels()`: Fetch danh sách model từ API (có fallback defaults)
- ✅ Validate array length match (input vs output)

### 3.5 Translation Engine (`src/main/services/translationEngine.ts`)
- ✅ `translateBatchByBlockIds()`: Dịch theo danh sách block ID
  - Phase 1: Check TM exact hit → auto-fill (không gọi API)
  - Phase 2: AI call cho TM misses → lưu DB + upsert TM
  - QA Linter auto-check sau mỗi bản dịch
- ✅ `startBackgroundQueue()`: Vòng lặp tự động dịch tất cả block `empty`
  - Exponential backoff cho lỗi 429 (2s → 4s → 8s)
  - AbortController support (dừng queue)
  - Broadcast progress + log events
- ✅ `startQueue()` / `stopQueue()`: Wrapper với state management
- ✅ `preFlightAnalyzer()`: Đếm pending blocks + estimated characters
- ✅ Glossary tự động inject vào prompt

### 3.6 QA Linter (`src/main/utils/qaLinter.ts`)
- ✅ `validateTranslation()`: Kiểm tra missing/extra variables `[...]` và tags `{...}`
- ✅ Trả về mảng error messages (rỗng = pass)

### 3.7 Export Service (`src/main/services/exportService.ts`)
- ✅ `exportFile()`: Cross-Translation export
  - Đọc source file từ `game/tl/<sourceLanguage>/`
  - Đổi header `translate <source>` → `translate <target>`
  - Ghi bản dịch vào target file với exact indentation
  - Auto backup file cũ trước khi ghi
  - Fallback: warning/empty blocks → giữ nguyên bản gốc
- ✅ `restoreBackup()`: Khôi phục từ backup file

### 3.8 Project IPC (`src/main/api/projectIpc.ts`)
- ✅ `scanAvailableLanguages()`: Quét `game/tl/` trả về danh sách ngôn ngữ
- ✅ `setupProject()`: Validate → Parse → Save config → Add to recent
- ✅ `getCurrentProject()`, `getRecentProjects()`

### 3.9 Workspace Service (`src/main/services/workspaceService.ts`)
- ✅ `getWorkspaceFiles()`: Lấy danh sách files + progress
- ✅ `getBlocksByFile()`: Lấy blocks của 1 file (ORDER BY line_index)
- ✅ `updateBlockTranslation()`: Cập nhật translation + status + auto update file stats

### 3.10 Glossary Service (`src/main/services/glossaryService.ts`)
- ✅ CRUD đầy đủ: `getAll`, `add`, `update`, `delete`

### 3.11 TM Service (`src/main/services/tmService.ts`)
- ✅ `getTMEntries()` (limit 1000), `deleteTMEntry`, `clearUnusedTM` (usage_count <= 1)
- ✅ `searchTM()` (LIKE query, limit 5)
- ✅ `upsertTM()` (INSERT ... ON CONFLICT)

### 3.12 Search Service (`src/main/services/searchService.ts`)
- ✅ `searchBlocks()`: Tìm kiếm theo LIKE/GLOB, hỗ trợ matchCase, wholeWord, useRegex
- ✅ `replaceBlockText()`: Thay thế text trong block

### 3.13 IPC Handlers (`src/main/ipcHandler.ts`) — 23 channels
- ✅ **Project (5):** `project:scanLanguages`, `project:setup`, `project:getCurrent`, `project:getRecent`, `project:selectFolder`
- ✅ **Settings (4):** `settings:get`, `settings:save`, `settings:testConnection`, `settings:listModels`
- ✅ **Glossary (4):** `glossary:getAll`, `glossary:add`, `glossary:update`, `glossary:delete`
- ✅ **TM (4):** `tm:getAll`, `tm:delete`, `tm:clearUnused`, `tm:search`
- ✅ **Search (2):** `search:searchBlocks`, `search:replaceBlockText`
- ✅ **Workspace (3):** `workspace:getFiles`, `workspace:getBlocks`, `workspace:updateBlock`
- ✅ **Engine (4):** `engine:preflight`, `engine:translateBatch`, `engine:startQueue`, `engine:stopQueue`

### 3.14 IPC Broadcast (`src/main/utils/ipcBroadcast.ts`)
- ✅ `emitSystemLog()`: Push log events tới renderer
- ✅ `emitEngineProgress()`: Push progress events tới renderer

---

## 4. PRELOAD (`src/preload/index.ts` + `index.d.ts`)
- ✅ contextBridge expose `window.api` với đầy đủ types
- ✅ 6 nhóm API: `project`, `settings`, `glossary`, `tm`, `search`, `workspace`, `engine`, `events`
- ✅ Event listeners: `onSystemLog`, `onEngineProgress` (có cleanup function)
- ✅ TypeScript declarations đồng bộ với implementation

---

## 5. FRONTEND (Renderer Process) — CHI TIẾT

### 5.1 App Architecture (`src/renderer/src/App.tsx`)
- ✅ 2 chế độ: `WelcomeScreen` (no project) ↔ `CATWorkspace` (có project)
- ✅ Quản lý state qua `useState` cho files, blocks, modals, logs
- ✅ Auto-fetch data từ `window.api.workspace` khi mount
- ✅ Subscribe `system:log` + `engine:progress` events (auto-refresh sidebar)
- ✅ Keyboard shortcuts: F1, Ctrl+E, Ctrl+, Ctrl+F, Ctrl+Shift+Q, Ctrl+Shift+G, Ctrl+Shift+A
- ✅ Optimistic UI update cho translation changes
- ✅ Debounce 500ms cho textarea input → save DB

### 5.2 CAT Workspace Actions — Trạng thái chi tiết
| Action | Trạng thái | Chi tiết |
|--------|-----------|----------|
| Manual edit (textarea) | ✅ HOẠT ĐỘNG | Optimistic update → `window.api.workspace.updateBlock` → fetchFiles |
| Approve block | ✅ HOẠT ĐỘNG | Gọi `updateBlock` với status='approved' |
| Revert block | ✅ HOẠT ĐỘNG | Gọi `updateBlock` với text=null, status='empty' |
| AI Translate (single block) | ✅ HOẠT ĐỘNG | Gọi `window.api.engine.translateBatch([blockId])` → refetch |
| Preflight + Start Queue | ✅ HOẠT ĐỘNG | `window.api.engine.preflight` + `startQueue` |
| Export project | ⚠️ CHƯA NỐI | Modal hiển thị nhưng `onRestore` là `console.log`, không gọi export API |
| Search & Replace | ⚠️ CHƯA NỐI | `onSearch`, `onReplace`, `onReplaceAll` là mock/stub |
| QA Report | ⚠️ CHƯA NỐI | `issues=[]` hardcoded, `onGoToBlock` là `console.log` |
| TM Manager | ⚠️ CHƯA NỐI | `entries=[]` hardcoded, callbacks là `console.log` |
| Glossary Manager | ⚠️ CHƯA NỐI | `entries=[]` hardcoded, callbacks là `console.log` |

### 5.3 UI Components

#### Screens (9 components)
| Component | Trạng thái | Ghi chú |
|-----------|-----------|---------|
| `WelcomeScreen.tsx` | ✅ HOẠT ĐỘNG | Hiển thị recent projects, cảnh báo thiếu API key (`hasApiKey={false}` hardcoded) |
| `SetupWizardModal.tsx` | ✅ HOẠT ĐỘNG | 3 bước: Browse folder → Scan languages → Confirm & Parse. Nối API thật |
| `PreflightModal.tsx` | ✅ HOẠT ĐỘNG | Hiển thị pending/characters/cost. Gọi `engine.startQueue` khi confirm |
| `ExportModal.tsx` | ⚠️ UI CHƯA CÓ DATA | `backups=[]` hardcoded, restore là TODO |
| `QAReportModal.tsx` | ⚠️ UI CHƯA CÓ DATA | `issues=[]` hardcoded |
| `TMManagerModal.tsx` | ⚠️ UI CHƯA CÓ DATA | `entries=[]` hardcoded |
| `GlossaryModal.tsx` | ⚠️ UI CHƯA CÓ DATA | `entries=[]` hardcoded |
| `SearchReplaceModal.tsx` | ⚠️ CHƯA NỐI API | Callbacks là mock functions |
| `KeyboardShortcutsModal.tsx` | ✅ HOẠT ĐỘNG | Hiển thị danh sách shortcuts |

#### CAT Tool Components (6 components)
| Component | Trạng thái | Ghi chú |
|-----------|-----------|---------|
| `TopHeader.tsx` | ✅ HOẠT ĐỘNG | Breadcrumb + action buttons + theme toggle |
| `LeftSidebar.tsx` | ✅ HOẠT ĐỘNG | File list từ DB, progress bars, filter, recent projects selector |
| `TranslationWorkspace.tsx` | ✅ HOẠT ĐỘNG | Render danh sách TranslationCards |
| `TranslationCard.tsx` | ✅ HOẠT ĐỘNG | Dual-pane (original/translation), debounce 500ms, AI/Revert/Approve buttons, status badge, warning display |
| `BottomBar.tsx` | ✅ HOẠT ĐỘNG | Stats + live log console |
| `SettingsModal.tsx` | ✅ HOẠT ĐỘNG | 4 tabs (AI & API, Prompt & Logic, TM, System). Nối API `settings.get/save/testConnection/listModels`. Theme switcher hoạt động |

### 5.4 Theme & Context
- ✅ `ThemeContext`: Dark/Light/System, persist qua localStorage
- ✅ Dark mode là mặc định

---

## 6. CHỨC NĂNG ĐANG HOẠT ĐỘNG (END-TO-END)

### ✅ Luồng hoạt động đầy đủ:
1. **Mở app** → Welcome Screen (hiển thị recent projects từ electron-store)
2. **Cảnh báo API Key** → `hasApiKey` hiện tại hardcoded `false` (cần đọc từ store)
3. **Tạo Project mới** → Setup Wizard: Browse folder → Scan `game/tl/` languages → Chọn source/target → Parse files → Import DB → Chuyển sang Workspace
4. **Mở lại project cũ** → Chọn từ Recent Projects → Gọi `setupProject` (re-parse + import) → Chuyển sang Workspace
5. **Workspace** → Tự động load files từ DB → Click file → Load blocks → Hiển thị TranslationCards
6. **Chỉnh sửa manual** → Gõ trong textarea → Debounce 500ms → Save DB → Update sidebar progress
7. **Approve/Revert** → Click button → Save DB → Refresh UI
8. **AI dịch 1 block** → Click Sparkles icon → Gọi API → TM check → AI call → Save DB → Refetch
9. **Pre-flight + Bulk translate** → Ctrl+Shift+A → Xem thống kê → Confirm → `engine.startQueue` → Background queue chạy → Progress events cập nhật UI realtime
10. **Settings** → Ctrl+, → Chỉnh API key, model, temperature, prompt, TM, theme → Save → Test Connection → Fetch models dynamically
11. **Keyboard shortcuts** → F1, Ctrl+E, Ctrl+, Ctrl+F, Ctrl+Shift+Q, Ctrl+Shift+G, Ctrl+Shift+A → Mở modal tương ứng
12. **Theme toggle** → Click icon trên header → Cycle Dark/Light/System

---

## 7. CHỨC NĂNG CHƯA HOÀN THIỆN / CẦN NỐI API

| Chức năng | Trạng thái | Vấn đề |
|-----------|-----------|--------|
| `hasApiKey` check trên WelcomeScreen | 🔴 HARDCODED | Luôn `false`, cần đọc từ `window.api.settings.get()` |
| Export Modal data | 🔴 MOCK | `backups=[]`, không có API gọi `exportFile()`, không có danh sách backup files |
| QA Report data | 🔴 MOCK | `issues=[]` hardcoded, không có API quét `warning` blocks từ DB |
| TM Manager data | 🔴 MOCK | `entries=[]` hardcoded, không gọi `window.api.tm.getAll()` |
| Glossary Manager data | 🔴 MOCK | `entries=[]` hardcoded, không gọi `window.api.glossary.getAll()` |
| Search & Replace | 🔴 MOCK | Callbacks là stub `() => []`, không gọi `window.api.search.*` |
| Source language hardcoded | 🔴 HARDCODED | `TopHeader` và `LeftSidebar` đều hardcode `"english"`, cần đọc từ `ProjectConfig` |
| API cost hardcoded | 🔴 HARDCODED | `BottomBar` hardcode `apiCost={0.0012}` |
| Export backend IPC | ⚠️ THIẾU | Không có `engine:exportProject` channel trong `ipcHandler.ts` |
| Bulk export (tất cả files) | 🔴 CHƯA CÓ | `exportService` chỉ export từng file, cần wrapper export all |
| Virtual scrolling | ⚠️ CHƯA CÓ | `TranslationWorkspace` render tất cả blocks, chưa dùng `react-window`/`react-virtuoso` |
| Pagination | ⚠️ CHƯA CÓ | `workspace:getBlocks` trả về tất cả blocks, không có LIMIT/OFFSET |
| Filter blocks by status | ⚠️ CHƯA CÓ | Workspace chưa có tabs filter (All/Empty/Draft/Approved/Warning) |
| Global search trong workspace | ⚠️ CHƯA CÓ | Chưa có search bar trong TranslationWorkspace |
| Clear Cache / Reset Settings buttons | 🔴 CHƯA CÓ LOGIC | UI có button nhưng chưa nối handler |

---

## 8. KIẾN TRÚC TỔNG QUAN

```
┌─────────────────────────────────────────────────────────┐
│                    Electron App                         │
├──────────────────────┬──────────────────────────────────┤
│   Main Process       │     Renderer Process             │
│   (Node.js)          │     (React 19)                   │
│                      │                                  │
│  ┌────────────────┐  │  ┌────────────────────────────┐ │
│  │ database.ts    │  │  │ App.tsx                    │ │
│  │ settings.ts    │  │  │  ├─ WelcomeScreen          │ │
│  │                │  │  │  └─ CATWorkspace           │ │
│  └────────────────┘  │  │     ├─ TopHeader           │ │
│  ┌────────────────┐  │  │     ├─ LeftSidebar         │ │
│  │ parser/        │  │  │     ├─ TranslationWorkspace│ │
│  │   rpyParser.ts │  │  │     │   └─ TranslationCard │ │
│  │ services/      │  │  │     ├─ BottomBar           │ │
│  │   parserSvc    │  │  │     └─ [9 Modals]          │ │
│  │   workspaceSvc │  │  └────────────────────────────┘ │
│  │   glossarySvc  │  │                                  │
│  │   tmSvc        │  └──────────────┬───────────────────┘
│  │   searchSvc    │                 │
│  │   exportSvc    │                 │
│  │   engine       │                 │
│  └────────────────┘  ┌──────────────▼───────────────────┐
│  ┌────────────────┐  │     Preload (contextBridge)     │
│  │ api/           │  │     window.api.*                │
│  │   aiService    │  │     events: onSystemLog         │
│  │   projectIpc   │  │             onEngineProgress    │
│  └────────────────┘  └─────────────────────────────────┘
│  ┌────────────────┐                                     │
│  │ ipcHandler.ts  │ ← 23 IPC channels                   │
│  └────────────────┘                                     │
│                      IPC (ipcMain/ipcRenderer)          │
├──────────────────────┴──────────────────────────────────┤
│  SQLite DB (userData)    electron-store (JSON)          │
└─────────────────────────────────────────────────────────┘
```

---

## 9. DEPENDENCIES ĐANG DÙNG

| Package | Version | Mục đích |
|---------|---------|----------|
| `better-sqlite3` | ^12.9.0 | Database |
| `electron-store` | ^11.0.2 | Settings persistence |
| `@google/generative-ai` | ^0.24.1 | Gemini API |
| `fs-extra` | ^11.3.4 | File I/O |
| `lucide-react` | ^1.14.0 | Icons |
| `@radix-ui/*` | various | UI primitives (dialog, select, slider, switch, tooltip...) |
| `react` / `react-dom` | ^19.2.1 | Frontend framework |
| `tailwindcss` | ^4.2.4 | Styling |
| `electron-vite` | ^5.0.0 | Build tool |

---

## 10. TỔNG KẾT TRẠNG THÁI

**Backend Core:** ~95% hoàn thành. Mọi service đều có implementation đầy đủ. Chỉ thiếu IPC channel cho `exportProject` và bulk export.

**IPC Bridge:** ~92% hoàn thành. 23/24 channels đã đăng ký. Thiếu `engine:exportProject`.

**Frontend UI:** ~85% hoàn thành. Tất cả components đã có mặt. Settings, Workspace, AI Translate hoạt động end-to-end.

**Frontend Data Binding:** ~60% hoàn thành. Các modal quản lý (TM, Glossary, Search, QA, Export) có UI nhưng chưa nối API — đang dùng mock data/stub callbacks.

**Performance (Virtual Scrolling + Pagination):** 0% — chưa implement. Sẽ cần thiết kế khi xử lý 100k+ blocks.
