# Database Schema Changelog

## [2026-04-29] Khởi Tạo Schema Lần Đầu
**Change type:** Added
**Reason:** Khởi tạo DB ban đầu cho dự án VN Translator dựa theo Project Context gốc.

**Tables created:**
- `files`
- `translation_blocks`
- `translation_memory`
- `blocks_fts` (Virtual FTS5 table)

**Triggers created:**
- `tbl_ai_after_insert`
- `tbl_ai_after_update`
- `tbl_ai_after_delete`
