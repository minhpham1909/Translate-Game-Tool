import { getDatabase } from '../store/database'
import { validateTranslation, validateLengthOverflow } from '../utils/qaLinter'
import { getSettings } from '../store/settings'

export type QAIssueSeverity = 'warning' | 'error'

export interface QAIssue {
  id: number
  fileId: number
  fileName: string
  lineIndex: number
  blockHash: string
  severity: QAIssueSeverity
  description: string
}

function inferSeverity(message: string): QAIssueSeverity {
  const m = message.toLowerCase()
  if (m.includes('mismatch') || m.includes('invalid') || m.includes('broken')) return 'error'
  return 'warning'
}

export function getQAIssues(fileId?: number): QAIssue[] {
  const db = getDatabase()
  const settings = getSettings()
  const rows = fileId
    ? (db.prepare(`
        SELECT b.id, b.file_id, b.block_hash, b.line_index, b.original_text, b.translated_text, f.file_name
        FROM translation_blocks b
        JOIN files f ON f.id = b.file_id
        WHERE b.file_id = ? AND b.translated_text IS NOT NULL AND TRIM(b.translated_text) != ''
        ORDER BY b.file_id ASC, b.line_index ASC
      `).all(fileId) as Array<{
        id: number
        file_id: number
        block_hash: string
        line_index: number
        original_text: string
        translated_text: string
        file_name: string
      }>)
    : (db.prepare(`
        SELECT b.id, b.file_id, b.block_hash, b.line_index, b.original_text, b.translated_text, f.file_name
        FROM translation_blocks b
        JOIN files f ON f.id = b.file_id
        WHERE b.translated_text IS NOT NULL AND TRIM(b.translated_text) != ''
        ORDER BY b.file_id ASC, b.line_index ASC
      `).all() as Array<{
        id: number
        file_id: number
        block_hash: string
        line_index: number
        original_text: string
        translated_text: string
        file_name: string
      }>)

  const issues: QAIssue[] = []
  for (const row of rows) {
    const base = validateTranslation(row.original_text, row.translated_text)
    const lengthWarnings = settings.enableLengthCheck !== false
      ? validateLengthOverflow(row.original_text, row.translated_text, settings.maxLengthRatio || 1.3)
      : []
    for (const message of [...base, ...lengthWarnings]) {
      issues.push({
        id: row.id,
        fileId: row.file_id,
        fileName: row.file_name,
        lineIndex: row.line_index,
        blockHash: row.block_hash,
        severity: inferSeverity(message),
        description: message,
      })
    }
  }
  return issues
}

