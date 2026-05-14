import fs from 'fs-extra'
import path from 'path'
import { getDatabase, syncAllFilesProgress } from '../store/database'
import { getProjectConfig } from '../store/settings'
import { FileRecord, TranslationBlock } from '../../shared/types'

export interface BackupEntry {
  fileId: number
  fileName: string
  filePath: string
  backupPath: string
  createdAt: string
  fileSize: number
}

export interface ExportFileEntry {
  id: number
  fileName: string
  filePath: string
  totalBlocks: number
  translatedBlocks: number
  status: 'pending' | 'in_progress' | 'completed'
  hasChanges: boolean
}

export interface ExportResult {
  exportedFiles: number
  totalFiles: number
  skippedFiles: number
  errors: string[]
}

/**
 * Lấy danh sách files có thay đổi (có ít nhất 1 block không phải 'empty').
 */
export function getFilesWithChanges(): ExportFileEntry[] {
  const db = getDatabase()
  const project = getProjectConfig()

  if (!project) throw new Error('Project config is not set.')

  const files = db.prepare(`
    SELECT f.*,
      (SELECT COUNT(*) FROM translation_blocks
       WHERE file_id = f.id AND status != 'empty') as changed_blocks
    FROM files f
    ORDER BY f.file_name ASC
  `).all() as (FileRecord & { changed_blocks: number })[]

  return files.map(f => ({
    id: f.id!,
    fileName: f.file_name,
    filePath: f.file_path,
    totalBlocks: f.total_blocks,
    translatedBlocks: f.translated_blocks,
    status: f.status,
    hasChanges: f.changed_blocks > 0,
  }))
}

/**
 * Hàm ghi đè bản dịch vào file game an toàn.
 * Hỗ trợ mô hình Cross-Translation (Dịch bắc cầu).
 * @param approvedOnly Nếu true, chỉ export approved blocks. Draft/warning/empty fallback về bản gốc.
 */
