import { getDatabase } from '../store/database'
import { getGlobalDatabase, upsertGlobalTM } from '../store/globalDb'
import { AIService, type ContextBlock } from '../api/aiService'
import { TranslationBlock } from '../../shared/types'
import { getSettings, getActiveProviderConfig } from '../store/settings'
import { validateTranslation, validateGlossary, validateLengthOverflow, type GlossaryTerm } from '../utils/qaLinter'
import { emitEngineProgress, emitSystemLog } from '../utils/ipcBroadcast'
import type { EngineProgressPayload } from '../utils/ipcBroadcast'
import { RateLimitError, TokenLimitError, ParsingError, APIError, normalizeError } from '../api/errors'
import { filterBlacklist } from '../utils/regexBlacklist'
import { filterSmartGlossary, formatGlossaryForPrompt } from '../utils/smartGlossary'
import { shouldRetry, categorizeErrors } from '../utils/selfCorrection'
import { isAlreadyTranslated } from '../utils/langDetector'
import {
  estimateBatchTokens,
  estimateThroughputPerMinute,
  estimateEtaSeconds,
  getDefaultTokenBudget,
  planBatchSize,
} from '../utils/tokenOptimizer'

type Db = ReturnType<typeof getDatabase>

// Hàm tiện ích: Tạm dừng execution (dùng cho Exponential Backoff)
function delay(ms: number, signal?: AbortSignal): Promise<void> {
  return new Promise<void>((resolve) => {
    if (signal?.aborted) return resolve()
    const timer = setTimeout(() => resolve(), ms)
    signal?.addEventListener(
      'abort',
      () => {
        clearTimeout(timer)
        resolve()
      },
      { once: true }
    )
  })
}

function updateFileStats(db: Db, fileId: number): void {
  const stats = db
    .prepare(
      `
    SELECT
      COUNT(*) as total,
      SUM(CASE WHEN status IN ('draft', 'approved', 'warning') THEN 1 ELSE 0 END) as translated
    FROM translation_blocks
    WHERE file_id = ?
  `
    )
    .get(fileId) as { total: number; translated: number }

  let status = 'pending'
  if (stats.translated === stats.total && stats.total > 0) {
    status = 'completed'
  } else if (stats.translated > 0) {
    status = 'in_progress'
  }

  db.prepare(
    `
    UPDATE files
    SET total_blocks = ?, translated_blocks = ?, status = ?, updated_at = CURRENT_TIMESTAMP
    WHERE id = ?
  `
  ).run(stats.total, stats.translated, status, fileId)
}

function buildSmartGlossary(db: Db, batchTexts: string[], enabled: boolean): string {
  void db
  const glossaries = getGlobalDatabase()
    .prepare(`SELECT source_text, target_text FROM glossaries WHERE enabled = 1`)
    .all() as { source_text: string; target_text: string }[]

  if (glossaries.length === 0) return ''

  if (!enabled || glossaries.length <= 5) {
    return formatGlossaryForPrompt(glossaries)
  }

  const relevant = filterSmartGlossary(glossaries, batchTexts)
  return formatGlossaryForPrompt(relevant)
}

function getRelevantGlossary(db: Db, batchTexts: string[], smartEnabled: boolean): GlossaryTerm[] {
  void db
  const all = getGlobalDatabase()
    .prepare(`SELECT source_text, target_text FROM glossaries WHERE enabled = 1`)
    .all() as GlossaryTerm[]

  if (all.length === 0) return []
  if (!smartEnabled || all.length <= 5) return all

  const relevant = filterSmartGlossary(all, batchTexts)
  return relevant
}

/**
 * Fetch previous translated blocks as conversation context.
 * Returns up to `windowSize` blocks before the current batch, ordered by line_index.
 */
function getContextBlocks(db: Db, fileId: number, firstLineIndex: number, windowSize: number): ContextBlock[] {
  if (windowSize <= 0) return []

  const blocks = db
    .prepare(
      `
    SELECT character_id, original_text, translated_text
    FROM translation_blocks
    WHERE file_id = ? AND line_index < ? AND status != 'empty' AND translated_text IS NOT NULL
    ORDER BY line_index DESC
    LIMIT ?
  `
    )
    .all(fileId, firstLineIndex, windowSize) as Array<{
      character_id: string | null
      original_text: string
      translated_text: string | null
    }>

  // Reverse to get chronological order (oldest first)
  return blocks.reverse().map((b) => ({
    character: b.character_id,
    original: b.original_text,
    translated: b.translated_text!,
  }))
}

/**
 * Get the current provider name for the translated_by field
 */
function getProviderName(): string {
  const { providerId } = getActiveProviderConfig()
  switch (providerId) {
    case 'gemini': return 'gemini'
    case 'claude': return 'claude'
    case 'openai_compatible': return 'openai_compatible'
    default: return providerId
  }
}

type QueueState = 'idle' | 'running' | 'paused' | 'stopped' | 'error' | 'done'

interface QueueCheckpointRow {
  file_id: number | null
  last_block_id: number | null
  queue_state: QueueState
  queue_config_json: string | null
  processed_count: number
  error_count: number
  updated_at?: string
}

interface TokenTelemetryRowInput {
  fileId?: number | null
  requestKind: 'queue_batch' | 'manual_batch'
  batchSize: number
  inputTokens: number
  outputTokens: number
  inputChars: number
  outputChars: number
  durationMs: number
  status: 'ok' | 'error'
  errorType?: string | null
}

function getActiveModelId(): string {
  const { config } = getActiveProviderConfig()
  return (config.modelId || '').trim()
}

function writeTokenTelemetry(input: TokenTelemetryRowInput): void {
  const db = getDatabase()
  const { providerId } = getActiveProviderConfig()
  const modelId = getActiveModelId()
  db.prepare(`
    INSERT INTO token_telemetry (
      file_id, provider_id, model_id, request_kind, batch_size,
      input_tokens, output_tokens, input_chars, output_chars,
      duration_ms, status, error_type
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `).run(
    input.fileId ?? null,
    providerId,
    modelId || null,
    input.requestKind,
    input.batchSize,
    input.inputTokens,
    input.outputTokens,
    input.inputChars,
    input.outputChars,
    input.durationMs,
    input.status,
    input.errorType ?? null
  )
}

