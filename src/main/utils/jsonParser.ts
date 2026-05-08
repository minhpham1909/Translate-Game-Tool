/**
 * extractJsonArray — Robust JSON parser for LLM responses.
 * Handles markdown code blocks, conversational filler, and malformed output.
 */

export class JSONParsingError extends Error {
  constructor(message: string, public readonly rawResponse: string) {
    super(message)
    this.name = 'JSONParsingError'
  }
}

/**
 * Extract a JSON array from a potentially dirty LLM response string.
 *
 * Strategy:
 * 1. Strip markdown code fences (```json ... ```, ``` ... ```)
 * 2. Find the first `[` and last `]` in the cleaned string
 * 3. Extract substring and attempt JSON.parse()
 * 4. Validate the result is an array
 *
 * @param responseText Raw text from the LLM
 * @returns Parsed string array
 * @throws JSONParsingError if extraction or parsing fails
 */
export function extractJsonArray(responseText: string): string[] {
  let text = responseText.trim()

  // Step 1: Remove markdown code fences
  text = text.replace(/```(?:json)?\s*/gi, '').replace(/```\s*$/g, '').trim()

  // Step 2: Remove common conversational filler patterns
  // e.g., "Here is the translation:", "Sure! Here you go:", "Dưới đây là kết quả:"
  // We rely on finding [ and ] so most filler is handled naturally,
  // but we remove leading text that appears before the first '['
  const firstBracket = text.indexOf('[')
  if (firstBracket === -1) {
    throw new JSONParsingError(
      'No JSON array found in response (missing "[" bracket)',
      responseText
    )
  }

  // Step 3: Find the matching closing bracket
  // We need the LAST ']' that properly closes the array
  let lastBracket = text.lastIndexOf(']')
  
  // FIX: If no closing bracket found, try to salvage truncated JSON
  if (lastBracket === -1 || lastBracket <= firstBracket) {
    // Try to add closing bracket if the response was truncated
    const trimmed = text.substring(firstBracket).trim()
    if (trimmed.endsWith('"') || trimmed.endsWith(',') || trimmed.endsWith('\\"')) {
      // Response was likely truncated - try to close the JSON array
      const salvaged = text + '"]'
      const salvagedResult = tryParseJson(salvaged.substring(firstBracket))
      if (salvagedResult) return salvagedResult
    }
    throw new JSONParsingError(
      'No closing "]" bracket found for JSON array',
      responseText
    )
  }

  // Extract the candidate JSON string
  const candidate = text.substring(firstBracket, lastBracket + 1)

  // Step 4: Attempt to parse
  try {
    const parsed = JSON.parse(candidate)

    // Step 5: Validate it's an array
    if (!Array.isArray(parsed)) {
      throw new JSONParsingError(
        `Parsed JSON is not an array (got ${typeof parsed})`,
        responseText
      )
    }

    // Step 6: Validate all elements are strings
    for (let i = 0; i < parsed.length; i++) {
      if (typeof parsed[i] !== 'string') {
        throw new JSONParsingError(
          `Element at index ${i} is not a string (got ${typeof parsed[i]})`,
          responseText
        )
      }
    }

    return parsed as string[]
  } catch (err) {
    if (err instanceof JSONParsingError) throw err
    const message = err instanceof Error ? err.message : String(err)
    
    // Try to salvage truncated JSON by adding closing bracket
    const salvaged = candidate + '"]'
    try {
      const salvagedParsed = JSON.parse(salvaged)
      if (Array.isArray(salvagedParsed) && salvagedParsed.every((item: unknown) => typeof item === 'string')) {
        console.warn('[JSONParser] Salvaged truncated JSON by adding closing bracket')
        return salvagedParsed as string[]
      }
    } catch {
      // Ignore salvage attempt failure
    }
    
    throw new JSONParsingError(
      `JSON parse failed: ${message}`,
      responseText
    )
  }
}

/**
 * Try to parse JSON from a substring (helper for salvage attempts)
 */
function tryParseJson(text: string): string[] | null {
  try {
    const parsed = JSON.parse(text)
    if (Array.isArray(parsed) && parsed.every((item: unknown) => typeof item === 'string')) {
      return parsed as string[]
    }
    return null
  } catch {
    return null
  }
}
