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
  const lastBracket = text.lastIndexOf(']')
  if (lastBracket === -1 || lastBracket <= firstBracket) {
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
    throw new JSONParsingError(
      `JSON parse failed: ${message}`,
      responseText
    )
  }
}