function saveQueueCheckpoint(checkpoint: {
  fileId?: number | null
  lastBlockId?: number | null
  state: QueueState
  queueConfig?: Record<string, unknown>
  processedCount: number
  errorCount: number
}): void {
  const db = getDatabase()
  db.prepare(`
    INSERT INTO queue_checkpoints (
      id, file_id, last_block_id, queue_state, queue_config_json, processed_count, error_count, updated_at
    ) VALUES (1, ?, ?, ?, ?, ?, ?, CURRENT_TIMESTAMP)
    ON CONFLICT(id) DO UPDATE SET
      file_id = excluded.file_id,
      last_block_id = excluded.last_block_id,
      queue_state = excluded.queue_state,
      queue_config_json = excluded.queue_config_json,
      processed_count = excluded.processed_count,
      error_count = excluded.error_count,
      updated_at = CURRENT_TIMESTAMP
  `).run(
    checkpoint.fileId ?? null,
    checkpoint.lastBlockId ?? null,
    checkpoint.state,
    checkpoint.queueConfig ? JSON.stringify(checkpoint.queueConfig) : null,
    checkpoint.processedCount,
    checkpoint.errorCount
  )
}

function readQueueCheckpoint(): QueueCheckpointRow | null {
  const db = getDatabase()
  const row = db.prepare(`
    SELECT file_id, last_block_id, queue_state, queue_config_json, processed_count, error_count, updated_at
    FROM queue_checkpoints
    WHERE id = 1
  `).get() as QueueCheckpointRow | undefined
  return row ?? null
}

function emitQueueProgress(progress: EngineProgressPayload): void {
  emitEngineProgress(progress)
}

function getQueueRetryDelay(error: unknown, attempts: number, effectiveBatchSize: number): {
  waitMs: number
  nextBatchSize: number
  shouldStop: boolean
} {
  if (error instanceof RateLimitError) {
    const waitMs = error.retryAfterMs || Math.min(6000, Math.pow(2, attempts) * 500)
    return { waitMs, nextBatchSize: effectiveBatchSize, shouldStop: false }
  }

  if (error instanceof TokenLimitError) {
    return { waitMs: 800, nextBatchSize: Math.max(1, Math.floor(effectiveBatchSize / 2)), shouldStop: false }
  }

  if (error instanceof ParsingError) {
    return { waitMs: 500, nextBatchSize: effectiveBatchSize, shouldStop: false }
  }

  if (error instanceof APIError && error.statusCode === 401) {
    return { waitMs: 0, nextBatchSize: effectiveBatchSize, shouldStop: true }
  }

  return { waitMs: 0, nextBatchSize: effectiveBatchSize, shouldStop: true }
}

function resolveQueueConfig(raw: string | null): { fileId: number | null; batchSize?: number; enableTokenOptimizer?: boolean; tokenBudget?: number; includeHidden?: boolean } | null {
  if (!raw) return null
  try {
    const parsed = JSON.parse(raw) as Record<string, unknown>
    return {
      fileId: typeof parsed.fileId === 'number' ? parsed.fileId : null,
      batchSize: typeof parsed.batchSize === 'number' ? parsed.batchSize : undefined,
      enableTokenOptimizer: typeof parsed.enableTokenOptimizer === 'boolean' ? parsed.enableTokenOptimizer : undefined,
      tokenBudget: typeof parsed.tokenBudget === 'number' ? parsed.tokenBudget : undefined,
      includeHidden: typeof parsed.includeHidden === 'boolean' ? parsed.includeHidden : undefined,
    }
  } catch {
    return null
  }
}

