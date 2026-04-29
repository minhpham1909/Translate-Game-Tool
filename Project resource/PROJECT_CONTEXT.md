# MASTER PROJECT CONTEXT: Ren'Py Visual Novel AI Translator

## 1. Project Overview & Product Vision
This is a commercial-grade, local desktop application designed to automate and manage the translation of Ren'Py Visual Novel game files (`.rpy`). It uses AI APIs (Gemini, GPT, Claude) to translate massive amounts of text (100k+ lines) while strictly preserving game engine logic, variables, and formatting. The tool includes advanced CAT (Computer-Assisted Translation) features like Translation Memory, Auto-QA, and a highly optimized UI for post-editing.

## 2. Tech Stack & Environment
- **Framework:** Electron built with `electron-vite`.
- **Renderer Process (Frontend):** React 19, TypeScript, Tailwind CSS. UI must be highly optimized for large datasets.
- **Main Process (Backend):** Node.js.
- **Database:** `better-sqlite3` (Required for handling 100k+ rows efficiently with FTS5).
- **File System:** `fs-extra` for safe file I/O operations.
- **AI Integration:** `@google/generative-ai` (Core) + Extensible adapter pattern for OpenAI/Anthropic.
- **Architecture Rule:** Strict isolation. The Renderer MUST NOT access the file system or DB directly. All communications must go through `ipcMain` and `ipcRenderer` (exposed via `preload` script).

## 3. Core Domain Rules (CRITICAL FOR REN'PY)
Failing these rules will crash the user's game. The AI Agent MUST implement safeguards for these:
1. **Indentation is Code:** The exact leading whitespace (spaces/tabs) of the original line MUST be captured during parsing and strictly applied to the translated line during export.
2. **Variable & Tag Preservation:** - `[variables]` (e.g., `[player_name]`) and `{tags}` (e.g., `{b}`, `{color=#f00}`) MUST NOT be translated or removed.
   - Escape characters (`\"`, `\n`) must be preserved.
3. **Translation Block Structure:** Target only `game/tl/` directory files.
   - *Dialogue:* Extract strings after `# ` comments inside `translate <language> <id>:` blocks.
   - *Strings/UI:* Extract strings from `new "..."` lines inside `translate <language> strings:` blocks.

## 4. Database Schema & Performance Optimization (SQLite)
To handle 100,000+ lines without lag, the Backend must implement:
- **Indexing:** Create DB indexes on `status`, `file_name`, and `block_id`.
- **Full-Text Search (FTS5):** Enable FTS5 for lightning-fast global search across original and translated texts.
- **Transactions:** Wrap batch updates/inserts in `BEGIN TRANSACTION; ... COMMIT;`.
- **Data Model (TranslationBlock):**
  - `id` (PK)
  - `file_name` (e.g., "script.rpy")
  - `block_id` (Ren'Py hash)
  - `type` ("dialogue" | "string")
  - `character_id` (e.g., "e" - for filtering)
  - `original_text`
  - `translated_text`
  - `status` ("empty" | "draft" | "approved")
  - `indentation` (string of spaces)
  - `line_index` (integer)

## 5. Key System Modules & Features

### 5.1. Parser & Auto-Tagging
- Read `.rpy` files line-by-line.
- **Contextual Awareness:** Auto-tag parsed blocks based on context (e.g., blocks in `screens.rpy` or `strings` blocks are tagged as `UI/Menu`; blocks with character IDs are tagged as `Dialogue`).

### 5.2. Translation Engine & Background Queue
- **Translation Memory (TM):** Before calling the API, check the TM database. If an exact match exists, auto-fill it to save API costs.
- **Background Worker:** A queue system that fetches `status = 'empty'` rows, batches them (e.g., 20 lines for context), sends them to the AI, and handles rate limiting (Delay/Retry on 429 errors).
- **Multi-Model Support:** UI settings to input API keys and a "Test Connection" validation button.

### 5.3. Frontend UX & Rendering (Performance Critical)
- **Virtual Scrolling:** Use `react-window` or `react-virtuoso` to render lists. Never render 10,000 DOM nodes at once.
- **Pagination:** Fetch data from SQLite via IPC using `LIMIT` and `OFFSET` or Cursor-based pagination.
- **Debounce:** Input fields for manual editing must use a 500ms debounce before triggering an IPC DB update.
- **Filters & Navigation:** A Tree View sidebar for files. Tabs for filtering statuses (`All`, `Pending`, `Drafts`).

### 5.4. QA Linter & System Logs
- **Auto-QA Linter:** A validation function that counts `[` and `{` in the original text vs translation. If mismatched, flag the row with a `[WARNING]` status for manual review.
- **System Log Console:** A real-time terminal UI at the bottom of the screen receiving IPC events (e.g., `[INFO] Parsing...`, `[SUCCESS] Batch translated`).

### 5.5. Safe Export & Pre-flight
- **Pre-flight Analyzer:** Calculate total pending characters and estimate API token cost before starting bulk translation.
- **Safe Exporting:** When exporting, the system MUST:
  1. Rename the target file to `[filename].rpy.backup_[timestamp]`.
  2. Create a new file, re-reading the source line-by-line and injecting the `approved` or `draft` translations from the DB with exact indentation.

## 6. Instructions for AI Agent
- ALWAYS write clean, typed TypeScript code.
- Implement UI components using Tailwind CSS utility classes.
- For DB operations, always use parameterized queries to prevent SQL injection and ensure stability with special characters.
- Wait for user instructions on which specific module to build first.