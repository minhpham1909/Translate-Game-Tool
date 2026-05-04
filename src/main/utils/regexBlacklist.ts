/**
 * Regex Blacklist — Auto-skip strings that should not be translated.
 *
 * Saves tokens and prevents AI hallucination on non-translatable content.
 */

import type { BlacklistPattern } from '../../shared/types'

/**
 * Default blacklist patterns.
 */
export const DEFAULT_BLACKLIST_PATTERNS: BlacklistPattern[] = [
  {
    pattern: '^\\s*$',
    description: 'Empty or whitespace-only strings',
    enabled: true,
  },
  {
    pattern: '^\\[Image\\s*\\d*\\]$',
    description: 'Image placeholder [Image 1]',
    enabled: true,
  },
  {
    pattern: '^\\[CG\\s*\\d*\\]$',
    description: 'CG placeholder [CG 1]',
    enabled: true,
  },
  {
    pattern: '^\\[BG\\s*\\d*\\]$',
    description: 'BG placeholder [BG 1]',
    enabled: true,
  },
  {
    pattern: '^\\[Scene\\s*\\d*\\]$',
    description: 'Scene placeholder [Scene 1]',
    enabled: true,
  },
  {
    pattern: '^[^\\p{L}\\p{N}]+$',
    description: 'Punctuation/symbols only (no letters or numbers)',
    enabled: true,
  },
  {
    pattern: '^[0-9]+$',
    description: 'Pure numbers',
    enabled: true,
  },
  {
    pattern: '^\\p{Lu}$',
    description: 'Single uppercase letter',
    enabled: false,
  },
]

/**
 * Test a single string against all enabled blacklist patterns.
 * Returns the first matching pattern description, or null if no match.
 */
export function matchBlacklist(text: string, patterns: BlacklistPattern[]): string | null {
  if (!text || text.length === 0) return 'Empty string'

  for (const p of patterns) {
    if (!p.enabled) continue
    try {
      const re = new RegExp(p.pattern, 'u')
      if (re.test(text)) {
        return p.description
      }
    } catch {
      // Invalid regex — skip
      console.warn(`[Blacklist] Invalid regex pattern: ${p.pattern}`)
    }
  }
  return null
}

/**
 * Filter a batch of strings, returning blacklisted ones separately.
 *
 * @param texts Array of strings to check
 * @param patterns Active blacklist patterns
 * @returns { toTranslate, skipped: { text, reason }[] }
 */
export function filterBlacklist(
  texts: string[],
  patterns: BlacklistPattern[]
): {
  toTranslate: string[]
  skipped: { text: string; reason: string }[]
} {
  const toTranslate: string[] = []
  const skipped: { text: string; reason: string }[] = []

  for (const text of texts) {
    const reason = matchBlacklist(text, patterns)
    if (reason) {
      skipped.push({ text, reason })
    } else {
      toTranslate.push(text)
    }
  }

  return { toTranslate, skipped }
}
