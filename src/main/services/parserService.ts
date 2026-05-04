import fs from 'fs-extra'
import path from 'path'
import { parseRpyFile, importRpyToDatabase } from '../parser/rpyParser'
import { getDatabase } from '../store/database'

/**
 * Lấy tất cả các file có đuôi mở rộng chỉ định trong một thư mục (đệ quy)
 */
async function getAllFiles(dir: string, ext: string): Promise<string[]> {
  let results: string[] = []
  const targetExt = ext.toLowerCase()

  try {
    const list = await fs.readdir(dir, { withFileTypes: true })
    for (const item of list) {
      const fullPath = path.join(dir, item.name)
      if (item.isDirectory()) {
        results = results.concat(await getAllFiles(fullPath, ext))
      } else if (item.name.toLowerCase().endsWith(targetExt)) {
        results.push(fullPath)
      }
    }
  } catch (error) {
    console.error(`Failed to scan directory ${dir}:`, error)
  }

  return results
}

function resetWorkspaceTables(): void {
  const db = getDatabase()
  db.exec('DELETE FROM translation_blocks;')
  db.exec('DELETE FROM files;')

  try {
    db.exec("INSERT INTO blocks_fts(blocks_fts) VALUES('rebuild');")
  } catch (err) {
    console.warn('[ParserService] Rebuilding FTS table due to error:', err)
    db.exec('DROP TRIGGER IF EXISTS tbl_ai_after_insert;')
    db.exec('DROP TRIGGER IF EXISTS tbl_ai_after_update;')
    db.exec('DROP TRIGGER IF EXISTS tbl_ai_after_delete;')
    db.exec('DROP TABLE IF EXISTS blocks_fts;')
    db.exec(`
      CREATE VIRTUAL TABLE blocks_fts USING fts5(
        original_text,
        translated_text,
        content='translation_blocks',
        content_rowid='id'
      );
    `)
    db.exec(`
      CREATE TRIGGER tbl_ai_after_insert AFTER INSERT ON translation_blocks BEGIN
        INSERT INTO blocks_fts(rowid, original_text, translated_text)
        VALUES (new.id, new.original_text, new.translated_text);
      END;
    `)
    db.exec(`
      CREATE TRIGGER tbl_ai_after_update AFTER UPDATE ON translation_blocks BEGIN
        UPDATE blocks_fts
        SET original_text = new.original_text, translated_text = new.translated_text
        WHERE rowid = old.id;
      END;
    `)
    db.exec(`
      CREATE TRIGGER tbl_ai_after_delete AFTER DELETE ON translation_blocks BEGIN
        INSERT INTO blocks_fts(blocks_fts, rowid, original_text, translated_text)
        VALUES('delete', old.id, old.original_text, old.translated_text);
      END;
    `)
  }
}

/**
 * Bắt đầu quá trình parse toàn bộ project
 * @param gameFolderPath Đường dẫn tuyệt đối đến game/
 * @param sourceLanguage Ngôn ngữ nguồn (vd: english)
 */
export async function parseProject(gameFolderPath: string, sourceLanguage: string): Promise<void> {
  const targetDir = path.join(gameFolderPath, 'tl', sourceLanguage)

  const exists = await fs.pathExists(targetDir)
  if (!exists) {
    throw new Error(`Thư mục ngôn ngữ không tồn tại: ${targetDir}`)
  }

  // Reset workspace tables before importing
  resetWorkspaceTables()

  // Lấy tất cả các file .rpy
  const rpyFiles = await getAllFiles(targetDir, '.rpy')
  if (rpyFiles.length === 0) {
    throw new Error(`Không tìm thấy file .rpy nào trong thư mục ${targetDir}`)
  }

  console.log(`[ParserService] Target dir: ${targetDir}`)
  console.log(`[ParserService] Found ${rpyFiles.length} files. Parsing...`)

  // Parse và Import từng file
  let processedFiles = 0
  let totalBlocks = 0
  for (const filePath of rpyFiles) {
    try {
      // Đường dẫn tương đối dùng để hiển thị (vd: script.rpy hoặc route1/script.rpy)
      const relativePath = path.relative(targetDir, filePath)

      const parseResult = await parseRpyFile(filePath, relativePath)

      // Import vào DB nếu file có dữ liệu (có blocks hoặc file rỗng thì tạo record rỗng)
      importRpyToDatabase(parseResult)
      totalBlocks += parseResult.blocks.length

      processedFiles++
      // TODO: Có thể bắn event IPC ra renderer để show progress bar nếu cần
    } catch (error) {
      console.error(`[ParserService] Failed to parse file ${filePath}:`, error)
    }
  }

  console.log(`[ParserService] Parse complete ${processedFiles}/${rpyFiles.length} files. Total blocks=${totalBlocks}`)
  if (processedFiles === 0) {
    throw new Error('No .rpy files could be parsed. Check logs for details.')
  }
}
