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
