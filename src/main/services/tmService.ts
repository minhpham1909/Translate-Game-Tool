import { getDatabase } from '../store/database'

export interface TMEntry {
  id?: number
  original_text: string
  translated_text: string
  usage_count: number
  last_used_at: string
}

/**
 * Lấy danh sách Translation Memory (giới hạn 1000 records mới nhất)
 */
export function getTMEntries(): TMEntry[] {
  const db = getDatabase()
  const stmt = db.prepare('SELECT * FROM translation_memory ORDER BY last_used_at DESC LIMIT 1000')
  return stmt.all() as TMEntry[]
}

/**
 * Xóa một entry TM
 */
export function deleteTMEntry(id: number): void {
  const db = getDatabase()
  const stmt = db.prepare('DELETE FROM translation_memory WHERE id = ?')
  stmt.run(id)
}

/**
 * Xóa tất cả các entry có usage_count = 0 hoặc 1 (tùy logic unused)
 */
export function clearUnusedTM(): void {
  const db = getDatabase()
  // Trong DB default là 1 khi insert, nên ta clear các record ít dùng nếu cần
  // Hoặc logic cụ thể: chưa từng được match (usage_count <= 1)
  const stmt = db.prepare('DELETE FROM translation_memory WHERE usage_count <= 1')
  stmt.run()
}

/**
 * Tìm kiếm fuzzy (LIKE) trong TM - Dùng cho AI auto-fill
 */
export function searchTM(query: string): TMEntry[] {
  const db = getDatabase()
  const stmt = db.prepare('SELECT * FROM translation_memory WHERE original_text LIKE ? LIMIT 5')
  return stmt.all(`%${query}%`) as TMEntry[]
}

/**
 * Thêm hoặc cập nhật TM (upsert)
 * Gọi khi AI dịch thành công một block
 */
export function upsertTM(originalText: string, translatedText: string): void {
  const db = getDatabase()
  const stmt = db.prepare(`
    INSERT INTO translation_memory (original_text, translated_text, usage_count, last_used_at)
    VALUES (?, ?, 1, CURRENT_TIMESTAMP)
    ON CONFLICT(original_text) DO UPDATE SET
      translated_text = excluded.translated_text,
      usage_count = usage_count + 1,
      last_used_at = CURRENT_TIMESTAMP
  `)
  stmt.run(originalText, translatedText)
}
