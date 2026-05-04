/**
 * Custom error types for the AI translation pipeline.
 * Each error type signals a different recovery strategy to the Queue Manager.
 */

/**
 * Rate limit error (HTTP 429).
 * Signal: Queue should wait and retry with exponential backoff.
 */
export class RateLimitError extends Error {
  public readonly retryAfterMs?: number

  constructor(message: string, retryAfterMs?: number) {
    super(message)
    this.name = 'RateLimitError'
    this.retryAfterMs = retryAfterMs
  }
}

/**
 * Token / context limit exceeded (HTTP 400/413).
 * Signal: Queue should reduce batch size and retry.
 */
export class TokenLimitError extends Error {
  constructor(message: string) {
    super(message)
    this.name = 'TokenLimitError'
  }
}

/**
 * JSON parsing failure from LLM response.
 * Signal: Queue should retry with a stricter prompt.
 */
export class ParsingError extends Error {
  public readonly rawResponse: string

  constructor(message: string, rawResponse: string) {
    super(message)
    this.name = 'ParsingError'
    this.rawResponse = rawResponse
  }
}

/**
 * Generic API error (auth failure, server error, etc.).
 */
export class APIError extends Error {
  public readonly statusCode?: number
  public readonly response?: string

  constructor(message: string, statusCode?: number, response?: string) {
    super(message)
    this.name = 'APIError'
    this.statusCode = statusCode
    this.response = response
  }
}

/**
 * Normalize an unknown error into one of our typed errors.
 * Handles OpenAI SDK errors, fetch errors, and plain errors.
 */
export function normalizeError(err: unknown): Error {
  if (err instanceof Error) {
    // Already typed
    if (
      err instanceof RateLimitError ||
      err instanceof TokenLimitError ||
      err instanceof ParsingError ||
      err instanceof APIError
    ) {
      return err
    }

    // OpenAI SDK errors have a `status` property
    const maybeStatus = (err as { status?: unknown }).status
    const statusCode = typeof maybeStatus === 'number' ? maybeStatus : undefined

    const message = err.message

    if (statusCode === 429) {
      // Check for Retry-After header (not always available)
      const maybeRetryAfter = (err as { headers?: Record<string, string> })?.headers?.['retry-after']
      const retryAfterMs = maybeRetryAfter ? parseInt(maybeRetryAfter, 10) * 1000 : undefined
      return new RateLimitError(message, retryAfterMs)
    }

    if (statusCode === 400 || statusCode === 413) {
      if (message.toLowerCase().includes('token') || message.toLowerCase().includes('length') || message.toLowerCase().includes('context')) {
        return new TokenLimitError(message)
      }
    }

    if (statusCode) {
      return new APIError(message, statusCode)
    }

    // Check for common error message patterns
    if (message.includes('429') || message.toLowerCase().includes('rate limit')) {
      return new RateLimitError(message)
    }

    if (message.toLowerCase().includes('json') || message.toLowerCase().includes('parse')) {
      return new ParsingError(message, '')
    }

    return err
  }

  // Non-error objects
  const message = typeof err === 'string' ? err : String(err)
  return new APIError(message)
}
