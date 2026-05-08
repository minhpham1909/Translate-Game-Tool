HOTFIX CONTEXT: Handling "Dirty Source" (Pre-translated Files)

1. The Business Problem (Dirty Source)

Because we use the "Direct Overwrite" strategy, if a user deletes a project and creates a new one using the same game folder, the files have already been modified. The parser will extract Vietnamese text and mistakenly place it into the original_text column with status = 'empty'.
If the user clicks "Translate All", the AI will try to translate Vietnamese into Vietnamese, wasting API tokens and potentially causing hallucinations.

2. The Solution: Heuristic Language Detection

We must detect if a string is already in the target language BEFORE saving it as 'empty' in the database. We will use a lightweight Regex approach (Heuristics) instead of a heavy external library.

A. Create the Language Detector Utility (src/main/utils/langDetector.ts)

Create a new utility file with the following logic:

/**
 * Detects if a text string contains characters specific to the target language.
 */
export function isAlreadyTranslated(text: string, targetLanguage: string): boolean {
  if (!text || text.trim() === '') return false;

  const lang = targetLanguage.toLowerCase();

  // Rule for Vietnamese: Check for specific diacritics
  if (lang.includes('việt') || lang.includes('vietnamese') || lang.includes('vn')) {
    // Regex matches any Vietnamese-specific character (both lower and upper case)
    const vnRegex = /[àáảãạăằắẳẵặâầấẩẫậèéẻẽẹêềếểễệìíỉĩịòóỏõọôồốổỗộơờớởỡợùúủũụưừứửữựỳýỷỹỵđ]/i;
    return vnRegex.test(text);
  }

  // Future proofing for other languages (e.g., Japanese Kana/Kanji)
  if (lang.includes('japanese') || lang.includes('nhật')) {
    const jpRegex = /[\u3040-\u30ff\u3400-\u4dbf\u4e00-\u9fff]/;
    return jpRegex.test(text);
  }

  return false;
}


B. Integrate into Parser (src/main/services/parserService.ts)

When the parser finishes extracting blocks and maps them for Database insertion (batch insert), intercept the object creation.

Implementation Rule:
For each extracted block:

Run isAlreadyTranslated(originalText, targetLanguage).

If true:

Set status = 'approved'

Set translated_text = originalText (Because the source text is actually the translated text)

If false:

Keep status = 'empty'

Keep translated_text = null

Agent Note: Look for your db.prepare('INSERT INTO translation_blocks...') logic in the parser service and apply this filter before the insertion.

C. Safety Net in Translation Engine (src/main/services/translationEngine.ts)

Just to be 100% safe, when pulling a batch of empty blocks to send to the AI:

Double check: If isAlreadyTranslated(block.original_text, settings.targetLanguage) returns true, immediately mark the block as approved in the DB and remove it from the AI payload batch.

3. Agent Execution Steps

Create src/main/utils/langDetector.ts with the provided Regex.

Update src/main/services/parserService.ts to apply the detector during the parsing phase.

Update src/main/services/translationEngine.ts to add the safety net check.
