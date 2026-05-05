/**
 * OpenAICompatibleTranslator
 *
 * Universal adapter for ALL OpenAI-compatible endpoints:
 *   - OpenAI (api.openai.com)
 *   - DeepSeek (api.deepseek.com)
 *   - Grok / xAI (api.x.ai)
 *   - OpenRouter (openrouter.ai)
 *   - Local LLMs (Ollama, vLLM, LM Studio, etc.)
 *
 * Uses native fetch — no external SDK needed.
 * Applies robust JSON extraction to handle dirty LLM responses.
 */

import { extractJsonArray, JSONParsingError } from '../../utils/jsonParser'
import { getLanguageLabel } from '../../../shared/types'
import { RateLimitError, TokenLimitError, ParsingError, APIError } from '../errors'
import { AppSettings } from '../../../shared/types'
import type { ContextBlock } from '../aiService'

export interface OpenAICompatibleConfig {
  baseURL: string
  apiKey: string
  modelId: string
  customHeaders?: Record<string, string>
}

export class OpenAICompatibleTranslator {
  providerName = 'OpenAI Compatible'
  private config: OpenAICompatibleConfig

  constructor(config: OpenAICompatibleConfig) {
    this.config = config
  }

  /**
   * Build the full URL for the chat completions endpoint.
   */
  private getEndpoint(): string {
    const base = this.config.baseURL.replace(/\/+$/, '')
    return `${base}/chat/completions`
  }

