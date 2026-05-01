import { getDatabase } from '../store/database'

export interface GlossaryEntry {
  id?: number
  source_text: string
  target_text: string
  notes?: string
  created_at?: string
}

/**
 * Lấy toàn bộ danh sách thuật ngữ
 */
export function getAllGlossaries(): GlossaryEntry[] {
  const db = getDatabase()
  const stmt = db.prepare('SELECT * FROM glossaries ORDER BY created_at DESC')
  return stmt.all() as GlossaryEntry[]
}

/**
 * Thêm một thuật ngữ mới
 */
export function addGlossary(entry: Omit<GlossaryEntry, 'id' | 'created_at'>): GlossaryEntry {
  const db = getDatabase()
  const stmt = db.prepare(`
    INSERT INTO glossaries (source_text, target_text, notes)
    VALUES (?, ?, ?)
  `)
  const result = stmt.run(entry.source_text, entry.target_text, entry.notes || null)
  
  return {
    id: result.lastInsertRowid as number,
    ...entry
  }
}

/**
 * Cập nhật thuật ngữ hiện có
 */
export function updateGlossary(id: number, entry: Omit<GlossaryEntry, 'id' | 'created_at'>): void {
  const db = getDatabase()
  const stmt = db.prepare(`
    UPDATE glossaries 
    SET source_text = ?, target_text = ?, notes = ?
    WHERE id = ?
  `)
  stmt.run(entry.source_text, entry.target_text, entry.notes || null, id)
}

/**
 * Xoá một thuật ngữ
 */
export function deleteGlossary(id: number): void {
  const db = getDatabase()
  const stmt = db.prepare('DELETE FROM glossaries WHERE id = ?')
  stmt.run(id)
}
