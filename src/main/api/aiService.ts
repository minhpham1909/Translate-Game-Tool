/**
 * AIService — Central AI translation manager.
 *
 * Phase 5 Refactor:
 * - Uses new provider-based settings schema (providers.{gemini,openai_compatible,claude})
 * - Routes all OpenAI-compatible providers (OpenAI, DeepSeek, Grok, OpenRouter, Local LLM)
 *   through a single OpenAICompatibleTranslator
 * - GeminiTranslator and ClaudeTranslator remain as separate classes
 */

import { GoogleGenerativeAI, Schema, SchemaType } from '@google/generative-ai'
import { getSettings, getActiveProviderConfig } from '../store/settings'
import { AppSettings } from '../../shared/types'
import { OpenAICompatibleTranslator } from './translators/OpenAICompatibleTranslator'
import { APIError } from './errors'

// ============================================================================
// HYBRID PROMPT ARCHITECTURE
// ============================================================================

export interface ContextBlock {
  character: string | null
  original: string
  translated: string
}

export function getSystemPrompt(targetLanguage: string, userCustomPrompt: string, glossary: string = "", contextHistory: ContextBlock[] = []): string {
  // Part A: Technical Rules (HARDCODED)
  const partA = `Nhiệm vụ của bạn là dịch mảng JSON các chuỗi hội thoại/UI sang ${targetLanguage}.
QUY TẮC KỸ THUẬT BẮT BUỘC (CRITICAL):
1. KHÔNG dịch, KHÔNG xóa, KHÔNG thay đổi vị trí các biến số trong ngoặc vuông: [player_name], [gold]...
2. KHÔNG dịch các thẻ tag trong ngoặc nhọn: {b}, {color=#f00}, {i}...
3. GIỮ NGUYÊN các ký tự escape: \\", \\n
4. BẮT BUỘC trả về mảng JSON có số lượng phần tử giống hệt input (tương ứng 1-1).`

  // Part A-1: Context History (for pronoun/tone consistency)
  let partContext = ""
  if (contextHistory.length > 0) {
    const contextLines = contextHistory
      .map((c) => {
        const char = c.character ? `[${c.character}]` : '[?]'
        return `- ${char}: "${c.original}" → "${c.translated}"`
      })
      .join('\n')
    partContext = `\n\nNGỮ CẢNH HỘI THOẠI TRƯỚC ĐÓ (CHỈ THAM CHIẾU, KHÔNG DỊCH):\n${contextLines}\n\nDùng ngữ cảnh trên để suy luận đại từ/xưng hô cho nhất quán. KHÔNG dịch lại các dòng này.`
  }

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

  return partA + partContext + partB
}

// ============================================================================
// GEMINI TRANSLATOR
// ============================================================================

class GeminiTranslator {
  providerName = 'Gemini'
  private genAI: GoogleGenerativeAI
  private modelName: string

  constructor(apiKey: string, modelName: string) {
    this.genAI = new GoogleGenerativeAI(apiKey)
    this.modelName = modelName
  }

  async translate(texts: string[], settings: AppSettings, glossaryText: string = "", contextHistory: ContextBlock[] = []): Promise<string[]> {
    const responseSchema: Schema = {
      type: SchemaType.ARRAY,
      items: { type: SchemaType.STRING }
    }

    const model = this.genAI.getGenerativeModel({
      model: this.modelName,
      systemInstruction: getSystemPrompt(settings.targetLanguage, settings.userCustomPrompt, glossaryText, contextHistory),
      generationConfig: {
        responseMimeType: 'application/json',
        responseSchema: responseSchema,
        temperature: settings.temperature,
      }
    })

    const prompt = `Dịch mảng JSON sau sang ${settings.targetLanguage}:\n${JSON.stringify(texts)}`

    const result = await model.generateContent(prompt)
    const responseText = result.response.text()

    let translatedArray: string[]
    try {
      translatedArray = JSON.parse(responseText)
    } catch {
      throw new APIError(`Gemini returned invalid JSON: ${responseText.substring(0, 200)}`)
    }

    if (translatedArray.length !== texts.length) {
      throw new APIError(`Array length mismatch: Input ${texts.length}, Output ${translatedArray.length}`)
    }

    return translatedArray
  }
}

// ============================================================================
// CLAUDE TRANSLATOR
// ============================================================================

class ClaudeTranslator {
  providerName = 'Claude'
  private apiKey: string
  private modelName: string
  private baseURL: string

  constructor(apiKey: string, modelName: string, baseURL?: string) {
    this.apiKey = apiKey
    this.modelName = modelName
    this.baseURL = baseURL || 'https://api.anthropic.com/v1'
  }

