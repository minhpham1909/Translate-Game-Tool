# PROJECT CONTEXT: Ren'Py Visual Novel AI Translator

## 1. Project Overview
This is a desktop application designed to automate the translation of Ren'Py Visual Novel game files (`.rpy`) using AI APIs (Gemini/Claude). The tool must parse specific translation blocks in `.rpy` files, extract original text, send it to an AI for translation while preserving game logic/variables, and rewrite the file safely without breaking the game engine.

## 2. Tech Stack & Environment
- **Framework:** Electron with React + TypeScript (Initialized via `electron-vite`).
- **Main Process (Backend):** Node.js, `fs-extra` (File I/O), `electron-store` (Local Database/State management), `@google/generative-ai` (AI API).
- **Renderer Process (Frontend):** React 19, TypeScript, Tailwind CSS.
- **Architecture:** Strict separation of Main and Renderer. All Node.js/File operations MUST go through `ipcMain` and be exposed via `preload` script.

## 3. Core Domain Rules (CRITICAL FOR REN'PY)
When parsing and writing `.rpy` files, the following rules are absolute. Failing to follow them will crash the user's game:

1. **Indentation is Code:** Ren'Py uses Python-like indentation. The parser MUST capture the exact leading whitespace of the original line and apply it to the translated line.
2. **Translation Block Structure:** We only target files in the `game/tl/` directory.
   - Dialogue block format:
     ```renpy
     translate vietnamese start_a170b500:
         # e "Original text here"
         e "Translated text goes here"
     ```
   - String block format:
     ```renpy
     translate vietnamese strings:
         old "Start Game"
         new "Bắt đầu Game"
     ```
3. **Variable & Tag Preservation:**
   - Variables in brackets `[player_name]`, `[variable_1]` MUST NOT be translated.
   - Text tags in braces `{b}`, `{color=#f00}` MUST NOT be translated.
   - Escape characters like `\"` or `\n` must be preserved.

## 4. Key Modules to Implement

### Module 1: The RpyParser (`src/main/parser/rpyParser.ts`)
- **Task:** Read a `.rpy` file line-by-line.
- **Logic:** Maintain a state machine (State: `OUTSIDE`, `IN_DIALOGUE_BLOCK`, `IN_STRING_BLOCK`).
- **Extraction:** When in a block, find the line starting with `# ` (commented original text), extract the dialogue inside quotes, and record its exact line index and indentation.
- **Output:** An array of `TranslationBlock` objects (blockId, type, characterId, originalText, lineIndex, indent).

### Module 2: The AI Connector (`src/main/api/aiService.ts`)
- **Task:** Take an array of strings, construct a prompt, and call the Gemini API.
- **Constraints:**
  - Must include a strict system prompt instructing the AI to act as a VN translator and NEVER modify `[]` or `{}`.
  - Must handle Rate Limiting (HTTP 429) with exponential backoff or queueing.
  - Must support batching (e.g., sending 10-20 lines at once for context).

### Module 3: State & Glossary Manager (`src/main/store/index.ts`)
- **Task:** Use `electron-store` to save user API Keys, project paths, and a translation Glossary (Dictionary) to ensure consistent character/location names across the game.

### Module 4: The UI (`src/renderer/src/App.tsx`)
- **Task:** Build a dashboard to:
  1. Select a folder containing `.rpy` files.
  2. Display a list of files and their translation progress.
  3. A dual-pane view showing Original Text (Left) vs. Translated Text (Right) for manual review.

## 5. Agent Instructions for Current Session
1. Read this context carefully.
2. Wait for my specific instructions on which module to build first.
3. Always provide fully typed TypeScript code.
4. When writing Regex for the parser, thoroughly explain the capture groups.