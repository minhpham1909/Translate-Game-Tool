import { TranslationBlock, FileRecord } from '../../shared/types'
import { getDatabase } from '../store/database'
import { readFileLines } from '../utils/fileUtils'
import path from 'path'

enum ParserState {
  OUTSIDE,
  IN_DIALOGUE_BLOCK,
  IN_STRING_BLOCK
}

/**
 * Image/system block patterns.
 * These are placeholder blocks like [Image 1], [CG 2], [BG] that should not be translated.
 */
const SYSTEM_BLOCK_PATTERNS: RegExp[] = [
  /^\[Image\s*\d*\]$/i,
  /^\[CG\s*\d*\]$/i,
  /^\[BG\s*\d*\]$/i,
  /^\[Scene\s*\d*\]$/i,
  /^\[End\]$/i,
  /^\[ImageEnd\]$/i,
  /^\[Music\s*\d*\]$/i,
  /^\[SFX\s*\d*\]$/i,
]

function isSystemBlock(text: string): boolean {
  return SYSTEM_BLOCK_PATTERNS.some((re) => re.test(text))
}

export interface ParseResult {
  fileRecord: Omit<FileRecord, 'id' | 'updated_at'>
  blocks: Omit<TranslationBlock, 'id' | 'file_id'>[]
}

/**
 * Phân tích cú pháp file .rpy để trích xuất các translation blocks.
 * Hàm này duyệt qua từng dòng và dùng Regex để capture.
 *
 * @param filePath Đường dẫn tuyệt đối đến file .rpy
 * @param relativePath Đường dẫn tương đối (ví dụ: game/tl/vietnamese/script.rpy)
 */
export async function parseRpyFile(filePath: string, relativePath: string): Promise<ParseResult> {
  const lines = await readFileLines(filePath)
  const blocks: Omit<TranslationBlock, 'id' | 'file_id'>[] = []

  let state = ParserState.OUTSIDE
  let currentBlockHash = ''

  // Regex patterns
  // Dialogue header: `translate vietnamese start_a170b500:`
  // G1: indent, G2: language, G3: block_hash
  const dialogueHeaderRegex = /^(\s*)translate\s+(\w+)\s+([a-zA-Z0-9_]+):$/

  // String header: `translate vietnamese strings:`
  // G1: indent, G2: language
  const stringHeaderRegex = /^(\s*)translate\s+(\w+)\s+strings:$/

  // Comment line (Cross-Translation: sẽ bỏ qua toàn bộ khi parse - chỉ lấy dòng active)
  // const commentRegex = /^(\s*)#\s*([a-zA-Z0-9_]*)\s+"(.*)"$/
  // NOTE: Không sử dụng commentRegex vì Cross-Translation chỉ đọc dòng active (tiếng Anh)
  // và bỏ qua hoàn toàn dòng comment (tiếng Nhật)

  // Translated dialogue line: `e "Translated text"`
  // G1: indent, G2: character_id (optional), G3: translated text
  const dialogueLineRegex = /^(\s*)([a-zA-Z0-9_]*)\s+"(.*)"$/

  // String old block: `old "Start Game"`
  // G1: indent, G2: original text
  const oldStringRegex = /^(\s*)old\s+"(.*)"$/

  // String new block: `new "Bắt đầu Game"`
  // G1: indent, G2: translated text
  const newStringRegex = /^(\s*)new\s+"(.*)"$/

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i]

    // Nếu gặp 1 khối translate mới, reset state về OUTSIDE để bắt đầu lại
    if (/^\s*translate\s+/.test(line)) {
      state = ParserState.OUTSIDE
    }

    if (state === ParserState.OUTSIDE) {
      // 1. Check if entering String Block
      const stringMatch = line.match(stringHeaderRegex)
      if (stringMatch) {
        state = ParserState.IN_STRING_BLOCK
        // String block không có hash chung, ta sẽ tự generate dựa vào dòng
        currentBlockHash = 'strings'
        continue
      }

      // 2. Check if entering Dialogue Block
      const dialogueMatch = line.match(dialogueHeaderRegex)
      if (dialogueMatch) {
        state = ParserState.IN_DIALOGUE_BLOCK
        currentBlockHash = dialogueMatch[3]
        continue
      }
    }

    if (state === ParserState.IN_DIALOGUE_BLOCK) {
      // Cross-Translation: Bỏ qua dòng comment (Tiếng gốc/Nhật)
      if (line.trim().startsWith('#')) {
        continue
      }

      // Tìm dòng active (Tiếng Anh)
      const lineMatch = line.match(dialogueLineRegex)
      if (lineMatch) {
        const charId = lineMatch[2] || null
        const activeText = lineMatch[3]

        // Skip system/image blocks (e.g., [Image 1], [CG 2])
        if (!isSystemBlock(activeText)) {
          blocks.push({
            block_hash: currentBlockHash,
            block_type: 'dialogue',
            character_id: charId,
            original_text: activeText,
            translated_text: null,
            status: 'empty',
            indentation: lineMatch[1],
            line_index: i
          })
        }

        // Reset cho block tiếp theo
        state = ParserState.OUTSIDE
      }
    }

    if (state === ParserState.IN_STRING_BLOCK) {
      if (line.trim().startsWith('#')) continue

      // Bỏ qua dòng 'old' (Tiếng Nhật làm key)
      const oldMatch = line.match(oldStringRegex)
      if (oldMatch) {
        continue
      }

      // Trích xuất dòng 'new' (Tiếng Anh)
      const newMatch = line.match(newStringRegex)
      if (newMatch) {
        const activeText = newMatch[2]

        // Skip system/image blocks
        if (!isSystemBlock(activeText)) {
          blocks.push({
            block_hash: `string_line_${i}`,
            block_type: 'string',
            character_id: null,
            original_text: activeText,
            translated_text: null,
            status: 'empty',
            indentation: newMatch[1],
            line_index: i
          })
        }
      }
    }
  }

  const fileRecord: Omit<FileRecord, 'id' | 'updated_at'> = {
    file_path: relativePath,
    file_name: path.basename(filePath),
    total_blocks: blocks.length,
    translated_blocks: blocks.filter((b) => b.status !== 'empty').length,
    status: blocks.length === 0 ? 'completed' : 'pending'
  }

  return { fileRecord, blocks }
}