  async translate(texts: string[], settings: AppSettings, glossaryText: string = "", contextHistory: ContextBlock[] = []): Promise<string[]> {
    const systemPrompt = getSystemPrompt(settings.targetLanguage, settings.userCustomPrompt, glossaryText, contextHistory)
    const prompt = `Dịch mảng JSON sau sang ${settings.targetLanguage}:\n${JSON.stringify(texts)}`

    const response = await fetch(`${this.baseURL.replace(/\/+$/, '')}/messages`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': this.apiKey,
        'anthropic-version': '2023-06-01'
      },
      body: JSON.stringify({
        model: this.modelName,
        system: systemPrompt,
        messages: [{ role: 'user', content: prompt }],
        max_tokens: 4096,
        temperature: settings.temperature
      })
    })

    if (!response.ok) {
      const body = await response.text()
      throw new APIError(`Claude API Error ${response.status}: ${body}`, response.status, body)
    }

    const data = await response.json()
    const content: string = data.content?.[0]?.text
    if (!content) {
      throw new APIError('Empty response from Claude API')
    }

    // Parse JSON from potentially dirty response
    let translatedArray: string[]
    try {
      // Strip markdown and find JSON array
      let cleaned = content.replace(/```(?:json)?\s*/gi, '').replace(/```\s*$/g, '').trim()
      const firstBracket = cleaned.indexOf('[')
      const lastBracket = cleaned.lastIndexOf(']')
      if (firstBracket === -1 || lastBracket <= firstBracket) {
        throw new Error('No JSON array found')
      }
      translatedArray = JSON.parse(cleaned.substring(firstBracket, lastBracket + 1))
    } catch {
      throw new APIError(`Claude returned invalid JSON: ${content.substring(0, 200)}`)
    }

    if (translatedArray.length !== texts.length) {
      throw new APIError(`Array length mismatch: Input ${texts.length}, Output ${translatedArray.length}`)
    }

    return translatedArray
  }
}

// ============================================================================
// MODEL DEFAULTS
// ============================================================================

export const DEFAULT_MODELS: Record<string, string[]> = {
  gemini: ['gemini-2.5-flash', 'gemini-2.5-pro', 'gemini-1.5-flash', 'gemini-1.5-pro'],
  openai_compatible: ['gpt-4o', 'gpt-4o-mini', 'gpt-4-turbo', 'gpt-3.5-turbo'],
  claude: ['claude-sonnet-4-20250514', 'claude-opus-4-20250414', 'claude-3-5-sonnet-20241022', 'claude-3-5-haiku-20241022'],
}

// ============================================================================
// AISERVICE — Factory Manager
// ============================================================================

export class AIService {
  /**
   * Translate a batch of texts using the currently active provider.
   */
  static async translateBatch(texts: string[], glossaryText: string = "", contextHistory: ContextBlock[] = []): Promise<string[]> {
    const settings = getSettings()
    const { providerId, config } = getActiveProviderConfig()

    if (!config.apiKey) {
      throw new APIError(`Missing API Key for provider: ${providerId.toUpperCase()}`)
    }

    const modelId = config.modelId || DEFAULT_MODELS[providerId]?.[0] || ''
    if (!modelId) {
      throw new APIError(`No model configured for provider: ${providerId.toUpperCase()}`)
    }

    let translator: { providerName: string; translate(texts: string[], settings: AppSettings, glossary: string, context: ContextBlock[]): Promise<string[]> }

    switch (providerId) {
      case 'gemini':
        translator = new GeminiTranslator(config.apiKey, modelId)
        break

      case 'claude':
        translator = new ClaudeTranslator(config.apiKey, modelId, config.baseURL || undefined)
        break

      case 'openai_compatible':
        translator = new OpenAICompatibleTranslator({
          baseURL: config.baseURL || 'https://api.openai.com/v1',
          apiKey: config.apiKey,
          modelId,
          customHeaders: config.customHeaders,
        })
        break

      default:
        throw new APIError(`Unsupported provider: ${providerId}`)
    }

    console.log(`[AI Service | ${translator.providerName}] Translating batch of ${texts.length} item(s)...`)
    const startTime = Date.now()

    try {
      const result = await translator.translate(texts, settings, glossaryText, contextHistory)
      const duration = Date.now() - startTime
      console.log(`[AI Service | ${translator.providerName}] OK for ${texts.length} item(s) (${duration}ms).`)
      return result
    } catch (error) {
      console.error(`[AI Service | ${translator.providerName}] Error:`, error)
      throw error
    }
  }

