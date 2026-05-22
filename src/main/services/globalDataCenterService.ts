import fs from 'fs-extra'
import path from 'path'
import { closeGlobalDatabase, getGlobalDatabase, getGlobalDbPath, initGlobalDatabase } from '../store/globalDb'

export type GlobalDataScope = 'tm' | 'glossary' | 'all'

export interface GlobalDataStats {
  tmCount: number
  glossaryCount: number
  snapshots: number
  latestSnapshot: string | null
}

export interface ClearGlobalDataOptions {
  scope: GlobalDataScope
  mode: 'all' | 'unused' | 'older_than_days'
  olderThanDays?: number
}

function getSnapshotDir(): string {
  const dbPath = getGlobalDbPath()
  return path.join(path.dirname(dbPath), 'snapshots')
}

function makeSnapshotName(): string {
  const ts = new Date().toISOString().replace(/[.:]/g, '-')
  return `global_assets_snapshot_${ts}.sqlite`
}

export async function createGlobalDataSnapshot(): Promise<string> {
  const sourceDb = getGlobalDbPath()
  const snapshotDir = getSnapshotDir()
  await fs.ensureDir(snapshotDir)

  closeGlobalDatabase()
  const destination = path.join(snapshotDir, makeSnapshotName())
  await fs.copy(sourceDb, destination, { overwrite: false, errorOnExist: true })
  initGlobalDatabase()

  return destination
}

export async function listGlobalDataSnapshots(): Promise<string[]> {
  const snapshotDir = getSnapshotDir()
  if (!(await fs.pathExists(snapshotDir))) return []

  const files = await fs.readdir(snapshotDir)
  const absolute = files
    .filter((file) => file.endsWith('.sqlite') && file.startsWith('global_assets_snapshot_'))
    .map((file) => path.join(snapshotDir, file))

  absolute.sort((a, b) => b.localeCompare(a))
  return absolute
}

export async function restoreLatestGlobalDataSnapshot(): Promise<{ restored: boolean; snapshotPath: string | null }> {
  const snapshots = await listGlobalDataSnapshots()
  const latest = snapshots[0]
  if (!latest) return { restored: false, snapshotPath: null }

  const targetDbPath = getGlobalDbPath()
  closeGlobalDatabase()
  await fs.copy(latest, targetDbPath, { overwrite: true })
  initGlobalDatabase()

  return { restored: true, snapshotPath: latest }
}

export function getGlobalDataStats(): GlobalDataStats {
  const db = getGlobalDatabase()
  const tmRow = db.prepare('SELECT COUNT(*) as cnt FROM translation_memory').get() as { cnt: number }
  const glossaryRow = db.prepare('SELECT COUNT(*) as cnt FROM glossaries').get() as { cnt: number }

  return {
    tmCount: tmRow.cnt ?? 0,
    glossaryCount: glossaryRow.cnt ?? 0,
    snapshots: 0,
    latestSnapshot: null,
  }
}

export async function clearGlobalDataWithSnapshot(options: ClearGlobalDataOptions): Promise<{ deletedRows: number; snapshotPath: string }> {
  const snapshotPath = await createGlobalDataSnapshot()
  const db = getGlobalDatabase()
  let deletedRows = 0

  const cutoffIso = (): string => {
    const days = Math.max(1, options.olderThanDays ?? 30)
    const dt = new Date(Date.now() - days * 24 * 60 * 60 * 1000)
    return dt.toISOString().slice(0, 19).replace('T', ' ')
  }

  if (options.scope === 'tm' || options.scope === 'all') {
    if (options.mode === 'unused') {
      const result = db.prepare('DELETE FROM translation_memory WHERE usage_count <= 1').run()
      deletedRows += result.changes
    } else if (options.mode === 'older_than_days') {
      const result = db.prepare('DELETE FROM translation_memory WHERE last_used_at < ?').run(cutoffIso())
      deletedRows += result.changes
    } else {
      const result = db.prepare('DELETE FROM translation_memory').run()
      deletedRows += result.changes
    }
  }

  if (options.scope === 'glossary' || options.scope === 'all') {
    if (options.mode === 'older_than_days') {
      const result = db.prepare('DELETE FROM glossaries WHERE created_at < ?').run(cutoffIso())
      deletedRows += result.changes
    } else {
      const result = db.prepare('DELETE FROM glossaries').run()
      deletedRows += result.changes
    }
  }

  return { deletedRows, snapshotPath }
}