export async function exportFile(fileId: number, approvedOnly: boolean = false): Promise<void> {
  const db = getDatabase()
  const project = getProjectConfig()

  if (!project) throw new Error('Project config is not set.')

  // Không cho phép export nếu target = None
  if (project.targetLanguage === 'None') {
    throw new Error('Không thể export với target = None. None là ngôn ngữ gốc, không phải đích dịch.')
  }

  // 1. Lấy thông tin File và Blocks
  const fileRecord = db.prepare(`SELECT * FROM files WHERE id = ?`).get(fileId) as FileRecord
  if (!fileRecord) throw new Error(`File not found for ID: ${fileId}`)

  const blocks = db.prepare(`SELECT * FROM translation_blocks WHERE file_id = ?`).all(fileId) as TranslationBlock[]

  // Tạo Hash Map để tra cứu O(1) theo line_index
  const blockMap = new Map<number, TranslationBlock>()
  for (const b of blocks) {
    blockMap.set(b.line_index, b)
  }

  // 2. Xác định đường dẫn file Source và Target
  // Xử lý case source = None: đọc từ game/ thay vì tl/None/
  // DIRECT OVERWRITE STRATEGY: Target = Source (ghi đè chính nó)
  const sourceBase = project.sourceLanguage === 'None'
    ? project.gameFolderPath
    : path.join(project.gameFolderPath, 'tl', project.sourceLanguage)
  const sourcePath = path.join(sourceBase, fileRecord.file_path)
  const targetPath = sourcePath // CRITICAL: Direct Overwrite - target equals source

  const exists = await fs.pathExists(sourcePath)
  if (!exists) throw new Error(`Source file not found: ${sourcePath}`)

  // 3. Write Permission Pre-flight Check
  const targetDir = path.dirname(targetPath)
  const testFilePath = path.join(targetDir, '.vnt_write_test')
  try {
    await fs.writeFile(testFilePath, '', 'utf8')
    await fs.remove(testFilePath)
  } catch (err) {
    if ((err as NodeJS.ErrnoException).code === 'EPERM' || (err as NodeJS.ErrnoException).code === 'EACCES') {
      throw new Error('Write permission denied. Please run the app as Administrator or move the game folder to a different location (e.g., Desktop or D: drive).')
    }
    throw err
  }

  // 4. Master Backup: chỉ tạo 1 lần duy nhất (.vnt_orig)
  if (await fs.pathExists(targetPath)) {
    const masterBackupPath = `${targetPath}.vnt_orig`
    if (!(await fs.pathExists(masterBackupPath))) {
      await fs.copy(targetPath, masterBackupPath)
      console.log(`[Export] Created Master Backup: ${masterBackupPath}`)
    }
  }

    // 5. Đọc file Source và thực hiện "Trojan Horse" Overwrite
  // QUAN TRỌNG: GIỮ NGUYÊN header (vd: translate english:), CHỈ thay text bên trong
  const sourceContent = await fs.readFile(sourcePath, 'utf8')
  // Xử lý cả CRLF và LF
  const sourceLines = sourceContent.split(/\r?\n/)
  const targetLines: string[] = []

  // Regex bắt header: capture indentation + "translate" + language + rest of line
  const headerRegex = /^(\s*translate\s+)([^\s]+)(\s+.+:.*)$/

  for (let i = 0; i < sourceLines.length; i++) {
    const line = sourceLines[i]

    // A. GIỮ NGUYÊN Header (KHÔNG thay đổi source/target language)
    const headerMatch = line.match(headerRegex)
    if (headerMatch) {
      // Giữ nguyên header gốc (không thay thế ngôn ngữ)
      targetLines.push(line)
      continue
    }

    // B. Kiểm tra dòng có block cần dịch không
    const block = blockMap.get(i)
    if (block) {
      // Quyết định có dùng bản dịch hay không
      const useTranslation = approvedOnly
        ? block.status === 'approved'  // Chỉ approved mới lấy bản dịch
        : (block.status === 'approved' || block.status === 'draft')  // approved + draft lấy bản dịch

      const finalTargetText = (useTranslation && block.translated_text)
        ? block.translated_text
        : block.original_text

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
        // Cấu trúc: old "..." / new "..."
        // GIỮ NGUYÊN dòng "old", CHỈ thay "new" bằng bản dịch
        if (finalTargetText !== block.original_text) {
          // Thêm comment dòng gốc
          targetLines.push(`${block.indentation}# old "${block.original_text}"`)
          targetLines.push(`${block.indentation}new "${finalTargetText}"`)
        } else {
          // Fallback: giữ nguyên
          targetLines.push(line)
        }
        continue
      }
    }

    // C. Dòng không có block (Ví dụ: dòng trống, dòng code thừa) -> Bê nguyên xi sang
    targetLines.push(line)
  }

  // 6. Ghi file Target (Đảm bảo luôn chèn CRLF để file chuẩn trên Windows)
  // DIRECT OVERWRITE: targetPath = sourcePath, không cần ensureDir
  await fs.writeFile(targetPath, targetLines.join('\r\n'), 'utf8')

  // 7. Xóa file .rpyc cũ để Ren'Py buộc recompile (Hullfix RPYC Deletion)
  const rpycPath = targetPath + 'c' // script.rpy -> script.rpyc
  if (await fs.pathExists(rpycPath)) {
    await fs.remove(rpycPath)
    console.log(`[Export] Deleted old compiled file to force recompilation: ${rpycPath}`)
  }

  // 8. Cập nhật trạng thái
  db.prepare(`UPDATE files SET status = 'completed', updated_at = CURRENT_TIMESTAMP WHERE id = ?`).run(fileId)
  console.log(`[Export] Exported: ${targetPath}`)
}

/**
 * Export toàn bộ project — lặp qua tất cả files trong DB.
 * @param approvedOnly Nếu true, chỉ export approved blocks.
 * @param onProgress Callback để báo progress (current, total, fileName)
 */
export async function exportAllFiles(
  approvedOnly: boolean = false,
  onProgress?: (current: number, total: number, fileName: string) => void
): Promise<ExportResult> {
  const db = getDatabase()
  const files = db.prepare(`SELECT * FROM files ORDER BY id ASC`).all() as FileRecord[]
  const result: ExportResult = { exportedFiles: 0, totalFiles: files.length, skippedFiles: 0, errors: [] }

  for (let i = 0; i < files.length; i++) {
    const file = files[i]
    const fileId = file.id
    if (fileId == null) {
      result.skippedFiles++
      result.errors.push(`${file.file_name}: missing ID`)
      continue
    }
    onProgress?.(i + 1, files.length, file.file_name)

    try {
      await exportFile(fileId, approvedOnly)
      result.exportedFiles++
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err)
      result.errors.push(`${file.file_name}: ${message}`)
      result.skippedFiles++
      console.error(`[Export] Failed to export ${file.file_name}:`, message)
    }
  }

  return result
}

/**
 * Export chỉ những file được chọn.
 * @param fileIds Danh sách file ID cần export
 * @param approvedOnly Nếu true, chỉ export approved blocks.
 * @param onProgress Callback để báo progress
 */
