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
export function getGameFolderName(gameFolderPath: string): string {
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
export function resolveDbPath(gameName: string): string {
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
 * Tìm đường dẫn file DB thực tế cho gameName (không tạo mới).
 * Quét các file vnt_{gameName}.sqlite, vnt_{gameName}_2.sqlite, ...
 */
/**
 * Tìm đường dẫn file DB thực tế cho gameName (không tạo mới).
 * CHỈ quét các file vnt_{gameName}.sqlite, vnt_{gameName}_2.sqlite, ...
 * TUYỆT ĐỐI KHÔNG dùng fallback translation_project.sqlite để tránh lỗi chéo DB (Crossover).
 */
export function findExistingDbPath(gameName: string): string | null {
  const customFolder = getCustomDbFolder()

  let dbDir: string
  if (customFolder && fs.existsSync(customFolder)) {
    dbDir = customFolder
  } else {
    dbDir = path.join(app.getPath('userData'), 'db')
  }

  const baseName = `vnt_${gameName}`

  // STRICT IDENTITY: Only look for files matching this specific game's base name
  const candidates = [
    path.join(dbDir, `${baseName}.sqlite`)
  ]

  // Handle collision variants (_2, _3, etc.)
  for (let i = 2; i <= 10; i++) {
    candidates.push(path.join(dbDir, `${baseName}_${i}.sqlite`))
  }

  for (const candidate of candidates) {
    if (fs.existsSync(candidate)) {
      return candidate
    }
  }

  return null
}

/**
 * Khởi tạo Database SQLite.
 * Nếu có gameFolderPath, file sẽ được đặt tên theo tên game: vnt_<GameName>.sqlite
 * Nếu không, dùng file default: translation_project.sqlite
 * Hỗ trợ custom folder qua Settings.
 * QUAN TRỌNG: Tìm DB đã tồn tại trước, CHỈ tạo mới nếu chưa có.
 */
export function initDatabase(gameFolderPath?: string): Database.Database {
  // Nếu đã init rồi, kiểm tra xem có cần chuyển sang per-project DB khác không
  if (db) {
    if (gameFolderPath) {
      const gameName = getGameFolderName(gameFolderPath)
      const expectedPath = findExistingDbPath(gameName) || resolveDbPath(gameName)
      if (expectedPath !== activeDbPath) {
        // Đang mở sai DB (ví dụ: default DB khi app startup) → đóng và mở per-project DB
        closeDatabase()
      } else {
        return db
      }
    } else {
      return db
    }
  }

  let dbPath: string

  if (gameFolderPath) {
    const gameName = getGameFolderName(gameFolderPath)
    // Tìm DB đã tồn tại trước (khi reopen project)
    const existing = findExistingDbPath(gameName)
    if (existing) {
      dbPath = existing
      console.log(`[System] Found existing DB: ${dbPath}`)
    } else {
      dbPath = resolveDbPath(gameName)
      console.log(`[System] Per-project DB: vnt_${gameName}.sqlite → ${dbPath}`)
    }
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

    // Translation memory and glossaries live in global_assets.sqlite.

    // MIGRATION CHECK: Đảm bảo bảng translation_blocks có cột translated_by
    const tableInfo = db.prepare(`PRAGMA table_info(translation_blocks);`).all() as Array<{ name: string }>;
    const hasTranslatedBy = tableInfo.some(col => col.name === 'translated_by');
    if (!hasTranslatedBy) {
      db.exec(`ALTER TABLE translation_blocks ADD COLUMN translated_by TEXT DEFAULT 'none';`);
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
 * PHẢI dùng wal_checkpoint(TRUNCATE) để force WAL merge trước khi đóng
 */
export function closeDatabase(): void {
  if (db) {
    try {
      db.pragma('wal_checkpoint(TRUNCATE)') // Force WAL to merge before closing
      db.close()
      db = null
      activeDbPath = null
      console.log(`[System] Database closed`)
    } catch (err) {
      console.error('[System] Failed to close database:', err)
    }
  }
}

/**
 * Orphaned Tasks Recovery (Startup Cleanup)
 * Reset các block bị kẹt ở status 'translating' hoặc 'in_progress' do app crash
 * Gọi khi load project hoặc init database
 */
export function recoverOrphanedTasks(): void {
  if (!db) return
  try {
    const result = db.prepare(`
      UPDATE translation_blocks 
      SET status = 'empty', translated_by = 'recovered'
      WHERE status = 'translating' OR status = 'in_progress'
    `).run()
    if (result.changes > 0) {
      console.log(`[System] Recovered ${result.changes} orphaned block(s) from crashed translation`)
    }
  } catch (err) {
    console.error('[System] Failed to recover orphaned tasks:', err)
  }
}

/**
 * Vacuum Database (Preventing Bloat)
 * Gọi sau khi xóa project để reclaim disk space
 */
export function vacuumDatabase(): void {
  if (!db) return
  try {
    db.exec('VACUUM')
    console.log('[System] Database vacuumed successfully')
  } catch (err) {
    console.error('[System] Failed to vacuum database:', err)
  }
}

/**
 * Sync files table progress counters from actual translation_blocks data.
 * Đồng bộ total_blocks và translated_blocks để UI progress không bị 0%.
 * Gọi sau mỗi lần parse hoặc load DB.
 */
export function syncAllFilesProgress(): void {
  if (!db) return
  try {
    const syncQuery = `
      UPDATE files
      SET
        total_blocks = (
          SELECT COUNT(*)
          FROM translation_blocks
          WHERE translation_blocks.file_id = files.id
        ),
        translated_blocks = (
          SELECT COUNT(*)
          FROM translation_blocks
          WHERE translation_blocks.file_id = files.id
          AND status IN ('approved', 'draft', 'modified')
        )
    `
    db.prepare(syncQuery).run()
    console.log('[DB] Synced files progress counters')
  } catch (err) {
    console.error('[DB] Failed to sync files progress:', err)
  }
}
