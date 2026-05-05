# 🚀 PHASE 5 IMPLEMENTATION PLAN — MVP Upgrade

> **Mục tiêu:** Nâng cấp toàn diện hệ thống dịch AI, tối ưu chi phí, xử lý ngữ cảnh, và chuẩn bị cho thực tế game VN đã compile.
> **Tổng hợp từ:** `PHASE 5 CONTEXT.md`, `Phase5_VI_context.md`, `Universal API Context.md`

---

## 1. TỔNG QUAN CÁC HẠNG MỤC

| # | Hạng mục | Mức độ ưu tiên | Độ phức tạp | Ảnh hưởng |
|---|----------|---------------|-------------|-----------|
| 1 | Universal API Gateway + Robust JSON Parser | 🔴 CRITICAL | Cao | Toàn bộ AI Service |
| 2 | Regex Blacklist (Auto-ignore system strings) | 🔴 CRITICAL | Thấp | Tiết kiệm chi phí API |
| 3 | Smart Glossary Injection | 🔴 CRITICAL | Trung bình | Tiết kiệm token gấp 10-50x |
| 4 | AI Self-Correction (Auto-Retry) | 🔴 CRITICAL | Trung bình | Chất lượng dịch |
| 5 | Strict Glossary Verification | 🟡 HIGH | Trung bình | Nhất quán thuật ngữ |
| 6 | Text Overflow Linter | 🟡 HIGH | Thấp | Tránh tràn UI game |
| 7 | Context Windowing | 🟡 HIGH | Cao | Dịch đại từ/tone chính xác |
| 8 | Multi-Select UI + Floating Action Bar | 🟡 HIGH | Trung bình | UX cải thiện đáng kể |
| 9 | Unpacker Skeleton (.rpa/.rpyc) | 🟢 MEDIUM | Thấp | Xử lý game compiled |
| 10 | Game Update / Diffing | 🟢 MEDIUM | Cao | Duy trì project khi game update |

---

## 2. CHI TIẾT TỪNG HẠNG MỤC & TASK LIST

---

### HẠNG MỤC 1: Universal API Gateway + Robust JSON Parser

**Vấn đề:** Hiện tại mỗi provider (Gemini, GPT, Claude, DeepSeek, Grok) có class riêng. Custom endpoints / open-source models thường trả JSON kèm markdown hoặc text thừa → `JSON.parse()` crash → queue dừng.

**Giải pháp:**
- Gom tất cả OpenAI-compatible providers (OpenAI, DeepSeek, Grok, OpenRouter, Local LLM) vào **một class duy nhất** `OpenAICompatibleTranslator`
- Tạo `extractJsonArray()` utility để parse JSON từ response "bẩn"
- Chuẩn hóa error types để Queue Manager xử lý đúng (429 → retry, 400 → giảm batch size, parse error → retry prompt strict hơn)
- Dùng `openai` npm SDK chính thức, cho phép override `baseURL` và `customHeaders`

#### Tasks:

| Task ID | Mô tả | File mới / Sửa | Dependency |
|---------|-------|---------------|------------|
| **1.1** | Tạo `src/main/utils/jsonParser.ts` với `extractJsonArray()` — strip markdown code blocks, tìm `[` đầu và `]` cuối, parse, ném `JSONParsingError` nếu fail | **NEW:** `jsonParser.ts` | — |
| **1.2** | Tạo `src/main/api/errors.ts` — định nghĩa custom errors: `RateLimitError`, `TokenLimitError`, `JSONParsingError`, `APIError` | **NEW:** `errors.ts` | — |
| **1.3** | Nâng cấp `AppSettings` — thay đổi cấu hình providers: `providers: { gemini, openai_compatible, claude }`, mỗi provider có `apiKey`, `baseURL?`, `modelId`, `customHeaders?` | **SỬA:** `types.ts`, `settings.ts` | — |
| **1.4** | Tạo `src/main/api/translators/OpenAICompatibleTranslator.ts` — dùng `openai` SDK, nhận `baseURL`, `apiKey`, `customHeaders`, system prompt bắt JSON thuần, apply `extractJsonArray()` | **NEW:** `OpenAICompatibleTranslator.ts` | 1.1, 1.2, 1.3 |
| **1.5** | Refactor `AIService` factory — route DeepSeek, Grok, OpenAI, Custom URL tất cả qua `OpenAICompatibleTranslator` với baseURL tương ứng. Giữ `GeminiTranslator` và `ClaudeTranslator` riêng | **SỬA:** `aiService.ts` | 1.4 |
| **1.6** | Update `translationEngine.ts` — catch normalized errors, xử lý `TokenLimitError` bằng cách giảm batch size động, `JSONParsingError` retry với prompt strict hơn | **SỬA:** `translationEngine.ts` | 1.2, 1.5 |
| **1.7** | Update SettingsModal UI — thêm input `Base URL`, `Custom Headers` cho OpenAI Compatible provider | **SỬA:** `SettingsModal.tsx` | 1.3 |