export async function exportSelectedFiles(
  fileIds: number[],
  approvedOnly: boolean = false,
  onProgress?: (current: number, total: number, fileName: string) => void
): Promise<ExportResult> {
  const db = getDatabase()
  const result: ExportResult = { exportedFiles: 0, totalFiles: fileIds.length, skippedFiles: 0, errors: [] }

  for (let i = 0; i < fileIds.length; i++) {
    const fileId = fileIds[i]
    const fileRecord = db.prepare(`SELECT * FROM files WHERE id = ?`).get(fileId) as FileRecord | undefined
    if (!fileRecord) {
      result.skippedFiles++
      result.errors.push(`File ID ${fileId}: not found`)
      continue
    }
    onProgress?.(i + 1, fileIds.length, fileRecord.file_name)

    try {
      await exportFile(fileId, approvedOnly)
      result.exportedFiles++
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err)
      result.errors.push(`${fileRecord.file_name}: ${message}`)
      result.skippedFiles++
      console.error(`[Export] Failed to export ${fileRecord.file_name}:`, message)
    }
  }

  return result
}

/**
 * Quét toàn bộ thư mục target để tìm các file backup.
 */
export async function listBackups(): Promise<BackupEntry[]> {
  const db = getDatabase()
  const project = getProjectConfig()

  if (!project) throw new Error('Project config is not set.')

  const files = db.prepare(`SELECT * FROM files`).all() as FileRecord[]
  const backups: BackupEntry[] = []

  for (const file of files) {
    // Direct Overwrite: backup được lưu ở source path, KHÔNG phải tl/{target}/
    const sourceBase = project.sourceLanguage === 'None'
      ? project.gameFolderPath
      : path.join(project.gameFolderPath, 'tl', project.sourceLanguage)
    const sourceDir = path.join(sourceBase, path.dirname(file.file_path))

    if (!await fs.pathExists(sourceDir)) continue

    const dirEntries = await fs.readdir(sourceDir)
    const baseName = path.basename(file.file_path)
    for (const entry of dirEntries) {
      if (entry.startsWith(`${baseName}.backup_`)) {
        const fullPath = path.join(sourceDir, entry)
        const stat = await fs.stat(fullPath)
        const timestampMatch = entry.match(/\.backup_(\d+)$/)
        const createdAt = timestampMatch
          ? new Date(parseInt(timestampMatch[1])).toLocaleString('vi-VN')
          : stat.birthtime.toLocaleString('vi-VN')

        const fileId = file.id
        if (fileId == null) continue

        backups.push({
          fileId,
          fileName: file.file_name,
          filePath: file.file_path,
          backupPath: fullPath,
          createdAt,
          fileSize: stat.size ?? 0,
        })
      }
    }
  }

  backups.sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime())

  return backups
}

/**
 * Phục hồi file gốc từ bản backup.
 * 4 bước: copy file → xoá .rpyc → reset DB blocks → sync progress
 * @param fileId File ID cần restore
 * @param backupFilePath Đường dẫn tới file backup
 */
export async function restoreFileBackup(fileId: number, backupFilePath: string): Promise<void> {
  void backupFilePath
  await restoreFileToOriginal(fileId)
}

export async function restoreFileToOriginal(fileId: number): Promise<void> {
  const db = getDatabase()

  const fileRecord = db.prepare(`SELECT * FROM files WHERE id = ?`).get(fileId) as FileRecord
  if (!fileRecord) throw new Error(`File not found for ID: ${fileId}`)

  db.prepare(`
    UPDATE translation_blocks
    SET translated_text = NULL, status = 'empty'
    WHERE file_id = ?
  `).run(fileId)

  syncAllFilesProgress()
  await exportFile(fileId, false)
  syncAllFilesProgress()

  console.log(`[Restore] Restored ${fileRecord.file_name} via DB reset`)
}

/**
 * Database-Driven Restore: xoá translations trong DB rồi re-export.
 * Không cần physical backup — dùng original_text từ DB để khôi phục.
 * @param fileId File ID cần restore về bản gốc
 */
export async function restoreFileToOriginal(fileId: number): Promise<void> {
  const db = getDatabase()
  if (!db) throw new Error('Database not initialized')

  // STEP 1: Wipe all translations for this file (giữ original_text)
  db.prepare(`
    UPDATE translation_blocks
    SET translated_text = NULL, status = 'empty'
    WHERE file_id = ?
  `).run(fileId)

  // STEP 2: Sync UI progress immediately
  syncAllFilesProgress()

  // STEP 3: Re-export — translated_text = NULL → exportFile dùng original_text
  await exportFile(fileId)
  console.log(`[Restore] Successfully restored fileId ${fileId} via DB reset + re-export`)
}

/**
 * Phục hồi file gốc từ bản backup gần nhất
 * @deprecated Use restoreFileBackup instead
 */
export async function restoreBackup(fileId: number, backupFilePath: string): Promise<void> {
  void backupFilePath
  return restoreFileToOriginal(fileId)
}

