HOTFIX CONTEXT: Trojan Horse Paradox & UI Progress Synchronization

1. Bug 1: The Trojan Horse Paradox (Language Detection Failure)

The Issue: The langDetector.ts relies on the targetLanguage variable (e.g., checking if it contains 'vietnamese'). Because we use the Trojan Horse strategy, the user often sets the Target Language to english (to overwrite tl/english). This causes the detector to skip the Vietnamese Regex entirely, leaving pre-translated Vietnamese blocks as empty.

A. The Fix (src/main/utils/langDetector.ts)

Remove the strict dependency on the targetLanguage string for Vietnamese detection. The tool should inherently recognize Vietnamese characters regardless of the folder routing name.

Rewrite the utility:

/**
 * Detects if a text string contains characters specific to the translated language.
 */
export function isAlreadyTranslated(text: string): boolean {
  if (!text || text.trim() === '') return false;

  // Universal Vietnamese Regex (Includes both lower and upper case specifically to be safe)
  const vnRegex = /[àáảãạăằắẳẵặâầấẩẫậèéẻẽẹêềếểễệìíỉĩịòóỏõọôồốổỗộơờớởỡợùúủũụưừứửữựỳýỷỹỵđÀÁẢÃẠĂẰẮẲẴẶÂẦẤẨẪẬÈÉẺẼẸÊỀẾỂỄỆÌÍỈĨỊÒÓỎÕỌÔỒỐỔỖỘƠỜỚỞỠỢÙÚỦŨỤƯỪỨỬỮỰỲÝỶỸỴĐ]/;

  if (vnRegex.test(text)) {
    return true;
  }

  // Future proofing for Japanese (Kanji/Kana)
  const jpRegex = /[\u3040-\u30ff\u3400-\u4dbf\u4e00-\u9fff]/;
  if (jpRegex.test(text)) {
      return true;
  }

  return false;
}


Agent Note: Update parserService.ts to call this new signature isAlreadyTranslated(originalText) without passing the target language.

2. Bug 2: UI Progress Showing 0% (DB Desync)

The Issue: The Sidebar UI reads total_blocks and translated_blocks from the files table. When the parser auto-approves "Dirty Source" blocks, or when a user reopens an existing DB, these columns in the files table are NOT updated. As a result, the progress bar stays at 0%.

A. The Fix: Create a Sync Function (src/main/store/database.ts or workspaceService.ts)

Create a powerful SQL aggregation function that forces the files table to sync with the translation_blocks table.

export function syncAllFilesProgress() {
  const db = getDatabase();
  if (!db) return;

  const syncQuery = `
    UPDATE files
    SET
      total_blocks = (
        SELECT COUNT(*)
        FROM translation_blocks
        WHERE translation_blocks.file_id = files.id
      ),
      translated_blocks = (
        SELECT COUNT(*)
        FROM translation_blocks
        WHERE translation_blocks.file_id = files.id
        AND status IN ('approved', 'draft', 'modified')
      );
  `;

  try {
    db.prepare(syncQuery).run();
  } catch (err) {
    console.error("[DB] Failed to sync files progress:", err);
  }
}


B. Trigger the Sync

The Agent MUST call syncAllFilesProgress() in TWO specific places:

In src/main/services/parserService.ts: Call it at the very end of parseProject() (after all files are parsed and inserted).

In src/main/api/projectIpc.ts: Call it inside openProject() (right after successfully loading the existing database).

3. Agent Execution Steps

Refactor langDetector.ts to use the unconditional Regex check and update where it is called in parserService.ts and translationEngine.ts.

Implement syncAllFilesProgress() in the database or workspace service.

Inject the sync function call at the end of the Parsing flow AND the Open Project flow.
