/**
 * Lấy ra tất cả các chuỗi nằm trong cặp dấu ngoặc nhất định
 * @param text Chuỗi đầu vào
 * @param openChar Ký tự mở (ví dụ: '[')
 * @param closeChar Ký tự đóng (ví dụ: ']')
 */
function extractTags(text: string, openChar: string, closeChar: string): string[] {
  const tags: string[] = []
  let inTag = false
  let currentTag = ''

  for (let i = 0; i < text.length; i++) {
    const char = text[i]
    if (char === openChar && !inTag) {
      inTag = true
      currentTag = char
    } else if (char === closeChar && inTag) {
      currentTag += char
      tags.push(currentTag)
      inTag = false
      currentTag = ''
    } else if (inTag) {
      currentTag += char
    }
  }

  return tags
}

/**
 * Kiểm tra xem bản dịch có bị mất biến (variable) hoặc thẻ định dạng (tag) hay không.
 * @param originalText Văn bản gốc
 * @param translatedText Văn bản đã dịch
 * @returns Mảng chứa các câu cảnh báo lỗi. Trả về mảng rỗng [] nếu pass.
 */
export function validateTranslation(originalText: string, translatedText: string): string[] {
  const errors: string[] = []

  // 1. Kiểm tra các biến Ren'Py: [player_name], [gold]...
  const originalVars = extractTags(originalText, '[', ']')
  for (const v of originalVars) {
    if (!translatedText.includes(v)) {
      errors.push(`Thiếu biến: ${v}`)
    }
  }

  // 2. Kiểm tra các thẻ định dạng Ren'Py: {b}, {color=#f00}...
  const originalTags = extractTags(originalText, '{', '}')
  for (const t of originalTags) {
    if (!translatedText.includes(t)) {
      errors.push(`Thiếu thẻ định dạng: ${t}`)
    }
  }

  // Cảnh báo phụ: Nếu bản dịch có chứa ngoặc mà bản gốc không có, có thể AI sinh nhầm (hallucination)
  const translatedVars = extractTags(translatedText, '[', ']')
  for (const v of translatedVars) {
    if (!originalVars.includes(v)) {
      errors.push(`Biến lạ không có trong bản gốc: ${v}`)
    }
  }

  const translatedTags = extractTags(translatedText, '{', '}')
  for (const t of translatedTags) {
    if (!originalTags.includes(t)) {
      errors.push(`Thẻ định dạng lạ không có trong bản gốc: ${t}`)
    }
  }

  return errors
}

/**
 * Text Overflow Check — warning when translated text is significantly longer than source.
 * Vietnamese is typically 20-30% longer than English, which can cause UI overflow in games.
 *
 * @param originalText Source text
 * @param translatedText Translated text
 * @param maxRatio Maximum allowed length ratio (default 1.3 = 30% longer)
 * @returns Array of warning strings. Empty if within threshold.
 */
export function validateLengthOverflow(
  originalText: string,
  translatedText: string,
  maxRatio: number = 1.3
): string[] {
  const warnings: string[] = []
  if (!originalText || !translatedText) return warnings

  const origLen = originalText.length
  const transLen = translatedText.length

  if (origLen === 0) return warnings

  const ratio = transLen / origLen
  if (ratio > maxRatio) {
    const pctIncrease = Math.round((ratio - 1) * 100)
    warnings.push(
      `Length overflow: translation is ${pctIncrease}% longer (${origLen} → ${transLen} chars). May overflow UI in game.`
    )
  }

  return warnings
}

/**
 * Glossary term record for verification.
 */
export interface GlossaryTerm {
  source_text: string
  target_text: string
}

/**
 * Strict Glossary Verification — check that glossary terms found in the source
 * are translated exactly as specified in the glossary.
 *
 * @param originalText Source text
 * @param translatedText Translated text
 * @param glossary All glossary entries
 * @returns Array of error strings. Empty if all terms match.
 */
export function validateGlossary(
  originalText: string,
  translatedText: string,
  glossary: GlossaryTerm[]
): string[] {
  const errors: string[] = []
  if (glossary.length === 0) return errors

  const sourceLower = originalText.toLowerCase()

  for (const term of glossary) {
    const sourceLowerTerm = term.source_text.toLowerCase()
    const targetTerm = term.target_text

    // Check if the source term appears in the original text
    if (sourceLower.includes(sourceLowerTerm)) {
      // Check if the target translation appears in the translated text
      // Use case-insensitive match for flexibility
      if (!translatedText.toLowerCase().includes(targetTerm.toLowerCase())) {
        errors.push(
          `Glossary violation: "${term.source_text}" must be translated as "${term.target_text}"`
        )
      }
    }
  }

  return errors
}
