CRITICAL HOTFIX: The Trojan Horse Export Strategy (Header Preservation)

1. The Critical Bug (In-game Language Fallback)

Currently, translations are exporting to the .rpy files, and .rpyc files are being successfully deleted. However, in-game, the text falls back to the root language (e.g., Spanish) instead of showing the translation.

The Root Cause:
In exportService.ts, the exporter is changing the translation block header from the source language to the target language.

Original: translate english start_123:

Current Export: translate vietnamese start_123:
When the user places this file in game/tl/english/ and selects "English" in the game menu, Ren'Py looks for translate english: blocks. Because we renamed them to vietnamese, Ren'Py finds nothing and falls back to the original root language.

2. The Solution: "Trojan Horse" Overwrite

Since we are using the Direct Overwrite strategy (placing Vietnamese text inside the english folder to trick the game), we MUST preserve the original language headers perfectly.

Rule: The outer shell (Header) remains the Source Language. The inner content (String) becomes the Target Language.

Expected Output: translate english start_123: (Keep exactly as original) -> followed by the Vietnamese text string.

3. Agent Execution Instructions (src/main/services/exportService.ts)

Locate the string replacement or file rebuilding logic inside your export function.

Step 1: REMOVE any logic that attempts to replace the source language name with the target language name in the block headers.

DO NOT do this: header.replace('translate english', 'translate vietnamese')

DO NOT do this: header.replace(sourceLanguage, targetLanguage)

Step 2: Ensure the Exporter simply takes the exact original header block (e.g., translate english start_a170b500:) and ONLY replaces the extracted original_text with the translated_text from the SQLite database.

Step 3: For strings blocks (UI text):

The original format is:
old "Start"
new "Start"

The output MUST BE:
old "Start" (Preserved perfectly)
new "Bắt đầu" (Injected translation)

Review your exportService.ts code now and apply this Trojan Horse rule.
