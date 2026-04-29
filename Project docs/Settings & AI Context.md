FEATURE CONTEXT: System Settings & Hybrid AI Prompting
1. Overview & Storage Strategy
This document defines the specifications for the Settings Module and the upgraded AI Translation Service.
Storage Rule: DO NOT use SQLite for settings. All settings defined in this document MUST be persisted using
electron-store (saving to a local JSON file). The SQLite database is strictly reserved for the 100k+ translation blocks
and translation memory.
2. Settings Schema ( AppSettings Interface)
The electron-store must implement the following AppSettings interface. It is divided into 5 logical groups:
Group 1: AI & API Config
activeProvider : enum ('gemini' | 'openai' | 'claude' | 'custom').
apiKeys : Record/Object storing keys for each provider.
activeModelId : string (e.g., "gemini-2.5-flash").
customEndpoint : string (Optional - For Local LLM or OpenRouter).
Group 2: Prompting & Localization (Hybrid Prompt Setup)
targetLanguage : string (Default: "Tiếng Việt").
temperature : number (Default: 0.2 - CRITICAL: Must be low to prevent formatting hallucinations).
userCustomPrompt : string (The contextual prompt defined by the user. If empty, fallback to a DEFAULT_USER_PROMPT ).
Group 3: Queue & Performance
batchSize : number (Default: 20 lines per API call).
concurrentRequests : number (Default: 1).
costWarningThreshold : number (USD, Default: 2.0).
Group 4: Translation Memory (TM)
enableTranslationMemory : boolean.
tmFuzzyThreshold : number (0.0 to 1.0. Default: 1.0).
Group 5: System UI
theme : 'light' | 'dark' | 'system'.
editorFontSize : number.
autoSaveInterval : number (in minutes).
3. The "Hybrid Prompting" Architecture
Do not hardcode a single system prompt. The AI Service must dynamically build the SystemInstruction by combining two
parts:
Part A: Technical Rules (HARDCODED - Hidden from User)
The AI Service MUST inject this exact text to protect the game engine:
Nhiệm vụ của bạn là dịch mảng JSON các chuỗi hội thoại/UI sang {TARGET_LANGUAGE}.
QUY TẮC KỸ THUẬT BẮT BUỘC (CRITICAL):
1. KHÔNG dịch, KHÔNG xóa, KHÔNG thay đổi vị trí các biến số trong ngoặc vuông: [player_name], [gold]...
2. KHÔNG dịch các thẻ tag trong ngoặc nhọn: {b}, {color=#f00}, {i}...
3. GIỮ NGUYÊN các ký tự escape: \", \n
4. BẮT BUỘC trả về mảng JSON có số lượng phần tử giống hệt input (tương ứng 1-1).
Part B: Contextual Rules (Dynamic from Settings)
Append the userCustomPrompt from Settings and the Glossary (from DB) below Part A. Example structure: [Part A:
Technical Rules] + \n\nQUY TẮC VĂN PHONG:\n + [Part B: User Prompt] + \n\nTỪ ĐIỂN:\n + [Glossary]
4. AI Service Refactoring (Adapter Pattern)
Refactor src/main/api/aiService.ts to support multiple providers without breaking the core logic:
1. Create an interface IAITranslator with a method: translate(texts: string[], glossaryText?: string):
Promise<string[]> .
2. Create GeminiTranslator class implementing this interface. It must apply the temperature and the Hybrid Prompt.
3. Create the main AIService class with a static method translateBatch . This method reads activeProvider from
electron-store , instantiates the correct Translator class, and handles global logging (e.g., console.log("[AI
Service | Gemini] Translating...") ).
5. Agent Instructions
1. Implement the Settings manager using electron-store .
2. Refactor aiService.ts according to the Hybrid Prompting and Adapter Pattern rules above.
3. Ensure the AI Service reads directly from the newly created Settings manager to get API keys, temperature, and custom
prompts