import { getDatabase } from '../store/database'
import { AIService } from '../api/aiService'
import { TranslationBlock } from '../../shared/types'
import { getSettings } from '../store/settings'
import { validateTranslation } from '../utils/qaLinter'
import { emitEngineProgress, emitSystemLog } from '../utils/ipcBroadcast'

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

function buildGlossaryText(db: Db): string {
  const glossaries = db
    .prepare(`SELECT source_text, target_text FROM glossaries`)
    .all() as { source_text: string; target_text: string }[]
  if (glossaries.length === 0) return ''
  return glossaries.map((g) => `${g.source_text} = ${g.target_text}`).join('\n')
}

export async function translateBatchByBlockIds(blockIds: number[]): Promise<void> {
  const uniqueIds = Array.from(new Set(blockIds)).filter((n) => Number.isFinite(n))
  if (uniqueIds.length === 0) return

  const db = getDatabase()
  const settings = getSettings()
  const glossaryText = buildGlossaryText(db)
  const fileIdsTouched = new Set<number>()

  const placeholders = uniqueIds.map(() => '?').join(',')
  const selectedBlocks = db
    .prepare(`SELECT * FROM translation_blocks WHERE id IN (${placeholders})`)
    .all(...uniqueIds) as TranslationBlock[]

  if (selectedBlocks.length === 0) return

  emitSystemLog('info', `[AI] Translating ${selectedBlocks.length} selected block(s)...`)

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

  // Phase 2: AI call for TM misses
  if (textsToTranslate.length > 0) {
    const translatedTexts = await AIService.translateBatch(textsToTranslate, glossaryText)
    if (translatedTexts.length !== textsToTranslate.length) {
      throw new Error(
        `Độ dài mảng output JSON (${translatedTexts.length}) không khớp với input (${textsToTranslate.length})`
      )
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
        const translated = translatedTexts[i]
        const block = blockMapping[i]
        const blockId = block?.id as number | undefined
        if (!blockId) continue
        const errors = validateTranslation(block.original_text, translated)
        const status = errors.length > 0 ? 'warning' : 'draft'

        stmtUpdateBlock.run(translated, settings.activeProvider, status, blockId)
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
 * Ước tính trước số lượng Token / Character cần dịch để user cân nhắc chi phí API.
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
    // Pricing differs per provider/model; keep a conservative placeholder for now.
    estimatedCost: 0,
  }
}

/**
 * Trình chạy nền (Background Worker Queue)
 * Fetch các dòng 'empty' -> Kiểm tra TM -> Gọi AI -> Lưu DB
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
  const enableTM = settings.enableTranslationMemory !== false
  const fileId = options?.fileId
  const signal = options?.signal

  while (hasMore) {
    if (signal?.aborted) {
      emitSystemLog('warning', '[Queue] Stopped by user.')
      break
    }

    // 1. Lấy ra N blocks đang chờ dịch (status = 'empty')
    const pendingBlocks = fileId
      ? (db
          .prepare(
            `
        SELECT * FROM translation_blocks
        WHERE status = 'empty' AND file_id = ?
        LIMIT ?
      `
          )
          .all(fileId, batchSize) as TranslationBlock[])
      : (db
          .prepare(
            `
        SELECT * FROM translation_blocks
        WHERE status = 'empty'
        LIMIT ?
      `
          )
          .all(batchSize) as TranslationBlock[])

    if (pendingBlocks.length === 0) {
      console.log('[Queue] All batches completed.')
      emitSystemLog('success', '[Queue] Completed.')
      hasMore = false
      break
    }

    const textsToTranslate: string[] = []
    const blockMapping: { [index: number]: TranslationBlock } = {}

    // 2. Tải toàn bộ Từ Điển (Glossary) từ DB
    const glossaryText = buildGlossaryText(db)

    // 3. Chuẩn bị Statement
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

    // Giai đoạn 1: Lọc qua TM để tiết kiệm API
    db.transaction(() => {
      for (let i = 0; i < pendingBlocks.length; i++) {
        const block = pendingBlocks[i]
        if (block.file_id) fileIdsTouched.add(block.file_id)

        const blockId = block.id as number | undefined
        if (!blockId) continue

        const tmRecord = enableTM && stmtCheckTM
          ? (stmtCheckTM.get(block.original_text) as { translated_text: string } | undefined)
          : undefined

        if (tmRecord) {
          // TM hit! Kéo qua linter kiểm tra lại cho chắc
          const errors = validateTranslation(block.original_text, tmRecord.translated_text)
          const status = errors.length > 0 ? 'warning' : 'draft'

          stmtUpdateBlock.run(tmRecord.translated_text, 'tm', status, blockId)
          if (enableTM && stmtUpdateTMUsage) stmtUpdateTMUsage.run(block.original_text)
          totalSuccess++
        } else {
          // TM miss! Cần gửi lên AI
          textsToTranslate.push(block.original_text)
          blockMapping[textsToTranslate.length - 1] = block
        }
      }

      // Sync sidebar stats for TM hits
      for (const fid of fileIdsTouched) updateFileStats(db, fid)
    })() // Execute transaction ngay lập tức

    if (onProgress) onProgress({ success: totalSuccess, error: totalError })
    emitEngineProgress({ success: totalSuccess, error: totalError })

    // 3. Nếu vẫn còn text chưa có trong TM, gọi AI
    if (textsToTranslate.length > 0) {
      let attempts = 0
      let success = false

      while (attempts < 3 && !success) {
        try {
          console.log(`[Queue] Calling AI for ${textsToTranslate.length} line(s)...`)
          emitSystemLog('info', `[Queue] Calling AI for ${textsToTranslate.length} line(s)...`)

          // Truyền từ điển đã parse vào
          const translatedTexts = await AIService.translateBatch(textsToTranslate, glossaryText)

           if (translatedTexts.length !== textsToTranslate.length) {
             throw new Error(`JSON output length (${translatedTexts.length}) does not match input (${textsToTranslate.length})`)
           }

          // 4. Lưu kết quả API vào DB & Cập nhật TM
          const stmtInsertTM = enableTM
            ? db.prepare(`
              INSERT INTO translation_memory (original_text, translated_text)
              VALUES (?, ?)
              ON CONFLICT(original_text) DO NOTHING
            `)
            : null

          db.transaction(() => {
            for (let i = 0; i < translatedTexts.length; i++) {
              const translated = translatedTexts[i]
              const block = blockMapping[i]
              const blockId = block?.id as number | undefined
              if (!blockId) continue

              // Chạy qua Linter để bắt lỗi mất Tag/Biến
              const errors = validateTranslation(block.original_text, translated)
              const status = errors.length > 0 ? 'warning' : 'draft'

              if (errors.length > 0) {
                console.log(`[Linter] Warnings at block ${block.id}:`, errors)
              }

              stmtUpdateBlock.run(translated, settings.activeProvider, status, blockId)
              if (enableTM && stmtInsertTM) stmtInsertTM.run(block.original_text, translated)
              totalSuccess++
            }

            // Sync sidebar stats
            for (const fid of fileIdsTouched) updateFileStats(db, fid)
          })()

          success = true

          // Phát event ra UI
          if (onProgress) onProgress({ success: totalSuccess, error: totalError })
          emitEngineProgress({ success: totalSuccess, error: totalError })
          emitSystemLog('success', `[Queue] Batch done. success=${totalSuccess}, error=${totalError}`)

        } catch (error: unknown) {
          attempts++
          totalError++
          const message = error instanceof Error ? error.message : String(error)
          console.error(`[Queue] API error (attempt ${attempts}):`, message)
          emitSystemLog('error', `[Queue] API error (attempt ${attempts}): ${message}`)

          // Xử lý Rate Limit (HTTP 429) bằng Exponential Backoff
          const maybeStatus =
            typeof error === 'object' && error !== null && 'status' in error
              ? (error as { status?: unknown }).status
              : undefined
          const status = typeof maybeStatus === 'number' ? maybeStatus : undefined
          if (status === 429 || message.includes('429')) {
             const waitTime = Math.pow(2, attempts) * 1000 // 2s -> 4s -> 8s
             console.log(`[Queue] Rate limited. Waiting ${waitTime}ms before retry...`)
             await delay(waitTime, signal)
          } else {
             // Lỗi nghiêm trọng (sai API Key, mất mạng), tạm dừng toàn bộ queue
             console.error('[Queue] Fatal error. Stopping queue.')
             emitSystemLog('error', `[Queue] Fatal error. Stopping queue.`)
             hasMore = false
             break
          }
        }
      }
    }

    // Tạm nghỉ 1s giữa các batch để tránh spam API liên tục gây rate limit
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
