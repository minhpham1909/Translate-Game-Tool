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
import { AppSettings, getLanguageLabel } from '../../shared/types'
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

function estimateTokenCountFromChars(charCount: number): number {
  if (charCount <= 0) return 0
  return Math.max(1, Math.ceil(charCount / 4))
}

function estimateMaxOutputTokens(texts: string[]): number {
  const totalChars = texts.reduce((sum, text) => sum + text.length, 0)
  const estimated = Math.ceil(totalChars / 3)
  return Math.max(256, Math.min(4096, estimated))
}

function buildPromptMetrics(texts: string[], glossaryText: string, contextHistory: ContextBlock[]) {
  const inputChars = texts.reduce((sum, text) => sum + text.length, 0)
  const glossaryChars = glossaryText.length
  const contextChars = contextHistory.reduce(
    (sum, block) => sum + block.original.length + block.translated.length + (block.character?.length || 0),
    0
  )
  const approxTokens = estimateTokenCountFromChars(inputChars + glossaryChars + contextChars)
  return { inputChars, glossaryChars, contextChars, approxTokens }
}

function isPromptTokenLimitError(error: unknown): boolean {
  if (error instanceof APIError) {
    const response = error.response || ''
    return /prompt tokens limit exceeded/i.test(response) || /prompt tokens limit exceeded/i.test(error.message)
  }
  return false
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
      systemInstruction: getSystemPrompt(getLanguageLabel(settings.targetLanguage), settings.userCustomPrompt, glossaryText, contextHistory),
      generationConfig: {
        responseMimeType: 'application/json',
        responseSchema: responseSchema,
        temperature: settings.temperature,
        maxOutputTokens: estimateMaxOutputTokens(texts),
      }
    })

    const prompt = `Dịch mảng JSON sau sang ${getLanguageLabel(settings.targetLanguage)}:\n${JSON.stringify(texts)}`

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
    const systemPrompt = getSystemPrompt(getLanguageLabel(settings.targetLanguage), settings.userCustomPrompt, glossaryText, contextHistory)
    const prompt = `Dịch mảng JSON sau sang ${getLanguageLabel(settings.targetLanguage)}:\n${JSON.stringify(texts)}`

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
        max_tokens: estimateMaxOutputTokens(texts),
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

const MODEL_CACHE_TTL_MS = 5 * 60 * 1000
const modelListCache = new Map<string, { models: string[]; expiresAt: number }>()

function getModelCacheKey(providerId: string, config: { apiKey?: string; baseURL?: string }): string {
  const keyPart = config.apiKey ? config.apiKey.slice(0, 8) : 'no-key'
  const basePart = config.baseURL ? config.baseURL.replace(/\/+$/, '') : ''
  return `${providerId}|${basePart}|${keyPart}`
}

function getCachedModels(providerId: string, config: { apiKey?: string; baseURL?: string }): string[] | null {
  const key = getModelCacheKey(providerId, config)
  const cached = modelListCache.get(key)
  if (!cached) return null
  if (cached.expiresAt < Date.now()) {
    modelListCache.delete(key)
    return null
  }
  return cached.models
}

function setCachedModels(providerId: string, config: { apiKey?: string; baseURL?: string }, models: string[]): void {
  const key = getModelCacheKey(providerId, config)
  modelListCache.set(key, { models, expiresAt: Date.now() + MODEL_CACHE_TTL_MS })
}

// ============================================================================
// MODEL FILTERING — Only show text-generation (LLM) models
// ============================================================================

const NON_TEXT_KEYWORDS = [
  'video', 'image', 'audio', 'speech', 'music', 'whisper',
  'dall-e', 'midjourney', 'flux', 'tts', 'stt', 'realtime',
  'generate', 'edit', 'inpaint', 'outpaint', 'upscale',
  'embedding', 'embed', 'moderation', 'mod',
  'text-to-video', 'text-to-speech', 'text-to-image',
  'video-to-video', 'image-to-video', 'image-to-image',
  'voice', 'sound', 'musicgen', 'audiocraft',
  'dubbing', 'translate-audio',
]

const LLM_KEYWORDS = [
  'gpt', 'claude', 'llama', 'mistral', 'qwen', 'deepseek',
  'gemma', 'gemini', 'phi', 'command', 'yi', 'mixtral',
  'zephyr', 'dbrx', 'falcon', 'olmo', 'mamba', 'vicuna',
  'wizardlm', 'codellama', 'nous', 'solar', 'nous-hermes',
  'minicpm', 'intern', 'yi', 'chatglm', 'qwen', 'baichuan',
  'openchat', 'starling', 'airoboros', 'openhermes',
  'neural', 'grok', 'sonnet', 'opus', 'haiku',
  'o1', 'o3', 'o4', 'gpt-4', 'gpt-3',
  'claude-', 'llama-', 'mistral-', 'qwen-', 'deepseek-',
]

/**
 * Check if a model ID is likely a text-generation (LLM) model.
 * Returns false for video/audio/image/embedding models.
 */