export async function translateBatchByBlockIds(blockIds: number[]): Promise<void> {
  const uniqueIds = Array.from(new Set(blockIds)).filter((n) => Number.isFinite(n))
  if (uniqueIds.length === 0) return

  const db = getDatabase()
  const settings = getSettings()
  const fileIdsTouched = new Set<number>()
  const providerName = getProviderName()

  const placeholders = uniqueIds.map(() => '?').join(',')
  const selectedBlocks = db
    .prepare(`SELECT * FROM translation_blocks WHERE id IN (${placeholders})`)
    .all(...uniqueIds) as TranslationBlock[]

  if (selectedBlocks.length === 0) return

  // CRITICAL: Skip blocks that are already approved (no need to translate again)
  let blocksToTranslate = selectedBlocks.filter(block => block.status !== 'approved' && block.visibility !== 'hidden')
  const skippedCount = selectedBlocks.length - blocksToTranslate.length
  if (skippedCount > 0) {
    emitSystemLog('info', `[AI] Skipped ${skippedCount} already-approved block(s)`)
  }

  // Dirty Source Hotfix: if user re-imported a folder that already has target-language text
  // but blocks are still marked as 'empty', auto-approve them and skip sending to AI.
  const stmtMarkDirtyApproved = db.prepare(
    `UPDATE translation_blocks SET translated_text = original_text, translated_by = 'dirty_source', status = 'approved' WHERE id = ?`
  )
  const dirtyApprovedIds = new Set<number>()
  db.transaction(() => {
    for (const block of blocksToTranslate) {
      const blockId = block.id as number | undefined
      if (!blockId) continue
      if (block.status !== 'empty') continue
      if (!isAlreadyTranslated(block.original_text)) continue

      stmtMarkDirtyApproved.run(blockId)
      dirtyApprovedIds.add(blockId)

      const fileId = (block.file_id ?? 0) as number
      if (fileId) fileIdsTouched.add(fileId)
    }
  })()

  if (dirtyApprovedIds.size > 0) {
    emitSystemLog('info', `[DirtySource] Auto-approved ${dirtyApprovedIds.size} already-translated block(s)`)
    blocksToTranslate = blocksToTranslate.filter((b) => !dirtyApprovedIds.has((b.id ?? 0) as number))
  }

  if (blocksToTranslate.length === 0) {
    if (dirtyApprovedIds.size > 0) {
      db.transaction(() => {
        for (const fileId of fileIdsTouched) updateFileStats(db, fileId)
      })()
    }

    emitSystemLog('info', '[AI] No blocks need translation')
    return
  }

  emitSystemLog('info', `[AI] Translating ${blocksToTranslate.length} selected block(s)...`)

  // Regex Blacklist: auto-skip non-translatable strings
  const enableBlacklist = settings.enableRegexBlacklist !== false
  const blacklistPatterns = settings.regexBlacklist || []
  let blacklistSkipped = 0

  if (enableBlacklist && blacklistPatterns.length > 0) {
    const stmtMarkSkipped = db.prepare(
      `UPDATE translation_blocks SET translated_text = original_text, translated_by = 'blacklist', status = 'skipped' WHERE id = ?`
    )
    for (const block of blocksToTranslate) {
      const blockId = block.id as number | undefined
      if (!blockId) continue
      if (block.status !== 'empty') continue // Only skip empty blocks
      const reason = filterBlacklist([block.original_text], blacklistPatterns).skipped[0]
      if (reason) {
        stmtMarkSkipped.run(blockId)
        blacklistSkipped++
        emitSystemLog('info', `[Blacklist] Skipped: "${block.original_text.substring(0, 50)}" (${reason.reason})`)
      }
    }
    if (blacklistSkipped > 0) {
      emitSystemLog('info', `[Blacklist] Skipped ${blacklistSkipped} block(s) matching filter patterns.`)
    }
  }

  const textsToTranslate: string[] = []
  const blockMapping: { [index: number]: TranslationBlock } = {}

  const enableTM = settings.enableTranslationMemory !== false
  const globalDb = getGlobalDatabase()
  const stmtCheckTM = enableTM
    ? globalDb.prepare(`SELECT translated_text FROM translation_memory WHERE original_text = ?`)
    : null
  const stmtUpdateTMUsage = enableTM
    ? globalDb.prepare(
        `UPDATE translation_memory SET usage_count = usage_count + 1, last_used_at = CURRENT_TIMESTAMP WHERE original_text = ?`
      )
    : null

  const stmtUpdateBlock = db.prepare(
    `UPDATE translation_blocks SET translated_text = ?, translated_by = ?, status = ? WHERE id = ?`
  )

  // Phase 1: TM exact hit
  db.transaction(() => {
    for (const block of blocksToTranslate) {
      const fileId = (block.file_id ?? 0) as number
      if (fileId) fileIdsTouched.add(fileId)

      const blockId = block.id as number | undefined
      if (!blockId) continue

      if (!enableTM || !stmtCheckTM || !stmtUpdateTMUsage) {
        textsToTranslate.push(block.original_text)
        blockMapping[textsToTranslate.length - 1] = block
        continue
      }

      const tmRecord = stmtCheckTM.get(block.original_text) as { translated_text: string } | undefined
      if (tmRecord?.translated_text) {
        const errors = validateTranslation(block.original_text, tmRecord.translated_text)
        const status = errors.length > 0 ? 'warning' : 'draft'
        stmtUpdateBlock.run(tmRecord.translated_text, 'tm', status, blockId)
        stmtUpdateTMUsage.run(block.original_text)
      } else {
        textsToTranslate.push(block.original_text)
        blockMapping[textsToTranslate.length - 1] = block
      }
    }
  })()

  // Phase 2: AI call for TM misses (with self-correction retry)
  if (textsToTranslate.length > 0) {
    const enableSmartGlossary = settings.enableSmartGlossary !== false
    const glossaryText = buildSmartGlossary(db, textsToTranslate, enableSmartGlossary)
    const inputChars = textsToTranslate.reduce((sum, text) => sum + text.length, 0)
    const estimated = estimateBatchTokens(textsToTranslate)

    // Context Windowing: fetch previous translated blocks as conversation context
    const contextWindowSize = settings.contextWindowSize || 0
    const firstBlock = blockMapping[0]
    const fileId = firstBlock?.file_id ?? 0
    const firstLineIndex = firstBlock?.line_index ?? 0
    const contextHistory = fileId > 0
      ? getContextBlocks(db, fileId, firstLineIndex, contextWindowSize)
      : []

    if (contextHistory.length > 0) {
      emitSystemLog('info', `[Context] Injecting ${contextHistory.length} block(s) of conversation history`)
    }

    let translatedTexts: string[]
    const requestStartedAt = Date.now()
    try {
      translatedTexts = await AIService.translateBatch(textsToTranslate, glossaryText, contextHistory)
      const outputChars = translatedTexts.reduce((sum, text) => sum + text.length, 0)
      writeTokenTelemetry({
        fileId: fileId || null,
        requestKind: 'manual_batch',
        batchSize: textsToTranslate.length,
        inputTokens: estimated.inputTokens,
        outputTokens: estimated.outputTokens,
        inputChars,
        outputChars,
        durationMs: Date.now() - requestStartedAt,
        status: 'ok',
      })
    } catch (err) {
      const normalized = normalizeError(err)
      const message = normalized.message
      writeTokenTelemetry({
        fileId: fileId || null,
        requestKind: 'manual_batch',
        batchSize: textsToTranslate.length,
        inputTokens: estimated.inputTokens,
        outputTokens: 0,
        inputChars,
        outputChars: 0,
        durationMs: Date.now() - requestStartedAt,
        status: 'error',
        errorType: normalized.name,
      })
      console.error(`[AI] Translation failed:`, message)
      emitSystemLog('error', `[AI] Translation failed: ${message}`)
      throw normalized
    }

    if (translatedTexts.length !== textsToTranslate.length) {
      throw new Error(
        `Độ dài mảng output JSON (${translatedTexts.length}) không khớp với input (${textsToTranslate.length})`
      )
    }

    // Phase 3: Linter + Glossary check + progressive self-correction retry
    const enableSelfCorrection = settings.enableSelfCorrection !== false
    const enableStrictGlossary = settings.enableStrictGlossary !== false
    const maxRetries = Math.min(3, Math.max(1, settings.maxRetryAttempts || 2))
    const relevantGlossary = enableStrictGlossary
      ? getRelevantGlossary(db, textsToTranslate, settings.enableSmartGlossary !== false)
      : []
    const blocksNeedingRetry: number[] = []
    const retryErrors: { [index: number]: string[] } = {}
    const finalTranslations: { [index: number]: string } = {}

    for (let i = 0; i < translatedTexts.length; i++) {
      const block = blockMapping[i]
      const blockId = block?.id as number | undefined
      if (!blockId) continue

      const errors = validateTranslation(block.original_text, translatedTexts[i])
      if (enableStrictGlossary && relevantGlossary.length > 0) {
        const glossaryErrors = validateGlossary(block.original_text, translatedTexts[i], relevantGlossary)
        errors.push(...glossaryErrors)
      }
      if (shouldRetry(errors) && enableSelfCorrection) {
        blocksNeedingRetry.push(i)
        retryErrors[i] = errors
      } else {
        finalTranslations[i] = translatedTexts[i]
      }
    }

    // Progressive self-correction retry (up to maxRetries)
    if (blocksNeedingRetry.length > 0) {
      emitSystemLog('warning', `[Self-Correct] ${blocksNeedingRetry.length} block(s) need correction`)

      let currentRetryTexts = blocksNeedingRetry.map(i => textsToTranslate[i])
      let currentRetryTranslations = translatedTexts.filter((_, i) => blocksNeedingRetry.includes(i))

      for (let attempt = 0; attempt < maxRetries; attempt++) {
        const remainingIndices: number[] = []
        const remainingTexts: string[] = []
        const remainingBadTranslations: string[] = []
        const remainingErrors: string[][] = []

        for (let j = 0; j < currentRetryTexts.length; j++) {
          const origIdx = blocksNeedingRetry[j]
          const block = blockMapping[origIdx]
          if (!block?.id) continue

          const errors = validateTranslation(block.original_text, currentRetryTranslations[j])
          if (enableStrictGlossary && relevantGlossary.length > 0) {
            const glossaryErrors = validateGlossary(block.original_text, currentRetryTranslations[j], relevantGlossary)
            errors.push(...glossaryErrors)
          }
          if (errors.length > 0) {
            remainingIndices.push(origIdx)
            remainingTexts.push(currentRetryTexts[j])
            remainingBadTranslations.push(currentRetryTranslations[j])
            remainingErrors.push(errors)
          } else {
            finalTranslations[origIdx] = currentRetryTranslations[j]
          }
        }

        if (remainingIndices.length === 0) break

        const { summary } = categorizeErrors(remainingErrors.flat())
        emitSystemLog('info', `[Self-Correct] Attempt ${attempt + 1}/${maxRetries} — fixing ${remainingIndices.length} block(s) (${summary})`)

        try {
          const newTranslations = await AIService.translateBatchWithRetry(
            remainingTexts,
            glossaryText,
            remainingErrors.flat(),
            attempt
          )

          currentRetryTexts = remainingTexts
          currentRetryTranslations = newTranslations
        } catch (retryErr) {
          console.error(`[Self-Correct] Attempt ${attempt + 1} failed:`, retryErr)
          emitSystemLog('warning', `[Self-Correct] Attempt ${attempt + 1} failed, using best available`)
          for (let j = 0; j < remainingIndices.length; j++) {
            finalTranslations[remainingIndices[j]] = currentRetryTranslations[j]
          }
          break
        }
      }

      // Save final attempt results
      for (let j = 0; j < currentRetryTexts.length; j++) {
        const origIdx = blocksNeedingRetry[j]
        if (finalTranslations[origIdx] === undefined) {
          finalTranslations[origIdx] = currentRetryTranslations[j]
        }
      }
    }

    // Save final translations
    db.transaction(() => {
      for (let i = 0; i < translatedTexts.length; i++) {
        const block = blockMapping[i]
        const blockId = block?.id as number | undefined
        if (!blockId) continue

        const finalText = finalTranslations[i] ?? translatedTexts[i]
        const errors = validateTranslation(block.original_text, finalText)
        const status = errors.length > 0 ? 'warning' : 'draft'
        stmtUpdateBlock.run(finalText, providerName, status, blockId)

        if (enableTM && finalText !== block.original_text) {
          upsertGlobalTM(block.original_text, finalText)
        }
      }
    })()
  }

  // Update sidebar stats
  db.transaction(() => {
    for (const fileId of fileIdsTouched) updateFileStats(db, fileId)
  })()

  emitSystemLog('success', `[AI] Done translating ${selectedBlocks.length} block(s).`)
}

