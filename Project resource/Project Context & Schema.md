MASTER PROJECT CONTEXT & DATABASE SCHEMA: Ren'Py AI Translator

1. Project Overview & Product Vision

This is a commercial-grade, local desktop application designed to automate and manage the translation of Ren'Py Visual Novel game files (.rpy). It uses AI APIs (Gemini, GPT, Claude) to translate massive amounts of text (100k+ lines) while strictly preserving game engine logic, variables, and formatting. The tool includes advanced CAT (Computer-Assisted Translation) features like Translation Memory, Auto-QA, and a highly optimized UI for post-editing.

2. Tech Stack & Environment

Framework: Electron built with electron-vite.

Renderer Process (Frontend): React 19, TypeScript, Tailwind CSS. UI must be highly optimized for large datasets.

Main Process (Backend): Node.js.

Database: better-sqlite3 (Required for handling 100k+ rows efficiently with FTS5).

File System: fs-extra for safe file I/O operations.

AI Integration: @google/generative-ai (Core) + Extensible adapter pattern for OpenAI/Anthropic.

Architecture Rule: Strict isolation. The Renderer MUST NOT access the file system or DB directly. All communications must go through ipcMain and ipcRenderer (exposed via preload script).

3. Core Domain Rules (CRITICAL FOR REN'PY)

Failing these rules will crash the user's game. The AI Agent MUST implement safeguards for these:

Indentation is Code: The exact leading whitespace (spaces/tabs) of the original line MUST be captured during parsing and strictly applied to the translated line during export.

Variable & Tag Preservation: - [variables] (e.g., [player_name]) and {tags} (e.g., {b}, {color=#f00}) MUST NOT be translated or removed.

Escape characters (\", \n) must be preserved.

Translation Block Structure: Target only game/tl/ directory files.

Dialogue: Extract strings after #  comments inside translate <language> <id>: blocks.

Strings/UI: Extract strings from new "..." lines inside translate <language> strings: blocks.

4. Database Schema & Models (SQLite)

The backend must initialize this schema using better-sqlite3.
Use PRAGMA journal_mode = WAL; and PRAGMA foreign_keys = ON; upon connection.

Table 1: files

Manages the tree structure of .rpy files. Used by the UI to render the sidebar navigation.

CREATE TABLE IF NOT EXISTS files (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    file_path TEXT UNIQUE NOT NULL,       -- E.g., "game/tl/vietnamese/script.rpy"
    file_name TEXT NOT NULL,              -- E.g., "script.rpy"
    total_blocks INTEGER DEFAULT 0,       
    translated_blocks INTEGER DEFAULT 0,  
    status TEXT DEFAULT 'pending',        -- 'pending', 'in_progress', 'completed'
    updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX IF NOT EXISTS idx_files_status ON files(status);


Agent Note: Provide a method updateFileProgress(fileId) to recalculate translated_blocks based on the translation_blocks table.

Table 2: translation_blocks

The core table. Stores every single translatable string.

CREATE TABLE IF NOT EXISTS translation_blocks (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    file_id INTEGER NOT NULL,             
    block_hash TEXT NOT NULL,             -- E.g., "start_a170b500"
    block_type TEXT NOT NULL,             -- 'dialogue' or 'string'
    character_id TEXT,                    -- E.g., "e". NULL if UI text.
    original_text TEXT NOT NULL,          
    translated_text TEXT,                 
    status TEXT DEFAULT 'empty',          -- 'empty', 'draft', 'approved', 'warning'
    indentation TEXT NOT NULL,            -- CRITICAL: Stores exact leading spaces
    line_index INTEGER NOT NULL,          -- Row number in the original .rpy file
    FOREIGN KEY (file_id) REFERENCES files (id) ON DELETE CASCADE
);
CREATE INDEX IF NOT EXISTS idx_blocks_file_id ON translation_blocks(file_id);
CREATE INDEX IF NOT EXISTS idx_blocks_status ON translation_blocks(status);
CREATE INDEX IF NOT EXISTS idx_blocks_character ON translation_blocks(character_id);


Agent Note: indentation MUST NOT be trimmed. Status transitions: empty -> AI translates -> draft -> User edits -> approved.

Table 3: translation_memory (TM)

Cost-saving cache. Stores previously translated sentences to prevent duplicate API calls.

CREATE TABLE IF NOT EXISTS translation_memory (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    original_text TEXT UNIQUE NOT NULL,   
    translated_text TEXT NOT NULL,
    usage_count INTEGER DEFAULT 1,        
    last_used_at DATETIME DEFAULT CURRENT_TIMESTAMP
);


Agent Note: Before calling the AI Service, query this table. If match found, auto-fill the block and increment usage_count.

Table 4: blocks_fts (Virtual Table)

Enables lightning-fast, global Full-Text Search.

CREATE VIRTUAL TABLE IF NOT EXISTS blocks_fts USING fts5(
    original_text, 
    translated_text, 
    content='translation_blocks', 
    content_rowid='id'
);

-- Triggers to auto-sync FTS with translation_blocks
CREATE TRIGGER IF NOT EXISTS tbl_ai_after_insert AFTER INSERT ON translation_blocks BEGIN
  INSERT INTO blocks_fts(rowid, original_text, translated_text) 
  VALUES (new.id, new.original_text, new.translated_text);
END;

CREATE TRIGGER IF NOT EXISTS tbl_ai_after_update AFTER UPDATE ON translation_blocks BEGIN
  UPDATE blocks_fts 
  SET original_text = new.original_text, translated_text = new.translated_text 
  WHERE rowid = old.id;
END;

CREATE TRIGGER IF NOT EXISTS tbl_ai_after_delete AFTER DELETE ON translation_blocks BEGIN
  INSERT INTO blocks_fts(blocks_fts, rowid, original_text, translated_text) 
  VALUES('delete', old.id, old.original_text, old.translated_text);
END;


5. Key System Modules & Features

5.1. Parser & Auto-Tagging

Read .rpy files line-by-line using a State Machine logic.

Extract dialogue and preserve indentation.

5.2. Translation Engine & Background Queue

Background Worker: A queue system fetches status = 'empty' rows, batches them (e.g., 20 lines), calls API, handles rate limiting (Delay/Retry on 429 errors).

5.3. Frontend UX & Rendering (Performance)

Virtual Scrolling: Use react-window or react-virtuoso to render lists. Never render 10,000 DOM nodes at once.

Pagination: Fetch data from SQLite via IPC using LIMIT and OFFSET.

Debounce: Input fields for manual editing must use a 500ms debounce before triggering an IPC DB update.

5.4. QA Linter & System Logs

Auto-QA Linter: Validate [ and { counts between original and translation. Flag mismatches with [WARNING] status.

System Log Console: Real-time terminal UI at the bottom receiving IPC events.

5.5. Safe Exporting

When exporting, the system MUST:

Rename target file to [filename].rpy.backup_[timestamp].

Create new file, re-reading source line-by-line and injecting translations with exact indentation.

6. General Instructions for AI Agent

ALWAYS write clean, typed TypeScript code.

Implement UI components using Tailwind CSS utility classes.

ALL database insert/update operations processing multiple rows (parsing file, batch AI translations) MUST be wrapped in a database transaction to optimize disk I/O.

Always use parameterized queries (e.g., stmt.run(val1, val2)) to prevent SQL injection.

Wait for user instructions on which specific module to build first.