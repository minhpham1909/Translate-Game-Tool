# IPC API Contract (Main ↔ Renderer)

Tài liệu này định nghĩa các kênh giao tiếp IPC giữa Main Process (Node.js) và Renderer Process (React).

---

## 1. Project Management (`project:`)

### `project:scanLanguages`
- **Description:** Quét thư mục `game/tl/` để lấy danh sách ngôn ngữ.
- **Request:** `gamePath (string)`
- **Response:** `Promise<string[]>`

### `project:setup`
- **Description:** Khởi tạo project mới (bao gồm chạy Parser quét file).
- **Request:** `config (ProjectConfig)`
- **Response:** `Promise<void>`

### `project:getCurrent`
- **Description:** Lấy cấu hình project hiện tại từ store.
- **Response:** `Promise<ProjectConfig | null>`

---

## 2. Workspace & Data (`workspace:`)

### `workspace:getFiles`
- **Description:** Lấy danh sách file và tiến độ dịch từ SQLite.
- **Response:** `Promise<DBFile[]>`

### `workspace:getBlocks`
- **Description:** Lấy danh sách blocks của 1 file.
- **Request:** `fileId (number)`
- **Response:** `Promise<TranslationBlock[]>`

### `workspace:updateBlock`
- **Description:** Cập nhật nội dung dịch/trạng thái cho 1 block.
- **Request:** `blockId (number), text (string | null), status (string)`
- **Response:** `Promise<void>`

---

## 3. Glossary Management (`glossary:`)

### `glossary:getAll`
- **Response:** `Promise<GlossaryEntry[]>`

### `glossary:add`
- **Request:** `entry (any)`
- **Response:** `Promise<GlossaryEntry>`

### `glossary:update`
- **Request:** `id (number), entry (any)`
- **Response:** `Promise<void>`

### `glossary:delete`
- **Request:** `id (number)`
- **Response:** `Promise<void>`

---

## 4. Translation Memory (`tm:`)

### `tm:getAll`
- **Response:** `Promise<TMEntry[]>`

### `tm:delete`
- **Request:** `id (number)`
- **Response:** `Promise<void>`

### `tm:clearUnused`
- **Description:** Xóa các bản ghi TM cũ hoặc ít dùng.
- **Response:** `Promise<void>`

### `tm:search`
- **Description:** Tìm kiếm mờ (Fuzzy) trong TM.
- **Request:** `query (string)`
- **Response:** `Promise<TMEntry[]>`

---

## 5. Search & Replace (`search:`)

### `search:searchBlocks`
- **Request:** `query (string), options (any)`
- **Response:** `Promise<SearchBlockResult[]>`

### `search:replaceBlockText`
- **Request:** `blockId (number), newText (string), isOriginal (boolean)`
- **Response:** `Promise<void>`

---

## 6. Translation Engine (`engine:`)

### `engine:preflight`
- **Description:** Thống kê số block đang `empty` để chuẩn bị dịch.
- **Request:** `fileId? (number)` (nếu có: chỉ tính trong 1 file)
- **Response:** `Promise<{ pendingBlocks: number; estimatedCharacters: number; estimatedCost: number }>`

### `engine:translateBatch`
- **Description:** Dịch một danh sách blockId (ưu tiên dùng cho nút AI trên từng card).
- **Request:** `blockIds (number[])`
- **Response:** `Promise<void>`

### `engine:startQueue`
- **Description:** Bắt đầu background queue dịch tự động.
- **Request:** `options? { fileId?: number }` (nếu có: chỉ dịch file đó)
- **Response:** `Promise<{ started: boolean; alreadyRunning: boolean }>`

### `engine:stopQueue`
- **Description:** Dừng background queue.
- **Request:** none
- **Response:** `Promise<{ stopped: boolean }>`

---

## 7. Events (Main -> Renderer)

### `system:log`
- **Description:** Push log realtime xuống UI.
- **Payload:** `{ type: 'info' | 'warning' | 'error' | 'success', message: string, timestamp: string }`

### `engine:progress`
- **Description:** Push tiến độ dịch (đếm success/error) trong lúc queue chạy.
- **Payload:** `{ success: number, error: number }`