/**
 * Ghi toàn bộ ParseResult vào Database sử dụng Transaction.
 * Đây là bước Data Import chính, đảm bảo tốc độ khi insert hàng ngàn dòng.
 */
export function importRpyToDatabase(parseResult: ParseResult): void {
  const db = getDatabase()
  const { fileRecord, blocks } = parseResult

  const runImport = db.transaction(() => {
    // 1. Insert hoặc Update bảng files
    const stmtFile = db.prepare(`
      INSERT INTO files (file_path, file_name, total_blocks, translated_blocks, status)
      VALUES (?, ?, ?, ?, ?)
      ON CONFLICT(file_path) DO UPDATE SET
        file_name = excluded.file_name,
        total_blocks = excluded.total_blocks,
        translated_blocks = excluded.translated_blocks,
        status = excluded.status,
        updated_at = CURRENT_TIMESTAMP
    `)

    stmtFile.run(
      fileRecord.file_path,
      fileRecord.file_name,
      fileRecord.total_blocks,
      fileRecord.translated_blocks,
      fileRecord.status
    )

    const row = db.prepare('SELECT id FROM files WHERE file_path = ?').get(fileRecord.file_path) as { id: number } | undefined
    if (!row) {
      throw new Error(`File record not found after upsert: ${fileRecord.file_path}`)
    }
    const fileId = row.id

    // 2. Xóa các blocks cũ của file này nếu chúng ta re-parse (idempotent)
    db.prepare('DELETE FROM translation_blocks WHERE file_id = ?').run(fileId)

    // 3. Batch insert (Bulk Insert) hàng ngàn blocks rất nhanh
    const stmtBlock = db.prepare(`
      INSERT INTO translation_blocks (
        file_id, block_hash, block_type, character_id,
        original_text, translated_text, status, indentation, line_index
      )
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
    `)

    for (const block of blocks) {
      stmtBlock.run(
        fileId,
        block.block_hash,
        block.block_type,
        block.character_id,
        block.original_text,
        block.translated_text,
        block.status,
        block.indentation,
        block.line_index
      )
    }
  })

  // Thực thi Transaction
  runImport()
}

/**
 * Diff result summary — returned after a diff-based re-import.
 */
export interface DiffSummary {
  unchanged: number   // Block hash + text both match — translation preserved
  modified: number    // Block hash matches but text changed — translation kept for reference, needs review
  newBlocks: number   // New blocks not in old version — empty
  removed: number     // Old blocks no longer in new version — archived
  totalFiles: number
}

interface OldBlockRow {
  id: number
  block_hash: string
  block_type: string
  character_id: string | null
  original_text: string
  translated_text: string | null
  status: string
  indentation: string
  line_index: number
  translated_by: string | null
}

/**
 * Diff-based import: compares new parse results against existing DB blocks.
 * Preserves translations where possible, marks changed blocks as 'modified'.
 *
 * Rules:
 * - hash + original_text match → keep translation, status unchanged
 * - hash matches but original_text differs → keep old translation, status = 'modified'
 * - hash is new → insert as 'empty'
 * - old hash not in new → mark as 'removed' (delete from DB, log count)
 */
