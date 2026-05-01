import { getDatabase } from '../store/database'

export interface SearchMatch {
  blockId: number
  fileName: string
  lineIndex: number
  text: string
  matchStart: number
  matchEnd: number
}

export interface SearchOptions {
  matchCase: boolean
  wholeWord: boolean
  useRegex: boolean
}

/**
 * Tìm kiếm văn bản trong toàn bộ project
 * Dùng SQLite FTS (Full-Text Search) hoặc query LIKE tùy option
 */
export function searchBlocks(query: string, options: SearchOptions): SearchMatch[] {
  const db = getDatabase()
  
  if (!query.trim()) return []

  // Nếu dùng regex, ta cần logic regex của SQLite, hoặc fetch toàn bộ rồi filter bằng JS.
  // Tuy nhiên SQLite mặc định ko hỗ trợ regex tốt, ta có thể fallback về fetch file hiện tại
  // hoặc fetch FTS trước rồi refine.
  // Ở đây giả lập đơn giản dùng LIKE cho non-regex
  
  let sql = `
    SELECT b.id, b.original_text, b.translated_text, b.line_index, f.file_name
    FROM translation_blocks b
    JOIN files f ON b.file_id = f.id
  `
  let params: any[] = []

  if (options.useRegex) {
    // Regex: Fetch toàn bộ (không khuyến khích cho project khổng lồ, nhưng ok với VN)
    // Hoặc implement custom sqlite function RegExp (cần setup phức tạp hơn).
    // Tạm thời lấy tất cả, sẽ refine sau.
  } else {
    // Escape cho LIKE
    const likeQuery = options.wholeWord ? `% ${query} %` : `%${query}%`
    
    if (options.matchCase) {
      // Bật case sensitive LIKE trong SQLite bằng pragma (nếu cần) hoặc dùng glob
      sql += ` WHERE b.original_text GLOB ? OR b.translated_text GLOB ?`
      params = [`*${query}*`, `*${query}*`]
    } else {
      sql += ` WHERE b.original_text LIKE ? OR b.translated_text LIKE ?`
      params = [likeQuery, likeQuery]
    }
  }

  const rawResults = db.prepare(sql).all(...params) as any[]
  
  // Refine kết quả bằng JS để chính xác vị trí match (start/end) và Regex
  const matches: SearchMatch[] = []
  
  for (const row of rawResults) {
    const textsToSearch = [
      { text: row.original_text, isOriginal: true },
      { text: row.translated_text, isOriginal: false }
    ]

    for (const { text } of textsToSearch) {
      if (!text) continue

      let matchStartIndex = -1
      
      if (options.useRegex) {
        try {
          const regex = new RegExp(query, options.matchCase ? 'g' : 'gi')
          const regexMatch = regex.exec(text)
          if (regexMatch) {
            matchStartIndex = regexMatch.index
            matches.push({
              blockId: row.id,
              fileName: row.file_name,
              lineIndex: row.line_index,
              text,
              matchStart: matchStartIndex,
              matchEnd: matchStartIndex + regexMatch[0].length
            })
          }
        } catch (e) {
          // Lỗi regex (query ko hợp lệ) -> bỏ qua
        }
      } else {
        const searchText = options.matchCase ? text : text.toLowerCase()
        const searchQuery = options.matchCase ? query : query.toLowerCase()
        
        matchStartIndex = searchText.indexOf(searchQuery)
        
        if (matchStartIndex !== -1) {
          // Check whole word if needed
          let isMatch = true
          if (options.wholeWord) {
            const before = matchStartIndex > 0 ? text[matchStartIndex - 1] : ' '
            const after = matchStartIndex + query.length < text.length ? text[matchStartIndex + query.length] : ' '
            const wordBoundaryRegex = /[\s.,!?;:'"()]/
            isMatch = wordBoundaryRegex.test(before) && wordBoundaryRegex.test(after)
          }

          if (isMatch) {
            matches.push({
              blockId: row.id,
              fileName: row.file_name,
              lineIndex: row.line_index,
              text,
              matchStart: matchStartIndex,
              matchEnd: matchStartIndex + query.length
            })
          }
        }
      }
    }
  }

  return matches
}

/**
 * Thay thế một kết quả
 */
export function replaceBlockText(blockId: number, newText: string, isOriginal: boolean = false): void {
  const db = getDatabase()
  if (isOriginal) {
    db.prepare('UPDATE translation_blocks SET original_text = ? WHERE id = ?').run(newText, blockId)
  } else {
    // Đánh dấu status = 'draft' nếu đang replace bản dịch
    db.prepare('UPDATE translation_blocks SET translated_text = ?, status = ? WHERE id = ?').run(newText, 'draft', blockId)
  }
}
