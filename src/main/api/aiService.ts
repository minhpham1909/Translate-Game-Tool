import { GoogleGenerativeAI, Schema, SchemaType } from '@google/generative-ai'
import { getSettings } from '../store/settings'

const SYSTEM_PROMPT = `Bạn là dịch giả chuyên nghiệp cho Visual Novel.
Dịch các đoạn text sau sang Tiếng Việt.

QUY TẮC BẮT BUỘC (CRITICAL):
1. KHÔNG ĐƯỢC dịch hoặc thay đổi nội dung trong dấu ngoặc vuông []: ví dụ [player_name], [variable_1]
2. KHÔNG ĐƯỢC dịch hoặc thay đổi text tags trong dấu ngoặc nhọn {}: ví dụ {b}, {color=#f00}, {/b}
3. KHÔNG ĐƯỢC thay đổi ký tự escape: \\", \\n
4. Giữ nguyên tone và giọng điệu của nhân vật

Bạn sẽ nhận được input là một mảng JSON các chuỗi (string). Bạn phải trả về CHÍNH XÁC một mảng JSON các chuỗi đã dịch, thứ tự tương ứng 1-1 với input.`

/**
 * Gọi API Gemini để dịch một mảng các đoạn text.
 * Trả về mảng text đã dịch với số lượng phần tử tương ứng.
 */
export async function translateBatchWithGemini(texts: string[]): Promise<string[]> {
  const settings = getSettings()
  const apiKey = settings.apiKeys['gemini'] || process.env.GEMINI_API_KEY
  
  if (!apiKey) {
    throw new Error('Thiếu API Key của Gemini. Vui lòng cập nhật trong Settings.')
  }

  const genAI = new GoogleGenerativeAI(apiKey)
  
  // Sử dụng JSON Schema để đảm bảo AI trả về đúng một mảng String
  const responseSchema: Schema = {
    type: SchemaType.ARRAY,
    items: {
      type: SchemaType.STRING
    }
  }

  const model = genAI.getGenerativeModel({ 
    model: settings.activeModelId || 'gemini-1.5-flash',
    systemInstruction: SYSTEM_PROMPT,
    generationConfig: {
      responseMimeType: 'application/json',
      responseSchema: responseSchema
    }
  })

  // Đưa input dạng JSON Array để AI xử lý gọn gàng
  const prompt = `Dịch mảng JSON sau sang Tiếng Việt:\n${JSON.stringify(texts)}`

  try {
    const result = await model.generateContent(prompt)
    const responseText = result.response.text()
    
    // Parse response trả về thành mảng string
    const translatedArray: string[] = JSON.parse(responseText)
    
    if (translatedArray.length !== texts.length) {
      console.warn(`[API Warning] Số lượng output (${translatedArray.length}) khác với input (${texts.length}).`)
    }

    return translatedArray
  } catch (error) {
    console.error('[API Error] Lỗi khi gọi Gemini API:', error)
    throw error
  }
}