/**
 * Tính năng Pre-flight Analyzer
 */
export async function preFlightAnalyzer(
  fileId?: number,
  includeHidden: boolean = false
): Promise<{ pendingBlocks: number; estimatedCharacters: number; estimatedCost: number }> {
  const db = getDatabase()
  const hiddenClause = includeHidden ? '' : ` AND (visibility IS NULL OR visibility != 'hidden')`
  const row = fileId
    ? (db
        .prepare(
          `
      SELECT COUNT(*) as blockCount, SUM(LENGTH(original_text)) as charCount
      FROM translation_blocks
      WHERE status = 'empty'${hiddenClause} AND file_id = ?
    `
        )
        .get(fileId) as { blockCount: number; charCount: number })
    : (db
        .prepare(
          `
      SELECT COUNT(*) as blockCount, SUM(LENGTH(original_text)) as charCount
      FROM translation_blocks
      WHERE status = 'empty'${hiddenClause}
    `
        )
        .get() as { blockCount: number; charCount: number })

  return {
    pendingBlocks: row.blockCount || 0,
    estimatedCharacters: row.charCount || 0,
    estimatedCost: 0,
  }
}

/**
 * Trình chạy nền (Background Worker Queue)
 * Fetch các dòng 'empty' -> Kiểm tra TM -> Gọi AI -> Lưu DB
 * Với normalized error handling.
 */
