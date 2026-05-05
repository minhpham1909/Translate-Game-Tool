import fs from 'fs-extra'
import path from 'path'
import { getDatabase } from '../store/database'
import { getProjectConfig, getSettings } from '../store/settings'
import { FileRecord, TranslationBlock } from '../../shared/types'

export interface BackupEntry {
  fileId: number
  fileName: string
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
  const sourcePath = path.join(project.gameFolderPath, 'tl', project.sourceLanguage, fileRecord.file_path)
  const targetPath = path.join(project.gameFolderPath, 'tl', project.targetLanguage, fileRecord.file_path)

  const exists = await fs.pathExists(sourcePath)
  if (!exists) throw new Error(`Source file not found: ${sourcePath}`)

  // 3. Sao lưu nếu file Target đã tồn tại
  if (await fs.pathExists(targetPath)) {
    const timestamp = new Date().getTime()
    const backupPath = `${targetPath}.backup_${timestamp}`
    await fs.copy(targetPath, backupPath)
    console.log(`[Export] Backup created: ${backupPath}`)
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

  // Generate language patch file after export
  try {
    const settings = getSettings()
    const patchKey = settings.languagePatchKey || 'K_F8'
    const showIcon = settings.languagePatchIcon !== false
    const patchContent = generateLanguagePatch(patchKey, showIcon)
    const project = getProjectConfig()
    if (project) {
      const patchPath = path.join(project.gameFolderPath, '00_vnt_lang_patch.rpy')
      await fs.writeFile(patchPath, patchContent, 'utf8')
      console.log(`[Export] Language patch generated: ${patchPath}`)
    }
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err)
    console.error('[Export] Failed to generate language patch:', message)
    result.errors.push(`Language patch: ${message}`)
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

  // Generate language patch file after export
  try {
    const settings = getSettings()
    const patchKey = settings.languagePatchKey || 'K_F8'
    const showIcon = settings.languagePatchIcon !== false
    const patchContent = generateLanguagePatch(patchKey, showIcon)
    const project = getProjectConfig()
    if (project) {
      const patchPath = path.join(project.gameFolderPath, '00_vnt_lang_patch.rpy')
      await fs.writeFile(patchPath, patchContent, 'utf8')
      console.log(`[Export] Language patch generated: ${patchPath}`)
    }
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err)
    console.error('[Export] Failed to generate language patch:', message)
    result.errors.push(`Language patch: ${message}`)
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
    const targetDir = path.join(project.gameFolderPath, 'tl', project.targetLanguage, path.dirname(file.file_path))

    if (!await fs.pathExists(targetDir)) continue

    const dirEntries = await fs.readdir(targetDir)
    for (const entry of dirEntries) {
      if (entry.startsWith(`${path.basename(file.file_path)}.backup_`)) {
        const fullPath = path.join(targetDir, entry)
        const stat = await fs.stat(fullPath)
        // Extract timestamp from backup filename
        const timestampMatch = entry.match(/\.backup_(\d+)$/)
        const createdAt = timestampMatch
          ? new Date(parseInt(timestampMatch[1])).toLocaleString('vi-VN')
          : stat.birthtime.toLocaleString('vi-VN')

        const fileId = file.id
        if (fileId == null) continue

        backups.push({
          fileId,
          fileName: file.file_name,
          backupPath: fullPath,
          createdAt,
          fileSize: stat.size ?? 0,
        })
      }
    }
  }

  // Sort by date descending (newest first)
  backups.sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime())

  return backups
}

/**
 * Phục hồi file gốc từ bản backup.
 * @param fileId File ID cần restore
 * @param backupFilePath Đường dẫn tới file backup
 */
export async function restoreFileBackup(fileId: number, backupFilePath: string): Promise<void> {
  const db = getDatabase()
  const project = getProjectConfig()

  if (!project) throw new Error('Project config is not set.')

  const fileRecord = db.prepare(`SELECT * FROM files WHERE id = ?`).get(fileId) as FileRecord
  if (!fileRecord) throw new Error(`File not found for ID: ${fileId}`)

  const exists = await fs.pathExists(backupFilePath)
  if (!exists) throw new Error(`Backup file not found: ${backupFilePath}`)

  const targetPath = path.join(project.gameFolderPath, 'tl', project.targetLanguage, fileRecord.file_path)
  await fs.copy(backupFilePath, targetPath)
  console.log(`[Export] Restored ${fileRecord.file_name} from backup: ${backupFilePath}`)
}

