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
