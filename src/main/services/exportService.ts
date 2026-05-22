import fs from 'fs-extra'
import path from 'path'
import { getDatabase, syncAllFilesProgress } from '../store/database'
import { getProjectConfig, getSettings } from '../store/settings'
import { normalizeLanguageCode, FileRecord, TranslationBlock } from '../../shared/types'

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

export interface ExportValidationIssue {
  code: 'missing_file' | 'header_mismatch' | 'placeholder_mismatch' | 'template_tag_mismatch' | 'quote_mismatch'
  severity: 'warning' | 'error'
  lineIndex: number
  message: string
}

export interface ExportResult {
  exportedFiles: number
  totalFiles: number
  skippedFiles: number
  errors: string[]
  warnings: string[]
}

export interface RemoveTranslationResult {
  removedTargetFolder: boolean
  removedBootstrapScript: boolean
}

const BOOTSTRAP_FILE_NAME = 'zz_vnt_force_language.rpy'

function getSourceBaseDir(gameFolderPath: string, sourceLanguage: string): string {
  return sourceLanguage === 'None'
    ? gameFolderPath
    : path.join(gameFolderPath, 'tl', sourceLanguage)
}

function resolveExportPaths(filePath: string): { sourcePath: string; targetPath: string } {
  const project = getProjectConfig()
  const settings = getSettings()
  if (!project) throw new Error('Project config is not set.')

  const sourceBase = getSourceBaseDir(project.gameFolderPath, project.sourceLanguage)
  const sourcePath = path.join(sourceBase, filePath)

  if (settings.exportMode === 'legacy_overwrite') {
    return { sourcePath, targetPath: sourcePath }
  }

  const targetLanguageCode = normalizeLanguageCode(project.targetLanguage)
  const targetBase = path.join(project.gameFolderPath, 'tl', targetLanguageCode)
  const targetPath = path.join(targetBase, filePath)
  return { sourcePath, targetPath }
}

function collectTokens(input: string, regex: RegExp): string[] {
  return Array.from(input.matchAll(regex), (m) => m[0]).sort()
}

function equalTokenSets(a: string[], b: string[]): boolean {
  if (a.length !== b.length) return false
  return a.every((token, idx) => token === b[idx])
}

function countUnescapedQuotes(text: string): number {
  let count = 0
  for (let i = 0; i < text.length; i++) {
    if (text[i] === '"' && text[i - 1] !== '\\') count++
  }
  return count
}

function validateBlock(block: TranslationBlock): ExportValidationIssue[] {
  const issues: ExportValidationIssue[] = []
  const translated = block.translated_text?.trim()
  if (!translated) return issues

  const placeholderRegex = /%[0-9]*[$]?[sdifxXocreEgGpnabBhHmMSYy]/g
  const tagRegex = /\{[^{}]+\}/g

  const originalPlaceholders = collectTokens(block.original_text, placeholderRegex)
  const translatedPlaceholders = collectTokens(translated, placeholderRegex)
  if (!equalTokenSets(originalPlaceholders, translatedPlaceholders)) {
    issues.push({
      code: 'placeholder_mismatch',
      severity: 'error',
      lineIndex: block.line_index,
      message: `Placeholder mismatch at line ${block.line_index}`,
    })
  }

  const originalTags = collectTokens(block.original_text, tagRegex)
  const translatedTags = collectTokens(translated, tagRegex)
  if (!equalTokenSets(originalTags, translatedTags)) {
    issues.push({
      code: 'template_tag_mismatch',
      severity: 'error',
      lineIndex: block.line_index,
      message: `Template tag mismatch at line ${block.line_index}`,
    })
  }

  const originalQuotes = countUnescapedQuotes(block.original_text)
  const translatedQuotes = countUnescapedQuotes(translated)
  if (translatedQuotes % 2 !== 0 || (originalQuotes % 2 === 0 && translatedQuotes % 2 !== 0)) {
    issues.push({
      code: 'quote_mismatch',
      severity: 'warning',
      lineIndex: block.line_index,
      message: `Potential quote mismatch at line ${block.line_index}`,
    })
  }

  return issues
}

