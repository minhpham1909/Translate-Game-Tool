import Database from 'better-sqlite3'
import { app } from 'electron'
import path from 'path'
import fs from 'fs-extra'

let db: Database.Database | null = null

/**
 * Khởi tạo Database SQLite.
 * Được lưu trong thư mục userData của Electron để đảm bảo dữ liệu
 * không bị mất khi ứng dụng update.
 */
export function initDatabase(): Database.Database {
  if (db) return db

  // Lấy đường dẫn an toàn để lưu data: C:\Users\<User>\AppData\Roaming\<App_Name>
  const userDataPath = app.getPath('userData')
  const dbDir = path.join(userDataPath, 'db')

  // Đảm bảo thư mục lưu trữ tồn tại
  fs.ensureDirSync(dbDir)

  const dbPath = path.join(dbDir, 'translation_project.sqlite')
  console.log(`[System] userData: ${userDataPath}`)
  console.log(`[System] dbPath: ${dbPath}`)

  // Khởi tạo DB
  db = new Database(dbPath, {
    // Uncomment dòng dưới nếu muốn debug log query ra console
    // verbose: console.log
  })

  // Bật tính năng WAL để tăng performance I/O
  db.pragma('journal_mode = WAL')
  // Bật Foreign Keys
  db.pragma('foreign_keys = ON')

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

    // 4. Bảng ảo blocks_fts: Phục vụ tính năng Full-Text Search
    db.exec(`
      CREATE VIRTUAL TABLE IF NOT EXISTS blocks_fts USING fts5(
        original_text,
        translated_text,
        content='translation_blocks',
        content_rowid='id'
      );
    `)

    // 5. Triggers: Tự động đồng bộ từ translation_blocks sang blocks_fts
    db.exec(`
      CREATE TRIGGER IF NOT EXISTS tbl_ai_after_insert AFTER INSERT ON translation_blocks BEGIN
        INSERT INTO blocks_fts(rowid, original_text, translated_text)
        VALUES (new.id, new.original_text, new.translated_text);
      END;
    `)

    db.exec(`
      CREATE TRIGGER IF NOT EXISTS tbl_ai_after_update AFTER UPDATE ON translation_blocks BEGIN
        UPDATE blocks_fts
        SET original_text = new.original_text, translated_text = new.translated_text
        WHERE rowid = old.id;
      END;
    `)

    db.exec(`
      CREATE TRIGGER IF NOT EXISTS tbl_ai_after_delete AFTER DELETE ON translation_blocks BEGIN
        INSERT INTO blocks_fts(blocks_fts, rowid, original_text, translated_text)
        VALUES('delete', old.id, old.original_text, old.translated_text);
      END;
    `)

    // 6. Bảng glossaries: Quản lý từ điển thuật ngữ
    db.exec(`
      CREATE TABLE IF NOT EXISTS glossaries (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        source_text TEXT UNIQUE NOT NULL,
        target_text TEXT NOT NULL,
        notes TEXT,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP
      );
    `)

    // MIGRATION CHECK: Đảm bảo bảng translation_blocks có cột translated_by
    const tableInfo = db.prepare(`PRAGMA table_info(translation_blocks);`).all() as any[];
    const hasTranslatedBy = tableInfo.some(col => col.name === 'translated_by');
    if (!hasTranslatedBy) {
      db.exec(`ALTER TABLE translation_blocks ADD COLUMN translated_by TEXT DEFAULT 'none';`);
    }
  })

  // Thực thi Transaction
  initTransaction()
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