  /**
   * Retry translation with self-correction prompt.
   * Shows the AI its bad translations along with specific errors.
   */
  static async translateBatchWithRetry(
    texts: string[],
    glossaryText: string,
    previousErrors: string[],
    attempt: number = 0
  ): Promise<string[]> {
    const settings = getSettings()
    const { providerId, config } = getActiveProviderConfig()

    if (!config.apiKey) {
      throw new APIError(`Missing API Key for provider: ${providerId.toUpperCase()}`)
    }

    const modelId = config.modelId || DEFAULT_MODELS[providerId]?.[0] || ''

    // Build self-correction prompt with original texts, bad translations, and errors
    const correctionPrompt = `You are fixing a translation from English to ${settings.targetLanguage}.

CRITICAL ERRORS found in the previous translation:
${previousErrors.map(e => `- ${e}`).join('\n')}

INSTRUCTIONS:
1. Return ONLY a valid JSON array of translated strings.
2. Do NOT translate, remove, or modify [variables] or {tags}.
3. The output array MUST have exactly ${texts.length} elements.
4. Fix the errors listed above.
${glossaryText ? `\nGLOSSARY (follow these terms):\n${glossaryText}` : ''}`

    switch (providerId) {
      case 'gemini': {
        const genAI = new GoogleGenerativeAI(config.apiKey)
        const responseSchema: Schema = {
          type: SchemaType.ARRAY,
          items: { type: SchemaType.STRING }
        }
        const model = genAI.getGenerativeModel({
          model: modelId,
          systemInstruction: correctionPrompt,
          generationConfig: {
            responseMimeType: 'application/json',
            responseSchema,
            temperature: Math.max(0, settings.temperature - 0.1 * (attempt + 1)),
          }
        })
        const result = await model.generateContent(`Translate these to ${settings.targetLanguage}:\n${JSON.stringify(texts)}`)
        return JSON.parse(result.response.text())
      }

      case 'claude': {
        const translator = new ClaudeTranslator(config.apiKey, modelId, config.baseURL || undefined)
        return translator.translate(texts, { ...settings, userCustomPrompt: correctionPrompt }, glossaryText)
      }

      case 'openai_compatible': {
        const translator = new OpenAICompatibleTranslator({
          baseURL: config.baseURL || 'https://api.openai.com/v1',
          apiKey: config.apiKey,
          modelId,
          customHeaders: config.customHeaders,
        })
        return translator.translate(texts, { ...settings, userCustomPrompt: correctionPrompt }, glossaryText)
      }

      default:
        throw new APIError(`Unsupported provider: ${providerId}`)
    }
  }

  /**
   * List available models for a given provider.
   */
  static async listModels(providerOverride?: string): Promise<string[]> {
    const settings = getSettings()
    const activeProvider = (providerOverride || settings.activeProviderId || 'gemini').toLowerCase()
    const config = settings.providers[activeProvider as keyof typeof settings.providers]
    const apiKey = config?.apiKey || ''

    const defaults = DEFAULT_MODELS[activeProvider] || DEFAULT_MODELS['gemini']

    if (!apiKey) return defaults

    if (activeProvider === 'gemini') {
      try {
        const url = new URL('https://generativelanguage.googleapis.com/v1beta/models')
        url.searchParams.set('key', apiKey)
        const response = await fetch(url.toString())
        if (!response.ok) return defaults

        const data = await response.json() as {
          models?: Array<{ name?: string; supportedGenerationMethods?: string[] }>
        }

        const remoteModels = (data.models || [])
          .filter((m) => (m.supportedGenerationMethods || []).includes('generateContent'))
          .map((m) => (m.name || '').replace('models/', ''))
          .filter((n) => n.length > 0)

        return remoteModels.length > 0 ? remoteModels : defaults
      } catch {
        return defaults
      }
    }

    if (activeProvider === 'openai_compatible') {
      const base = (config?.baseURL || 'https://api.openai.com/v1').replace(/\/+$/, '')
      try {
        const response = await fetch(`${base}/models`, {
          headers: { 'Authorization': `Bearer ${apiKey}` }
        })
        if (!response.ok) return defaults
        const data = await response.json()
        const remoteModels = (data.data || []).map((m: { id: string }) => m.id)
        return remoteModels.length > 0 ? remoteModels : defaults
      } catch {
        return defaults
      }
    }

    if (activeProvider === 'claude') {
      try {
        const response = await fetch('https://api.anthropic.com/v1/models', {
          headers: {
            'x-api-key': apiKey,
            'anthropic-version': '2023-06-01'
          }
        })
        if (!response.ok) return defaults
        const data = await response.json()
        const remoteModels = (data.data || [])
          .map((m: { id: string }) => m.id)
          .filter((id: string) => id.includes('claude'))
        return remoteModels.length > 0 ? remoteModels : defaults
      } catch {
        return defaults
      }
    }

    return defaults
  }
}