function validateExportInput(sourceLines: string[], blocks: TranslationBlock[]): ExportValidationIssue[] {
  const issues: ExportValidationIssue[] = []
  const hasHeader = sourceLines.some((line) => /^\s*translate\s+[^\s]+\s+.+:\s*$/.test(line))
  if (!hasHeader) {
    issues.push({
      code: 'header_mismatch',
      severity: 'warning',
      lineIndex: 0,
      message: 'No Ren\'Py translate header detected in source file.',
    })
  }

  for (const block of blocks) {
    issues.push(...validateBlock(block))
  }

  return issues
}

async function writeLanguageBootstrap(): Promise<void> {
  const project = getProjectConfig()
  const settings = getSettings()
  if (!project || settings.exportMode !== 'vortex_like' || !settings.forceTargetLanguageOnLaunch) return

  const targetLanguage = normalizeLanguageCode(project.targetLanguage)
  const bootstrapPath = path.join(project.gameFolderPath, BOOTSTRAP_FILE_NAME)
  const script = [
    '# Auto-generated by VN Translator (Vortex-like export mode).',
    '# Forces Ren\'Py to prioritize translated language on startup.',
    'init -999 python:',
    `    _vnt_target_lang = "${targetLanguage}"`,
    '    try:',
    '        persistent.language = _vnt_target_lang',
    '        if renpy.game.preferences.language != _vnt_target_lang:',
    '            renpy.change_language(_vnt_target_lang)',
    '    except Exception:',
    '        pass',
    '',
  ].join('\n')

  await fs.writeFile(bootstrapPath, script, 'utf8')

  const bootstrapRpycPath = `${bootstrapPath}c`
  if (await fs.pathExists(bootstrapRpycPath)) {
    await fs.remove(bootstrapRpycPath)
  }

  console.log(`[Export] Bootstrap language script written: ${bootstrapPath}`)
}

