import Database from 'better-sqlite3'
import { app } from 'electron'
import path from 'path'
import fs from 'fs-extra'
import { getCustomDbFolder } from './settings'

let db: Database.Database | null = null
let activeDbPath: string | null = null

/**
 * Lấy tên folder game từ đường dẫn, dùng để đặt tên file DB.
 * VD: D:\Games\ABC\game → ABC
 */
function getGameFolderName(gameFolderPath: string): string {
  // Normalize path
  const normalized = gameFolderPath.replace(/[/\\]+$/, '')
  const base = path.basename(normalized)

  // Nếu folder là "game", lấy folder cha (thường là tên game)
  if (base.toLowerCase() === 'game') {
    const parent = path.basename(path.dirname(normalized))
    return sanitizeFolderName(parent) || 'default'
  }

  return sanitizeFolderName(base) || 'default'
}

/**
 * Làm sạch tên folder để dùng làm tên file (loại ký tự đặc biệt).
 */
function sanitizeFolderName(name: string): string {
  return name.replace(/[^a-zA-Z0-9À-ỹà-ỹ\s_-]/g, '').trim().replace(/\s+/g, '_')
}

/**
 * Tạo đường dẫn DB an toàn, xử lý xung đột tên.
 * VD: customDir/vnt_ABC.sqlite, nếu tồn tại → vnt_ABC_2.sqlite
 */
function resolveDbPath(gameName: string): string {
  const customFolder = getCustomDbFolder()

  let dbDir: string
  if (customFolder && fs.existsSync(customFolder)) {
    dbDir = customFolder
  } else {
    // Fallback: userData/db
    dbDir = path.join(app.getPath('userData'), 'db')
  }

  fs.ensureDirSync(dbDir)

  const baseName = `vnt_${gameName}`
  let candidate = path.join(dbDir, `${baseName}.sqlite`)

  // Handle collision
  let counter = 2
  while (fs.existsSync(candidate)) {
    candidate = path.join(dbDir, `${baseName}_${counter}.sqlite`)
    counter++
  }

  return candidate
}

/**
 * Lấy đường dẫn file DB đang active (cho mục đích debug/hiển thị)
 */
export function getActiveDbPath(): string | null {
  return activeDbPath
}

/**
 * Khởi tạo Database SQLite.
 * Nếu có gameFolderPath, file sẽ được đặt tên theo tên game: vnt_<GameName>.sqlite
 * Nếu không, dùng file default: translation_project.sqlite
 * Hỗ trợ custom folder qua Settings.
 */
export function initDatabase(gameFolderPath?: string): Database.Database {
  if (db) return db

  let dbPath: string

  if (gameFolderPath) {
    const gameName = getGameFolderName(gameFolderPath)
    dbPath = resolveDbPath(gameName)
    console.log(`[System] Per-project DB: vnt_${gameName}.sqlite → ${dbPath}`)
  } else {
    // Fallback: dùng file default (backward compatibility)
    const dbDir = path.join(app.getPath('userData'), 'db')
    fs.ensureDirSync(dbDir)
    dbPath = path.join(dbDir, 'translation_project.sqlite')
    console.log(`[System] Default DB: ${dbPath}`)
  }

  activeDbPath = dbPath

  // Clean up stale WAL/SHM files if main DB is missing
  if (!fs.existsSync(dbPath)) {
    fs.removeSync(dbPath + '-wal')
    fs.removeSync(dbPath + '-shm')
  }

  // Khởi tạo DB
  db = new Database(dbPath, {
    // Uncomment dòng dưới nếu muốn debug log query ra console
    // verbose: console.log
  })

  // Bật tính năng WAL để tăng performance I/O
  db.pragma('journal_mode = WAL')
  // Bật Foreign Keys
  db.pragma('foreign_keys = ON')
  // Tăng cache để giảm I/O
  db.pragma('cache_size = -4000')
  db.pragma('synchronous = NORMAL')

  // Check integrity on startup
  try {
    const integrity = db.pragma('integrity_check', { simple: true }) as string
    if (integrity !== 'ok') {
      console.warn('[Database] Integrity check failed:', integrity)
      db.exec('VACUUM')
    }
  } catch (err) {
    console.error('[Database] Integrity check error:', err)
  }

  // Thiết lập Schema
  setupSchema(db)

  return db
}

/**
 * Thiết lập Schema cho Database nếu các bảng chưa tồn tại
 */
