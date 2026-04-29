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
  let currentCharacterId: string | null = null
  let currentOriginalText = ''
  
  // Regex patterns
  // Dialogue header: `translate vietnamese start_a170b500:`
  // G1: indent, G2: language, G3: block_hash
  const dialogueHeaderRegex = /^(\s*)translate\s+(\w+)\s+([a-zA-Z0-9_]+):$/
  
  // String header: `translate vietnamese strings:`
  // G1: indent, G2: language
  const stringHeaderRegex = /^(\s*)translate\s+(\w+)\s+strings:$/
  
  // Comment line inside dialogue: `# e "Original text here"`
  // G1: indent, G2: character_id (optional), G3: original text
  const commentRegex = /^(\s*)#\s*([a-zA-Z0-9_]*)\s+"(.*)"$/
  
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
      // 1. Check if entering Dialogue Block
      const dialogueMatch = line.match(dialogueHeaderRegex)
      if (dialogueMatch) {
        state = ParserState.IN_DIALOGUE_BLOCK
        currentBlockHash = dialogueMatch[3]
        currentCharacterId = null
        currentOriginalText = ''
        continue
      }

      // 2. Check if entering String Block
      const stringMatch = line.match(stringHeaderRegex)
      if (stringMatch) {
        state = ParserState.IN_STRING_BLOCK
        // String block không có hash chung, ta sẽ tự generate dựa vào dòng
        currentBlockHash = 'strings' 
        continue
      }
    }

    if (state === ParserState.IN_DIALOGUE_BLOCK) {
      // Tìm dòng comment chứa Original Text
      const commentMatch = line.match(commentRegex)
      if (commentMatch) {
        currentCharacterId = commentMatch[2] || null
        currentOriginalText = commentMatch[3]
        continue
      }

      // Tìm dòng translatable (bản dịch)
      if (currentOriginalText) {
        const lineMatch = line.match(dialogueLineRegex)
        // Loại bỏ các dòng comment bị nhận diện nhầm
        if (lineMatch && !line.trim().startsWith('#')) {
          const transText = lineMatch[3]
          // Dịch rồi thì approved, chưa dịch (empty string) thì empty
          const isTranslated = transText.length > 0 && transText !== currentOriginalText
          
          blocks.push({
            block_hash: currentBlockHash,
            block_type: 'dialogue',
            character_id: currentCharacterId,
            original_text: currentOriginalText,
            translated_text: transText || null,
            status: isTranslated ? 'approved' : 'empty',
            indentation: lineMatch[1], // Capture exact indent (CRITICAL)
            line_index: i // Lưu vị trí dòng để ghi file sau này
          })
          
          // Reset cho block tiếp theo
          currentOriginalText = ''
          state = ParserState.OUTSIDE
        }
      }
    }

    if (state === ParserState.IN_STRING_BLOCK) {
      const oldMatch = line.match(oldStringRegex)
      if (oldMatch) {
        currentOriginalText = oldMatch[2]
        continue
      }

      if (currentOriginalText) {
        const newMatch = line.match(newStringRegex)
        if (newMatch) {
          const transText = newMatch[2]
          const isTranslated = transText.length > 0 && transText !== currentOriginalText
          
          blocks.push({
            block_hash: `string_line_${i}`, // Tạo hash dựa vào dòng
            block_type: 'string',
            character_id: null,
            original_text: currentOriginalText,
            translated_text: transText || null,
            status: isTranslated ? 'approved' : 'empty',
            indentation: newMatch[1], // Capture exact indent (CRITICAL)
            line_index: i
          })
          
          currentOriginalText = ''
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
    
    const fileResult = stmtFile.run(
      fileRecord.file_path, 
      fileRecord.file_name, 
      fileRecord.total_blocks, 
      fileRecord.translated_blocks, 
      fileRecord.status
    )
    
    let fileId: number
    if (fileResult.changes > 0 && fileResult.lastInsertRowid) {
      fileId = fileResult.lastInsertRowid as number
    } else {
      const row = db.prepare('SELECT id FROM files WHERE file_path = ?').get(fileRecord.file_path) as { id: number }
      fileId = row.id
    }

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