export async function startBackgroundQueue(
  onProgress?: (progress: { success: number; error: number }) => void,
  options?: { fileId?: number; signal?: AbortSignal; includeHidden?: boolean }
): Promise<void> {
  const db = getDatabase()
  const settings = getSettings()
  const batchSize = settings.batchSize || 20
  const { providerId } = getActiveProviderConfig()
  const enableTokenOptimizer = settings.enableTokenOptimizer !== false
  const tokenBudget = settings.tokenTargetInputTokens > 0
    ? settings.tokenTargetInputTokens
    : getDefaultTokenBudget(providerId)
  const checkpointBeforeStart = readQueueCheckpoint()
  const checkpointMatchesScope = (checkpointBeforeStart?.file_id ?? null) === (options?.fileId ?? null)
  let hasMore = true
  let queueState: QueueState = 'running'
  let totalSuccess = checkpointMatchesScope ? (checkpointBeforeStart?.processed_count ?? 0) : 0
  let totalError = checkpointMatchesScope ? (checkpointBeforeStart?.error_count ?? 0) : 0
  let effectiveBatchSize = batchSize
  const enableTM = settings.enableTranslationMemory !== false
  const fileId = options?.fileId
  const includeHidden = options?.includeHidden === true
  const signal = options?.signal
  const providerName = getProviderName()
  const queueStartedAt = Date.now()
  const queueConfig = {
    fileId: fileId ?? null,
    batchSize,
    enableTokenOptimizer,
    tokenBudget,
    includeHidden,
  }
  if (
    checkpointMatchesScope &&
    checkpointBeforeStart &&
    (checkpointBeforeStart.queue_state === 'paused' || checkpointBeforeStart.queue_state === 'stopped' || checkpointBeforeStart.queue_state === 'error')
  ) {
    emitSystemLog('info', `[Queue] Resume checkpoint found (processed=${checkpointBeforeStart.processed_count}, errors=${checkpointBeforeStart.error_count})`)
  }

  const countPendingBlocks = (): number => {
    const hiddenClause = includeHidden ? '' : ` AND (visibility IS NULL OR visibility != 'hidden')`
    if (fileId) {
      const row = db.prepare(`SELECT COUNT(*) as c FROM translation_blocks WHERE status = 'empty'${hiddenClause} AND file_id = ?`).get(fileId) as { c: number }
      return row.c
    }
    const row = db.prepare(`SELECT COUNT(*) as c FROM translation_blocks WHERE status = 'empty'${hiddenClause}`).get() as { c: number }
    return row.c
  }

  saveQueueCheckpoint({
    fileId: fileId ?? null,
    state: 'running',
    queueConfig,
    processedCount: totalSuccess,
    errorCount: totalError,
  })

  while (hasMore) {
    if (signal?.aborted) {
      queueState = currentQueue?.state === 'paused' ? 'paused' : 'stopped'
      emitSystemLog('warning', queueState === 'paused' ? '[Queue] Paused by user.' : '[Queue] Stopped by user.')
      saveQueueCheckpoint({
        fileId: fileId ?? null,
        state: queueState,
        queueConfig,
        processedCount: totalSuccess,
        errorCount: totalError,
      })
      emitQueueProgress({
        success: totalSuccess,
        error: totalError,
        state: queueState,
        fileId: fileId ?? null,
        processed: totalSuccess + totalError,
      })
      break
    }

    const candidateLimit = Math.max(effectiveBatchSize * 3, effectiveBatchSize)
    const hiddenClause = includeHidden ? '' : ` AND (visibility IS NULL OR visibility != 'hidden')`
    const candidateBlocks = fileId
      ? (db
          .prepare(
            `
        SELECT * FROM translation_blocks
        WHERE status = 'empty'${hiddenClause} AND file_id = ?
        ORDER BY id ASC
        LIMIT ?
      `
          )
          .all(fileId, candidateLimit) as TranslationBlock[])
      : (db
          .prepare(
            `
        SELECT * FROM translation_blocks
        WHERE status = 'empty'${hiddenClause}
        ORDER BY id ASC
        LIMIT ?
      `
          )
          .all(candidateLimit) as TranslationBlock[])

    let pendingBlocks = candidateBlocks
    if (enableTokenOptimizer && candidateBlocks.length > 0) {
      const plannedSize = planBatchSize(
        candidateBlocks.map((b) => b.original_text),
        {
          minBatchSize: 1,
          maxBatchSize: Math.max(1, effectiveBatchSize),
          targetInputTokens: tokenBudget,
        }
      )
      pendingBlocks = candidateBlocks.slice(0, plannedSize)
      effectiveBatchSize = plannedSize
    }

    if (pendingBlocks.length === 0) {
      console.log('[Queue] All batches completed.')
      emitSystemLog('success', '[Queue] Completed.')
      queueState = 'done'
      const throughput = estimateThroughputPerMinute(totalSuccess + totalError, queueStartedAt)
      emitQueueProgress({
        success: totalSuccess,
        error: totalError,
        state: queueState,
        fileId: fileId ?? null,
        processed: totalSuccess + totalError,
        speedBlocksPerMin: Number(throughput.toFixed(2)),
        etaSeconds: 0,
        batchSize: effectiveBatchSize,
      })
      saveQueueCheckpoint({
        fileId: fileId ?? null,
        lastBlockId: null,
        state: queueState,
        queueConfig,
        processedCount: totalSuccess,
        errorCount: totalError,
      })
      hasMore = false
      break
    }

    const textsToTranslate: string[] = []
    const blockMapping: { [index: number]: TranslationBlock } = {}
    const fileIdsTouched = new Set<number>()

    // Dirty Source Hotfix: auto-approve already-translated target-language blocks.
    // This prevents Vietnamese→Vietnamese AI calls when user re-imports a previously overwritten folder.
    const stmtMarkDirtyApproved = db.prepare(
      `UPDATE translation_blocks SET translated_text = original_text, translated_by = 'dirty_source', status = 'approved' WHERE id = ?`
    )

    let dirtyApprovedCount = 0
    let activeBlocks = pendingBlocks
    if (activeBlocks.length > 0) {
      db.transaction(() => {
        for (const block of activeBlocks) {
          const blockId = block.id as number | undefined
          if (!blockId) continue
          if (!isAlreadyTranslated(block.original_text)) continue

          stmtMarkDirtyApproved.run(blockId)
          if (block.file_id) fileIdsTouched.add(block.file_id)
          dirtyApprovedCount++
          totalSuccess++
        }
      })()

      if (dirtyApprovedCount > 0) {
        activeBlocks = activeBlocks.filter((b) => !isAlreadyTranslated(b.original_text))
        emitSystemLog('info', `[DirtySource] Auto-approved ${dirtyApprovedCount} block(s) in this batch.`)
      }
    }

    // Regex Blacklist: auto-skip non-translatable strings
    const enableBlacklist = settings.enableRegexBlacklist !== false
    const blacklistPatterns = settings.regexBlacklist || []
    let batchSkippedCount = 0

    // activeBlocks already excludes dirty-source approved blocks

    if (enableBlacklist && blacklistPatterns.length > 0) {
      const stmtMarkSkipped = db.prepare(
        `UPDATE translation_blocks SET translated_text = original_text, translated_by = 'blacklist', status = 'skipped' WHERE id = ?`
      )
      activeBlocks = activeBlocks.filter((block) => {
        const reason = filterBlacklist([block.original_text], blacklistPatterns).skipped[0]
        if (reason) {
          const blockId = block.id as number | undefined
          if (blockId) {
            stmtMarkSkipped.run(blockId)
            batchSkippedCount++
            totalSuccess++
          }
          return false
        }
        return true
      })

      if (batchSkippedCount > 0) {
        emitSystemLog('info', `[Blacklist] Skipped ${batchSkippedCount} block(s) in this batch.`)
      }
    }

    const stmtCheckTM = enableTM
      ? getGlobalDatabase().prepare(`SELECT translated_text FROM translation_memory WHERE original_text = ?`)
      : null
    const stmtUpdateBlock = db.prepare(
      `UPDATE translation_blocks SET translated_text = ?, translated_by = ?, status = ? WHERE id = ?`
    )
    const stmtUpdateTMUsage = enableTM
      ? getGlobalDatabase().prepare(
          `UPDATE translation_memory SET usage_count = usage_count + 1, last_used_at = CURRENT_TIMESTAMP WHERE original_text = ?`
        )
      : null

    // Giai đoạn 1: Lọc qua TM
    db.transaction(() => {
      for (let i = 0; i < activeBlocks.length; i++) {
        const block = activeBlocks[i]
        if (block.file_id) fileIdsTouched.add(block.file_id)

        const blockId = block.id as number | undefined
        if (!blockId) continue

        const tmRecord = enableTM && stmtCheckTM
          ? (stmtCheckTM.get(block.original_text) as { translated_text: string } | undefined)
          : undefined

        if (tmRecord) {
          const errors = validateTranslation(block.original_text, tmRecord.translated_text)
          const status = errors.length > 0 ? 'warning' : 'draft'

          stmtUpdateBlock.run(tmRecord.translated_text, 'tm', status, blockId)
          if (enableTM && stmtUpdateTMUsage) stmtUpdateTMUsage.run(block.original_text)
          totalSuccess++
        } else {
          textsToTranslate.push(block.original_text)
          blockMapping[textsToTranslate.length - 1] = block
        }
      }

      for (const fid of fileIdsTouched) updateFileStats(db, fid)
    })()

    if (onProgress) onProgress({ success: totalSuccess, error: totalError })
    const remainingAfterTm = countPendingBlocks()
    const throughputAfterTm = estimateThroughputPerMinute(totalSuccess + totalError, queueStartedAt)
    emitQueueProgress({
      success: totalSuccess,
      error: totalError,
      state: queueState,
      fileId: fileId ?? null,
      processed: totalSuccess + totalError,
      speedBlocksPerMin: Number(throughputAfterTm.toFixed(2)),
      etaSeconds: estimateEtaSeconds(remainingAfterTm, throughputAfterTm),
      batchSize: effectiveBatchSize,
    })

    // 2. Gọi AI nếu còn text
    if (textsToTranslate.length > 0) {
      let attempts = 0
      let success = false
      const estimated = estimateBatchTokens(textsToTranslate)
      const inputChars = textsToTranslate.reduce((sum, text) => sum + text.length, 0)

      while (attempts < 3 && !success) {
        const requestStartedAt = Date.now()
        try {
          console.log(`[Queue] Calling AI for ${textsToTranslate.length} line(s)...`)
          emitSystemLog('info', `[Queue] Calling AI for ${textsToTranslate.length} line(s)...`)

          const enableSmartGlossary = settings.enableSmartGlossary !== false
          const glossaryText = buildSmartGlossary(db, textsToTranslate, enableSmartGlossary)

          // Context Windowing
          const contextWindowSize = settings.contextWindowSize || 0
          const contextHistory = fileId && blockMapping[0]
            ? getContextBlocks(db, fileId, blockMapping[0].line_index, contextWindowSize)
            : []

          const translatedTexts = await AIService.translateBatch(textsToTranslate, glossaryText, contextHistory)
          const outputChars = translatedTexts.reduce((sum, text) => sum + text.length, 0)
          writeTokenTelemetry({
            fileId: fileId ?? null,
            requestKind: 'queue_batch',
            batchSize: textsToTranslate.length,
            inputTokens: estimated.inputTokens,
            outputTokens: estimated.outputTokens,
            inputChars,
            outputChars,
            durationMs: Date.now() - requestStartedAt,
            status: 'ok',
          })

          if (translatedTexts.length !== textsToTranslate.length) {
            throw new Error(`JSON output length (${translatedTexts.length}) does not match input (${textsToTranslate.length})`)
          }

          // Linter + Glossary + progressive self-correction retry
          const enableSelfCorrection = settings.enableSelfCorrection !== false
          const enableStrictGlossary = settings.enableStrictGlossary !== false
          const maxRetries = Math.min(3, Math.max(1, settings.maxRetryAttempts || 2))
          const relevantGlossary = enableStrictGlossary
            ? getRelevantGlossary(db, textsToTranslate, enableSmartGlossary)
            : []
          const blocksNeedingRetry: number[] = []
          const retryErrors: { [index: number]: string[] } = {}
          const finalTranslations: { [index: number]: string } = {}

          for (let i = 0; i < translatedTexts.length; i++) {
            const block = blockMapping[i]
            if (!block?.id) { finalTranslations[i] = translatedTexts[i]; continue }
            const errors = validateTranslation(block.original_text, translatedTexts[i])
            if (enableStrictGlossary && relevantGlossary.length > 0) {
              const glossaryErrors = validateGlossary(block.original_text, translatedTexts[i], relevantGlossary)
              errors.push(...glossaryErrors)
            }
            if (shouldRetry(errors) && enableSelfCorrection) {
              blocksNeedingRetry.push(i)
              retryErrors[i] = errors
            } else {
              finalTranslations[i] = translatedTexts[i]
            }
          }

          if (blocksNeedingRetry.length > 0) {
            emitSystemLog('warning', `[Self-Correct] ${blocksNeedingRetry.length} block(s) need correction`)

            const currentRetryTexts = blocksNeedingRetry.map(i => textsToTranslate[i])
            let currentRetryTranslations = translatedTexts.filter((_, i) => blocksNeedingRetry.includes(i))

            for (let attempt = 0; attempt < maxRetries; attempt++) {
              const remainingIndices: number[] = []
              const remainingTexts: string[] = []
              const remainingBadTranslations: string[] = []
              const remainingErrors: string[][] = []

              for (let j = 0; j < currentRetryTexts.length; j++) {
                const origIdx = blocksNeedingRetry[j]
                const block = blockMapping[origIdx]
                if (!block?.id) continue

                const errors = validateTranslation(block.original_text, currentRetryTranslations[j])
                if (enableStrictGlossary && relevantGlossary.length > 0) {
                  const glossaryErrors = validateGlossary(block.original_text, currentRetryTranslations[j], relevantGlossary)
                  errors.push(...glossaryErrors)
                }
                if (errors.length > 0) {
                  remainingIndices.push(origIdx)
                  remainingTexts.push(currentRetryTexts[j])
                  remainingBadTranslations.push(currentRetryTranslations[j])
                  remainingErrors.push(errors)
                } else {
                  finalTranslations[origIdx] = currentRetryTranslations[j]
                }
              }

              if (remainingIndices.length === 0) break

              const { summary } = categorizeErrors(remainingErrors.flat())
              emitSystemLog('info', `[Self-Correct] Attempt ${attempt + 1}/${maxRetries} — fixing ${remainingIndices.length} block(s) (${summary})`)

              try {
                const newTranslations = await AIService.translateBatchWithRetry(
                  remainingTexts,
                  glossaryText,
                  remainingErrors.flat(),
                  attempt
                )
                currentRetryTranslations = newTranslations
              } catch {
                emitSystemLog('warning', `[Self-Correct] Attempt ${attempt + 1} failed`)
                for (let j = 0; j < remainingIndices.length; j++) {
                  finalTranslations[remainingIndices[j]] = currentRetryTranslations[j]
                }
                break
              }
            }

            // Save final attempt results
            for (let j = 0; j < blocksNeedingRetry.length; j++) {
              const origIdx = blocksNeedingRetry[j]
              if (finalTranslations[origIdx] === undefined) {
                finalTranslations[origIdx] = currentRetryTranslations[j]
              }
            }
          }

          db.transaction(() => {
            for (let i = 0; i < translatedTexts.length; i++) {
              const translated = finalTranslations[i]
              const block = blockMapping[i]
              const blockId = block?.id as number | undefined
              if (!blockId) continue

              const errors = validateTranslation(block.original_text, translated)

              // Length overflow check (warning only)
              const enableLengthCheck = settings.enableLengthCheck !== false
              const maxLengthRatio = settings.maxLengthRatio || 1.3
              if (enableLengthCheck) {
                const overflowWarnings = validateLengthOverflow(block.original_text, translated, maxLengthRatio)
                if (overflowWarnings.length > 0) {
                  console.log(`[Overflow] Block ${blockId}: ${overflowWarnings[0]}`)
                }
                errors.push(...overflowWarnings)
              }

              const status = errors.length > 0 ? 'warning' : 'draft'

              if (errors.length > 0) {
                console.log(`[Linter] Warnings at block ${block.id}:`, errors)
              }

              stmtUpdateBlock.run(translated, providerName, status, blockId)
              if (enableTM && translated !== block.original_text) upsertGlobalTM(block.original_text, translated)
              totalSuccess++
            }

            for (const fid of fileIdsTouched) updateFileStats(db, fid)
          })()

          success = true

          if (onProgress) onProgress({ success: totalSuccess, error: totalError })
          const remaining = countPendingBlocks()
          const throughput = estimateThroughputPerMinute(totalSuccess + totalError, queueStartedAt)
          emitQueueProgress({
            success: totalSuccess,
            error: totalError,
            state: queueState,
            fileId: fileId ?? null,
            processed: totalSuccess + totalError,
            speedBlocksPerMin: Number(throughput.toFixed(2)),
            etaSeconds: estimateEtaSeconds(remaining, throughput),
            batchSize: effectiveBatchSize,
            approxInputTokens: estimated.inputTokens,
            approxOutputTokens: estimated.outputTokens,
          })
          emitSystemLog('success', `[Queue] Batch done. success=${totalSuccess}, error=${totalError}`)

        } catch (error: unknown) {
          attempts++
          totalError++
          const normalized = normalizeError(error)
          const message = normalized.message
          writeTokenTelemetry({
            fileId: fileId ?? null,
            requestKind: 'queue_batch',
            batchSize: textsToTranslate.length,
            inputTokens: estimated.inputTokens,
            outputTokens: 0,
            inputChars,
            outputChars: 0,
            durationMs: Date.now() - requestStartedAt,
            status: 'error',
            errorType: normalized.name,
          })

          console.error(`[Queue] Error (attempt ${attempts}): ${normalized.name} — ${message}`)
          emitSystemLog('error', `[Queue] ${normalized.name} (attempt ${attempts}): ${message}`)

          const retryPlan = getQueueRetryDelay(normalized, attempts, effectiveBatchSize)
          effectiveBatchSize = retryPlan.nextBatchSize

          if (normalized instanceof RateLimitError) {
            const waitTime = retryPlan.waitMs
            console.log(`[Queue] Rate limited. Waiting ${waitTime}ms...`)
            await delay(waitTime, signal)
          } else if (normalized instanceof TokenLimitError) {
            // Reduce batch size and retry
            emitSystemLog('warning', `[Queue] Token limit. Reducing batch size to ${effectiveBatchSize}`)
            await delay(retryPlan.waitMs, signal)
          } else if (normalized instanceof ParsingError) {
            // Retry — might be a fluke with the model
            await delay(retryPlan.waitMs, signal)
          } else {
            if (normalized instanceof APIError && normalized.statusCode === 401) {
              console.error('[Queue] Auth failed. Stopping queue.')
              emitSystemLog('error', '[Queue] Invalid API key. Stopping queue.')
            } else {
              console.error('[Queue] Fatal error. Stopping queue.')
              emitSystemLog('error', `[Queue] Fatal: ${message}`)
            }
            queueState = 'error'
            hasMore = false
            break
          }

          if (retryPlan.shouldStop) {
            queueState = 'error'
            hasMore = false
            break
          }
        }
      }
    }

    const lastBlockId = pendingBlocks.reduce((max, block) => Math.max(max, block.id ?? 0), 0) || null
    saveQueueCheckpoint({
      fileId: fileId ?? null,
      lastBlockId,
      state: queueState,
      queueConfig,
      processedCount: totalSuccess,
      errorCount: totalError,
    })

    await delay(1000, signal)
  }
}