export async function removeExportedTranslationsFromGame(): Promise<RemoveTranslationResult> {
  const project = getProjectConfig()
  if (!project) throw new Error('Project config is not set.')

  const targetLanguage = normalizeLanguageCode(project.targetLanguage)
  const targetFolderPath = path.join(project.gameFolderPath, 'tl', targetLanguage)
  const expectedBase = path.join(project.gameFolderPath, 'tl')
  const resolvedTarget = path.resolve(targetFolderPath)
  const resolvedExpected = path.resolve(expectedBase)
  if (!resolvedTarget.startsWith(resolvedExpected)) {
    throw new Error('Resolved target translation folder is outside expected game/tl path.')
  }

  let removedTargetFolder = false
  if (await fs.pathExists(targetFolderPath)) {
    await fs.remove(targetFolderPath)
    removedTargetFolder = true
  }

  const bootstrapPath = path.join(project.gameFolderPath, BOOTSTRAP_FILE_NAME)
  let removedBootstrapScript = false
  if (await fs.pathExists(bootstrapPath)) {
    await fs.remove(bootstrapPath)
    removedBootstrapScript = true
  }
  const bootstrapRpycPath = `${bootstrapPath}c`
  if (await fs.pathExists(bootstrapRpycPath)) {
    await fs.remove(bootstrapRpycPath)
    removedBootstrapScript = true
  }

  console.log(`[Remove Translation] Removed folder=${removedTargetFolder}, bootstrap=${removedBootstrapScript}`)
  return { removedTargetFolder, removedBootstrapScript }
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
 * Export một file theo mode hiện tại trong settings.
 */
export async function exportFile(fileId: number, approvedOnly: boolean = false): Promise<ExportValidationIssue[]> {
  const db = getDatabase()
  const project = getProjectConfig()
  const settings = getSettings()

  if (!project) throw new Error('Project config is not set.')
  if (project.targetLanguage === 'None') {
    throw new Error('Cannot export with target = None. None is source language, not target.')
  }

  const fileRecord = db.prepare(`SELECT * FROM files WHERE id = ?`).get(fileId) as FileRecord
  if (!fileRecord) throw new Error(`File not found for ID: ${fileId}`)

  const blocks = db.prepare(`SELECT * FROM translation_blocks WHERE file_id = ?`).all(fileId) as TranslationBlock[]
  const blockMap = new Map<number, TranslationBlock>()
  for (const b of blocks) blockMap.set(b.line_index, b)

  const { sourcePath, targetPath } = resolveExportPaths(fileRecord.file_path)

  const exists = await fs.pathExists(sourcePath)
  if (!exists) {
    throw new Error(`Source file not found: ${sourcePath}`)
  }

  const sourceContent = await fs.readFile(sourcePath, 'utf8')
  const sourceLines = sourceContent.split(/\r?\n/)

  const validationIssues = validateExportInput(sourceLines, blocks)
  const errorCount = validationIssues.filter((issue) => issue.severity === 'error').length
  if (errorCount > 0) {
    const summary = validationIssues.filter((issue) => issue.severity === 'error').slice(0, 3).map((issue) => issue.message).join('; ')
    throw new Error(`Pre-export validation failed (${errorCount} errors). ${summary}`)
  }

  const targetDir = path.dirname(targetPath)
  await fs.ensureDir(targetDir)

  const testFilePath = path.join(targetDir, '.vnt_write_test')
  try {
    await fs.writeFile(testFilePath, '', 'utf8')
    await fs.remove(testFilePath)
  } catch (err) {
    if ((err as NodeJS.ErrnoException).code === 'EPERM' || (err as NodeJS.ErrnoException).code === 'EACCES') {
      throw new Error('Write permission denied. Please run the app as Administrator or move the game folder to a writable location.')
    }
    throw err
  }

  // Legacy overwrite keeps one-time master backup.
  if (settings.exportMode === 'legacy_overwrite' && await fs.pathExists(targetPath)) {
    const masterBackupPath = `${targetPath}.vnt_orig`
    if (!(await fs.pathExists(masterBackupPath))) {
      await fs.copy(targetPath, masterBackupPath)
      console.log(`[Export] Created Master Backup: ${masterBackupPath}`)
    }
  }

  const targetLines: string[] = []
  const targetLanguage = normalizeLanguageCode(project.targetLanguage)
  const headerRegex = /^(\s*translate\s+)([^\s]+)(\s+.+:.*)$/

  for (let i = 0; i < sourceLines.length; i++) {
    const line = sourceLines[i]
    const headerMatch = line.match(headerRegex)
    if (headerMatch) {
      if (settings.exportMode === 'vortex_like') {
        targetLines.push(`${headerMatch[1]}${targetLanguage}${headerMatch[3]}`)
      } else {
        targetLines.push(line)
      }
      continue
    }

    const block = blockMap.get(i)
    if (!block) {
      targetLines.push(line)
      continue
    }

    const useTranslation = approvedOnly
      ? block.status === 'approved'
      : (block.status === 'approved' || block.status === 'draft' || block.status === 'modified')

    const finalTargetText = (useTranslation && block.translated_text)
      ? block.translated_text
      : block.original_text

    if (block.block_type === 'dialogue') {
      const charPrefix = block.character_id ? `${block.character_id} ` : ''
      if (finalTargetText !== block.original_text) {
        targetLines.push(`${block.indentation}# ${charPrefix}"${block.original_text}"`)
      }
      targetLines.push(`${block.indentation}${charPrefix}"${finalTargetText}"`)
      continue
    }

    if (block.block_type === 'string') {
      if (finalTargetText !== block.original_text) {
        targetLines.push(`${block.indentation}# old "${block.original_text}"`)
        targetLines.push(`${block.indentation}new "${finalTargetText}"`)
      } else {
        targetLines.push(line)
      }
      continue
    }

    targetLines.push(line)
  }

  await fs.writeFile(targetPath, targetLines.join('\r\n'), 'utf8')

  // .rpyc cleanup policy: always clear compiled target to force recompilation.
  const targetRpycPath = targetPath + 'c'
  if (await fs.pathExists(targetRpycPath)) {
    await fs.remove(targetRpycPath)
    console.log(`[Export] Removed stale compiled file: ${targetRpycPath}`)
  }

  db.prepare(`UPDATE files SET status = 'completed', updated_at = CURRENT_TIMESTAMP WHERE id = ?`).run(fileId)
  console.log(`[Export] Mode=${settings.exportMode} wrote: ${targetPath}`)
  return validationIssues
}

export async function exportAllFiles(
  approvedOnly: boolean = false,
  onProgress?: (current: number, total: number, fileName: string) => void
): Promise<ExportResult> {
  const db = getDatabase()
  const files = db.prepare(`SELECT * FROM files ORDER BY id ASC`).all() as FileRecord[]
  const result: ExportResult = { exportedFiles: 0, totalFiles: files.length, skippedFiles: 0, errors: [], warnings: [] }

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
      const issues = await exportFile(fileId, approvedOnly)
      issues.filter((issue) => issue.severity === 'warning').forEach((issue) => {
        result.warnings.push(`${file.file_name}: ${issue.message}`)
      })
      result.exportedFiles++
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err)
      result.errors.push(`${file.file_name}: ${message}`)
      result.skippedFiles++
      console.error(`[Export] Failed to export ${file.file_name}:`, message)
    }
  }

  if (result.exportedFiles > 0) {
    await writeLanguageBootstrap()
  }

  return result
}

