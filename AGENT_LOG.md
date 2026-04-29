# AI Work Log

## [2026-04-29 16:08] Database SQLite Initialization
**Requested:** Tạo file `src/main/store/database.ts` để khởi tạo DB SQLite và thiết lập các bảng theo đúng thiết kế.
**Delivered:**
- [BE] `src/main/store/database.ts` — Tạo module DB dựa trên `better-sqlite3`. Khởi tạo 3 bảng chính (`files`, `translation_blocks`, `translation_memory`), 1 bảng ảo (`blocks_fts`), và 3 triggers để sync data. DB được lưu vào thư mục `app.getPath('userData')` để an toàn.
- [ROOT] `PROJECT_PROGRESS.md` — Tạo file theo dõi tiến độ session.
- [ROOT] `SCHEMA_CHANGELOG.md` — Lưu trữ log schema DB.
- [ROOT] `API_CONTRACT.md` — Nơi định nghĩa các IPC channels sắp tới.
- [ROOT] `.env.example` — Mẫu file môi trường.
**Status:** ✅ Complete
**Notes:** 
- Lệnh chạy cài đặt dependency bị lỗi trong môi trường sandbox của agent nên tôi không tự chạy được lệnh `npm install better-sqlite3`. User sẽ cần chạy thủ công.

## [2026-04-29 16:21] Xây dựng RpyParser và Data Import
**Requested:** Tiến hành triển khai phase 1 Rpy Parser.
**Delivered:**
- [BE] `src/shared/types.ts` — Tạo shared interface `TranslationBlock`, `FileRecord`, `TranslationMemoryRecord` dùng chung cho Main và Renderer.
- [BE] `src/main/utils/fileUtils.ts` — Tạo hàm scan thư mục `game/tl/` và hàm đọc file theo từng dòng (hỗ trợ CRLF/LF).
- [BE] `src/main/parser/rpyParser.ts` — Viết State Machine sử dụng Regex để đọc file `.rpy` và trích xuất đúng `original_text`, bảo toàn `indentation`.
- [BE] `src/main/parser/rpyParser.ts` — Viết logic `importRpyToDatabase` sử dụng Bulk Insert/Transaction trên SQLite để tối ưu hóa I/O cho file lớn.
**Status:** ✅ Complete
**Notes:** Xử lý `block_type = 'string'` bằng cách tự động đánh index băm do string không có ID như dialogue. Mặc định dialogue tags là Dialogue và string tags là UI/Menu.