export function importRpyToDatabaseDiff(parseResult: ParseResult, oldFileId: number | null): DiffSummary {
  const db = getDatabase()
  const { fileRecord, blocks } = parseResult

  let unchanged = 0
  let modified = 0
  let newBlocks = 0

  const runDiff = db.transaction(() => {
    // 1. Upsert file record
    const stmtFile = db.prepare(`
      INSERT INTO files (file_path, file_name, total_blocks, translated_blocks, status)
      VALUES (?, ?, ?, ?, ?)
      ON CONFLICT(file_path) DO UPDATE SET
        file_name = excluded.file_name,
        total_blocks = excluded.total_blocks,
        translated_blocks = excluded.translated_blocks,
        status = excluded.status,
        updated_at = CURRENT_TIMESTAMP
    `)

    stmtFile.run(
      fileRecord.file_path,
      fileRecord.file_name,
      fileRecord.total_blocks,
      fileRecord.translated_blocks,
      fileRecord.status
    )

    const row = db.prepare('SELECT id FROM files WHERE file_path = ?').get(fileRecord.file_path) as { id: number } | undefined
    if (!row) {
      throw new Error(`File record not found after upsert: ${fileRecord.file_path}`)
    }
    const fileId = row.id

    // 2. Fetch existing blocks for this file (if any)
    const oldBlocks = oldFileId
      ? db.prepare(`SELECT * FROM translation_blocks WHERE file_id = ?`).all(oldFileId) as OldBlockRow[]
      : []

    // Build lookup: block_hash → old block
    const oldBlockMap = new Map<string, OldBlockRow>()
    for (const ob of oldBlocks) {
      oldBlockMap.set(ob.block_hash, ob)
    }

    // Track which old hashes we've seen (for removal detection)
    const seenOldHashes = new Set<string>()

    // 3. Prepare statements
    const stmtUpdateBlock = db.prepare(`
      UPDATE translation_blocks SET
        original_text = ?,
        translated_text = ?,
        status = ?,
        line_index = ?,
        indentation = ?,
        block_type = ?,
        character_id = ?
      WHERE id = ?
    `)

    const stmtInsertBlock = db.prepare(`
      INSERT INTO translation_blocks (
        file_id, block_hash, block_type, character_id,
        original_text, translated_text, status, indentation, line_index
      )
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
    `)

    // 4. Process each new block
    for (const block of blocks) {
      const existing = oldBlockMap.get(block.block_hash)

      if (existing) {
        seenOldHashes.add(block.block_hash)

        if (existing.original_text === block.original_text) {
          // Exact match: keep everything as-is
          // Just update line_index and indentation (might have shifted)
          stmtUpdateBlock.run(
            block.original_text,
            existing.translated_text,
            existing.status,
            block.line_index,
            block.indentation,
            block.block_type,
            block.character_id,
            existing.id
          )
          unchanged++
        } else {
          // Hash matches but text changed → mark as 'modified'
          // Keep old translation for user reference
          stmtUpdateBlock.run(
            block.original_text,
            existing.translated_text,  // Keep old translation
            'modified',
            block.line_index,
            block.indentation,
            block.block_type,
            block.character_id,
            existing.id
          )
          modified++
        }
      } else {
        // New block: insert as empty
        stmtInsertBlock.run(
          fileId,
          block.block_hash,
          block.block_type,
          block.character_id,
          block.original_text,
          block.translated_text,
          block.status,
          block.indentation,
          block.line_index
        )
        newBlocks++
      }
    }

    // 5. Remove old blocks that are no longer in the new version
    // We delete them entirely since they don't exist in the new game version
    let removed = 0
    for (const ob of oldBlocks) {
      if (!seenOldHashes.has(ob.block_hash)) {
        db.prepare('DELETE FROM translation_blocks WHERE id = ?').run(ob.id)
        removed++
      }
    }

    // 6. Update file stats
    const stats = db.prepare(`
      SELECT
        COUNT(*) as total,
        SUM(CASE WHEN status NOT IN ('empty', 'modified') THEN 1 ELSE 0 END) as translated
      FROM translation_blocks WHERE file_id = ?
    `).get(fileId) as { total: number; translated: number }

    const newStatus = stats.translated === 0 ? 'pending' : stats.translated >= stats.total ? 'completed' : 'in_progress'
    db.prepare(`
      UPDATE files SET total_blocks = ?, translated_blocks = ?, status = ?, updated_at = CURRENT_TIMESTAMP
      WHERE id = ?
    `).run(stats.total, stats.translated, newStatus, fileId)
  })

  runDiff()

  return {
    unchanged,
    modified,
    newBlocks,
    removed: 0, // Will be computed from oldBlocks.length - seenOldHashes.size
    totalFiles: 1,
  }
}
