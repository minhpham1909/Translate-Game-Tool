PHASE 4 CONTEXT: IPC Bridge & Frontend React UI Architecture

1. Overview

The Backend Core (Parser, SQLite, TM, AI Engine, Exporter) is complete. We now need to build the Bridge (IPC) and the User Interface (React).

Security Rule: The React Frontend (src/renderer) MUST NOT import fs, better-sqlite3, or @google/generative-ai. All operations must go through window.api defined in src/preload/index.ts.

2. The IPC Bridge Definition (Main <-> Renderer)

The Agent must implement the following IPC channels in src/main/ipcHandler.ts (or similar) and expose them in src/preload/index.ts.

A. Dialog & Project Setup

dialog:selectFolder: Opens OS folder picker. Returns folder path.

project:scanLanguages: Takes a folder path, scans game/tl/, returns available languages ['english', 'chinese', ...].

project:init: Saves ProjectConfig (source/target language) and triggers the Parser to extract data into SQLite.

B. File & Data Fetching (Pagination is CRITICAL)

db:getFiles: Returns list of files from the files table with translation progress.

db:getBlocks: Takes { fileId, statusFilter, limit, offset, searchQuery }. Returns paginated translation_blocks. Use FTS5 blocks_fts if searchQuery is present.

db:updateBlock: Takes { blockId, translatedText, status }. Updates the DB. (Used when user manually edits a translation).

C. Actions & Engine Triggers

engine:translateBatch: Takes an array of blockIds. Backend fetches them, checks Translation Memory, calls AI Service, updates DB, and returns success/fail.

engine:exportProject: Triggers the Safe Exporter module.

settings:get / settings:save: Reads/Writes electron-store.

D. Server-Sent Events (Main -> Renderer)

The Preload script must expose an onSystemLog and onProgressUpdate listener so the Backend can push real-time terminal logs and progress bar updates to React.

3. Frontend React Architecture (src/renderer/src/)

Use Tailwind CSS, Lucide React (for icons), and a Virtualized List library (e.g., react-virtuoso or react-window) to handle rendering 10,000+ items without lag.

Component 1: Sidebar (Left Pane)

Renders the tree/list of .rpy files.

Calls window.api.db.getFiles().

Shows a mini progress bar for each file.

Selecting a file sets the activeFileId in the global state.

Component 2: Workspace (Main Center Pane)

Contains a Top Bar with Filters (Tabs: All, Empty, Draft, Approved, Warning) and a Search Input.

Virtualized List: Renders TranslationCard components based on window.api.db.getBlocks(). Implements infinite scrolling or pagination.

Component 3: TranslationCard (The Core UI Unit)

A visually distinct row/card.

Header: Shows Character ID (e.g., "e") and Block Hash.

Body (Grid 2-cols):

Left: original_text (Read-only, muted).

Right: <textarea> for translated_text. Uses a 500ms debounce on change to call window.api.db.updateBlock().

Footer: Shows Status Badge (Colored: Gray/Empty, Blue/Draft, Green/Approved, Red/Warning). Shows a "Translate this block" icon button.

Component 4: BottomTerminal (Log Viewer)

A collapsible footer panel.

Listens to window.api.onSystemLog((msg) => {...}) and displays an auto-scrolling terminal output.

Component 5: SettingsModal

A modal mapping to the AppSettings interface.

Includes inputs for API Keys, Target Language, Custom Prompt, and a "Test Connection" button.

4. Agent Instructions for Phase 4 Execution

DO NOT build everything at once. Follow this exact sequence:

STEP 1: The Preload & IPC setup. Write the preload/index.ts and the IPC handlers in the main process. Expose the API safely. Wait for my confirmation.

STEP 2: The UI Skeleton. Create the basic React layout (Sidebar, Workspace, Bottom Terminal) using Tailwind, with Mock Data. Wait for my confirmation.

STEP 3: Wiring Data. Connect the React components to the window.api methods. Implement the Virtualized List and Debounced Textarea.