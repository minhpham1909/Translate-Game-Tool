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
