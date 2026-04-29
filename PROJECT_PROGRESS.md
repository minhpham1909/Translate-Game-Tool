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

### Current State
- Đã có khả năng parse file `.rpy` thành dữ liệu thô và push vào database.
- Tuy nhiên chưa nối việc này vào UI (Dashboard). Do đó người dùng chưa thể tự chọn thư mục từ giao diện.

### Next Steps
- Bắt đầu triển khai Phase 2: Translation Engine, TM & Queue System (Gọi API AI)
- Gắn các IPC handlers để Renderer có thể yêu cầu parse folder.

### Known Issues / Blockers
- Chưa có giao diện UI để chọn folder và kích hoạt parser. Cần làm UI sau.
