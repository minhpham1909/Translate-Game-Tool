/**
 * Smart Glossary Injection — Only send glossary terms relevant to the current batch.
 *
 * Reduces token usage and prevents AI confusion from irrelevant terminology.
 */

export interface GlossaryEntry {
  source_text: string
  target_text: string
}

/**
 * Filter glossary entries to only those relevant to the current batch of texts.
 *
 * Matching strategy:
 * 1. Case-insensitive substring match (glossary source appears in any batch text)
 * 2. Word-boundary aware for short terms (1-3 chars) to avoid false positives
 * 3. Always includes all entries if glossary is small (< 5 entries)
 *
 * @param entries All glossary entries from the database
 * @param batchTexts The current batch of source texts being translated
 * @returns Filtered glossary entries relevant to this batch
 */
export function filterSmartGlossary(
  entries: GlossaryEntry[],
  batchTexts: string[]
): GlossaryEntry[] {
  if (entries.length === 0 || batchTexts.length === 0) return []

  // Small glossary — send all terms (overhead is negligible)
  if (entries.length <= 5) return entries

  const matched = new Set<number>()

  // Combine all batch texts for efficient matching
  const batchLower = batchTexts.map((t) => t.toLowerCase())
  const combinedBatch = batchLower.join(' ')

  for (let i = 0; i < entries.length; i++) {
    const source = entries[i].source_text
    const sourceLower = source.toLowerCase()

    // Long terms: simple substring match
    if (sourceLower.length > 3) {
      if (combinedBatch.includes(sourceLower)) {
        matched.add(i)
        continue
      }
      // Also check individual texts for partial word matches
      for (const textLower of batchLower) {
        if (textLower.includes(sourceLower)) {
          matched.add(i)
          break
        }
      }
      continue
    }

    // Short terms (1-3 chars): require word-boundary match to avoid false positives
    // e.g., "AI" should match "AI system" but not "rain"
    const wordBoundaryPattern = new RegExp(
      `(?<![\\p{L}\\p{N}])${escapeRegex(sourceLower)}(?![\\p{L}\\p{N}])`,
      'u'
    )
    for (const textLower of batchLower) {
      if (wordBoundaryPattern.test(textLower)) {
        matched.add(i)
        break
      }
    }
  }

  // Return matched entries in original order
  return [...matched].sort((a, b) => a - b).map((i) => entries[i])
}

/**
 * Format glossary entries for injection into the system prompt.
 * Only includes entries with non-empty source and target.
 */
export function formatGlossaryForPrompt(entries: GlossaryEntry[]): string {
  if (entries.length === 0) return ''

  return entries
    .filter((e) => e.source_text.trim() && e.target_text.trim())
    .map((e) => `• "${e.source_text}" → "${e.target_text}"`)
    .join('\n')
}

function escapeRegex(str: string): string {
  return str.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
}