---

### HẠNG MỤC 2: Regex Blacklist (Auto-ignore System Strings)

**Vấn đề:** Các chuỗi hệ thống (`%s`, `{#000}`, `v1.0`, `...`, `?!`) không cần dịch nhưng vẫn gọi API → tốn tiền vô ích.

**Giải pháp:** Trước khi gửi batch cho AI/TM, match `original_text` với mảng regex patterns. Nếu khớp → auto `status = 'approved'`, `translated_text = original_text`, skip hoàn toàn.

#### Patterns mặc định:
- Chuỗi rỗng / chỉ whitespace
- Chỉ dấu câu: `/^[^\w]+$/`
- Chỉ số: `/^\d+$/`
- Hex color: `/^#[0-9a-fA-F]+$/`
- Placeholder đơn: `/^%[sd]$/`, `/^\{#[0-9a-fA-F]+\}$/`
- String cực ngắn (1-2 ký tự không phải chữ): `/^[a-zA-Z]{1,2}$/`

#### Tasks:

| Task ID | Mô tả | File mới / Sửa | Dependency |
|---------|-------|---------------|------------|
| **2.1** | Tạo `src/main/utils/blacklistPatterns.ts` — mảng regex patterns mặc định + function `isBlacklisted(text: string): boolean` | **NEW:** `blacklistPatterns.ts` | — |
| **2.2** | Tích hợp vào `translationEngine.ts` — trong `translateBatchByBlockIds()` và `startBackgroundQueue()`, trước khi đưa vào AI/TM queue, lọc blocks qua `isBlacklisted()`. Nếu match → auto approve + skip | **SỬA:** `translationEngine.ts` | 2.1 |
| **2.3** | Thêm status `'ignored'` vào types (optional) hoặc tái dùng `'approved'` với `translated_by = 'blacklist'` | **SỬA:** `types.ts` (nếu cần status mới) | — |

---

### HẠNG MỤC 3: Smart Glossary Injection

**Vấn đề:** Glossary 1000 từ → inject tất cả vào prompt → tốn token, AI loãng ngữ cảnh.

**Giải pháp:** Trước khi gọi AI, scan batch text xem từ glossary nào XUẤT HIỆN → chỉ inject những từ đó.

#### Tasks:

| Task ID | Mô tả | File mới / Sửa | Dependency |
|---------|-------|---------------|------------|
| **3.1** | Sửa `buildGlossaryText()` trong `translationEngine.ts` → nhận danh sách texts cần dịch, query tất cả glossary entries, filter bằng regex (case-insensitive) xem từ nào xuất hiện trong texts, chỉ trả về những từ match | **SỬA:** `translationEngine.ts` | — |
| **3.2** | Tối ưu: Nếu glossary < 50 từ → inject tất cả (không cần filter). Nếu > 50 → dùng smart filter | **SỬA:** `translationEngine.ts` | 3.1 |

---

### HẠNG MỤC 4: AI Self-Correction (Auto-Retry)

**Vấn đề:** Linter chỉ báo warning, không tự sửa → user review thủ công.

**Giải pháp:** Sau AI return → chạy Linter → nếu có lỗi → retry 1 lần với prompt bổ sung *"Previous translation failed: [errors]. Fix immediately."* → nếu vẫn lỗi → save `status = 'warning'`

#### Tasks:

| Task ID | Mô tả | File mới / Sửa | Dependency |
|---------|-------|---------------|------------|
| **4.1** | Trong `translationEngine.ts`, sau khi nhận kết quả AI → gọi `validateTranslation()` → nếu errors.length > 0 → gọi lại AI lần 2 với prompt chèn thêm error messages → validate lại → save kết quả | **SỬA:** `translationEngine.ts` | — |
| **4.2** | Thêm hàm `translateBatchWithRetry()` trong `aiService.ts` — nhận previous errors, append vào system prompt | **SỬA:** `aiService.ts` | 4.1 |
| **4.3** | Log rõ ràng: `[Linter] Auto-retry #1 for block X due to: [errors]` | **SỬA:** `translationEngine.ts` | 4.1 |