export async function exportSelectedFiles(
  fileIds: number[],
  approvedOnly: boolean = false,
  onProgress?: (current: number, total: number, fileName: string) => void
): Promise<ExportResult> {
  const db = getDatabase()
  const result: ExportResult = { exportedFiles: 0, totalFiles: fileIds.length, skippedFiles: 0, errors: [], warnings: [] }

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
      const issues = await exportFile(fileId, approvedOnly)
      issues.filter((issue) => issue.severity === 'warning').forEach((issue) => {
        result.warnings.push(`${fileRecord.file_name}: ${issue.message}`)
      })
      result.exportedFiles++
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err)
      result.errors.push(`${fileRecord.file_name}: ${message}`)
      result.skippedFiles++
      console.error(`[Export] Failed to export ${fileRecord.file_name}:`, message)
    }
  }

  if (result.exportedFiles > 0) {
    await writeLanguageBootstrap()
  }

  return result
}

export async function listBackups(): Promise<BackupEntry[]> {
  const db = getDatabase()
  const project = getProjectConfig()

  if (!project) throw new Error('Project config is not set.')

  const files = db.prepare(`SELECT * FROM files`).all() as FileRecord[]
  const backups: BackupEntry[] = []

  for (const file of files) {
    const sourceBase = getSourceBaseDir(project.gameFolderPath, project.sourceLanguage)
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
          ? new Date(parseInt(timestampMatch[1], 10)).toLocaleString('vi-VN')
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

export async function restoreFileBackup(fileId: number, backupFilePath: string): Promise<void> {
  void backupFilePath
  await restoreFileToOriginal(fileId)
}

export async function clearFileTranslations(fileId: number, reExport: boolean = true): Promise<void> {
  const db = getDatabase()
  const fileRecord = db.prepare(`SELECT * FROM files WHERE id = ?`).get(fileId) as FileRecord
  if (!fileRecord) throw new Error(`File not found for ID: ${fileId}`)

  db.prepare(`
    UPDATE translation_blocks
    SET translated_text = NULL, status = 'empty'
    WHERE file_id = ?
  `).run(fileId)

  syncAllFilesProgress()
  if (reExport) {
    await exportFile(fileId, false)
    await writeLanguageBootstrap()
  }
  syncAllFilesProgress()
  console.log(`[Clear Translation] Cleared ${fileRecord.file_name} (fileId ${fileId}) and re-exported=${reExport}`)
}

export async function clearAllTranslations(reExport: boolean = true): Promise<{ clearedFiles: number }> {
  const db = getDatabase()
  const files = db.prepare(`SELECT id FROM files ORDER BY id ASC`).all() as Array<{ id: number }>
  for (const file of files) {
    await clearFileTranslations(file.id, reExport)
  }
  return { clearedFiles: files.length }
}

export async function restoreFileToOriginal(fileId: number): Promise<void> {
  await clearFileTranslations(fileId, true)
}

export async function restoreBackup(fileId: number, backupFilePath: string): Promise<void> {
  void backupFilePath
  return restoreFileToOriginal(fileId)
}