/**
 * Phục hồi file gốc từ bản backup gần nhất
 * @deprecated Use restoreFileBackup instead
 */
export async function restoreBackup(fileId: number, backupFilePath: string): Promise<void> {
  return restoreFileBackup(fileId, backupFilePath)
}

/**
 * Generate nội dung file 00_vnt_lang_patch.rpy để inject universal language switcher.
 * Không sửa code game, chỉ thêm file mới vào game/
 * @param key - Shortcut key (default: 'K_F8')
 * @param showIcon - Có hiển thị icon ở góc phải không
 */
export function generateLanguagePatch(key?: string, showIcon?: boolean): string {
  const shortcutKey = key || 'K_F8'
  const showIconBool = showIcon !== false // default true

  return `# 00_vnt_lang_patch.rpy - Auto-generated by VN Translator
# Universal Language Switcher - no UI modification needed
# Shortcut: ${shortcutKey} | Icon: ${showIconBool ? 'Enabled' : 'Disabled'}

init python:
    # Safely get all detected languages from the engine
    def vnt_get_available_languages():
        try:
            langs = list(renpy.known_languages())
        except:
            # Fallback for Ren'Py < 6.99.10: scan tl/ folder manually
            import os
            tl_path = os.path.join(config.gamedir, 'tl')
            langs = []
            if os.path.exists(tl_path):
                for item in os.listdir(tl_path):
                    full = os.path.join(tl_path, item)
                    if os.path.isdir(full) and item.lower() not in ['none', 'common']:
                        langs.append(item)
        langs.sort()
        return langs

# The Standalone Popup Screen
screen vnt_language_popup():
    modal True
    zorder 2147483647  # Max int to stay on top

    # Key binding handler (works with config.keymap)
    on "vnt_lang_menu" action [Language(None), Hide("vnt_language_popup")]

    frame:
        align (0.5, 0.5)
        padding (40, 40)
        background Solid("#1a1a1ae6")  # Semi-transparent dark background

        vbox:
            spacing 15
            text "VN Translator - Select Language" size 24 bold True color "#ffffff" xalign 0.5
            null height 10

            # Button for Root/Original Language
            textbutton "Original Game Language":
                action [Language(None), Hide("vnt_language_popup")]
                text_color "#cccccc" hover_text_color "#4ade80"
                xalign 0.5

            # Buttons for dynamically detected translations
            for lang in vnt_get_available_languages():
                textbutton "[lang.capitalize()]":
                    action [Language(lang), Hide("vnt_language_popup")]
                    text_color "#cccccc" hover_text_color "#4ade80"
                    xalign 0.5

            null height 20
            textbutton "Close":
                action Hide("vnt_language_popup")
                text_color "#ef4444" hover_text_color "#f87171"
                xalign 0.5

# Bind the popup to a hotkey (configurable)
# Using config.overlay_screens for maximum compatibility
init python:
    config.keymap['vnt_lang_menu'] = ['${shortcutKey}']
    # Register overlay screen - compatible with all Ren'Py versions
    if "vnt_language_popup" not in config.overlay_screens:
        config.overlay_screens.append("vnt_language_popup")

${showIconBool ? `
# Add a tiny button to the top right corner (fallback for mouse-only users)
screen vnt_mouse_fallback():
    zorder 9998
    textbutton "VN":
        text_size 12
        action Show("vnt_language_popup")
        align (1.0, 0.0)
        padding (8, 4)
        background Solid("#00000088")
        text_color "#ffffff"

# Ensure the mouse fallback is always shown
init python:
    if "vnt_mouse_fallback" not in config.overlay_screens:
        config.overlay_screens.append("vnt_mouse_fallback")
` : ''}
`
}

