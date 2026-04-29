FEATURE CONTEXT: Multi-Language Routing & Project Initialization

1. The Business Problem (Ren'Py Multi-Language Structure)

Ren'Py games often contain multiple languages.

The Root/Default language scripts are in game/*.rpy.

Translations are in game/tl/<language>/*.rpy.
A translation block in game/tl/english/script.rpy looks like this:
```renpy
translate english start_a170b500:

e "こんにちは" (This is the root language comment)

e "Hello" (This is the active translated string)
```
If a user wants to translate from English to Vietnamese, the Parser MUST extract the active string ("Hello"), NOT the commented string ("こんにちは").

2. Project State Management (electron-store)

To handle this, we must store the Current Project configuration in electron-store (separate from AppSettings).
Add a ProjectConfig state containing:

gameFolderPath: Absolute path to the game/ folder.

sourceLanguage: 'default' (meaning root files) OR a specific language folder name (e.g., 'english', 'spanish').

targetLanguage: The output language folder name (e.g., 'vietnamese').

3. Project Initialization Flow (Setup Wizard UI -> Main Process)

When the user creates a new translation project:

User selects the game/ folder via UI.

The Backend scans the game/tl/ directory and returns a list of available translation folders (e.g., ['english', 'chinese']).

The UI asks the user to select the Source Language (Options: "Root Scripts", "english", "chinese").

The UI asks the user to input the Target Language (e.g., "vietnamese").

Backend saves this ProjectConfig to the store.

4. Upgraded Parser Logic (CRITICAL)

The rpyParser.ts module must adapt its Regex and extraction logic based on the ProjectConfig.sourceLanguage:

Scenario A: sourceLanguage is 'default' (Root Scripts)

This is for extracting directly from the original game files (not recommended for VN translation, but needed for edge cases).

The Parser scans game/*.rpy (excluding tl/ folder).

It extracts standard dialogue lines (e.g., e "Hello").

Since it's generating a new translation, it must create the Ren'Py hash IDs (complex, usually we rely on Ren'Py SDK to generate the tl/ folder first).

Agent Note: For MVP, restrict the tool to ONLY work with Scenario B (translating from an existing tl/ folder).

Scenario B: sourceLanguage is a specific language (e.g., 'english')

This is the Primary Flow.

The Parser ONLY scans files inside game/tl/<sourceLanguage>/.

When it encounters translate <sourceLanguage> <block_hash>::

It ignores the #  commented line.

It extracts the active string (the actual English text) as the original_text for the AI.

It records the exact indentation and line index.

5. Upgraded Export Logic (Cross-Translation Export)

When the user clicks "Export" to apply their translations:

Target Directory: The exporter creates or targets game/tl/<targetLanguage>/.

File Generation: For each file, it reads the original file from game/tl/<sourceLanguage>/.

Block Transformation:

It changes the block header from translate <sourceLanguage> <hash>: to translate <targetLanguage> <hash>:.

It takes the extracted Source string (e.g., the English text) and writes it as the #  comment (so the user has a reference in the code).

It writes the translated_text (Vietnamese) as the new active line.

6. Agent Instructions

Implement the ProjectConfig store in electron-store to track the current working project.

Update the RpyParser module to explicitly accept sourceLanguage and targetLanguage parameters.

Write robust Regex in the Parser to extract the active line in a tl/ block, completely bypassing the commented line.

Prepare the IPC handlers for the "Project Setup Wizard" so the React Frontend can query available languages in the tl/ folder.