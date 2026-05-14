HOTFIX CONTEXT: Global Translation Memory & Zero-Token Auto-Fill

1. The Business Problem (Wasted Tokens on Repeated UI/Text)

Currently, the translation_memory and glossaries tables reside inside the per-project SQLite database (vnt_<GameName>.sqlite). If a user translates "Start Game" in Project A, they have to pay API tokens to translate it again in Project B.
We need to elevate TM and Glossaries to a Global SQLite Database so knowledge compounds across all projects, acting as an offline auto-translation dictionary for exact matches.

2. Solution Pillar 1: The Global Database (src/main/store/globalDb.ts)

Create a new dedicated database file for global assets.

Path: app.getPath('userData')/db/global_assets.sqlite

Tables: Move the creation of translation_memory and glossaries tables from database.ts into this new globalDb.ts.

Logic: Whenever a block is marked as approved in ANY project, it upserts the {original_text, translated_text} into the global_assets.sqlite TM table.

3. Solution Pillar 2: Pre-parsing Auto-Fill (Zero-Token Translation)

Update src/main/services/parserService.ts. We must intercept blocks BEFORE they are saved as empty.

The New Pipeline inside parseProject:
For every extracted original_text:

Rule 1 (Dirty Source): Run isAlreadyTranslated(original_text). If true -> mark approved, translated_text = original_text.

Rule 2 (Global TM Exact Match): Query globalDb -> SELECT translated_text FROM translation_memory WHERE original_text = ?.

If a match is found: Mark status = 'approved', translated_text = match, translated_by = 'TM'.

Rule 3 (Fallback): If no match, save as empty.

Agent Note: This ensures that when the user opens a new project, thousands of UI strings and repeated dialogues are instantly translated for free before the AI Queue even starts.

4. Solution Pillar 3: Strict Glossary Isolation (For AI Prompts)

Ensure src/main/utils/smartGlossary.ts strictly isolates glossary terms.

Rule: Do NOT use Glossaries for physical string-replacement in the text. Glossaries MUST ONLY be appended to the AI System Prompt.

Optimization: Only append a glossary term to the prompt if the source text of the current AI batch actually .includes() the glossary source term.

5. Agent Execution Steps

STEP 1: Create src/main/store/globalDb.ts and migrate the translation_memory and glossaries table schemas there. Remove them from the per-project database.ts.
STEP 2: Update tmService.ts and glossaryService.ts to read/write from globalDb instead of the project DB.
STEP 3: Update parserService.ts to implement the Rule 2 (Global TM Exact Match) check during the initial file parsing phase.
STEP 4: Update workspaceService.ts or translationEngine.ts to ensure that whenever a block's status becomes approved, it fires an async background upsert to the Global TM.
