import fs from 'fs-extra'
import path from 'path'
import { getDatabase } from '../store/database'
import { getProjectConfig } from '../store/settings'
import { FileRecord, TranslationBlock } from '../../shared/types'

/**
 * Hàm ghi đè bản dịch vào file game an toàn.
 * Hỗ trợ mô hình Cross-Translation (Dịch bắc cầu).
 */
export async function exportFile(fileId: number): Promise<void> {
  const db = getDatabase()
  const project = getProjectConfig()

  if (!project) throw new Error('Chưa thiết lập Project Config.')

  // 1. Lấy thông tin File và Blocks
  const fileRecord = db.prepare(`SELECT * FROM files WHERE id = ?`).get(fileId) as FileRecord
  if (!fileRecord) throw new Error(`Không tìm thấy file ID: ${fileId}`)

  const blocks = db.prepare(`SELECT * FROM translation_blocks WHERE file_id = ?`).all(fileId) as TranslationBlock[]
  
  // Tạo Hash Map để tra cứu O(1) theo line_index
  const blockMap = new Map<number, TranslationBlock>()
  for (const b of blocks) {
    blockMap.set(b.line_index, b)
  }

  // 2. Xác định đường dẫn file Source và Target
  const sourcePath = path.join(project.gameFolderPath, 'tl', project.sourceLanguage, fileRecord.file_path)
  const targetPath = path.join(project.gameFolderPath, 'tl', project.targetLanguage, fileRecord.file_path)

  const exists = await fs.pathExists(sourcePath)
  if (!exists) throw new Error(`Không tìm thấy file nguồn: ${sourcePath}`)

  // 3. Sao lưu nếu file Target đã tồn tại
  if (await fs.pathExists(targetPath)) {
    const timestamp = new Date().getTime()
    const backupPath = `${targetPath}.backup_${timestamp}`
    await fs.copy(targetPath, backupPath)
    console.log(`[Export] Đã sao lưu bản cũ: ${backupPath}`)
  }

  // 4. Đọc file Source và thực hiện Cross-Translation Transform
  const sourceContent = await fs.readFile(sourcePath, 'utf8')
  // Xử lý cả CRLF và LF
  const sourceLines = sourceContent.split(/\r?\n/)
  const targetLines: string[] = []

  const headerRegex = /^(\s*translate\s+)([^\s]+)(\s+.+:.*)$/

  for (let i = 0; i < sourceLines.length; i++) {
    const line = sourceLines[i]

    // A. Thay đổi Header Ngôn Ngữ
    const headerMatch = line.match(headerRegex)
    if (headerMatch && headerMatch[2] === project.sourceLanguage) {
      targetLines.push(`${headerMatch[1]}${project.targetLanguage}${headerMatch[3]}`)
      continue
    }

    // B. Kiểm tra dòng có block cần dịch không
    const block = blockMap.get(i)
    if (block) {
      const isApprovedOrDraft = block.status === 'approved' || block.status === 'draft'
      // Fallback an toàn nếu có Linter Warning hoặc chưa dịch
      const finalTargetText = (isApprovedOrDraft && block.translated_text) ? block.translated_text : block.original_text

      if (block.block_type === 'dialogue') {
        const charPrefix = block.character_id ? `${block.character_id} ` : ''
        
        // Chỉ thêm comment gốc nếu bản dịch khác với bản gốc (tức là không phải fallback)
        if (finalTargetText !== block.original_text) {
          targetLines.push(`${block.indentation}# ${charPrefix}"${block.original_text}"`)
        }
        
        targetLines.push(`${block.indentation}${charPrefix}"${finalTargetText}"`)
        continue
      }

      if (block.block_type === 'string') {
        targetLines.push(`${block.indentation}new "${finalTargetText}"`)
        continue
      }
    }

    // C. Dòng không có block (Ví dụ: dòng trống, dòng code thừa) -> Bê nguyên xi sang
    targetLines.push(line)
  }

  // 5. Ghi file Target (Đảm bảo luôn chèn CRLF để file chuẩn trên Windows)
  await fs.ensureDir(path.dirname(targetPath))
  await fs.writeFile(targetPath, targetLines.join('\r\n'), 'utf8')

  // 6. Cập nhật trạng thái
  db.prepare(`UPDATE files SET status = 'completed', updated_at = CURRENT_TIMESTAMP WHERE id = ?`).run(fileId)
  console.log(`[Export] Thành công: ${targetPath}`)
}

/**
 * Phục hồi file gốc từ bản backup gần nhất
 */
export async function restoreBackup(fileId: number, backupFilePath: string): Promise<void> {
  const db = getDatabase()
  const project = getProjectConfig()

  if (!project) throw new Error('Chưa thiết lập Project Config.')

  const fileRecord = db.prepare(`SELECT * FROM files WHERE id = ?`).get(fileId) as FileRecord
  if (!fileRecord) throw new Error(`Không tìm thấy file ID: ${fileId}`)

  const targetPath = path.join(project.gameFolderPath, 'tl', project.targetLanguage, fileRecord.file_path)

  const exists = await fs.pathExists(backupFilePath)
  if (!exists) throw new Error(`Không tìm thấy file backup: ${backupFilePath}`)

  await fs.copy(backupFilePath, targetPath)
  console.log(`[Export] Đã khôi phục file gốc từ: ${backupFilePath}`)
}
