# Project Progress Log

## [2026-04-29] Session: Nền Tảng & SQLite Database
### Completed
- [x] Cập nhật lại bản Kế hoạch Triển khai (`implementation_plan.md`) dựa trên kiến trúc SQLite + FTS5.
- [x] Phase 0: Thiết Lập Nền Tảng & Database SQLite
  - [x] Cài đặt `better-sqlite3`
  - [x] Tạo file quản lý DB `src/main/store/database.ts` với schema chuẩn
  - [x] Tạo các file quản lý dự án (`PROJECT_PROGRESS.md`, `AGENT_LOG.md`, `SCHEMA_CHANGELOG.md`, `API_CONTRACT.md`, `.env.example`)
  - [x] Móc `initDatabase()` vào `main/index.ts`
- [x] Móc nối `initDatabase()` vào sự kiện `app.whenReady()` của Electron trong `src/main/index.ts`.
- [x] Đăng ký `closeDatabase()` khi app tắt (sự kiện `will-quit`).

## [2026-04-29] Session: Phase 1 - Rpy Parser
### Completed
- [x] Tạo `src/shared/types.ts` với các interfaces cốt lõi.
- [x] Xây dựng tiện ích đọc và quét file `src/main/utils/fileUtils.ts`.
- [x] Tạo `src/main/parser/rpyParser.ts` triển khai State Machine.
- [x] Hỗ trợ parse dialogue blocks và string blocks (bảo toàn tuyệt đối `indentation`).
- [x] Tích hợp logic import vào cơ sở dữ liệu (sử dụng Transactions).

## [2026-04-29] Session: Phase 2 - Translation Engine
### Completed
- [x] Tạo `src/main/store/settings.ts` để lưu thiết lập API Key xuống hệ thống (bằng `electron-store`).
- [x] Tạo `src/main/api/aiService.ts` dùng Gemini API (với chuẩn JSON Array output, prompt nghiêm ngặt giữ nguyên biến/tags).
- [x] Tạo `src/main/services/translationEngine.ts` với `startBackgroundQueue()`.
- [x] Logic Translation Memory: Check TM cache -> Call API -> Save Cache.
- [x] Exponential backoff cho lỗi rate limit (429).
- [x] `preFlightAnalyzer` đếm block rỗng và ước lượng chữ.

### Current State
- Backend Pipeline gần như hoàn chỉnh: Parser -> DB -> Translation Queue (có TM & Rate limit) -> DB.
- Cần có IPC Channels để nối tất cả các backend services ra Frontend.

### Next Steps
- Triển khai Phase 3: Auto-QA Linter & Backend Utilities (Bao gồm Safe Export).
- Gắn các handler IPC (ví dụ `start-translation`, `scan-folder`).

### Known Issues / Blockers
- Không có lỗi nào hiện tại. UI vẫn đang thiếu.

## [2026-04-29] Session: Phase 3 - Project Setup & Cross-Translation
### Completed
- [x] Nâng cấp `types.ts` và `settings.ts` để hỗ trợ `ProjectConfig` (Quản lý dự án Cross-Translation).
- [x] Tạo `projectIpc.ts` xử lý quét danh sách ngôn ngữ (`scanAvailableLanguages`).
- [x] Nâng cấp `rpyParser.ts`: Triển khai cơ chế Dịch Bắc Cầu (bỏ qua dòng gốc Tiếng Nhật, trích xuất dòng Tiếng Anh).
- [x] Tạo `qaLinter.ts`: So khớp số lượng tag `[]` và `{}` để chống mất biến (Hallucination). Tích hợp vào Background Queue.
- [x] Tạo `exportService.ts`: Đắp bản dịch ngược lại file `.rpy` bằng Hash Map, tự động fallback nếu bị `warning`, bảo tồn `old` string cho giao diện, và tạo file `.backup`.

### Current State
- Backend Core hoàn thiện 100%: Project Setup -> Parser (Cross-Translation) -> TM/API Queue -> Linter -> Exporter (Backup/Restore).

### Next Steps
- Triển khai Phase 4: Xây dựng IPC Bridge (API Contract) và bắt tay vào làm giao diện React (Frontend).

### Known Issues / Blockers
- UI chưa bắt đầu. Cần làm UI Setup Wizard để kích hoạt luồng.

## [2026-05-01] Session: Phase 4 UI Bug Fix & Phase 4E Backend Core
### Completed
- [x] Fix lỗi layout của `DialogContent` đè nút Cancel (X): Chuyển `showCloseButton = false` mặc định và đổi `grid` thành `flex flex-col` để fix tỷ lệ Header/Body/Footer.
- [x] Fix lỗi layout body của Settings Modal khi switch qua tab có ít nội dung bị co lại (thêm `min-h-0`).
- [x] Tạo `src/main/services/glossaryService.ts` (CRUD).
- [x] Tạo `src/main/services/tmService.ts` (CRUD, Search, Upsert).
- [x] Tạo `src/main/services/searchService.ts` (Global FTS/Regex Search & Replace).
- [x] Tạo `src/main/ipcHandler.ts` để map 15 kênh IPC cho Project, Glossary, TM, Search.
- [x] Đăng ký `registerIpcHandlers()` vào `main/index.ts`.
- [x] Cập nhật `src/preload/index.ts` và `index.d.ts` để expose `window.api` cho Frontend.

