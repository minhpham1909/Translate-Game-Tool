import Database from 'better-sqlite3'
import { app } from 'electron'
import path from 'path'
import fs from 'fs-extra'

let globalDb: Database.Database | null = null

export function getGlobalDbPath(): string {
  const dbDir = path.join(app.getPath('userData'), 'db')
  fs.ensureDirSync(dbDir)
  return path.join(dbDir, 'global_assets.sqlite')
}

export function initGlobalDatabase(): Database.Database {
  if (globalDb) return globalDb

  globalDb = new Database(getGlobalDbPath())
  globalDb.pragma('journal_mode = WAL')
  globalDb.pragma('foreign_keys = ON')
  globalDb.pragma('cache_size = -4000')
  globalDb.pragma('synchronous = NORMAL')
  setupGlobalSchema(globalDb)

  return globalDb
}

export function getGlobalDatabase(): Database.Database {
  return initGlobalDatabase()
}

export function closeGlobalDatabase(): void {
  if (!globalDb) return
  try {
    globalDb.pragma('wal_checkpoint(TRUNCATE)')
    globalDb.close()
  } finally {
    globalDb = null
  }
}

function setupGlobalSchema(db: Database.Database): void {
  db.exec(`
    CREATE TABLE IF NOT EXISTS translation_memory (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      original_text TEXT UNIQUE NOT NULL,
      translated_text TEXT NOT NULL,
      usage_count INTEGER DEFAULT 1,
      last_used_at DATETIME DEFAULT CURRENT_TIMESTAMP
    );

    CREATE TABLE IF NOT EXISTS glossaries (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      source_text TEXT UNIQUE NOT NULL,
      target_text TEXT NOT NULL,
      notes TEXT,
      enabled INTEGER DEFAULT 1,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP
    );
  `)

  db.exec(`CREATE INDEX IF NOT EXISTS idx_global_tm_last_used ON translation_memory(last_used_at);`)
  db.exec(`CREATE INDEX IF NOT EXISTS idx_global_glossary_enabled ON glossaries(enabled);`)

  const glossaryInfo = db.prepare(`PRAGMA table_info(glossaries);`).all() as Array<{ name: string }>
  const hasGlossaryEnabled = glossaryInfo.some((col) => col.name === 'enabled')
  if (!hasGlossaryEnabled) {
    db.exec(`ALTER TABLE glossaries ADD COLUMN enabled INTEGER DEFAULT 1;`)
    db.exec(`UPDATE glossaries SET enabled = 1 WHERE enabled IS NULL;`)
  }
}

function tableExists(db: Database.Database, tableName: string): boolean {
  const row = db
    .prepare(`SELECT name FROM sqlite_master WHERE type = 'table' AND name = ?`)
    .get(tableName) as { name: string } | undefined

  return !!row
}

export function migrateLegacyGlobalAssets(projectDb: Database.Database): void {
  const db = getGlobalDatabase()

  const migrate = db.transaction(() => {
    if (tableExists(projectDb, 'translation_memory')) {
      const tmRows = projectDb
        .prepare(`
          SELECT original_text, translated_text, usage_count, last_used_at
          FROM translation_memory
          WHERE original_text IS NOT NULL AND translated_text IS NOT NULL
        `)
        .all() as Array<{
          original_text: string
          translated_text: string
          usage_count?: number
          last_used_at?: string
        }>

      const insertTM = db.prepare(`
        INSERT INTO translation_memory (original_text, translated_text, usage_count, last_used_at)
        VALUES (?, ?, ?, COALESCE(?, CURRENT_TIMESTAMP))
        ON CONFLICT(original_text) DO UPDATE SET
          translated_text = excluded.translated_text,
          usage_count = MAX(translation_memory.usage_count, excluded.usage_count),
          last_used_at = CURRENT_TIMESTAMP
      `)

      for (const row of tmRows) {
        insertTM.run(row.original_text, row.translated_text, row.usage_count ?? 1, row.last_used_at ?? null)
      }
    }

    if (tableExists(projectDb, 'glossaries')) {
      const hasEnabled = (projectDb.prepare(`PRAGMA table_info(glossaries);`).all() as Array<{ name: string }>)
        .some((col) => col.name === 'enabled')
      const glossaryRows = projectDb
        .prepare(`
          SELECT source_text, target_text, notes, ${hasEnabled ? 'enabled' : '1 as enabled'}, created_at
          FROM glossaries
          WHERE source_text IS NOT NULL AND target_text IS NOT NULL
        `)
        .all() as Array<{
          source_text: string
          target_text: string
          notes?: string | null
          enabled?: number
          created_at?: string
        }>

      const insertGlossary = db.prepare(`
        INSERT INTO glossaries (source_text, target_text, notes, enabled, created_at)
        VALUES (?, ?, ?, ?, COALESCE(?, CURRENT_TIMESTAMP))
        ON CONFLICT(source_text) DO NOTHING
      `)

      for (const row of glossaryRows) {
        insertGlossary.run(row.source_text, row.target_text, row.notes ?? null, row.enabled ?? 1, row.created_at ?? null)
      }
    }
  })

  migrate()
}

export function upsertGlobalTM(originalText: string, translatedText: string): void {
  const original = originalText.trim()
  const translated = translatedText.trim()
  if (!original || !translated) return

  getGlobalDatabase()
    .prepare(`
      INSERT INTO translation_memory (original_text, translated_text, usage_count, last_used_at)
      VALUES (?, ?, 1, CURRENT_TIMESTAMP)
      ON CONFLICT(original_text) DO UPDATE SET
        translated_text = excluded.translated_text,
        usage_count = translation_memory.usage_count + 1,
        last_used_at = CURRENT_TIMESTAMP
    `)
    .run(originalText, translatedText)
}

export function findGlobalTMExact(originalText: string): string | null {
  const row = getGlobalDatabase()
    .prepare(`SELECT translated_text FROM translation_memory WHERE original_text = ?`)
    .get(originalText) as { translated_text: string } | undefined

  if (!row?.translated_text) return null

  getGlobalDatabase()
    .prepare(`UPDATE translation_memory SET usage_count = usage_count + 1, last_used_at = CURRENT_TIMESTAMP WHERE original_text = ?`)
    .run(originalText)

  return row.translated_text
}
