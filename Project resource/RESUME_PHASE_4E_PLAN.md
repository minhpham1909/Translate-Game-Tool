# Kế hoạch Tiếp tục Triển khai Phase 4E: Kết nối Dữ liệu Thực tế

Tài liệu này được tạo ra để đồng bộ trạng thái công việc giữa các session AI, giúp agent tiếp theo có thể nắm bắt ngay lập tức các phần còn lại của Phase 4E.

## 1. Trạng Thái Hiện Tại (Đã Hoàn Thành)

### Chunk 1: Infrastructure & Data Binding
- [x] Tạo `workspaceService.ts`: CRUD SQLite cho Files và Blocks.
- [x] Đăng ký IPC Handlers: `workspace:getFiles`, `workspace:getBlocks`, `workspace:updateBlock`.
- [x] Expose qua `preload/index.ts`.
- [x] Frontend: `App.tsx` đã xóa Mock Data, tự động fetch danh sách file và blocks khi mở project.

### Chunk 2: Ren'Py Parser Integration
- [x] Tạo `parserService.ts`: Đệ quy quét file `.rpy` và nạp vào DB.
- [x] Tích hợp Parser vào luồng khởi tạo Project mới (`project:setup`).
- [x] Frontend: `SetupWizardModal.tsx` đã gọi API thật, có màn hình chờ khi đang nạp dữ liệu.

---

## 2. Các Công Việc Còn Lại (Chunk 3 & Tiếp theo)

### Chunk 3: AI Translation Integration (Ưu tiên cao)
- **Mục tiêu:** Nối nút AI trên thẻ dịch và luồng dịch tự động hàng loạt.
- [x] Backend: Bổ sung `translateBatchByBlockIds()` + Queue có thể stop bằng AbortSignal; cập nhật file stats sau khi dịch.
- [x] IPC: Đăng ký `engine:preflight`, `engine:translateBatch`, `engine:startQueue`, `engine:stopQueue`.
- [x] Preload: Expose `window.api.engine` + `window.api.events` (`system:log`, `engine:progress`).
- [x] Frontend: Nút Sparkles gọi `window.api.engine.translateBatch([blockId])` và refresh dữ liệu.
- [x] Frontend: Preflight dùng dữ liệu thật từ backend và Start Translation kích hoạt queue (project/file).

### Chunk 4: Modals & Management UI Binding
- **Mục tiêu:** Làm cho các bảng quản lý (Glossary, TM) hoạt động với dữ liệu thật.
- [ ] `GlossaryManagerModal.tsx`: Nối CRUD vào `window.api.glossary`.
- [ ] `TMManagerModal.tsx`: Nối danh sách và tính năng search vào `window.api.tm`.
- [ ] `SearchReplaceModal.tsx`: Nối tính năng tìm kiếm toàn cục vào `window.api.search`.

### Chunk 5: Export & QA System
- **Mục tiêu:** Xuất kết quả cuối cùng ra file `.rpy` thực tế.
- [ ] IPC: Đăng ký handler cho `exportService.ts`.
- [ ] Frontend: `ExportModal.tsx` -> Gọi API export, hiển thị log thành công/thất bại.
- [ ] QA: Đảm bảo Linter tự động chạy khi lưu/dịch để hiển thị Warning Badge trên UI.

---

## 3. Ghi Chú Kỹ Thuật Cho Agent Sau
- **Database**: Sử dụng `better-sqlite3`. Schema nằm trong `src/main/store/database.ts`.
- **Parser**: Nằm trong `src/main/parser/rpyParser.ts` và `src/main/services/parserService.ts`.
- **IPC**: Mọi giao tiếp Frontend -> Backend phải qua `window.api` (định nghĩa tại `src/preload/index.ts`).
- **Style**: Sử dụng Tailwind + Shadcn UI. Layout chính của App là `flex flex-col h-full w-full`.
