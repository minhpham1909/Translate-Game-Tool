/**
 * AI Self-Correction — Progressive auto-retry with error categorization.
 *
 * When the linter detects issues, the AI is shown its own bad translation
 * along with specific error messages, and asked to fix them.
 *
 * Retry strategy:
 *   Attempt 0: Normal translation
 *   Attempt 1: Gentle correction — show errors only
 *   Attempt 2: Strict correction — show original + bad translation + errors
 */

/**
 * Severity levels for linter errors.
 */
export type ErrorSeverity = 'critical' | 'warning'

/**
 * Categorize a single linter error message.
 */
export function categorizeError(errorMsg: string): { severity: ErrorSeverity; label: string } {
  if (errorMsg.includes('Thiếu biến') || errorMsg.includes('Thiếu thẻ định dạng')) {
    return { severity: 'critical', label: 'Missing element' }
  }
  if (errorMsg.includes('Biến lạ') || errorMsg.includes('Thẻ định dạng lạ')) {
    return { severity: 'warning', label: 'Extra element' }
  }
  return { severity: 'warning', label: 'Unknown' }
}

/**
 * Categorize a list of errors and return a summary.
 */
export function categorizeErrors(errors: string[]): {
  critical: string[]
  warnings: string[]
  summary: string
} {
  const critical: string[] = []
  const warnings: string[] = []

  for (const err of errors) {
    const { severity } = categorizeError(err)
    if (severity === 'critical') {
      critical.push(err)
    } else {
      warnings.push(err)
    }
  }

  const parts: string[] = []
  if (critical.length > 0) parts.push(`${critical.length} critical`)
  if (warnings.length > 0) parts.push(`${warnings.length} warnings`)
  const summary = parts.join(', ') || 'No errors'

  return { critical, warnings, summary }
}

/**
 * Build a retry prompt for self-correction.
 *
 * @param attempt 0-based retry attempt number (0 = first retry, 1 = second retry)
 * @param targetLanguage Target language for translation
 * @param originalTexts The original source texts
 * @param badTranslations The AI's previous (flawed) translations
 * @param errors Per-block error arrays
 * @param glossary Optional glossary text to re-inject
 * @returns System prompt string for the retry request
 */
export function buildRetryPrompt(
  attempt: number,
  targetLanguage: string,
  originalTexts: string[],
  badTranslations: string[],
  errors: string[][],
  glossary: string = ''
): string {
  const isFinalAttempt = attempt >= 1

  // Build error report per block
  const errorReport = originalTexts
    .map((orig, idx) => {
      const blockErrors = errors[idx] || []
      if (blockErrors.length === 0) return null
      const bad = badTranslations[idx] || '(no output)'

      return `BLOCK ${idx + 1}:
  Source: "${orig}"
  Bad translation: "${bad}"
  Issues: ${blockErrors.join('; ')}`
    })
    .filter(Boolean)
    .join('\n\n')

  if (isFinalAttempt) {
    // Attempt 2+: Strict mode — show everything, demand pure JSON
    return `You are fixing a translation from English to ${targetLanguage}.

CRITICAL: The previous translation has errors. Review each block carefully.

${errorReport}

STRICT RULES:
1. Return ONLY a valid JSON array of strings. No markdown, no explanation.
2. The output array MUST have exactly ${originalTexts.length} elements.
3. Preserve ALL [variables] and {tags} exactly as they appear in the source.
4. Fix the errors listed above for each block.
5. Do NOT add any new variables, tags, or brackets that are not in the source.`
  }

  // Attempt 1: Gentle mode — show errors, trust the AI
  let prompt = `Please fix the translation errors below and return a corrected JSON array.

${errorReport}

RULES:
1. Return ONLY a valid JSON array with exactly ${originalTexts.length} elements.
2. Preserve all [variables] and {tags} from the source text.
3. Fix the specific issues listed for each block.`

  if (glossary) {
    prompt += `\n\nGLOSSARY (must follow these terms):\n${glossary}`
  }

  return prompt
}

/**
 * Determine if a translation should be retried based on error severity.
 * Critical errors always trigger retry. Warnings only if no critical errors exist.
 */
export function shouldRetry(errors: string[]): boolean {
  if (errors.length === 0) return false
  const { critical } = categorizeErrors(errors)
  return critical.length > 0 || errors.length >= 2
}
