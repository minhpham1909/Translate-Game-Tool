import { TranslationBlock, FileRecord } from '../../shared/types'
import { getDatabase } from '../store/database'
import { readFileLines } from '../utils/fileUtils'
import path from 'path'

enum ParserState {
  OUTSIDE,
  IN_DIALOGUE_BLOCK,
  IN_STRING_BLOCK
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

        blocks.push({
          block_hash: currentBlockHash,
          block_type: 'dialogue',
          character_id: charId,
          original_text: activeText, // Đây là bản Tiếng Anh (Source for AI)
          translated_text: null,     // AI sẽ dịch sau
          status: 'empty',
          indentation: lineMatch[1], // Capture exact indent (CRITICAL)
          line_index: i // Lưu vị trí dòng để ghi đè đúng dòng active
        })

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

        blocks.push({
          block_hash: `string_line_${i}`, // Tạo hash dựa vào dòng
          block_type: 'string',
          character_id: null,
          original_text: activeText, // Tiếng Anh (Source for AI)
          translated_text: null,
          status: 'empty',
          indentation: newMatch[1], // Capture exact indent (CRITICAL)
          line_index: i
        })
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
