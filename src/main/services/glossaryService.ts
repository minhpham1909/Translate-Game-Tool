import { getDatabase } from '../store/database'

export interface GlossaryEntry {
  id?: number
  source_text: string
  target_text: string
  notes?: string
  created_at?: string
  enabled?: boolean
}

/**
 * Lấy toàn bộ danh sách thuật ngữ
 */
export function getAllGlossaries(): GlossaryEntry[] {
  const db = getDatabase()
  const stmt = db.prepare('SELECT * FROM glossaries ORDER BY created_at DESC')
  const rows = stmt.all() as Array<GlossaryEntry & { enabled?: number }>
  return rows.map((row) => ({
    ...row,
    enabled: row.enabled !== 0,
  }))
}

/**
 * Thêm một thuật ngữ mới
 */
export function addGlossary(entry: Omit<GlossaryEntry, 'id' | 'created_at'>): GlossaryEntry {
  const db = getDatabase()
  const enabled = entry.enabled !== false
  const stmt = db.prepare(`
    INSERT INTO glossaries (source_text, target_text, notes, enabled)
    VALUES (?, ?, ?, ?)
  `)
  const result = stmt.run(entry.source_text, entry.target_text, entry.notes || null, enabled ? 1 : 0)

  return {
    id: result.lastInsertRowid as number,
    ...entry,
    enabled,
  }
}

/**
 * Cập nhật thuật ngữ hiện có
 */
export function updateGlossary(id: number, entry: Omit<GlossaryEntry, 'id' | 'created_at'>): void {
  const db = getDatabase()
  const enabled = entry.enabled !== false
  const stmt = db.prepare(`
    UPDATE glossaries
    SET source_text = ?, target_text = ?, notes = ?, enabled = ?
    WHERE id = ?
  `)
  stmt.run(entry.source_text, entry.target_text, entry.notes || null, enabled ? 1 : 0, id)
}

/**
 * Xoá một thuật ngữ
 */
export function deleteGlossary(id: number): void {
  const db = getDatabase()
  const stmt = db.prepare('DELETE FROM glossaries WHERE id = ?')
  stmt.run(id)
}

/**
 * Bật/tắt nhiều thuật ngữ cùng lúc
 */
export function setGlossaryEnabled(ids: number[], enabled: boolean): void {
  const db = getDatabase()
  const uniqueIds = Array.from(new Set(ids)).filter((id) => Number.isFinite(id))
  if (uniqueIds.length === 0) return

  const stmt = db.prepare(`UPDATE glossaries SET enabled = ? WHERE id = ?`)
  const tx = db.transaction((list: number[]) => {
    for (const id of list) {
      stmt.run(enabled ? 1 : 0, id)
    }
  })
  tx(uniqueIds)
}