function isTextGenerationModel(modelId: string): boolean {
  const lower = modelId.toLowerCase()

  // Reject: known non-text patterns
  if (NON_TEXT_KEYWORDS.some((kw) => lower.includes(kw))) return false

  // Accept: known LLM patterns
  if (LLM_KEYWORDS.some((kw) => lower.includes(kw))) return true

  // Reject: common OpenRouter prefixes for non-text models
  // e.g. "google/gemma-3-27b-it" is OK, but "stabilityai/stable-diffusion-3" is not
  // If the model ID doesn't match any known LLM pattern and looks like a provider/model combo,
  // check for additional non-text indicators
  const parts = lower.split('/')
  if (parts.length >= 2) {
    const provider = parts[0]
    const model = parts.slice(1).join('/')

    // Image/video model providers
    const imageVideoProviders = ['stabilityai', 'runwayml', 'luma', 'pika', 'kling', 'minimax', 'vidu']
    if (imageVideoProviders.includes(provider)) return false

    // Embedding providers (commonly listed on OpenRouter)
    if (provider.includes('embed') || model.includes('embed')) return false
  }

  // Short model IDs that look like version numbers or hashes are likely not LLMs
  if (/^v\d+\.\d+/.test(lower)) return false

  // Default: accept if it looks like a reasonable model name
  // (contains letters and possibly numbers/dashes/underscores, not too short)
  return lower.length >= 3 && /[a-zA-Z]/.test(lower)
}

// ============================================================================
// AISERVICE — Factory Manager
// ============================================================================

