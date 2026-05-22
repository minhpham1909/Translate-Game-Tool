import { getDatabase } from '../store/database'

export interface SearchMatch {
  blockId: number
  fileId: number
  fileName: string
  lineIndex: number
  text: string
  matchStart: number
  matchEnd: number
  field: 'original' | 'translated'
}

export interface SearchOptions {
  matchCase: boolean
  wholeWord: boolean
  useRegex: boolean
  searchTarget?: 'original' | 'translated' | 'both'
  includeHidden?: boolean
  fileId?: number
}

/**
 * Tìm kiếm văn bản trong toàn bộ project
 * Dùng SQLite FTS (Full-Text Search) hoặc query LIKE tùy option
 */
export function searchBlocks(query: string, options: SearchOptions): SearchMatch[] {
  const db = getDatabase()
  const normalizedQuery = query.trim()
  if (!normalizedQuery) return []

  const searchTarget = options.searchTarget ?? 'both'
  const includeHidden = options.includeHidden === true
  const fileId = typeof options.fileId === 'number' ? options.fileId : undefined
  const whereClauses: string[] = []
  const params: unknown[] = []

  if (!includeHidden) {
    whereClauses.push(`(b.visibility IS NULL OR b.visibility != 'hidden')`)
  }
  if (fileId !== undefined) {
    whereClauses.push('b.file_id = ?')
    params.push(fileId)
  }

  if (!options.useRegex) {
    const pattern = options.matchCase ? `*${normalizedQuery}*` : `%${normalizedQuery}%`
    const textClauses: string[] = []
    if (searchTarget === 'original' || searchTarget === 'both') {
      textClauses.push(options.matchCase ? 'b.original_text GLOB ?' : 'b.original_text LIKE ?')
      params.push(pattern)
    }
    if (searchTarget === 'translated' || searchTarget === 'both') {
      textClauses.push(options.matchCase ? 'b.translated_text GLOB ?' : 'b.translated_text LIKE ?')
      params.push(pattern)
    }
    if (textClauses.length > 0) {
      whereClauses.push(`(${textClauses.join(' OR ')})`)
    }
  }

  const whereSql = whereClauses.length > 0 ? `WHERE ${whereClauses.join(' AND ')}` : ''
  const sql = `
    SELECT b.id, b.file_id, b.original_text, b.translated_text, b.line_index, f.file_name
    FROM translation_blocks b
    JOIN files f ON b.file_id = f.id
    ${whereSql}
  `
  const rawResults = db.prepare(sql).all(...params) as Array<{
    id: number
    file_id: number
    original_text: string | null
    translated_text: string | null
    line_index: number
    file_name: string
  }>

  const matches: SearchMatch[] = []

  const selectedFields: Array<'original' | 'translated'> =
    searchTarget === 'both' ? ['original', 'translated'] : [searchTarget]

  // Fast single-block search shortcuts:
  // - id:123 or #123
  // - line:648 or l:648
  // - hash:abc123 (prefix match)
  const idMatch = normalizedQuery.match(/^(?:id:|#)(\d+)$/i)
  const lineMatch = normalizedQuery.match(/^(?:line:|l:)(\d+)$/i)
  const hashMatch = normalizedQuery.match(/^hash:([a-z0-9_:-]+)$/i)
  if (idMatch || lineMatch || hashMatch) {
    const quickWhere = ['1=1']
    const quickParams: unknown[] = []
    if (!includeHidden) quickWhere.push(`(b.visibility IS NULL OR b.visibility != 'hidden')`)
    if (fileId !== undefined) {
      quickWhere.push('b.file_id = ?')
      quickParams.push(fileId)
    }
    if (idMatch) {
      quickWhere.push('b.id = ?')
      quickParams.push(Number(idMatch[1]))
    } else if (lineMatch) {
      quickWhere.push('b.line_index = ?')
      quickParams.push(Number(lineMatch[1]))
    } else if (hashMatch) {
      quickWhere.push('b.block_hash LIKE ?')
      quickParams.push(`${hashMatch[1]}%`)
    }

    const quickRows = db.prepare(`
      SELECT b.id, b.file_id, b.original_text, b.translated_text, b.line_index, f.file_name
      FROM translation_blocks b
      JOIN files f ON b.file_id = f.id
      WHERE ${quickWhere.join(' AND ')}
      ORDER BY b.id ASC
      LIMIT 20
    `).all(...quickParams) as Array<{
      id: number
      file_id: number
      original_text: string | null
      translated_text: string | null
      line_index: number
      file_name: string
    }>

    const quickMatches: SearchMatch[] = []
    for (const row of quickRows) {
      for (const field of selectedFields) {
        const text = field === 'original' ? row.original_text : row.translated_text
        if (!text) continue
        quickMatches.push({
          blockId: row.id,
          fileId: row.file_id,
          fileName: row.file_name,
          lineIndex: row.line_index,
          text,
          matchStart: 0,
          matchEnd: Math.min(text.length, normalizedQuery.length || 1),
          field,
        })
      }
    }
    return quickMatches
  }

  let regex: RegExp | null = null
  if (options.useRegex) {
    try {
      regex = new RegExp(normalizedQuery, options.matchCase ? 'g' : 'gi')
    } catch {
      return []
    }
  }

  const isWordBoundary = (text: string, start: number, end: number): boolean => {
    if (!options.wholeWord) return true
    const before = start > 0 ? text[start - 1] : ' '
    const after = end < text.length ? text[end] : ' '
    const boundary = /[\s.,!?;:'"(){}\[\]<>/\\|-]/
    return boundary.test(before) && boundary.test(after)
  }

  for (const row of rawResults) {
    for (const field of selectedFields) {
      const text = field === 'original' ? row.original_text : row.translated_text
      if (!text) continue

      if (options.useRegex) {
        if (!regex) continue
        regex.lastIndex = 0
        const regexMatch = regex.exec(text)
        if (regexMatch) {
          const start = regexMatch.index
          const end = start + regexMatch[0].length
          if (isWordBoundary(text, start, end)) {
            matches.push({
              blockId: row.id,
              fileId: row.file_id,
              fileName: row.file_name,
              lineIndex: row.line_index,
              text,
              matchStart: start,
              matchEnd: end,
              field,
            })
          }
        }
      } else {
        const searchText = options.matchCase ? text : text.toLowerCase()
        const searchQuery = options.matchCase ? normalizedQuery : normalizedQuery.toLowerCase()
        const start = searchText.indexOf(searchQuery)
        if (start !== -1) {
          const end = start + normalizedQuery.length
          if (isWordBoundary(text, start, end)) {
            matches.push({
              blockId: row.id,
              fileId: row.file_id,
              fileName: row.file_name,
              lineIndex: row.line_index,
              text,
              matchStart: start,
              matchEnd: end,
              field,
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
    db.prepare('UPDATE translation_blocks SET original_text = ?, status = ? WHERE id = ?').run(newText, 'modified', blockId)
  } else {
    // Đánh dấu status = 'draft' nếu đang replace bản dịch
    db.prepare('UPDATE translation_blocks SET translated_text = ?, status = ? WHERE id = ?').run(newText, 'draft', blockId)
  }
}
