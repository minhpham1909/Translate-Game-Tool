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

## [2026-04-29 16:52] Cập nhật AIService sang kiến trúc Adapter Pattern
**Requested:** Ghi đè file src/main/api/aiService.ts bằng đoạn code sử dụng Adapter Pattern.
**Delivered:**
- [BE] `src/main/api/aiService.ts` — Áp dụng Adapter Pattern (`IAITranslator`) để bọc các class `GeminiTranslator` và `OpenAITranslator`. Viết thêm System Prompt nâng cao hỗ trợ `glossaryText`.
- [BE] `src/main/services/translationEngine.ts` — Chuyển từ gọi hàm trực tiếp sang sử dụng class manager tĩnh `AIService.translateBatch(texts, glossaryText)`. 
**Status:** ✅ Complete
**Notes:** `glossaryText` hiện tại truyền vào là chuỗi rỗng (`""`). Ở bước sau, khi lấy từ điển từ DB, chúngrow sẽ tự động gộp và nối vào biến này để truyền xuống AI.

## [2026-04-29 17:18] Nâng cấp Settings Module và Hybrid Prompt
**Requested:** Implement Settings 5 nhóm theo chuẩn thiết kế và tích hợp Hybrid Prompting vào AI Service.
**Delivered:**
- [BE] `src/shared/types.ts` — Định nghĩa chuẩn 5 nhóm Setting (AI Config, Prompting, Queue, TM, UI) bao gồm các biến `customEndpoint`, `temperature`, `userCustomPrompt`, `costWarningThreshold`, `tmFuzzyThreshold`...
- [BE] `src/main/store/settings.ts` — Áp dụng `defaultSettings` chuẩn xác theo document. Dùng `electron-store` để lưu trữ, không dùng SQLite.
- [BE] `src/main/api/aiService.ts` — Viết lại `getSystemPrompt` thành kiến trúc **Hybrid Prompt**: Tách Part A (Hardcoded rules) và Part B (Văn phong từ `userCustomPrompt` + TỪ ĐIỂN). Đồng thời pass object `settings` xuống cho các Translator (như Gemini) để truyền `targetLanguage`, `temperature`, và `customEndpoint` một cách linh động.
**Status:** ✅ Complete
**Notes:** Avatar upload not included — not part of the request. Flagged as future suggestion.

## [2026-04-29 19:45] Phase 3 - Cross-Translation & Utilities
**Requested:** Thực thi Phase 3: Auto-QA Linter, Safe Export và Cập nhật Parser hỗ trợ Cross-Translation (Dịch bắc cầu).
**Delivered:**
- [BE] `src/shared/types.ts` — Thêm `ProjectConfig` interface.
- [BE] `src/main/store/settings.ts` — Thêm các hàm `getProjectConfig()`, `saveProjectConfig()`.
- [BE] `src/main/api/projectIpc.ts` — Thêm hàm `scanAvailableLanguages()` và `setupProject()`.
- [BE] `src/main/parser/rpyParser.ts` — Đổi Regex/State Machine để bỏ qua dòng gốc và trích xuất dòng Active (Tiếng Anh) làm original_text.
- [BE] `src/main/utils/qaLinter.ts` — Thêm hàm `validateTranslation()` đếm ngoặc vuông/nhọn.
- [BE] `src/main/services/translationEngine.ts` — Gọi Linter sau khi API/TM trả về kết quả, tự động gán `warning` nếu lỗi.
- [BE] `src/main/services/exportService.ts` — Thêm hàm `exportFile()` với logic fallback an toàn và giữ nguyên key `old` strings; thêm hàm `restoreBackup()`.
**Status:** ✅ Complete
**Notes:** Chấp nhận thiết kế Cross-Translation của user. Các block bị lỗi Linter sẽ tự động fallback về tiếng Anh thay vì xuất tiếng Việt để chống crash game.