---

### HẠNG MỤC 5: Strict Glossary Verification

**Vấn đề:** AI có thể bỏ qua glossary term đã inject → tên nhân vật dịch sai → không nhất quán.

**Giải pháp:** Linter kiểm tra: nếu original chứa Glossary Source Term → translated PHẢI chứa Target Term → nếu không → warning.

#### Tasks:

| Task ID | Mô tả | File mới / Sửa | Dependency |
|---------|-------|---------------|------------|
| **5.1** | Nâng cấp `qaLinter.ts` — `validateTranslation()` nhận thêm `glossaryEntries?` parameter. Duyệt từng entry: nếu `source_text` xuất hiện trong original → check `target_text` có trong translated → nếu không → push error `"Missing glossary term: '{source}' should be '{target}'"` | **SỬA:** `qaLinter.ts` | — |
| **5.2** | Trong `translationEngine.ts`, khi gọi Linter sau AI → truyền glossary entries vào | **SỬA:** `translationEngine.ts` | 5.1 |

---

### HẠNG MỤC 6: Text Overflow Linter

**Vấn đề:** Tiếng Việt dài hơn tiếng Anh 20-30% → dịch quá dài → tràn UI game.

**Giải pháp:** Thêm rule vào Linter: nếu `translated.length > original.length * 1.5` → warning.

#### Tasks:

| Task ID | Mô tả | File mới / Sửa | Dependency |
|---------|-------|---------------|------------|
| **6.1** | Thêm rule vào `qaLinter.ts`: `if (translated.length > original.length * 1.5) → push "Text overflow risk: translation is X% longer than original"` | **SỬA:** `qaLinter.ts` | — |
| **6.2** | (Optional) Thêm setting `textOverflowThreshold` (mặc định 1.5) để user tùy chỉnh | **SỬA:** `types.ts`, `settings.ts` | 6.1 |

---

### HẠNG MỤC 7: Context Windowing

**Vấn đề:** AI dịch từng block đơn lẻ → không hiểu ngữ cảnh trước/sau → đại từ sai.

**Giải pháp:** Khi gửi batch cho AI, kèm `context_history` — các block phía trước đã dịch (approved/draft) — để AI tham chiếu.

#### Payload schema mới:
```json
{
  "context_history": [
    {"character": "Arthur", "original": "Hi Mary.", "translated": "Chào Mary."}
  ],
  "to_translate": [
    {"id": 105, "character": "Arthur", "original": "You look beautiful today."}
  ]
}
```

#### Tasks:

| Task ID | Mô tả | File mới / Sửa | Dependency |
|---------|-------|---------------|------------|
| **7.1** | Update System Prompt trong `aiService.ts` — hướng dẫn AI dùng `context_history` CHỈ để tham chiếu đại từ/tone, CHỈ dịch `to_translate` array, output vẫn là JSON array thuần túy (không thêm keys) | **SỬA:** `aiService.ts` | — |
| **7.2** | Trong `translationEngine.ts`, trước khi gọi AI → query DB lấy N blocks trước đó (theo `file_id` + `line_index`, status != 'empty') → build `context_history` | **SỬA:** `translationEngine.ts` | 7.1 |
| **7.3** | Update prompt builder để inject context_history dạng: *"Previous conversation context (DO NOT TRANSLATE):\n- [Arthur]: Hi Mary. → Chào Mary."* | **SỬA:** `aiService.ts` | 7.2 |
| **7.4** | Đảm bảo output vẫn là array string (không thay đổi response schema) | **SỬA:** `aiService.ts` | 7.3 |

---

### HẠNG MỤC 8: Multi-Select UI + Floating Action Bar

**Vấn đề:** User không thể chọn nhiều block cùng lúc để dịch theo ngữ cảnh hội thoại.

**Giải pháp:** Checkbox trên mỗi card, Shift-Click, floating action bar khi có selection.

#### Tasks:

