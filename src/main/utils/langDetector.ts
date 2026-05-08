/**
 * langDetector.ts
 * Heuristic Language Detection - nhẹ, không dùng external library.
 * Phát hiện text đã được dịch (Dirty Source) để tránh dịch lặp.
 * KHÔNG phụ thuộc vào targetLanguage (Trojan Horse Paradox fix).
 */

/**
 * Phát hiện nếu text đã chứa ký tự đặc trưng của ngôn ngữ đã dịch.
 * Dùng universal regex — không cần biết targetLanguage là gì.
 * @param text - Văn bản cần kiểm tra
 * @returns true nếu text có chứa ký tự đặc trưng của Vietnamese/Chinese
 */
export function isAlreadyTranslated(text: string): boolean {
  if (!text || text.trim() === '') return false

  const normalized = text.normalize('NFC')

  // Universal Vietnamese Regex (cả lower và upper case)
  const vnRegex = /[àáảãạăằắẳẵặâầấẩẫậèéẻẽẹêềếểễệìíỉĩịòóỏõọôồốổỗộơờớởỡợùúủũụưừứửữựỳýỷỹỵđÀÁẢÃẠĂẰẮẲẴẶÂẦẤẨẪẬÈÉẺẼẸÊỀẾỂỄỆÌÍỈĨỊÒÓỎÕỌÔỒỐỔỖỘƠỜỚỞỠỢÙÚỦŨỤƯỪỨỬỮỰỲÝỶỸỴĐ]/
  if (vnRegex.test(normalized)) return true

  // Chinese (Hán tự thường gặp trong game Nhật có bản dịch Việt)
  const cnRegex = /[\u4e00-\u9fff]/
  if (cnRegex.test(normalized)) return true

  return false
}

/**
 * Kiểm tra và xử lý block đã dịch (Dirty Source).
 */
export function handleDirtySource(originalText: string): {
  isDirty: boolean
  status: string
  translatedText: string
} {
  if (isAlreadyTranslated(originalText)) {
    return {
      isDirty: true,
      status: 'approved',
      translatedText: originalText
    }
  }
  return {
    isDirty: false,
    status: 'empty',
    translatedText: ''
  }
}
