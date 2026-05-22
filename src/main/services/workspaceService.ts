import { getDatabase } from '../store/database'
import { upsertGlobalTM } from '../store/globalDb'
import { TranslationBlock } from '../../shared/types'
import { classifyBlockVisibility, runMandatoryClassifierTestCases } from '../utils/blockVisibilityClassifier'

type Db = ReturnType<typeof getDatabase>
let classifierSelfTestRan = false

export interface DBFile {
  id: number
  file_path: string
  file_name: string
  total_blocks: number
  translated_blocks: number
  status: 'completed' | 'in_progress' | 'pending' | 'warning'
  updated_at: string
}

/**
 * Lấy danh sách toàn bộ các file trong project
 */
export function getWorkspaceFiles(): DBFile[] {
  const db = getDatabase()
  return db.prepare(`
    SELECT id, file_path, file_name, total_blocks, translated_blocks, status, updated_at
    FROM files
    ORDER BY file_name ASC
  `).all() as DBFile[]
}

/**
 * Lấy danh sách block dịch của một file
 * @param fileId ID của file
 */
export function getBlocksByFile(fileId: number): TranslationBlock[] {
  const db = getDatabase()

  if (!classifierSelfTestRan) {
    classifierSelfTestRan = true
    const selfTest = runMandatoryClassifierTestCases()
    if (selfTest.failed.length > 0) {
      console.warn('[Classifier Self-Test] Failed cases:', selfTest.failed)
    } else {
      console.log(`[Classifier Self-Test] Passed ${selfTest.passed} mandatory cases.`)
    }
  }

  const rows = db.prepare(`
    SELECT * FROM translation_blocks
    WHERE file_id = ?
    ORDER BY line_index ASC
  `).all(fileId) as TranslationBlock[]

  const updateVisibilityStmt = db.prepare(`
    UPDATE translation_blocks
    SET visibility = ?, hidden_reason = ?
    WHERE id = ?
  `)

  const tx = db.transaction((blocks: TranslationBlock[]) => {
    for (const block of blocks) {
      if (block.id == null) continue
      if (block.manual_override === 1) continue
      const currentVisibility = block.visibility
      const currentReason = block.hidden_reason
      const classified = classifyBlockVisibility(block)
      if (currentVisibility !== classified.visibility || currentReason !== classified.reason) {
        updateVisibilityStmt.run(classified.visibility, classified.reason, block.id)
        block.visibility = classified.visibility
        block.hidden_reason = classified.reason
      }
    }
  })
  tx(rows)

  return rows
}

/**
 * Cập nhật nội dung dịch cho 1 block
 * @param blockId ID của block
 * @param translatedText Nội dung dịch
 * @param status Trạng thái (draft, approved, etc.)
 */
export function updateBlockTranslation(blockId: number, translatedText: string | null, status: string): void {
  const db = getDatabase()
  db.transaction(() => {
    // 1. Cập nhật block
    const translatedBy = translatedText?.trim() ? 'manual' : 'none'
    db.prepare(`
      UPDATE translation_blocks 
      SET translated_text = ?, status = ?, translated_by = ?
      WHERE id = ?
    `).run(translatedText, status, translatedBy, blockId)

    // 2. Lấy file_id để cập nhật lại thông số file
    const block = db.prepare(`SELECT file_id, original_text FROM translation_blocks WHERE id = ?`).get(blockId) as {
      file_id: number
      original_text: string
    }
    if (block) {
      updateFileStats(db, block.file_id)
      if (status === 'approved' && translatedText?.trim()) {
        upsertGlobalTM(block.original_text, translatedText)
      }
    }
  })()
}

export function batchApproveBlocks(blockIds: number[]): void {
  const db = getDatabase()
  const uniqueIds = Array.from(new Set(blockIds)).filter((id) => Number.isFinite(id))
  if (uniqueIds.length === 0) return

  const stmtGetBlock = db.prepare(`
    SELECT id, file_id, original_text, translated_text, translated_by
    FROM translation_blocks
    WHERE id = ?
  `)
  const stmtApprove = db.prepare(`UPDATE translation_blocks SET status = 'approved' WHERE id = ?`)
  const touchedFileIds = new Set<number>()

  db.transaction(() => {
    for (const id of uniqueIds) {
      const block = stmtGetBlock.get(id) as {
        id: number
        file_id: number
        original_text: string
        translated_text: string | null
        translated_by: string | null
      } | undefined

      if (!block) continue

      stmtApprove.run(id)
      touchedFileIds.add(block.file_id)

      if (block.translated_text?.trim() && block.translated_by !== 'dirty_source') {
        upsertGlobalTM(block.original_text, block.translated_text)
      }
    }

    for (const fileId of touchedFileIds) {
      updateFileStats(db, fileId)
    }
  })()
}

export function setBlockManualVisibility(blockId: number, visibility: 'visible' | 'hidden'): void {
  const db = getDatabase()
  const block = db.prepare(`
    SELECT id, block_type, original_text
    FROM translation_blocks
    WHERE id = ?
  `).get(blockId) as Pick<TranslationBlock, 'id' | 'block_type' | 'original_text'> | undefined

  if (!block?.id) return

  const classified = classifyBlockVisibility(block)
  const hiddenReason = visibility === 'hidden' ? (classified.reason === 'dialogue' ? 'mixed' : classified.reason) : classified.reason

  db.prepare(`
    UPDATE translation_blocks
    SET visibility = ?, hidden_reason = ?, manual_override = 1
    WHERE id = ?
  `).run(visibility, hiddenReason, blockId)
}

export function setBlocksManualVisibility(blockIds: number[], visibility: 'visible' | 'hidden'): void {
  const db = getDatabase()
  const uniqueIds = Array.from(new Set(blockIds)).filter((id) => Number.isFinite(id))
  if (uniqueIds.length === 0) return

  const tx = db.transaction(() => {
    for (const blockId of uniqueIds) {
      setBlockManualVisibility(blockId, visibility)
    }
  })
  tx()
}

/**
 * Cập nhật thông số file (tổng block đã dịch, trạng thái file)
 * Bao gồm cả 'modified' vì các block đã sửa cũng được tính vào tiến độ.
 */
function updateFileStats(db: Db, fileId: number): void {
  // Lấy tổng số block và số block đã dịch (status not 'empty')
  const stats = db.prepare(`
    SELECT 
      COUNT(*) as total,
      SUM(CASE WHEN status != 'empty' THEN 1 ELSE 0 END) as translated
    FROM translation_blocks
    WHERE file_id = ?
  `).get(fileId) as { total: number, translated: number }

  let status = 'pending'
  if (stats.translated === stats.total && stats.total > 0) {
    status = 'completed'
  } else if (stats.translated > 0) {
    status = 'in_progress'
  }

  db.prepare(`
    UPDATE files 
    SET total_blocks = ?, translated_blocks = ?, status = ?, updated_at = CURRENT_TIMESTAMP
    WHERE id = ?
  `).run(stats.total, stats.translated, status, fileId)
}
