import { dialog, ipcMain } from 'electron'
import { scanAvailableLanguages, setupProject, getCurrentProject, getRecentProjects, openProject } from './api/projectIpc'
import { getAllGlossaries, addGlossary, updateGlossary, deleteGlossary, setGlossaryEnabled } from './services/glossaryService'
import { getTMEntries, deleteTMEntry, clearUnusedTM, searchTM } from './services/tmService'
import { searchBlocks, replaceBlockText, type SearchOptions } from './services/searchService'
import { getWorkspaceFiles, getBlocksByFile, updateBlockTranslation } from './services/workspaceService'
import { preFlightAnalyzer, startQueue, stopQueue, translateBatchByBlockIds } from './services/translationEngine'
import { parseProjectDiff, previewDiff } from './services/parserService'
import { AIService } from './api/aiService'
import { getSettings, saveSettings } from './store/settings'
import { getDatabase, rebuildFtsTable } from './store/database'
import { scanCompiledFiles, runUnpacker, installUnpackerDeps } from './services/unpackerService'
import { exportAllFiles, exportSelectedFiles, getFilesWithChanges, listBackups, restoreFileBackup } from './services/exportService'
import type { AppSettings, ProjectConfig } from '../shared/types'

export function registerIpcHandlers(): void {
  // --- Project & Settings ---
  ipcMain.handle('project:scanLanguages', async (_, gamePath: string) => {
    return await scanAvailableLanguages(gamePath)
  })

  ipcMain.handle('project:setup', async (_, config: ProjectConfig, forceReparse?: boolean) => {
    await setupProject(config, forceReparse ?? false)
  })

  ipcMain.handle('project:open', async (_, config: ProjectConfig) => {
    await openProject(config)
  })

  ipcMain.handle('project:getCurrent', () => {
    return getCurrentProject()
  })

  ipcMain.handle('project:getRecent', () => {
    return getRecentProjects()
  })

  ipcMain.handle('project:selectFolder', async () => {
    const result = await dialog.showOpenDialog({
      properties: ['openDirectory']
    })
    if (result.canceled) return null
    return result.filePaths[0] ?? null
  })

  ipcMain.handle('settings:selectDbFolder', async () => {
    const result = await dialog.showOpenDialog({
      title: 'Chọn thư mục lưu database SQLite',
      properties: ['openDirectory', 'createDirectory']
    })
    if (result.canceled) return null
    return result.filePaths[0] ?? null
  })

  ipcMain.handle('project:scanCompiled', async (_, gameDir: string) => {
    return await scanCompiledFiles(gameDir)
  })

  ipcMain.handle('project:unpackGame', async (_, gameDir: string, mode?: 'extract' | 'decompile' | 'auto') => {
    return await runUnpacker(gameDir, { mode })
  })

  ipcMain.handle('project:installUnpackerDeps', async () => {
    return await installUnpackerDeps()
  })

  ipcMain.handle('project:previewDiff', async (_, newGameDir: string, sourceLanguage: string) => {
    return await previewDiff(newGameDir, sourceLanguage)
  })

  ipcMain.handle('project:updateGame', async (_, newGameDir: string, sourceLanguage: string) => {
    return await parseProjectDiff(newGameDir, sourceLanguage)
  })

  // --- Settings ---
  ipcMain.handle('settings:get', () => {
    return getSettings()
  })

  ipcMain.handle('settings:save', (_, partial: Partial<AppSettings>) => {
    return saveSettings(partial)
  })

  ipcMain.handle('settings:testConnection', async () => {
    try {
      await AIService.testConnection()
      return { ok: true }
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : String(err)
      return { ok: false, error: message }
    }
  })

  ipcMain.handle('settings:listModels', async (_, provider?: string) => {
    return AIService.listModels(provider)
  })

  // --- Glossary ---
  ipcMain.handle('glossary:getAll', () => {
    return getAllGlossaries()
  })

  ipcMain.handle('glossary:add', (_, entry: { source_text: string; target_text: string; notes?: string }) => {
    return addGlossary(entry)
  })

  ipcMain.handle('glossary:update', (_, id: number, entry: { source_text: string; target_text: string; notes?: string }) => {
    return updateGlossary(id, entry)
  })

  ipcMain.handle('glossary:delete', (_, id: number) => {
    return deleteGlossary(id)
  })

  ipcMain.handle('glossary:setEnabled', (_, ids: number[], enabled: boolean) => {
    return setGlossaryEnabled(ids, enabled)
  })

  // --- Translation Memory ---
  ipcMain.handle('tm:getAll', () => {
    return getTMEntries()
  })

  ipcMain.handle('tm:delete', (_, id: number) => {
    return deleteTMEntry(id)
  })

  ipcMain.handle('tm:clearUnused', () => {
    return clearUnusedTM()
  })

  ipcMain.handle('tm:search', (_, query: string) => {
    return searchTM(query)
  })

  // --- Search & Replace ---
  ipcMain.handle('search:searchBlocks', (_, query: string, options: SearchOptions) => {
    return searchBlocks(query, options)
  })

  ipcMain.handle('search:replaceBlockText', (_, blockId: number, newText: string, isOriginal: boolean) => {
    return replaceBlockText(blockId, newText, isOriginal)
  })

  // --- Workspace (Phase 4E) ---
  ipcMain.handle('workspace:getFiles', () => {
    return getWorkspaceFiles()
  })

  ipcMain.handle('workspace:getBlocks', (_, fileId: number) => {
    return getBlocksByFile(fileId)
  })

  ipcMain.handle('workspace:updateBlock', (_, blockId: number, text: string | null, status: string) => {
    try {
      return updateBlockTranslation(blockId, text, status)
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : String(err)
      if (message.includes('SQLITE_CORRUPT') || message.includes('database disk image is malformed')) {
        console.warn('[IPC] FTS corruption detected, rebuilding and retrying...')
        rebuildFtsTable()
        return updateBlockTranslation(blockId, text, status)
      }
      throw err
    }
  })

  ipcMain.handle('workspace:batchApprove', async (_, blockIds: number[]) => {
    const db = getDatabase()
    const stmt = db.prepare(`UPDATE translation_blocks SET status = 'approved' WHERE id = ?`)
    const updateMany = db.transaction((ids: number[]) => {
      for (const id of ids) {
        stmt.run(id)
      }
    })
    try {
      updateMany(blockIds)
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : String(err)
      if (message.includes('SQLITE_CORRUPT') || message.includes('database disk image is malformed')) {
        console.warn('[IPC] FTS corruption detected, rebuilding and retrying...')
        rebuildFtsTable()
        updateMany(blockIds)
      } else {
        throw err
      }
    }
  })

  // --- Engine (AI Translation) ---
  ipcMain.handle('engine:preflight', (_, fileId?: number) => {
    return preFlightAnalyzer(fileId)
  })

  ipcMain.handle('engine:translateBatch', async (_, blockIds: number[]) => {
    try {
      return await translateBatchByBlockIds(blockIds)
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : String(err)
      if (message.includes('SQLITE_CORRUPT') || message.includes('database disk image is malformed')) {
        console.warn('[IPC] FTS corruption detected, rebuilding and retrying...')
        rebuildFtsTable()
        return await translateBatchByBlockIds(blockIds)
      }
      throw err
    }
  })

  ipcMain.handle('engine:startQueue', (_, options?: { fileId?: number }) => {
    return startQueue(options)
  })

  ipcMain.handle('engine:stopQueue', () => {
    return stopQueue()
  })

  // --- Export ---
  ipcMain.handle('export:getFilesWithChanges', () => {
    return getFilesWithChanges()
  })

  ipcMain.handle('export:exportAll', async (_, approvedOnly: boolean) => {
    return await exportAllFiles(approvedOnly)
  })

  ipcMain.handle('export:exportSelected', async (_, fileIds: number[], approvedOnly: boolean) => {
    return await exportSelectedFiles(fileIds, approvedOnly)
  })

  ipcMain.handle('export:listBackups', async () => {
    return await listBackups()
  })

  ipcMain.handle('export:restoreBackup', async (_, fileId: number, backupPath: string) => {
    await restoreFileBackup(fileId, backupPath)
  })
}
