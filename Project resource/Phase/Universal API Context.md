FEATURE CONTEXT: Universal API Gateway & Robust JSON Handling

1. The Business Problem (Multi-Model & Custom Endpoints)

To support DeepSeek, Grok, OpenAI, Claude, and aggregators like OpenRouter or Local LLMs (Ollama), the AIService must be extremely flexible.

Most of these providers use the OpenAI API format. We don't need distinct classes for all of them; we need a single, highly configurable OpenAICompatibleTranslator.

CRITICAL DANGER: Custom endpoints and open-source models often fail to return pure JSON. They might wrap the JSON in markdown code blocks or add conversational filler text (e.g., "Here is your translation:

$$...$$

"). This will crash JSON.parse() and break the translation queue.

2. Settings Upgrade (src/main/store/settings.ts)

The AppSettings interface must be upgraded to support Custom Endpoints fully:

interface AIProviderConfig {
  apiKey: string;
  baseURL?: string; // Essential for DeepSeek, OpenRouter, Local LLMs
  modelId: string;
  customHeaders?: Record<string, string>; // Essential for OpenRouter (e.g., HTTP-Referer)
}

// Update in AppSettings:
providers: {
  gemini: AIProviderConfig;
  openai_compatible: AIProviderConfig; // Covers OpenAI, DeepSeek, Grok, OpenRouter
  claude: AIProviderConfig;
}
activeProviderId: 'gemini' | 'openai_compatible' | 'claude';



3. The "Robust JSON Parser" (CRITICAL UTILITY)

Agent MUST create a utility function in src/main/utils/jsonParser.ts to extract JSON arrays from dirty AI responses.
Logic for extractJsonArray(responseText: string):

Remove markdown code blocks (e.g., strip backticks like json and ).

Find the first occurrence of [ and the last occurrence of ].

Extract the substring and attempt JSON.parse().

If it fails, throw a specific JSONParsingError so the Translation Engine knows to auto-retry.

4. Universal OpenAI Adapter (src/main/api/translators/OpenAITranslator.ts)

Implement the IAITranslator interface for ALL OpenAI-compatible endpoints using the official openai npm package.

It must accept baseURL, apiKey, and customHeaders in its constructor.

It must instruct the model to return JSON. Even if response_format: { type: "json_object" } is used, the system prompt must explicitly say: "Return ONLY a raw JSON array. No markdown, no conversational text."

It MUST use the extractJsonArray utility on the response before returning.

5. Normalized Error Handling for the Queue Manager

Custom endpoints return wildly different HTTP error codes. The Adapters must catch these and normalize them into standard errors for the translationEngine.ts queue:

Rate Limit (429): Throw RateLimitError (Signals the Queue to wait and exponential backoff).

Context/Token Limit (400/413): Throw TokenLimitError (Signals the Queue to reduce batch size and retry).

Format/JSON Error: Throw ParsingError (Signals the Queue to retry with a stricter prompt warning).

6. Agent Execution Steps

STEP 1: Implement the extractJsonArray utility function with robust Regex to handle dirty LLM outputs. STEP 2: Upgrade the settings.ts schema to support baseURL and customHeaders for the OpenAI Compatible provider. STEP 3: Implement the OpenAICompatibleTranslator class. Ensure it uses the official openai SDK but allows overriding the baseURL. Apply the JSON parsing utility to its output. STEP 4: Update the main AIService factory to route DeepSeek, Grok, OpenAI, and Custom URLs all through the OpenAICompatibleTranslator using their specific Base URLs.
