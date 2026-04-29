import { getDatabase } from '../store/database'
import { AIService } from '../api/aiService'
import { TranslationBlock, AppSettings } from '../../shared/types'
import { getSettings } from '../store/settings'

// Hàm tiện ích: Tạm dừng execution (dùng cho Exponential Backoff)
const delay = (ms: number) => new Promise(res => setTimeout(res, ms))

/**
 * Tính năng Pre-flight Analyzer
 * Ước tính trước số lượng Token / Character cần dịch để user cân nhắc chi phí API.
 */
export async function preFlightAnalyzer() {
  const db = getDatabase()
  const row = db.prepare(`
    SELECT COUNT(*) as blockCount, SUM(LENGTH(original_text)) as charCount 
    FROM translation_blocks 
    WHERE status = 'empty'
  `).get() as { blockCount: number, charCount: number }
  
  return {
    pendingBlocks: row.blockCount || 0,
    estimatedCharacters: row.charCount || 0,
  }
}

/**
 * Trình chạy nền (Background Worker Queue)
 * Fetch các dòng 'empty' -> Kiểm tra TM -> Gọi AI -> Lưu DB
 */
export async function startBackgroundQueue(onProgress?: (progress: { success: number, error: number }) => void) {
  const db = getDatabase()
  const settings = getSettings()
  const batchSize = settings.batchSize || 20
  let hasMore = true
  let totalSuccess = 0
  let totalError = 0

  while (hasMore) {
    // 1. Lấy ra N blocks đang chờ dịch (status = 'empty')
    const pendingBlocks = db.prepare(`
      SELECT * FROM translation_blocks 
      WHERE status = 'empty' 
      LIMIT ?
    `).all(batchSize) as TranslationBlock[]

    if (pendingBlocks.length === 0) {
      console.log('[Queue] Đã dịch xong toàn bộ!')
      hasMore = false
      break
    }

    const textsToTranslate: string[] = []
    const blockMapping: { [index: number]: TranslationBlock } = {}

    // 2. Tải toàn bộ Từ Điển (Glossary) từ DB
    const glossaries = db.prepare(`SELECT source_text, target_text FROM glossaries`).all() as {source_text: string, target_text: string}[]
    let glossaryText = ""
    if (glossaries.length > 0) {
      glossaryText = glossaries.map(g => `${g.source_text} = ${g.target_text}`).join('\n')
    }

    // 3. Chuẩn bị Statement
    const stmtCheckTM = db.prepare(`SELECT translated_text FROM translation_memory WHERE original_text = ?`)
    const stmtUpdateBlock = db.prepare(`UPDATE translation_blocks SET translated_text = ?, translated_by = ?, status = 'draft' WHERE id = ?`)
    const stmtUpdateTMUsage = db.prepare(`UPDATE translation_memory SET usage_count = usage_count + 1, last_used_at = CURRENT_TIMESTAMP WHERE original_text = ?`)
    
    // Giai đoạn 1: Lọc qua TM để tiết kiệm API
    db.transaction(() => {
      for (let i = 0; i < pendingBlocks.length; i++) {
        const block = pendingBlocks[i]
        const tmRecord = stmtCheckTM.get(block.original_text) as { translated_text: string } | undefined
        
        if (tmRecord) {
          // TM hit! Auto-fill ngay lập tức
          stmtUpdateBlock.run(tmRecord.translated_text, 'tm', block.id)
          stmtUpdateTMUsage.run(block.original_text)
          totalSuccess++
        } else {
          // TM miss! Cần gửi lên AI
          textsToTranslate.push(block.original_text)
          blockMapping[textsToTranslate.length - 1] = block
        }
      }
    })() // Execute transaction ngay lập tức

    // 3. Nếu vẫn còn text chưa có trong TM, gọi AI
    if (textsToTranslate.length > 0) {
      let attempts = 0
      let success = false
      
      while (attempts < 3 && !success) {
        try {
          console.log(`[Queue] Bắt đầu gọi API cho ${textsToTranslate.length} dòng...`)
          
          // Truyền từ điển đã parse vào
          const translatedTexts = await AIService.translateBatch(textsToTranslate, glossaryText)
          
          if (translatedTexts.length !== textsToTranslate.length) {
             throw new Error(`Độ dài mảng output JSON (${translatedTexts.length}) không khớp với input (${textsToTranslate.length})`)
          }

          // 4. Lưu kết quả API vào DB & Cập nhật TM
          const stmtInsertTM = db.prepare(`
            INSERT INTO translation_memory (original_text, translated_text) 
            VALUES (?, ?)
            ON CONFLICT(original_text) DO NOTHING
          `)

          db.transaction(() => {
            for (let i = 0; i < translatedTexts.length; i++) {
              const translated = translatedTexts[i]
              const block = blockMapping[i]
              
              stmtUpdateBlock.run(translated, settings.activeProvider, block.id)
              stmtInsertTM.run(block.original_text, translated)
              totalSuccess++
            }
          })()

          success = true
          
          // Phát event ra UI
          if (onProgress) onProgress({ success: totalSuccess, error: totalError })

        } catch (error: any) {
          attempts++
          totalError++
          console.error(`[Queue] Lỗi gọi API (lần ${attempts}):`, error.message)
          
          // Xử lý Rate Limit (HTTP 429) bằng Exponential Backoff
          if (error.status === 429 || (error.message && error.message.includes('429'))) {
             const waitTime = Math.pow(2, attempts) * 1000 // 2s -> 4s -> 8s
             console.log(`[Queue] Bị Rate Limit, đợi ${waitTime}ms trước khi thử lại...`)
             await delay(waitTime)
          } else {
             // Lỗi nghiêm trọng (sai API Key, mất mạng), tạm dừng toàn bộ queue
             console.error(`[Queue] Lỗi nghiêm trọng, dừng queue.`)
             hasMore = false
             break
          }
        }
      }
    }
    
    // Tạm nghỉ 1s giữa các batch để tránh spam API liên tục gây rate limit
    await delay(1000)
  }
}