export class AIService {
  private static buildOpenAICompatibleHeaders(
    config: { apiKey: string; customHeaders?: Record<string, string> }
  ): Record<string, string> {
    const headers: Record<string, string> = {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${config.apiKey}`,
    }

    if (config.customHeaders) {
      for (const [key, value] of Object.entries(config.customHeaders)) {
        headers[key] = value
      }
    }

    return headers
  }

  private static async resolveModelId(
    providerId: string,
    config: { apiKey?: string; modelId?: string; baseURL?: string; customHeaders?: Record<string, string> }
  ): Promise<string> {
    const configured = (config.modelId || '').trim()
    if (configured) return configured

    const models = await AIService.listModels(providerId)
    if (models.length > 0) return models[0]

    throw new APIError(`No model available for provider: ${providerId.toUpperCase()}`)
  }

  /**
   * Translate a batch of texts using the currently active provider.
   */
  static async translateBatch(texts: string[], glossaryText: string = "", contextHistory: ContextBlock[] = []): Promise<string[]> {
    const settings = getSettings()
    const { providerId, config } = getActiveProviderConfig()

    if (!config.apiKey) {
      throw new APIError(`Missing API Key for provider: ${providerId.toUpperCase()}`)
    }

    const modelId = await AIService.resolveModelId(providerId, config)

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
    const metrics = buildPromptMetrics(texts, glossaryText, contextHistory)
    console.log(
      `[AI Service | ${translator.providerName}] Input chars=${metrics.inputChars}, glossary chars=${metrics.glossaryChars}, context chars=${metrics.contextChars}, approx tokens=${metrics.approxTokens}.`
    )
    const startTime = Date.now()

    try {
      const result = await translator.translate(texts, settings, glossaryText, contextHistory)
      const duration = Date.now() - startTime
      console.log(`[AI Service | ${translator.providerName}] OK for ${texts.length} item(s) (${duration}ms).`)
      return result
    } catch (error) {
      if (
        providerId === 'openai_compatible' &&
        isPromptTokenLimitError(error) &&
        (contextHistory.length > 0 || glossaryText.length > 0 || settings.userCustomPrompt)
      ) {
        console.warn(`[AI Service | ${translator.providerName}] Prompt tokens limit exceeded. Retrying with trimmed prompt...`)
        const trimmedSettings = { ...settings, userCustomPrompt: '' }
        try {
          const result = await translator.translate(texts, trimmedSettings, '', [])
          const duration = Date.now() - startTime
          console.log(`[AI Service | ${translator.providerName}] OK for ${texts.length} item(s) after trim (${duration}ms).`)
          return result
        } catch (retryError) {
          console.error(`[AI Service | ${translator.providerName}] Trim retry failed:`, retryError)
          throw retryError
        }
      }

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

    const modelId = await AIService.resolveModelId(providerId, config)

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
            maxOutputTokens: estimateMaxOutputTokens(texts),
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

    const fallback = (config?.modelId || '').trim() ? [config.modelId] : []

    if (!apiKey) return fallback

    const cached = getCachedModels(activeProvider, { apiKey, baseURL: config?.baseURL })
    if (cached) return cached

    if (activeProvider === 'gemini') {
      try {
        const url = new URL('https://generativelanguage.googleapis.com/v1beta/models')
        url.searchParams.set('key', apiKey)
        const response = await fetch(url.toString())
        if (!response.ok) return fallback

        const data = await response.json() as {
          models?: Array<{ name?: string; supportedGenerationMethods?: string[] }>
        }

        const remoteModels = (data.models || [])
          .filter((m) => (m.supportedGenerationMethods || []).includes('generateContent'))
          .map((m) => (m.name || '').replace('models/', ''))
          .filter((n) => n.length > 0)

        const finalModels = remoteModels.length > 0 ? remoteModels : fallback
        if (finalModels.length > 0) setCachedModels(activeProvider, { apiKey, baseURL: config?.baseURL }, finalModels)
        return finalModels
      } catch {
        return fallback
      }
    }

    if (activeProvider === 'openai_compatible') {
      const base = (config?.baseURL || 'https://api.openai.com/v1').replace(/\/+$/, '')
      try {
        const response = await fetch(`${base}/models`, {
          headers: AIService.buildOpenAICompatibleHeaders({ apiKey, customHeaders: config?.customHeaders })
        })
        if (!response.ok) return fallback
        const data = await response.json()
        const raw = Array.isArray(data.data) ? data.data : (Array.isArray(data.models) ? data.models : [])
        const remoteModels = raw
          .map((m: { id?: string; name?: string }) => m.id || m.name || '')
          .filter((id: string) => id.length > 0)
          .filter((id: string) => isTextGenerationModel(id))
        const finalModels = remoteModels.length > 0 ? remoteModels : fallback
        if (finalModels.length > 0) setCachedModels(activeProvider, { apiKey, baseURL: config?.baseURL }, finalModels)
        return finalModels
      } catch {
        return fallback
      }
    }

    if (activeProvider === 'claude') {
      try {
        const base = (config?.baseURL || 'https://api.anthropic.com/v1').replace(/\/+$/, '')
        const response = await fetch(`${base}/models`, {
          headers: {
            'x-api-key': apiKey,
            'anthropic-version': '2023-06-01'
          }
        })
        if (!response.ok) return fallback
        const data = await response.json()
        const remoteModels = (data.data || [])
          .map((m: { id: string }) => m.id)
          .filter((id: string) => id.includes('claude'))
        const finalModels = remoteModels.length > 0 ? remoteModels : fallback
        if (finalModels.length > 0) setCachedModels(activeProvider, { apiKey, baseURL: config?.baseURL }, finalModels)
        return finalModels
      } catch {
        return fallback
      }
    }

    return fallback
  }

  /**
   * Test provider connectivity without running a full translation.
   */
  static async testConnection(providerOverride?: string): Promise<void> {
    const settings = getSettings()
    const providerId = (providerOverride || settings.activeProviderId || 'gemini').toLowerCase()
    const config = settings.providers[providerId as keyof typeof settings.providers]
    const apiKey = config?.apiKey || ''

    if (!apiKey) {
      throw new APIError(`Missing API Key for provider: ${providerId.toUpperCase()}`)
    }

    if (providerId === 'gemini') {
      const url = new URL('https://generativelanguage.googleapis.com/v1beta/models')
      url.searchParams.set('key', apiKey)
      const response = await fetch(url.toString())
      if (!response.ok) {
        const body = await response.text().catch(() => '')
        throw new APIError(`Gemini connection failed (${response.status}): ${body}`, response.status, body)
      }
      return
    }

    if (providerId === 'openai_compatible') {
      const base = (config?.baseURL || 'https://api.openai.com/v1').replace(/\/+$/, '')
      const headers = AIService.buildOpenAICompatibleHeaders({ apiKey, customHeaders: config?.customHeaders })
      const modelId = (config?.modelId || '').trim()

      const response = await fetch(`${base}/models`, { headers })
      if (response.ok) return

      if (response.status === 404 || response.status === 405 || response.status === 501) {
        if (!modelId) {
          throw new APIError('Model ID is required for test connection when /models is unavailable')
        }
        const fallback = await fetch(`${base}/chat/completions`, {
          method: 'POST',
          headers,
          body: JSON.stringify({
            model: modelId,
            messages: [{ role: 'user', content: 'ping' }],
            max_tokens: 1,
            temperature: 0,
          })
        })
        if (!fallback.ok) {
          const body = await fallback.text().catch(() => '')
          throw new APIError(`Connection failed (${fallback.status}): ${body}`, fallback.status, body)
        }
        return
      }

      const body = await response.text().catch(() => '')
      throw new APIError(`Connection failed (${response.status}): ${body}`, response.status, body)
    }

    if (providerId === 'claude') {
      const base = (config?.baseURL || 'https://api.anthropic.com/v1').replace(/\/+$/, '')
      const response = await fetch(`${base}/models`, {
        headers: {
          'x-api-key': apiKey,
          'anthropic-version': '2023-06-01'
        }
      })
      if (!response.ok) {
        const body = await response.text().catch(() => '')
        throw new APIError(`Claude connection failed (${response.status}): ${body}`, response.status, body)
      }
      return
    }

    throw new APIError(`Unsupported provider: ${providerId}`)
  }
}