## [2026-05-01 13:58] Phase 4E - Backend Core Files & IPC Bridge
**Requested:** Cấu hình Backend API Services (Phase 4E) và expose lên frontend qua IPC.
**Delivered:**
- [BE] `src/main/services/glossaryService.ts` — Viết các hàm CRUD thao tác với DB SQLite cho Glossary.
- [BE] `src/main/services/tmService.ts` — Viết hàm CRUD và fuzzy search (`searchTM`, `clearUnusedTM`) cho Translation Memory.
- [BE] `src/main/services/searchService.ts` — Viết hàm `searchBlocks` kết hợp query LIKE trên SQLite và Regex/Whole Word mapping trên JS, và hàm `replaceBlockText`.
- [BE] `src/main/ipcHandler.ts` — Đăng ký 15 kênh IPC (`ipcMain.handle`) kết nối trực tiếp đến các file Service (Project, Glossary, TM, Search).
- [BE] `src/main/index.ts` — Móc `registerIpcHandlers()` vào luồng khởi tạo app.
- [FE/BE] `src/preload/index.ts` và `src/preload/index.d.ts` — Cập nhật cấu trúc `window.api` (gom nhóm project, glossary, tm, search) thành strongly typed, có code hint rõ ràng.
**Status:** ✅ Complete
**Notes:** Quá trình IPC cho `exportService` và update `recentProjects` của `settings` sẽ được bổ sung tiếp ở Phase 4 nếu cần. Tạm thời đủ các handler thiết yếu cho UI.

## [2026-05-01 14:38] Phase 4E - Chunk 1: Workspace Infrastructure & Data Binding
**Requested:** Xóa bỏ Mock Data ở CAT Workspace, nối giao diện với API DB thực tế qua IPC.
**Delivered:**
- [BE] `src/main/services/workspaceService.ts` — Thêm service đọc file và translation block từ SQLite, hỗ trợ update status.
- [BE] `src/main/ipcHandler.ts` — Đăng ký các handle `workspace:getFiles`, `workspace:getBlocks`, `workspace:updateBlock`.
- [FE] `src/preload/index.d.ts` & `src/preload/index.ts` — Thêm định nghĩa và expose API cho `window.api.workspace`.
- [FE] `src/renderer/src/App.tsx` — Loại bỏ biến `MOCK_FILES`, `MOCK_BLOCKS`. Viết lại logic `useEffect` để fetch data thật qua `window.api.workspace`.
**Status:** ✅ Complete
**Notes:** Hiện tại vì chưa có hệ thống parser file `.rpy` (sẽ làm ở Chunk 2), DB SQLite hoàn toàn trống. Giao diện sau khi cập nhật sẽ tự động rơi vào UI "Empty State" (Welcome Screen hoặc báo không có file). Đây là behavior chuẩn, chờ Chunk 2 đổ data vào.

## [2026-05-01 15:26] Phase 4E - Chunk 2: Ren'Py Parser Integration
**Requested:** Tích hợp RpyParser vào quá trình khởi tạo Project.
**Delivered:**
- [BE] `src/main/services/parserService.ts` — Viết hàm `parseProject()` có nhiệm vụ đệ quy quét toàn bộ file `.rpy` trong ngôn ngữ được chọn và nạp vào Database bằng `parseRpyFile`.
- [BE] `src/main/api/projectIpc.ts` — Sửa đổi `setupProject()` thành `async`, chèn logic gọi `parseProject()` trước khi save config.
- [FE] `src/renderer/src/components/screens/SetupWizardModal.tsx` — Nối `handleScanLanguages` và `handleStartParse` để gọi trực tiếp các API ipcMain tương ứng. Hiển thị UI tiến trình chờ.
- [FE] `src/renderer/src/App.tsx` — Thêm trigger tự reload UI Workspace khi Project mới được lưu thành công.
**Status:** ✅ Complete
**Notes:** Quá trình parse hàng trăm file `.rpy` sẽ tốn vài giây đến vài phút. UI Modal sẽ bị block bằng `parseMessage` trong lúc chờ backend trả về kết quả Promise. Đã fix lỗi sót lại do xóa `MOCK_BLOCKS` không triệt để.

## [2026-05-01 09:30] Fix TS Deprecation Error
**Requested:** Sửa lỗi đỏ liên quan đến 'baseUrl' is deprecated trong tsconfig.web.json
**Delivered:**
- [FE] `tsconfig.web.json` — Loại bỏ `"baseUrl": "."` để tuân thủ chuẩn module resolution mới của TypeScript 5+.
**Status:** ✅ Complete
**Notes:** TypeScript hiện nay tự động phân giải `paths` tương đối với file config nếu không có `baseUrl`. Người dùng có thể cần Restart TS Server để VS Code cập nhật trạng thái.

## [2026-05-01 09:35] Fix TS Path Resolution
**Requested:** Sửa lỗi 'Non-relative paths are not allowed' trong tsconfig.web.json
**Delivered:**
- [FE] `tsconfig.web.json` — Thêm tiền tố `./` vào các đường dẫn trong `paths` để tương thích với chế độ không có `baseUrl`.
**Status:** ✅ Complete
**Notes:** Khi bỏ `baseUrl`, TS yêu cầu đường dẫn trong `paths` phải bắt đầu rõ ràng bằng `./`.

