HOTFIX CONTEXT: Relaxed OpenAI Wrapper Parsing

1. The Bug (OpenRouter / Custom Endpoint Anomaly)

The OpenAICompatibleTranslator.ts strictly expects responses to follow the standard OpenAI wrapper format (data.choices[0].message.content).
However, logs show that OpenRouter (specifically when routing to Gemini) sometimes strips this wrapper and returns the raw JSON array directly in the HTTP body (e.g., ["Translated text"]).
Because an Array does not have a .choices property, our code evaluates content as undefined and throws an "Empty response from AI service" error.

2. The Solution (Flexible Body Parsing)

We must read the raw HTTP response text first. If it conforms to the OpenAI wrapper, we extract the content. If it doesn't (meaning it's likely a raw array or raw string from a quirky endpoint), we treat the ENTIRE response body as the content and pass it directly to our robust extractJsonArray utility.

A. Agent Execution Steps

Open src/main/api/translators/OpenAICompatibleTranslator.ts.
Locate the translate method. Find this specific block of code (around line 250-265) that occurs right after handling the 402/HTTP errors:

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


REPLACE THAT ENTIRE BLOCK WITH THIS ROBUST LOGIC:

    const rawBody = await response.text().catch(() => '')
    if (!rawBody || rawBody.trim() === '') {
      throw new APIError('Empty response body from AI service')
    }

    let content = ''
    try {
      const data = JSON.parse(rawBody)
      // 1. Check if it matches standard OpenAI structure
      if (data && typeof data === 'object' && Array.isArray(data.choices) && data.choices[0]?.message?.content !== undefined) {
        content = data.choices[0].message.content
      }
      // 2. Fallback: If it's valid JSON but NOT OpenAI format (e.g., OpenRouter returned the raw array directly)
      else {
        content = rawBody
      }
    } catch {
      // 3. Fallback: It's not valid JSON at all (e.g., plain text or markdown), let extractJsonArray handle it
      content = rawBody
    }

    if (!content || content.trim() === '') {
      throw new APIError('Could not extract content from AI response')
    }


Agent Note: The rest of the code below this (where it calls extractJsonArray(content)) remains completely unchanged.
