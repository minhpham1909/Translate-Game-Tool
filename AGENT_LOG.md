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

## [2026-04-29 16:46] Triển khai Phase 2: Translation Engine, TM & Queue System
**Requested:** Triển khai phase tiếp theo.
**Delivered:**
- [BE] `src/main/store/settings.ts` — Xây dựng Settings Manager bằng `electron-store` để lưu `apiKeys`, `activeModelId`, `batchSize`, v.v. xuống ổ cứng.
- [BE] `src/main/api/aiService.ts` — Viết hàm `translateBatchWithGemini` kết nối API `@google/generative-ai`. Đặc biệt cấu hình `responseSchema` là JSON Array (type: STRING) để ép AI trả về mảng kết quả ổn định, không bị vỡ dòng so với chuỗi văn bản thông thường.
- [BE] `src/main/services/translationEngine.ts` — Viết logic `startBackgroundQueue`: vòng lặp lấy từng mẻ text (20 dòng) có trạng thái 'empty' để xử lý.
- [BE] `src/main/services/translationEngine.ts` — **Tích hợp TM (Translation Memory):** Query DB TM trước khi gọi API. Auto-fill nếu cache Hit, chỉ gọi AI nếu cache Miss.
- [BE] `src/main/services/translationEngine.ts` — **Rate Limiting:** Bắt lỗi 429 và sử dụng Exponential Backoff để thử lại tự động mà không bị crash.
- [BE] `src/main/services/translationEngine.ts` — Thêm `preFlightAnalyzer` đếm số block, character trước khi dịch.
**Status:** ✅ Complete
**Notes:** Sử dụng `responseMimeType: 'application/json'` cho Gemini là rất quan trọng để đảm bảo tính nhất quán của dòng lệnh. Claude/OpenAI sẽ được mở rộng dễ dàng thông qua interface `aiService` sau này.