  /**
   * Build the request headers, merging API key auth with custom headers.
   */
  private buildHeaders(): Record<string, string> {
    const headers: Record<string, string> = {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${this.config.apiKey}`,
    }

    // Merge custom headers (e.g., OpenRouter requires HTTP-Referer and X-Title)
    if (this.config.customHeaders) {
      for (const [key, value] of Object.entries(this.config.customHeaders)) {
        headers[key] = value
      }
    }

    return headers
  }

  /**
   * Build the system prompt that instructs the model to return pure JSON.
   */
  private buildSystemPrompt(userSystemPrompt: string, contextHistory: ContextBlock[]): string {
    let contextSection = ''
    if (contextHistory.length > 0) {
      const contextLines = contextHistory
        .map((c) => {
          const char = c.character ? `[${c.character}]` : '[?]'
          return `- ${char}: "${c.original}" → "${c.translated}"`
        })
        .join('\n')
      contextSection = `\n\nPREVIOUS CONVERSATION CONTEXT (REFERENCE ONLY, DO NOT TRANSLATE):\n${contextLines}\n\nUse this context to infer pronouns/tone. Do NOT re-translate these lines.`
    }

    return `You are a translation engine. Your task is to translate text arrays.

CRITICAL OUTPUT RULES:
1. Return ONLY a raw JSON array of strings. Example: ["translated1", "translated2"]
2. DO NOT wrap the JSON in markdown code blocks.
3. DO NOT add any conversational text before or after the JSON.
4. The number of output strings MUST exactly match the number of input strings.
5. Preserve all variables in [brackets], {tags}, and escape sequences (\\n, \\\", etc.).
${contextSection}

${userSystemPrompt}`
  }

  /**
   * Normalize an HTTP error into our typed error system.
   */
  private normalizeHttpError(statusCode: number, body: string, headers?: Headers): Error {
    const retryAfter = headers?.get('retry-after')
    const retryAfterMs = retryAfter ? parseInt(retryAfter, 10) * 1000 : undefined

    if (statusCode === 429) {
      return new RateLimitError(`Rate limit exceeded (429): ${body}`, retryAfterMs)
    }

    if (statusCode === 400 || statusCode === 413 || statusCode === 422) {
      const lower = body.toLowerCase()
      if (
        lower.includes('token') ||
        lower.includes('length') ||
        lower.includes('context') ||
        lower.includes('max_tokens') ||
        lower.includes('context_length_exceeded')
      ) {
        return new TokenLimitError(`Token/context limit exceeded (${statusCode}): ${body}`)
      }
      // Other 400 errors might be bad request / format issues
      return new APIError(`Bad request (${statusCode}): ${body}`, statusCode, body)
    }

    if (statusCode === 401 || statusCode === 403) {
      return new APIError(`Authentication failed (${statusCode}): Invalid API key`, statusCode, body)
    }

    if (statusCode >= 500) {
      return new APIError(`Server error (${statusCode}): ${body}`, statusCode, body)
    }

    return new APIError(`HTTP ${statusCode}: ${body}`, statusCode, body)
  }

  private estimateMaxOutputTokens(texts: string[]): number {
    if (texts.length === 0) return 256
    const totalChars = texts.reduce((sum, text) => sum + text.length, 0)
    const estimated = Math.ceil(totalChars / 3)
    return Math.max(256, Math.min(4096, estimated))
  }

  private extractAffordableTokenLimit(body: string): number | null {
    try {
      const parsed = JSON.parse(body) as { error?: { message?: string } }
      const message = parsed?.error?.message || ''
      const match = message.match(/can only afford\s+(\d+)/i)
      if (match && match[1]) {
        const value = Number(match[1])
        return Number.isFinite(value) && value > 0 ? value : null
      }
    } catch {
      // ignore JSON parse failures
    }

    const fallbackMatch = body.match(/can only afford\s+(\d+)/i)
    if (fallbackMatch && fallbackMatch[1]) {
      const value = Number(fallbackMatch[1])
      return Number.isFinite(value) && value > 0 ? value : null
    }

    return null
  }

  private buildRequestBody(systemPrompt: string, userPrompt: string, maxTokens: number, temperature: number): string {
    return JSON.stringify({
      model: this.config.modelId,
      messages: [
        { role: 'system', content: systemPrompt },
        { role: 'user', content: userPrompt }
      ],
      temperature,
      max_tokens: maxTokens
    })
  }

  private tryExtractObjectValueArray(raw: string): string[] | null {
    let text = raw.trim()
    text = text.replace(/```(?:json)?\s*/gi, '').replace(/```\s*$/g, '').trim()

    const firstBrace = text.indexOf('{')
    const lastBrace = text.lastIndexOf('}')
    if (firstBrace === -1 || lastBrace <= firstBrace) return null

    const candidate = text.substring(firstBrace, lastBrace + 1)
    try {
      const parsed = JSON.parse(candidate) as Record<string, unknown>
      if (!parsed || typeof parsed !== 'object') return null

      const values = Object.values(parsed)
      const arrayValues = values.filter((v) => Array.isArray(v)) as unknown[][]
      if (arrayValues.length === 1) {
        const arr = arrayValues[0]
        if (arr.every((item) => typeof item === 'string')) {
          return arr as string[]
        }
      }

      if (values.length === 1 && typeof values[0] === 'string') {
        return [values[0] as string]
      }

      const knownKeys = ['translations', 'data', 'items', 'result', 'output']
      for (const key of knownKeys) {
        const value = (parsed as Record<string, unknown>)[key]
        if (Array.isArray(value) && value.every((item) => typeof item === 'string')) {
          return value as string[]
        }
      }
    } catch {
      return null
    }

    return null
  }

  private tryExtractSingleKeyTranslation(raw: string, sourceText: string): string | null {
    let text = raw.trim()
    text = text.replace(/```(?:json)?\s*/gi, '').replace(/```\s*$/g, '').trim()

    const firstBrace = text.indexOf('{')
    const lastBrace = text.lastIndexOf('}')
    if (firstBrace === -1 || lastBrace <= firstBrace) return null

    const candidate = text.substring(firstBrace, lastBrace + 1)
    try {
      const parsed = JSON.parse(candidate) as Record<string, unknown>
      if (!parsed || typeof parsed !== 'object') return null

      const keys = Object.keys(parsed)
      if (keys.length !== 1) return null

      const key = keys[0]
      const value = parsed[key]

      if (Array.isArray(value) && value.length === 0) {
        return key !== sourceText ? key : null
      }

      if (value === '' || value === null) {
        return key !== sourceText ? key : null
      }
    } catch {
      return null
    }

    return null
  }

  /**
   * Translate a batch of texts.
   *
   * @param texts Array of strings to translate
   * @param settings AppSettings (for temperature, target language, etc.)
   * @param glossaryText Optional glossary string to inject into prompt
   * @param contextHistory Optional conversation history for context windowing
   * @returns Array of translated strings (same length as input)
   */
  async translate(texts: string[], settings: AppSettings, glossaryText: string = '', contextHistory: ContextBlock[] = []): Promise<string[]> {
    if (!this.config.apiKey) {
      throw new APIError('API key is not configured for this provider')
    }

    if (texts.length === 0) return []

    const systemPrompt = this.buildSystemPrompt(
      getSystemPrompt(getLanguageLabel(settings.targetLanguage), settings.userCustomPrompt, glossaryText),
      contextHistory
    )

    const userPrompt = `Translate the following array of strings to ${getLanguageLabel(settings.targetLanguage)}:\n${JSON.stringify(texts)}`

    const requestedMaxTokens = this.estimateMaxOutputTokens(texts)

    const sendRequest = async (maxTokens: number): Promise<Response> => {
      const body = this.buildRequestBody(systemPrompt, userPrompt, maxTokens, settings.temperature)
      return await fetch(this.getEndpoint(), {
        method: 'POST',
        headers: this.buildHeaders(),
        body,
      })
    }

    let response: Response
    try {
      response = await sendRequest(requestedMaxTokens)
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err)
      throw new APIError(`Network error: ${message}`)
    }

    if (!response.ok) {
      const errorBody = await response.text().catch(() => '')
      if (response.status === 402) {
        const affordable = this.extractAffordableTokenLimit(errorBody)
        if (affordable && affordable < requestedMaxTokens) {
          const retryMaxTokens = Math.max(64, affordable)
          const retryResponse = await sendRequest(retryMaxTokens)
          if (!retryResponse.ok) {
            const retryBody = await retryResponse.text().catch(() => '')
            throw this.normalizeHttpError(retryResponse.status, retryBody, retryResponse.headers)
          }
          response = retryResponse
        } else {
          throw this.normalizeHttpError(response.status, errorBody, response.headers)
        }
      } else {
        throw this.normalizeHttpError(response.status, errorBody, response.headers)
      }
    }

    const data = await response.json().catch(() => null) as {
      choices?: Array<{
        message?: {
          content?: string
        }
      }>
    } | null

    const content = data?.choices?.[0]?.message?.content
    if (!content) {
      throw new APIError('Empty response from AI service')
    }

    // Use robust JSON parser to handle dirty responses
    try {
      const translatedArray = extractJsonArray(content)

      if (translatedArray.length !== texts.length) {
        if (texts.length === 1 && translatedArray.length > 0) {
          return [translatedArray[0]]
        }
        const objectArray = this.tryExtractObjectValueArray(content)
        if (objectArray) {
          if (objectArray.length === texts.length) return objectArray
          if (texts.length === 1 && objectArray.length > 0) return [objectArray[0]]
        }
        if (texts.length === 1) {
          const singleKey = this.tryExtractSingleKeyTranslation(content, texts[0])
          if (singleKey) return [singleKey]
        }
        throw new ParsingError(
          `Array length mismatch: Input ${texts.length}, Output ${translatedArray.length}`,
          content
        )
      }

      return translatedArray
    } catch (err) {
      if (err instanceof ParsingError || err instanceof JSONParsingError) {
        const objectArray = this.tryExtractObjectValueArray(content)
        if (objectArray) {
          if (objectArray.length === texts.length) return objectArray
          if (texts.length === 1 && objectArray.length > 0) return [objectArray[0]]
        }
        if (texts.length === 1) {
          const singleKey = this.tryExtractSingleKeyTranslation(content, texts[0])
          if (singleKey) return [singleKey]
        }
        throw new ParsingError(err.message, content)
      }
      throw err
    }
  }
}

// ============================================================================
// Hybrid Prompt Builder (shared logic)
// ============================================================================

function getSystemPrompt(targetLanguage: string, userCustomPrompt: string, glossary: string = ""): string {
  // Part A: Technical Rules (HARDCODED)
  const partA = `Nhiệm vụ của bạn là dịch mảng JSON các chuỗi hội thoại/UI sang ${targetLanguage}.
QUY TẮC KỸ THUẬT BẮT BUỘC (CRITICAL):
1. KHÔNG dịch, KHÔNG xóa, KHÔNG thay đổi vị trí các biến số trong ngoặc vuông: [player_name], [gold]...
2. KHÔNG dịch các thẻ tag trong ngoặc nhọn: {b}, {color=#f00}, {i}...
3. GIỮ NGUYÊN các ký tự escape: \\", \\n
4. BẮT BUỘC trả về mảng JSON có số lượng phần tử giống hệt input (tương ứng 1-1).`

  // Part B: Contextual Rules (Dynamic from Settings)
  let partB = ""
  if (userCustomPrompt) {
    partB += `\n\nQUY TẮC VĂN PHONG:\n${userCustomPrompt}`
  } else {
    partB += `\n\nQUY TẮC VĂN PHONG:
1. Bản địa hóa tự nhiên: Dùng văn nói, ngôn ngữ mạng hoặc từ lóng phù hợp với ngữ cảnh. KHÔNG dịch máy.
2. Xưng hô: Tự suy luận mối quan hệ qua ngữ cảnh để dùng đại từ cho mượt mà.
3. Nếu chuỗi chỉ là các dấu câu ("...", "?!", "Ah."), hãy giữ nguyên, không cần bịa thêm chữ.`
  }

  if (glossary) {
    partB += `\n\nTỪ ĐIỂN THUẬT NGỮ (BẮT BUỘC TUÂN THỦ):\nDịch các từ khóa sau đúng theo danh sách:\n${glossary}`
  }

  return partA + partB
}
