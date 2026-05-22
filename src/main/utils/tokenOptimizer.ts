export interface TokenPlannerOptions {
  minBatchSize?: number
  maxBatchSize: number
  targetInputTokens: number
  maxInputTokens?: number
}

export interface TokenEstimate {
  inputTokens: number
  outputTokens: number
}

const TOKEN_APPROX_CHAR_RATIO = 4
const OUTPUT_EXPANSION_RATIO = 1.25

export function estimateTextTokens(text: string): number {
  if (!text) return 0
  return Math.max(1, Math.ceil(text.length / TOKEN_APPROX_CHAR_RATIO))
}

export function estimateBatchInputTokens(texts: string[]): number {
  if (texts.length === 0) return 0
  // JSON + separators overhead to avoid under-estimation.
  const payloadChars = texts.reduce((sum, t) => sum + t.length, 0)
  const structuralChars = texts.length * 8
  return Math.max(1, Math.ceil((payloadChars + structuralChars) / TOKEN_APPROX_CHAR_RATIO))
}

export function estimateBatchTokens(texts: string[]): TokenEstimate {
  const inputTokens = estimateBatchInputTokens(texts)
  const outputTokens = Math.max(1, Math.ceil(inputTokens * OUTPUT_EXPANSION_RATIO))
  return { inputTokens, outputTokens }
}

export function planBatchSize(texts: string[], options: TokenPlannerOptions): number {
  if (texts.length === 0) return 0

  const minBatchSize = Math.max(1, options.minBatchSize ?? 1)
  const maxBatchSize = Math.max(minBatchSize, options.maxBatchSize)
  const target = Math.max(1, options.targetInputTokens)
  const hardMax = Math.max(target, options.maxInputTokens ?? Math.ceil(target * 1.2))

  let planned = 0
  let running = 0

  for (let i = 0; i < texts.length && planned < maxBatchSize; i++) {
    const token = estimateTextTokens(texts[i])
    if (planned >= minBatchSize && running + token > target) break
    if (running + token > hardMax && planned > 0) break

    running += token
    planned++
  }

  return Math.max(minBatchSize, Math.min(maxBatchSize, planned))
}

export function getDefaultTokenBudget(providerId: string): number {
  switch (providerId) {
    case 'gemini':
      return 3200
    case 'claude':
      return 3000
    case 'openai_compatible':
      return 2800
    default:
      return 2500
  }
}

export function estimateThroughputPerMinute(processed: number, startAtMs: number, nowMs: number = Date.now()): number {
  const elapsedMs = Math.max(1, nowMs - startAtMs)
  return (processed * 60000) / elapsedMs
}

export function estimateEtaSeconds(remaining: number, throughputPerMinute: number): number | null {
  if (remaining <= 0) return 0
  if (throughputPerMinute <= 0) return null
  return Math.ceil((remaining / throughputPerMinute) * 60)
}
