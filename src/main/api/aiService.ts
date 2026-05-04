import { GoogleGenerativeAI, Schema, SchemaType } from '@google/generative-ai'
// Import hàm lấy settings từ store của bạn (để agent tự link)
import { getSettings } from '../store/settings'

// ============================================================================
// 1. HYBRID PROMPT ARCHITECTURE
// ============================================================================
const getSystemPrompt = (targetLanguage: string, userCustomPrompt: string, glossary: string = "") => {
  // Part A: Technical Rules (HARDCODED - Mệnh lệnh không thể thương lượng)
  const partA = `Nhiệm vụ của bạn là dịch mảng JSON các chuỗi hội thoại/UI sang ${targetLanguage}.
QUY TẮC KỸ THUẬT BẮT BUỘC (CRITICAL):
1. KHÔNG dịch, KHÔNG xóa, KHÔNG thay đổi vị trí các biến số trong ngoặc vuông: [player_name], [gold]...
2. KHÔNG dịch các thẻ tag trong ngoặc nhọn: {b}, {color=#f00}, {i}...
3. GIỮ NGUYÊN các ký tự escape: \\", \\n
4. BẮT BUỘC trả về mảng JSON có số lượng phần tử giống hệt input (tương ứng 1-1).`;

  // Part B: Contextual Rules (Dynamic from Settings)
  let partB = "";
  if (userCustomPrompt) {
    partB += `\n\nQUY TẮC VĂN PHONG:\n${userCustomPrompt}`;
  } else {
    partB += `\n\nQUY TẮC VĂN PHONG:
1. Bản địa hóa tự nhiên: Dùng văn nói, ngôn ngữ mạng hoặc từ lóng phù hợp với ngữ cảnh. KHÔNG dịch máy.
2. Xưng hô: Tự suy luận mối quan hệ qua ngữ cảnh để dùng đại từ cho mượt mà.
3. Nếu chuỗi chỉ là các dấu câu ("...", "?!", "Ah."), hãy giữ nguyên, không cần bịa thêm chữ.`;
  }

  if (glossary) {
    partB += `\n\nTỪ ĐIỂN THUẬT NGỮ (BẮT BUỘC TUÂN THỦ):\nDịch các từ khóa sau đúng theo danh sách:\n${glossary}`;
  }

  return partA + partB;
}


// ============================================================================
// 2. INTERFACE CHUNG CHO MỌI MODEL AI (Adapter Pattern)
// ============================================================================
import { AppSettings } from '../../shared/types'

export interface IAITranslator {
  providerName: string;
  translate(texts: string[], settings: AppSettings, glossaryText?: string): Promise<string[]>;
}

// ============================================================================
// 3. IMPLEMENTATION CHO GEMINI
// ============================================================================
class GeminiTranslator implements IAITranslator {
  providerName = 'Gemini';
  private genAI: GoogleGenerativeAI;
  private modelName: string;

  constructor(apiKey: string, modelName: string) {
    this.genAI = new GoogleGenerativeAI(apiKey);
    this.modelName = modelName;
  }

  async translate(texts: string[], settings: AppSettings, glossaryText: string = ""): Promise<string[]> {
    const responseSchema: Schema = {
      type: SchemaType.ARRAY,
      items: { type: SchemaType.STRING }
    };

    const model = this.genAI.getGenerativeModel({
      model: this.modelName,
      systemInstruction: getSystemPrompt(settings.targetLanguage, settings.userCustomPrompt, glossaryText),
      generationConfig: {
        responseMimeType: 'application/json',
        responseSchema: responseSchema,
        temperature: settings.temperature, // Hybrid Prompt yêu cầu lấy temp từ settings
      }
    });

    const prompt = `Dịch mảng JSON sau sang ${settings.targetLanguage}:\n${JSON.stringify(texts)}`;

    try {
      const result = await model.generateContent(prompt);
      const responseText = result.response.text();

      const translatedArray: string[] = JSON.parse(responseText);

      if (translatedArray.length !== texts.length) {
        throw new Error(`Array length mismatch: Input ${texts.length}, Output ${translatedArray.length}`);
      }

      return translatedArray;
    } catch (error) {
      throw error;
    }
  }
}

// ============================================================================
// 4. IMPLEMENTATION CHO OPENAI / GPT
// ============================================================================
class GPTTranslator implements IAITranslator {
  providerName = 'GPT';
  private apiKey: string;
  private modelName: string;
  private endpoint: string;