function setupSchema(db: Database.Database): void {
  // Dùng transaction để đảm bảo tạo toàn bộ schema một cách nguyên vẹn (atomically)
  const initTransaction = db.transaction(() => {

    // 1. Bảng files: Quản lý danh sách file rpy
    db.exec(`
      CREATE TABLE IF NOT EXISTS files (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        file_path TEXT UNIQUE NOT NULL,
        file_name TEXT NOT NULL,
        total_blocks INTEGER DEFAULT 0,
        translated_blocks INTEGER DEFAULT 0,
        status TEXT DEFAULT 'pending',
        updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
      );
    `)
    db.exec(`CREATE INDEX IF NOT EXISTS idx_files_status ON files(status);`)

    // 2. Bảng translation_blocks: Lưu trữ toàn bộ câu text
    db.exec(`
      CREATE TABLE IF NOT EXISTS translation_blocks (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        file_id INTEGER NOT NULL,
        block_hash TEXT NOT NULL,
        block_type TEXT NOT NULL,
        character_id TEXT,
        original_text TEXT NOT NULL,
        translated_text TEXT,
        status TEXT DEFAULT 'empty',
        indentation TEXT NOT NULL,
        line_index INTEGER NOT NULL,
        FOREIGN KEY (file_id) REFERENCES files (id) ON DELETE CASCADE
      );
    `)
    db.exec(`CREATE INDEX IF NOT EXISTS idx_blocks_file_id ON translation_blocks(file_id);`)
    db.exec(`CREATE INDEX IF NOT EXISTS idx_blocks_status ON translation_blocks(status);`)
    db.exec(`CREATE INDEX IF NOT EXISTS idx_blocks_character ON translation_blocks(character_id);`)

    // 3. Bảng translation_memory: Lưu lịch sử dịch để cache
    db.exec(`
      CREATE TABLE IF NOT EXISTS translation_memory (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        original_text TEXT UNIQUE NOT NULL,
        translated_text TEXT NOT NULL,
        usage_count INTEGER DEFAULT 1,
        last_used_at DATETIME DEFAULT CURRENT_TIMESTAMP
      );
    `)

    // 5. Bảng glossaries: Quản lý từ điển thuật ngữ
    db.exec(`
      CREATE TABLE IF NOT EXISTS glossaries (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        source_text TEXT UNIQUE NOT NULL,
        target_text TEXT NOT NULL,
        notes TEXT,
        enabled INTEGER DEFAULT 1,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP
      );
    `)

    // MIGRATION CHECK: Đảm bảo bảng translation_blocks có cột translated_by
    const tableInfo = db.prepare(`PRAGMA table_info(translation_blocks);`).all() as any[];
    const hasTranslatedBy = tableInfo.some(col => col.name === 'translated_by');
    if (!hasTranslatedBy) {
      db.exec(`ALTER TABLE translation_blocks ADD COLUMN translated_by TEXT DEFAULT 'none';`);
    }

    const glossaryInfo = db.prepare(`PRAGMA table_info(glossaries);`).all() as any[];
    const hasGlossaryEnabled = glossaryInfo.some(col => col.name === 'enabled');
    if (!hasGlossaryEnabled) {
      db.exec(`ALTER TABLE glossaries ADD COLUMN enabled INTEGER DEFAULT 1;`);
      db.exec(`UPDATE glossaries SET enabled = 1 WHERE enabled IS NULL;`);
    }
  })

  // Thực thi Transaction
  initTransaction()
}

/**
 * FTS5 virtual table has been removed to avoid corruption issues.
 * Search functionality now uses LIKE/GLOB queries on translation_blocks directly.
 * This function is kept for backward compatibility with IPC handlers.
 */
export function rebuildFtsTable(): void {
  // No-op: FTS table removed. If old DB has blocks_fts, clean it up.
  if (!db) return
  try {
    db.exec('DROP TABLE IF EXISTS blocks_fts;')
    db.exec('DROP TRIGGER IF EXISTS tbl_ai_after_insert;')
    db.exec('DROP TRIGGER IF EXISTS tbl_ai_after_update;')
    db.exec('DROP TRIGGER IF EXISTS tbl_ai_after_delete;')
    console.log('[Database] Cleaned up legacy FTS artifacts.')
  } catch (err) {
    console.error('[Database] Error cleaning up FTS artifacts:', err)
  }
}

/**
 * Lấy instance của Database
 */
export function getDatabase(): Database.Database {
  if (!db) {
    throw new Error('Database chưa được khởi tạo. Cần gọi initDatabase() trước.')
  }
  return db
}

/**
 * Đóng kết nối Database khi tắt app
 */
export function closeDatabase(): void {
  if (db) {
    db.close()
    db = null
  }
}