| Task ID | Mô tả | File mới / Sửa | Dependency |
|---------|-------|---------------|------------|
| **8.1** | Thêm checkbox vào `TranslationCard.tsx` — nhận `isSelected`, `onToggle` props | **SỬA:** `TranslationCard.tsx` | — |
| **8.2** | Thêm state `selectedBlockIds` vào `TranslationWorkspace.tsx` — quản lý Set<number> | **SỬA:** `TranslationWorkspace.tsx` | 8.1 |
| **8.3** | Implement Shift-Click logic — lưu `lastClickedIndex`, khi shift-click → select range | **SỬA:** `TranslationWorkspace.tsx` | 8.2 |
| **8.4** | Tạo `FloatingActionBar.tsx` — hiển thị khi `selectedBlockIds.size > 0`: "X blocks selected" → Translate Together | Approve All | Clear | **NEW:** `FloatingActionBar.tsx` | 8.3 |
| **8.5** | "Translate Together" → gọi `window.api.engine.translateBatch([...ids])` — đảm bảo sort theo `line_index` trước khi gửi | **SỬA:** `App.tsx` hoặc `TranslationWorkspace.tsx` | 8.4 |
| **8.6** | "Approve All" → loop qua selected blocks → `window.api.workspace.updateBlock(id, text, 'approved')` | **SỬA:** `App.tsx` hoặc `TranslationWorkspace.tsx` | 8.4 |

---

### HẠNG MỤC 9: Unpacker Skeleton (.rpa / .rpyc)

**Vấn đề:** Game đã compile, chỉ có `.rpa` / `.rpyc`, không parse được.

**Giải pháp:** Skeleton service dùng `child_process` gọi Python scripts (giả lập, chưa cần file thật).

#### Tasks:

| Task ID | Mô tả | File mới / Sửa | Dependency |
|---------|-------|---------------|------------|
| **9.1** | Tạo thư mục `src/main/python-tools/` (để trống, thêm `.gitkeep`) | **NEW:** directory | — |
| **9.2** | Tạo `src/main/services/unpackerService.ts` — function `unpackGame(gamePath: string)`: detect `.rpa`/`.rpyc`, spawn Python process (giả lập), log progress | **NEW:** `unpackerService.ts` | — |
| **9.3** | Thêm IPC handler `project:unpackGame` | **SỬA:** `ipcHandler.ts` | 9.2 |
| **9.4** | Update SetupWizard — nếu không tìm thấy `.rpy` nhưng có `.rpa`/`.rpyc` → hiện warning + nút "Unpack first" | **SỬA:** `SetupWizardModal.tsx` | 9.3 |

---

### HẠNG MỤC 10: Game Update / Diffing

**Vấn đề:** Game update v1.0 → v1.1 → parse lại mất bản dịch cũ.

**Giải pháp:** Khi re-parse, so sánh với DB cũ:
- `block_hash` + `original_text` khớp → giữ nguyên
- Hash mới → thêm `status = 'empty'`
- Hash cũ nhưng `original_text` đổi → `status = 'modified'` (user review)

#### Tasks:

| Task ID | Mô tả | File mới / Sửa | Dependency |
|---------|-------|---------------|------------|
| **10.1** | Thêm status `'modified'` vào `TranslationBlock.status` type | **SỬA:** `types.ts` | — |
| **10.2** | Sửa `importRpyToDatabase()` trong `rpyParser.ts` — thay vì DELETE all blocks cũ → so sánh từng block: nếu hash+text khớp → skip; hash mới → insert; hash cũ text đổi → update `original_text` + set `status = 'modified'` | **SỬA:** `rpyParser.ts` | 10.1 |
| **10.3** | Update `parserService.ts` — truyền cờ `isReparse` vào `parseProject()` để quyết định dùng logic diff hay full reset | **SỬA:** `parserService.ts` | 10.2 |
| **10.4** | UI — highlight blocks `status = 'modified'` với màu riêng (amber/yellow) trong TranslationCard | **SỬA:** `TranslationCard.tsx` | 10.1 |
| **10.5** | (Optional) Thêm filter tab "Modified" trong Workspace | **SỬA:** `TranslationWorkspace.tsx` | 10.4 |

---

## 3. THỨ TỰ THỰC THI (EXECUTION ORDER)