  constructor(apiKey: string, modelName: string, customEndpoint?: string) {
    this.apiKey = apiKey;
    this.modelName = modelName;
    this.endpoint = customEndpoint || 'https://api.openai.com/v1/chat/completions';
  }

  async translate(texts: string[], settings: AppSettings, glossaryText: string = ""): Promise<string[]> {
    const systemPrompt = getSystemPrompt(settings.targetLanguage, settings.userCustomPrompt, glossaryText);
    const prompt = `Dịch mảng JSON sau sang ${settings.targetLanguage}:\n${JSON.stringify(texts)}`;

    const response = await fetch(this.endpoint, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${this.apiKey}`
      },
      body: JSON.stringify({
        model: this.modelName,
        messages: [
          { role: 'system', content: systemPrompt },
          { role: 'user', content: prompt }
        ],
        temperature: settings.temperature,
        response_format: { type: 'json_object' }
      })
    });

    if (!response.ok) {
      const body = await response.text();
      throw new Error(`[AI Service | GPT] API Error ${response.status}: ${body}`);
    }

    const data = await response.json();
    const content: string = data.choices?.[0]?.message?.content;
    if (!content) {
      throw new Error('[AI Service | GPT] Empty response from API');
    }

    const translatedArray: string[] = JSON.parse(content);
    if (translatedArray.length !== texts.length) {
      throw new Error(`Array length mismatch: Input ${texts.length}, Output ${translatedArray.length}`);
    }

    return translatedArray;
  }
}

// ============================================================================
// 5. IMPLEMENTATION CHO CLAUDE (Anthropic)
// ============================================================================
class ClaudeTranslator implements IAITranslator {
  providerName = 'Claude';
  private apiKey: string;
  private modelName: string;
  private endpoint: string;

  constructor(apiKey: string, modelName: string, customEndpoint?: string) {
    this.apiKey = apiKey;
    this.modelName = modelName;
    this.endpoint = customEndpoint || 'https://api.anthropic.com/v1/messages';
  }

  async translate(texts: string[], settings: AppSettings, glossaryText: string = ""): Promise<string[]> {
    const systemPrompt = getSystemPrompt(settings.targetLanguage, settings.userCustomPrompt, glossaryText);
    const prompt = `Dịch mảng JSON sau sang ${settings.targetLanguage}:\n${JSON.stringify(texts)}`;

    const response = await fetch(this.endpoint, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': this.apiKey,
        'anthropic-version': '2023-06-01'
      },
      body: JSON.stringify({
        model: this.modelName,
        system: systemPrompt,
        messages: [
          { role: 'user', content: prompt }
        ],
        max_tokens: 4096,
        temperature: settings.temperature
      })
    });

    if (!response.ok) {
      const body = await response.text();
      throw new Error(`[AI Service | Claude] API Error ${response.status}: ${body}`);
    }

    const data = await response.json();
    const content: string = data.content?.[0]?.text;
    if (!content) {
      throw new Error('[AI Service | Claude] Empty response from API');
    }

    const translatedArray: string[] = JSON.parse(content);
    if (translatedArray.length !== texts.length) {
      throw new Error(`Array length mismatch: Input ${texts.length}, Output ${translatedArray.length}`);
    }

    return translatedArray;
  }
}

// ============================================================================
// 6. IMPLEMENTATION CHO DEEPSEEK
// ============================================================================
class DeepSeekTranslator implements IAITranslator {
  providerName = 'DeepSeek';
  private apiKey: string;
  private modelName: string;
  private endpoint: string;

  constructor(apiKey: string, modelName: string, customEndpoint?: string) {
    this.apiKey = apiKey;
    this.modelName = modelName;
    this.endpoint = customEndpoint || 'https://api.deepseek.com/v1/chat/completions';
  }

  async translate(texts: string[], settings: AppSettings, glossaryText: string = ""): Promise<string[]> {
    const systemPrompt = getSystemPrompt(settings.targetLanguage, settings.userCustomPrompt, glossaryText);
    const prompt = `Dịch mảng JSON sau sang ${settings.targetLanguage}:\n${JSON.stringify(texts)}`;

    const response = await fetch(this.endpoint, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${this.apiKey}`
      },
      body: JSON.stringify({
        model: this.modelName,
        messages: [
          { role: 'system', content: systemPrompt },
          { role: 'user', content: prompt }
        ],
        temperature: settings.temperature,
        response_format: { type: 'json_object' }
      })
    });

    if (!response.ok) {
      const body = await response.text();
      throw new Error(`[AI Service | DeepSeek] API Error ${response.status}: ${body}`);
    }

    const data = await response.json();
    const content: string = data.choices?.[0]?.message?.content;
    if (!content) {
      throw new Error('[AI Service | DeepSeek] Empty response from API');
    }

    const translatedArray: string[] = JSON.parse(content);
    if (translatedArray.length !== texts.length) {
      throw new Error(`Array length mismatch: Input ${texts.length}, Output ${translatedArray.length}`);
    }

    return translatedArray;
  }
}

