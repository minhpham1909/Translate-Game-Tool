import { getDatabase } from '../store/database'
import { AIService, type ContextBlock } from '../api/aiService'
import { TranslationBlock } from '../../shared/types'
import { getSettings, getActiveProviderConfig } from '../store/settings'
import { validateTranslation, validateGlossary, validateLengthOverflow, type GlossaryTerm } from '../utils/qaLinter'
import { emitEngineProgress, emitSystemLog } from '../utils/ipcBroadcast'
import { RateLimitError, TokenLimitError, ParsingError, APIError, normalizeError } from '../api/errors'
import { filterBlacklist } from '../utils/regexBlacklist'
import { filterSmartGlossary, formatGlossaryForPrompt } from '../utils/smartGlossary'
import { shouldRetry, categorizeErrors } from '../utils/selfCorrection'

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
  const glossaries = db
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
  const all = db
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

  emitSystemLog('info', `[AI] Translating ${selectedBlocks.length} selected block(s)...`)

  // Regex Blacklist: auto-skip non-translatable strings
  const enableBlacklist = settings.enableRegexBlacklist !== false
  const blacklistPatterns = settings.regexBlacklist || []
  let skippedCount = 0

  if (enableBlacklist && blacklistPatterns.length > 0) {
    const stmtMarkSkipped = db.prepare(
      `UPDATE translation_blocks SET translated_text = original_text, translated_by = 'blacklist', status = 'skipped' WHERE id = ?`
    )
    for (const block of selectedBlocks) {
      const blockId = block.id as number | undefined
      if (!blockId) continue
      if (block.status !== 'empty') continue // Only skip empty blocks
      const reason = filterBlacklist([block.original_text], blacklistPatterns).skipped[0]
      if (reason) {
        stmtMarkSkipped.run(blockId)
        skippedCount++
        emitSystemLog('info', `[Blacklist] Skipped: "${block.original_text.substring(0, 50)}" (${reason.reason})`)
      }
    }
    if (skippedCount > 0) {
      emitSystemLog('info', `[Blacklist] Skipped ${skippedCount} block(s) matching filter patterns.`)
    }
  }

  const textsToTranslate: string[] = []
  const blockMapping: { [index: number]: TranslationBlock } = {}

  const enableTM = settings.enableTranslationMemory !== false
  const stmtCheckTM = enableTM
    ? db.prepare(`SELECT translated_text FROM translation_memory WHERE original_text = ?`)
    : null
  const stmtUpdateTMUsage = enableTM
    ? db.prepare(
        `UPDATE translation_memory SET usage_count = usage_count + 1, last_used_at = CURRENT_TIMESTAMP WHERE original_text = ?`
      )
    : null

  const stmtUpdateBlock = db.prepare(
    `UPDATE translation_blocks SET translated_text = ?, translated_by = ?, status = ? WHERE id = ?`
  )

  // Phase 1: TM exact hit
  db.transaction(() => {
    for (const block of selectedBlocks) {
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

    // Context Windowing: fetch previous translated blocks as conversation context
    const contextWindowSize = settings.contextWindowSize || 0
    const firstBlock = selectedBlocks.find((b) => b.status !== 'skipped' && blockMapping[0]?.id === b.id) || blockMapping[0]
    const fileId = firstBlock?.file_id ?? 0
    const firstLineIndex = blockMapping[0]?.line_index ?? 0
    const contextHistory = fileId > 0
      ? getContextBlocks(db, fileId, firstLineIndex, contextWindowSize)
      : []
    if (contextHistory.length > 0) {
      emitSystemLog('info', `[Context] Injecting ${contextHistory.length} block(s) of conversation history`)
    }

    let translatedTexts: string[]
    try {
      translatedTexts = await AIService.translateBatch(textsToTranslate, glossaryText, contextHistory)
    } catch (err) {
      const normalized = normalizeError(err)
      const message = normalized.message
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

    const stmtInsertTM = enableTM
      ? db.prepare(
          `
            INSERT INTO translation_memory (original_text, translated_text)
            VALUES (?, ?)
            ON CONFLICT(original_text) DO NOTHING
          `
        )
      : null

    db.transaction(() => {
      for (let i = 0; i < translatedTexts.length; i++) {
        const translated = finalTranslations[i]
        const block = blockMapping[i]
        const blockId = block?.id as number | undefined
        if (!blockId) continue

        // Re-run linter on final translation
        const errors = validateTranslation(block.original_text, translated)

        // Length overflow check (warning only, not a self-correction trigger)
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

        stmtUpdateBlock.run(translated, providerName, status, blockId)
        if (enableTM && stmtInsertTM) stmtInsertTM.run(block.original_text, translated)
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
  fileId?: number
): Promise<{ pendingBlocks: number; estimatedCharacters: number; estimatedCost: number }> {
  const db = getDatabase()
  const row = fileId
    ? (db
        .prepare(
          `
      SELECT COUNT(*) as blockCount, SUM(LENGTH(original_text)) as charCount
      FROM translation_blocks
      WHERE status = 'empty' AND file_id = ?
    `
        )
        .get(fileId) as { blockCount: number; charCount: number })
    : (db
        .prepare(
          `
      SELECT COUNT(*) as blockCount, SUM(LENGTH(original_text)) as charCount
      FROM translation_blocks
      WHERE status = 'empty'
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
  options?: { fileId?: number; signal?: AbortSignal }
): Promise<void> {
  const db = getDatabase()
  const settings = getSettings()
  const batchSize = settings.batchSize || 20
  let hasMore = true
  let totalSuccess = 0
  let totalError = 0
  let effectiveBatchSize = batchSize
  const enableTM = settings.enableTranslationMemory !== false
  const fileId = options?.fileId
  const signal = options?.signal
  const providerName = getProviderName()

  while (hasMore) {
    if (signal?.aborted) {
      emitSystemLog('warning', '[Queue] Stopped by user.')
      break
    }

    // 1. Lấy ra N blocks đang chờ dịch
    const pendingBlocks = fileId
      ? (db
          .prepare(
            `
        SELECT * FROM translation_blocks
        WHERE status = 'empty' AND file_id = ?
        LIMIT ?
      `
          )
          .all(fileId, effectiveBatchSize) as TranslationBlock[])
      : (db
          .prepare(
            `
        SELECT * FROM translation_blocks
        WHERE status = 'empty'
        LIMIT ?
      `
          )
          .all(effectiveBatchSize) as TranslationBlock[])

    if (pendingBlocks.length === 0) {
      console.log('[Queue] All batches completed.')
      emitSystemLog('success', '[Queue] Completed.')
      hasMore = false
      break
    }

    const textsToTranslate: string[] = []
    const blockMapping: { [index: number]: TranslationBlock } = {}

    // Regex Blacklist: auto-skip non-translatable strings
    const enableBlacklist = settings.enableRegexBlacklist !== false
    const blacklistPatterns = settings.regexBlacklist || []
    let batchSkippedCount = 0
    let activeBlocks = pendingBlocks

    if (enableBlacklist && blacklistPatterns.length > 0) {
      const stmtMarkSkipped = db.prepare(
        `UPDATE translation_blocks SET translated_text = original_text, translated_by = 'blacklist', status = 'skipped' WHERE id = ?`
      )
      activeBlocks = pendingBlocks.filter((block) => {
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
      ? db.prepare(`SELECT translated_text FROM translation_memory WHERE original_text = ?`)
      : null
    const stmtUpdateBlock = db.prepare(
      `UPDATE translation_blocks SET translated_text = ?, translated_by = ?, status = ? WHERE id = ?`
    )
    const stmtUpdateTMUsage = enableTM
      ? db.prepare(
          `UPDATE translation_memory SET usage_count = usage_count + 1, last_used_at = CURRENT_TIMESTAMP WHERE original_text = ?`
        )
      : null
    const fileIdsTouched = new Set<number>()

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
    emitEngineProgress({ success: totalSuccess, error: totalError })

    // 2. Gọi AI nếu còn text
    if (textsToTranslate.length > 0) {
      let attempts = 0
      let success = false

      while (attempts < 3 && !success) {
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

          const stmtInsertTM = enableTM
            ? db.prepare(`
                INSERT INTO translation_memory (original_text, translated_text)
                VALUES (?, ?)
                ON CONFLICT(original_text) DO NOTHING
              `)
            : null

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
              if (enableTM && stmtInsertTM) stmtInsertTM.run(block.original_text, translated)
              totalSuccess++
            }

            for (const fid of fileIdsTouched) updateFileStats(db, fid)
          })()

          success = true

          if (onProgress) onProgress({ success: totalSuccess, error: totalError })
          emitEngineProgress({ success: totalSuccess, error: totalError })
          emitSystemLog('success', `[Queue] Batch done. success=${totalSuccess}, error=${totalError}`)

        } catch (error: unknown) {
          attempts++
          totalError++
          const normalized = normalizeError(error)
          const message = normalized.message

          console.error(`[Queue] Error (attempt ${attempts}): ${normalized.name} — ${message}`)
          emitSystemLog('error', `[Queue] ${normalized.name} (attempt ${attempts}): ${message}`)

          if (normalized instanceof RateLimitError) {
            const waitTime = normalized.retryAfterMs || Math.min(5000, Math.pow(2, attempts) * 500)
            console.log(`[Queue] Rate limited. Waiting ${waitTime}ms...`)
            await delay(waitTime, signal)
          } else if (normalized instanceof TokenLimitError) {
            // Reduce batch size and retry
            effectiveBatchSize = Math.max(1, Math.floor(effectiveBatchSize / 2))
            emitSystemLog('warning', `[Queue] Token limit. Reducing batch size to ${effectiveBatchSize}`)
            await delay(800, signal)
          } else if (normalized instanceof ParsingError) {
            // Retry — might be a fluke with the model
            await delay(500, signal)
          } else if (normalized instanceof APIError && normalized.statusCode === 401) {
            // Auth error — fatal
            console.error('[Queue] Auth failed. Stopping queue.')
            emitSystemLog('error', '[Queue] Invalid API key. Stopping queue.')
            hasMore = false
            break
          } else {
            // Other fatal errors
            console.error('[Queue] Fatal error. Stopping queue.')
            emitSystemLog('error', `[Queue] Fatal: ${message}`)
            hasMore = false
            break
          }
        }
      }
    }

    await delay(1000, signal)
  }
}

let currentQueue: { abort: AbortController; running: boolean } | null = null

export function startQueue(options?: { fileId?: number }): { started: boolean; alreadyRunning: boolean } {
  if (currentQueue?.running) {
    emitSystemLog('warning', '[Queue] Already running.')
    return { started: false, alreadyRunning: true }
  }

  const abort = new AbortController()
  currentQueue = { abort, running: true }

  emitSystemLog('info', `[Queue] Started${options?.fileId ? ` (fileId=${options.fileId})` : ''}.`)

  void startBackgroundQueue(undefined, { fileId: options?.fileId, signal: abort.signal })
    .catch((err: unknown) => {
      const message = err instanceof Error ? err.message : String(err)
      console.error('[Queue] Unhandled error:', message)
      emitSystemLog('error', `[Queue] Unhandled error: ${message}`)
    })
    .finally(() => {
      if (currentQueue) currentQueue.running = false
      emitSystemLog('info', '[Queue] Idle.')
    })

  return { started: true, alreadyRunning: false }
}

export function stopQueue(): { stopped: boolean } {
  if (!currentQueue?.running) return { stopped: false }
  currentQueue.abort.abort()
  return { stopped: true }
}
