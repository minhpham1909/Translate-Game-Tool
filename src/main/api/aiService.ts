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
// 4. IMPLEMENTATION STUBS CHO CÁC MODEL KHÁC (Sẽ triển khai sau)
// ============================================================================
class ClaudeTranslator implements IAITranslator {
  providerName = 'Claude';
  // TODO: Lưu các tham số khi triển khai thực sự
  constructor(_apiKey: string, _modelName: string, _customEndpoint?: string) {}
  async translate(_texts: string[], _settings: AppSettings, _glossaryText: string = ""): Promise<string[]> {
    throw new Error("Claude is not yet implemented.");
  }
}

class GPTTranslator implements IAITranslator {
  providerName = 'GPT';
  // TODO: Lưu các tham số khi triển khai thực sự
  constructor(_apiKey: string, _modelName: string, _customEndpoint?: string) {}
  async translate(_texts: string[], _settings: AppSettings, _glossaryText: string = ""): Promise<string[]> {
    throw new Error("GPT (OpenAI) is not yet implemented.");
  }
}

class DeepSeekTranslator implements IAITranslator {
  providerName = 'DeepSeek';
  // TODO: Lưu các tham số khi triển khai thực sự
  constructor(_apiKey: string, _modelName: string, _customEndpoint?: string) {}
  async translate(_texts: string[], _settings: AppSettings, _glossaryText: string = ""): Promise<string[]> {
    throw new Error("DeepSeek is not yet implemented.");
  }
}

class GrokTranslator implements IAITranslator {
  providerName = 'Grok';
  // TODO: Lưu các tham số khi triển khai thực sự
  constructor(_apiKey: string, _modelName: string, _customEndpoint?: string) {}
  async translate(_texts: string[], _settings: AppSettings, _glossaryText: string = ""): Promise<string[]> {
    throw new Error("Grok is not yet implemented.");
  }
}

// ============================================================================
// 5. GLOBAL AI SERVICE (Core Manager)
// ============================================================================
export class AIService {
  /**
   * Gọi API dịch thuật dựa trên cấu hình Global Settings của người dùng.
   * Xử lý log tập trung cho toàn hệ thống.
   */
  static async translateBatch(texts: string[], glossaryText: string = ""): Promise<string[]> {
    const settings = getSettings();
    const activeProvider = settings.activeProvider || 'gemini'; // 'gemini' | 'openai' | 'claude'
    const apiKey = settings.apiKeys[activeProvider];
    const modelId = settings.activeModelId || 'gemini-1.5-flash';

    if (!apiKey) {
      const errorMsg = `[AI Service Error] Missing API Key for provider: ${activeProvider.toUpperCase()}`;
      console.error(errorMsg);
      throw new Error(errorMsg);
    }

    let translator: IAITranslator;

    // Factory logic: Chọn Model dựa theo setting
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

    console.log(`[AI Service | ${translator.providerName}] Bắt đầu dịch batch ${texts.length} câu...`);
    const startTime = Date.now();

    try {
      const result = await translator.translate(texts, settings, glossaryText);
      
      const duration = Date.now() - startTime;
      console.log(`[AI Service | ${translator.providerName}] Dịch thành công ${texts.length} câu (${duration}ms).`);
      
      return result;
    } catch (error) {
      console.error(`[AI Service | ${translator.providerName}] Lỗi trong quá trình dịch:`, error);
      throw error; // Quăng lỗi lên cho UI hoặc Queue Manager xử lý (Retry/Hiển thị lỗi)
    }
  }
}