// ============================================================================
// 7. IMPLEMENTATION CHO GROK (xAI)
// ============================================================================
class GrokTranslator implements IAITranslator {
  providerName = 'Grok';
  private apiKey: string;
  private modelName: string;
  private endpoint: string;

  constructor(apiKey: string, modelName: string, customEndpoint?: string) {
    this.apiKey = apiKey;
    this.modelName = modelName;
    this.endpoint = customEndpoint || 'https://api.x.ai/v1/chat/completions';
  }

  async translate(texts: string[], settings: AppSettings, glossaryText: string = ""): Promise<string[]> {
    const systemPrompt = getSystemPrompt(settings.targetLanguage, settings.userCustomPrompt, glossaryText);
    const prompt = `Dịch mảng JSON sau sang ${settings.targetLanguage}:\n${JSON.stringify(texts)}`;

    const response = await fetch(this.endpoint, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${this.apiKey}`
      },
      body: JSON.stringify({
        model: this.modelName,
        messages: [
          { role: 'system', content: systemPrompt },
          { role: 'user', content: prompt }
        ],
        temperature: settings.temperature,
        response_format: { type: 'json_object' }
      })
    });

    if (!response.ok) {
      const body = await response.text();
      throw new Error(`[AI Service | Grok] API Error ${response.status}: ${body}`);
    }

    const data = await response.json();
    const content: string = data.choices?.[0]?.message?.content;
    if (!content) {
      throw new Error('[AI Service | Grok] Empty response from API');
    }

    const translatedArray: string[] = JSON.parse(content);
    if (translatedArray.length !== texts.length) {
      throw new Error(`Array length mismatch: Input ${texts.length}, Output ${translatedArray.length}`);
    }

    return translatedArray;
  }
}

// ============================================================================
// 5. GLOBAL AI SERVICE (Core Manager)
// ============================================================================

export const DEFAULT_MODELS: Record<string, string[]> = {
  gemini: ['gemini-2.5-flash', 'gemini-2.5-pro', 'gemini-1.5-flash', 'gemini-1.5-pro'],
  gpt: ['gpt-4o', 'gpt-4o-mini', 'gpt-4-turbo', 'gpt-3.5-turbo'],
  claude: ['claude-sonnet-4-20250514', 'claude-opus-4-20250414', 'claude-3-5-sonnet-20241022', 'claude-3-5-haiku-20241022'],
  deepseek: ['deepseek-chat', 'deepseek-reasoner'],
  grok: ['grok-3', 'grok-3-fast', 'grok-2']
};

export class AIService {
  /**
   * Gọi API dịch thuật dựa trên cấu hình Global Settings của người dùng.
   * Xử lý log tập trung cho toàn hệ thống.
   */
  static async translateBatch(texts: string[], glossaryText: string = ""): Promise<string[]> {
    const settings = getSettings();
    const activeProvider = settings.activeProvider || 'gemini';
    const apiKey = settings.apiKeys[activeProvider];
    let modelId = settings.activeModelId || '';

    if (!apiKey) {
      const errorMsg = `[AI Service Error] Missing API Key for provider: ${activeProvider.toUpperCase()}`;
      console.error(errorMsg);
      throw new Error(errorMsg);
    }

    let translator: IAITranslator;

    if (!modelId) {
      const models = await AIService.listModels(activeProvider)
      if (models.length === 0) {
        throw new Error(`[AI Service Error] No available models for provider: ${activeProvider.toUpperCase()}`)
      }
      modelId = models[0]
    }

    switch (activeProvider.toLowerCase()) {
      case 'gemini':
        translator = new GeminiTranslator(apiKey, modelId);
        break;
      case 'claude':
        translator = new ClaudeTranslator(apiKey, modelId);
        break;
      case 'gpt':
      case 'openai':
        translator = new GPTTranslator(apiKey, modelId, settings.customEndpoint);
        break;
      case 'deepseek':
        translator = new DeepSeekTranslator(apiKey, modelId, settings.customEndpoint);
        break;
      case 'grok':
        translator = new GrokTranslator(apiKey, modelId, settings.customEndpoint);
        break;
      default:
        throw new Error(`[AI Service Error] Unsupported provider: ${activeProvider}`);
    }

    console.log(`[AI Service | ${translator.providerName}] Translating batch of ${texts.length} item(s)...`);
    const startTime = Date.now();

    try {
      const result = await translator.translate(texts, settings, glossaryText);

      const duration = Date.now() - startTime;
      console.log(`[AI Service | ${translator.providerName}] Translation OK for ${texts.length} item(s) (${duration}ms).`);

      return result;
    } catch (error) {
      console.error(`[AI Service | ${translator.providerName}] Translation error:`, error);
      throw error;
    }
  }

  static async listModels(providerOverride?: string): Promise<string[]> {
    const settings = getSettings();
    const activeProvider = (providerOverride || settings.activeProvider || 'gemini').toLowerCase();
    const apiKey = settings.apiKeys[activeProvider as keyof typeof settings.apiKeys];

    const defaults = DEFAULT_MODELS[activeProvider] || DEFAULT_MODELS['gemini'];

    if (!apiKey) {
      return defaults;
    }

    if (activeProvider === 'gemini') {
      try {
        const url = new URL('https://generativelanguage.googleapis.com/v1beta/models')
        url.searchParams.set('key', apiKey)

        const response = await fetch(url.toString())
        if (!response.ok) {
          return defaults;
        }

        const data = (await response.json()) as {
          models?: Array<{
            name?: string
            supportedGenerationMethods?: string[]
          }>
        }

        const remoteModels = (data.models || [])
          .filter((model) => (model.supportedGenerationMethods || []).includes('generateContent'))
          .map((model) => (model.name || '').replace('models/', ''))
          .filter((name) => name.length > 0);

        if (remoteModels.length > 0) {
          return remoteModels;
        }
      } catch {
        return defaults;
      }
    }

    if (activeProvider === 'gpt' || activeProvider === 'openai') {
      try {
        const response = await fetch('https://api.openai.com/v1/models', {
          headers: { 'Authorization': `Bearer ${apiKey}` }
        });
        if (!response.ok) {
          return defaults;
        }
        const data = await response.json();
        const remoteModels = (data.data || [])
          .map((m: { id: string }) => m.id)
          .filter((id: string) => id.includes('gpt') || id.includes('o1') || id.includes('o3'));
        if (remoteModels.length > 0) {
          return remoteModels;
        }
      } catch {
        return defaults;
      }
    }

    if (activeProvider === 'claude') {
      try {
        const response = await fetch('https://api.anthropic.com/v1/models', {
          headers: {
            'x-api-key': apiKey,
            'anthropic-version': '2023-06-01'
          }
        });
        if (!response.ok) {
          return defaults;
        }
        const data = await response.json();
        const remoteModels = (data.data || [])
          .map((m: { id: string }) => m.id)
          .filter((id: string) => id.includes('claude'));
        if (remoteModels.length > 0) {
          return remoteModels;
        }
      } catch {
        return defaults;
      }
    }

    if (activeProvider === 'deepseek') {
      try {
        const response = await fetch('https://api.deepseek.com/v1/models', {
          headers: { 'Authorization': `Bearer ${apiKey}` }
        });
        if (!response.ok) {
          return defaults;
        }
        const data = await response.json();
        const remoteModels = (data.data || []).map((m: { id: string }) => m.id);
        if (remoteModels.length > 0) {
          return remoteModels;
        }
      } catch {
        return defaults;
      }
    }

    if (activeProvider === 'grok') {
      try {
        const response = await fetch('https://api.x.ai/v1/models', {
          headers: { 'Authorization': `Bearer ${apiKey}` }
        });
        if (!response.ok) {
          return defaults;
        }
        const data = await response.json();
        const remoteModels = (data.data || []).map((m: { id: string }) => m.id);
        if (remoteModels.length > 0) {
          return remoteModels;
        }
      } catch {
        return defaults;
      }
    }

    return defaults;
  }
}