let currentQueue: {
  abort: AbortController
  running: boolean
  state: QueueState
  fileId: number | null
  startedAt: number
} | null = null

function startQueueInternal(options?: { fileId?: number; includeHidden?: boolean }, origin: 'start' | 'resume' = 'start'): { started: boolean; alreadyRunning: boolean } {
  if (currentQueue?.running) {
    emitSystemLog('warning', '[Queue] Already running.')
    return { started: false, alreadyRunning: true }
  }

  const abort = new AbortController()
  currentQueue = {
    abort,
    running: true,
    state: 'running',
    fileId: options?.fileId ?? null,
    startedAt: Date.now(),
  }

  const verb = origin === 'resume' ? 'Resumed' : 'Started'
  emitSystemLog('info', `[Queue] ${verb}${options?.fileId ? ` (fileId=${options.fileId})` : ''}.`)
  emitQueueProgress({
    success: 0,
    error: 0,
    state: 'running',
    fileId: options?.fileId ?? null,
    processed: 0,
  })

  void startBackgroundQueue(undefined, { fileId: options?.fileId, signal: abort.signal, includeHidden: options?.includeHidden === true })
    .catch((err: unknown) => {
      const message = err instanceof Error ? err.message : String(err)
      console.error('[Queue] Unhandled error:', message)
      emitSystemLog('error', `[Queue] Unhandled error: ${message}`)
      emitQueueProgress({
        success: 0,
        error: 1,
        state: 'error',
        fileId: options?.fileId ?? null,
        processed: 1,
      })
    })
    .finally(() => {
      const checkpoint = readQueueCheckpoint()
      const finalState = checkpoint?.queue_state ?? 'idle'
      if (currentQueue) {
        currentQueue.running = false
        currentQueue.state = finalState
      }

      if (finalState === 'done') {
        emitSystemLog('success', '[Queue] Idle.')
      } else if (finalState === 'paused') {
        emitSystemLog('warning', '[Queue] Paused.')
      } else if (finalState === 'stopped') {
        emitSystemLog('warning', '[Queue] Stopped.')
      } else if (finalState === 'error') {
        emitSystemLog('error', '[Queue] Error.')
      } else {
        emitSystemLog('info', '[Queue] Idle.')
      }

      emitQueueProgress({
        success: checkpoint?.processed_count ?? 0,
        error: checkpoint?.error_count ?? 0,
        state: finalState,
        fileId: checkpoint?.file_id ?? options?.fileId ?? null,
        processed: (checkpoint?.processed_count ?? 0) + (checkpoint?.error_count ?? 0),
      })
    })

  return { started: true, alreadyRunning: false }
}

