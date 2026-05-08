/**
 * Lightweight heuristics for detecting already-translated (dirty source) strings.
 *
 * We intentionally use regex-based detection to avoid heavy dependencies.
 */
export function isAlreadyTranslated(text: string, targetLanguage: string): boolean {
  if (!text || text.trim() === '') return false

  const lang = (targetLanguage || '').toLowerCase()

  // Rule for Vietnamese: Check for specific diacritics
  if (lang.includes('việt') || lang.includes('viet') || lang.includes('vietnamese') || lang.includes('vn')) {
    // Regex matches any Vietnamese-specific character (both lower and upper case)
    const vnRegex = /[àáảãạăằắẳẵặâầấẩẫậèéẻẽẹêềếểễệìíỉĩịòóỏõọôồốổỗộơờớởỡợùúủũụưừứửữựỳýỷỹỵđ]/i
    return vnRegex.test(text)
  }

  // Future proofing for other languages (e.g., Japanese Kana/Kanji)
  if (lang.includes('japanese') || lang.includes('nhật')) {
    const jpRegex = /[\u3040-\u30ff\u3400-\u4dbf\u4e00-\u9fff]/
    return jpRegex.test(text)
  }

  return false
}