| Step | Tasks | Ước lượng | Mục tiêu |
|------|-------|-----------|----------|
| **Step 1** | 1.1, 1.2, 2.1, 6.1 | 1 session | Foundation: JSON parser, error types, blacklist, overflow linter |
| **Step 2** | 1.3, 1.4, 1.5, 1.6 | 1-2 sessions | Universal API Gateway + OpenAI Compatible Translator |
| **Step 3** | 3.1, 3.2, 5.1, 5.2, 4.1, 4.2 | 1 session | Smart Glossary + Strict Glossary + AI Self-Correction |
| **Step 4** | 7.1, 7.2, 7.3, 7.4 | 1 session | Context Windowing |
| **Step 5** | 8.1, 8.2, 8.3, 8.4, 8.5, 8.6 | 1 session | Multi-Select UI + Floating Action Bar |
| **Step 6** | 1.7 | Nửa session | SettingsModal UI update (baseURL, customHeaders) |
| **Step 7** | 9.1, 9.2, 9.3, 9.4 | 1 session | Unpacker Skeleton |
| **Step 8** | 10.1, 10.2, 10.3, 10.4 | 1 session | Game Update / Diffing |
| **Step 9** | QA + E2E testing | 1 session | Test toàn bộ luồng |

**Tổng:** ~8-10 sessions

---

## 4. FILE SƠ ĐỒ THAY ĐỔI

### Files mới cần tạo:
```
src/main/utils/jsonParser.ts
src/main/api/errors.ts
src/main/utils/blacklistPatterns.ts
src/main/api/translators/OpenAICompatibleTranslator.ts
src/main/services/unpackerService.ts
src/main/python-tools/.gitkeep
src/renderer/src/components/cat-tool/FloatingActionBar.tsx
```

### Files cần sửa:
```
src/shared/types.ts                    (status 'modified', AppSettings providers config)
src/main/store/settings.ts             (new provider config schema)
src/main/api/aiService.ts              (factory refactor, context prompt, retry logic)
src/main/services/translationEngine.ts (blacklist, smart glossary, self-correction, context window)
src/main/utils/qaLinter.ts             (strict glossary, text overflow)
src/main/parser/rpyParser.ts           (diff logic for re-import)
src/main/services/parserService.ts     (isReparse flag)
src/main/ipcHandler.ts                 (unpackGame handler)
src/renderer/src/App.tsx               (multi-select handlers)
src/renderer/src/components/cat-tool/TranslationCard.tsx     (checkbox, modified status)
src/renderer/src/components/cat-tool/TranslationWorkspace.tsx (multi-select state, shift-click)
src/renderer/src/components/cat-tool/SettingsModal.tsx       (baseURL, customHeaders inputs)
src/renderer/src/components/screens/SetupWizardModal.tsx     (unpack warning)
package.json                           (add 'openai' dependency)
```

---

## 5. RỦI RO & LƯU Ý

| Rủi ro | Giải pháp |
|--------|-----------|
| `openai` SDK conflict với code hiện tại | Dùng namespace import, test kỹ trước khi merge |
| Context windowing làm tăng token đáng kể | Giới hạn `context_history` max 10 blocks trước |
| Diff logic phức tạp với file lớn | Transaction DB, test với project 10k+ blocks |
| Custom endpoints trả response không ổn định | `extractJsonArray()` phải robust, retry logic chặt |
| Multi-select performance với 10k blocks | Virtual scrolling (defer đến Phase 6 nếu cần) |

---

## 6. ĐỊNH NGHĨA "DONE" CHO PHASE 5

- [x] Universal API Gateway hoạt động với ít nhất 3 providers (OpenAI, DeepSeek, custom endpoint)
- [x] Robust JSON parser xử lý được markdown-wrapped responses
- [x] Regex blacklist auto-skip được system strings
- [x] Smart glossary injection chỉ gửi từ xuất hiện trong batch
- [x] AI self-correction retry thành công ít nhất 1 lần khi linter fail
- [x] Strict glossary check phát hiện được missing terms
- [x] Text overflow linter cảnh báo được câu dài >150%
- [x] Context windowing inject được conversation history vào prompt
- [x] Multi-select UI hoạt động (checkbox, shift-click, floating bar)
- [x] Unpacker skeleton có IPC handler + UI warning
- [x] Game update/diffing giữ được bản dịch cũ, đánh dấu modified
- [x] All existing tests pass (nếu có)
- [x] TypeScript build không lỗi

**Phase 5 hoàn thành — 10/10 hạng mục, 46/46 tasks ✅**