export function startQueue(options?: { fileId?: number; includeHidden?: boolean }): { started: boolean; alreadyRunning: boolean } {
  return startQueueInternal(options, 'start')
}

export function pauseQueue(): { paused: boolean } {
  if (!currentQueue?.running) return { paused: false }
  currentQueue.state = 'paused'
  const previous = readQueueCheckpoint()
  saveQueueCheckpoint({
    fileId: currentQueue.fileId,
    state: 'paused',
    processedCount: previous?.processed_count ?? 0,
    errorCount: previous?.error_count ?? 0,
  })
  currentQueue.abort.abort()
  return { paused: true }
}

export function resumeQueue(): { resumed: boolean; alreadyRunning: boolean } {
  if (currentQueue?.running) return { resumed: false, alreadyRunning: true }
  const checkpoint = readQueueCheckpoint()
  if (!checkpoint || checkpoint.queue_state === 'done' || checkpoint.queue_state === 'idle') {
    return { resumed: false, alreadyRunning: false }
  }

  const config = resolveQueueConfig(checkpoint.queue_config_json)
  const targetFileId = config?.fileId ?? checkpoint.file_id
  const includeHidden = config?.includeHidden === true
  const result = startQueueInternal(
    targetFileId !== null && targetFileId !== undefined ? { fileId: targetFileId, includeHidden } : { includeHidden },
    'resume'
  )
  return { resumed: result.started, alreadyRunning: result.alreadyRunning }
}

export function getQueueStatus(): {
  state: QueueState
  running: boolean
  fileId: number | null
  processedCount: number
  errorCount: number
  lastBlockId: number | null
  updatedAt: string | null
} {
  const checkpoint = readQueueCheckpoint()
  return {
    state: currentQueue?.running ? currentQueue.state : (checkpoint?.queue_state ?? 'idle'),
    running: !!currentQueue?.running,
    fileId: currentQueue?.fileId ?? checkpoint?.file_id ?? null,
    processedCount: checkpoint?.processed_count ?? 0,
    errorCount: checkpoint?.error_count ?? 0,
    lastBlockId: checkpoint?.last_block_id ?? null,
    updatedAt: checkpoint?.updated_at ?? null,
  }
}

export function stopQueue(): { stopped: boolean } {
  if (!currentQueue?.running) return { stopped: false }
  currentQueue.state = 'stopped'
  const previous = readQueueCheckpoint()
  saveQueueCheckpoint({
    fileId: currentQueue.fileId,
    state: 'stopped',
    processedCount: previous?.processed_count ?? 0,
    errorCount: previous?.error_count ?? 0,
  })
  currentQueue.abort.abort()
  return { stopped: true }
}