### Current State
- UI cơ bản (10 màn hình) đã hoàn thành, layout flex fix chuẩn xác.
- Backend Core đã đủ service và có IPC Bridge sẵn sàng để React (Renderer) gọi.

### Next Steps
- Thay thế Mock Data trong React UI bằng cách gọi `window.api` thật để kết nối toàn bộ luồng từ Parser -> DB -> UI -> AI.

## [2026-05-01] Session: Phase 4E - Chunk 1
### Completed
- [x] Tạo `workspaceService.ts` quản lý việc lấy danh sách `files` và `translation_blocks` từ SQLite.
- [x] Cung cấp hàm `updateBlockTranslation` và logic tự tính toán lại số block đã dịch (`updateFileStats`).
- [x] Đăng ký 3 IPC handlers `workspace:getFiles`, `workspace:getBlocks`, `workspace:updateBlock`.
- [x] Sửa đổi `App.tsx` ở Frontend: Xóa bỏ MOCK_FILES, MOCK_BLOCKS và thay thế bằng fetch API.
- [x] Thêm tự động hook vào trạng thái Project mở hay chưa bằng `window.api.project.getCurrent()`.

### Current State
- UI đã lấy dữ liệu thật từ DB thông qua API. Vì DB hiện tại trống nên UI sẽ hiện trạng thái Empty hoặc báo chưa có Project.
- Phím tắt (F1, Ctrl+S) đã hoạt động tốt.

### Next Steps
- Thực thi Chunk 2: Viết `parserService.ts` sử dụng đa luồng Regex để phân tích cú pháp `.rpy` và đưa vào DB. Kích hoạt Parser khi User tạo dự án mới ở Setup Wizard.

## [2026-05-01] Session: Phase 4E - Chunk 2
### Completed
- [x] Tạo `src/main/services/parserService.ts` chứa hàm đệ quy tìm và parse hàng loạt file `.rpy`.
- [x] Sửa hàm `setupProject` thành `async` và chèn logic gọi Parser trước khi hoàn thành setup.
- [x] Nối `SetupWizardModal.tsx` vào API thật `window.api.project.scanLanguages` và `setup`.
- [x] Hiện loading message thông báo cho người dùng chờ đợi trong lúc hệ thống parse file và nạp vào DB.

### Current State
- Người dùng đã có thể trỏ vào thư mục Game, công cụ sẽ đọc thư mục đó, quét số lượng ngôn ngữ hiện có, và nạp tất cả dữ liệu câu thoại vào Database SQLite! Ngay sau đó UI sẽ load lên màn hình làm việc (Workspace) với số liệu thật 100%.

### Next Steps
- Thực thi Chunk 3: Frontend Data Binding & User Actions cho các tính năng khác (ví dụ: Chạy API AI hàng loạt, Export). Mặc dù hiện tại người dùng đã có thể nhấn Ctrl+S để lưu từng dòng, nhưng chúng ta chưa nối API AI Translator (`window.api.engine.translateBatch`) cho nút AI trên TranslationCard.

## [2026-05-01] Session: Maintenance & TS Config Fix
### Completed
- [x] Fix lỗi deprecation `baseUrl` trong `tsconfig.web.json` để tương thích với TypeScript 5.0+.
- [x] Fix lỗi `Non-relative paths` bằng cách thêm `./` vào cấu hình `paths`.

### Current State
- Hệ thống hoạt động ổn định, cấu hình TypeScript được cập nhật theo chuẩn mới.

### Next Steps
- Tiếp tục thực hiện Chunk 3: Frontend Data Binding & User Actions.

## [2026-05-05] Session: Phase 5 - Language Patch & Selective Export
### Completed
- [x] Thêm `languagePatchKey` + `languagePatchIcon` vào `shared/types.ts` (AppSettings interface)
- [x] Thêm default values trong `settings.ts` (`languagePatchKey: 'K_F8'`, `languagePatchIcon: true`)
- [x] Tạo `generateLanguagePatch()` trong `exportService.ts` (universal floating popup, zorder 2147483647)
- [x] Tích hợp patch generation vào `exportAllFiles()` và `exportSelectedFiles()` (auto-write `00_vnt_lang_patch.rpy` to `game/`)
- [x] Cập nhật `SettingsModal.tsx`: Thêm state, load/save `languagePatchKey` và `languagePatchIcon`, UI section trong System tab
- [x] Cập nhật `ExportModal.tsx`: Hiển thị file list với checkboxes, auto-select changed files, buttons (select changed/all/none)
- [x] Fix `types.ts` encoding issues (rewrote entire file with proper UTF-8)
- [x] Typecheck + Build: ✅ All pass

### Current State
- Phase 5 hoàn thành: Language Patch (floating language switcher) hoạt động, Selective Export UI sẵn sàng
- Export sẽ tự động generate `00_vnt_lang_patch.rpy` vào thư mục `game/` của project

### Next Steps
- Test Export flow end-to-end: Export → Check `00_vnt_lang_patch.rpy` generated → Open game → Press F8 → Verify language switcher
- Verify Language Patch works với different Ren'Py versions and game UI structures

