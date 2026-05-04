import { dialog, ipcMain } from 'electron'
import { scanAvailableLanguages, setupProject, getCurrentProject, getRecentProjects } from './api/projectIpc'
import { getAllGlossaries, addGlossary, updateGlossary, deleteGlossary } from './services/glossaryService'
import { getTMEntries, deleteTMEntry, clearUnusedTM, searchTM } from './services/tmService'
import { searchBlocks, replaceBlockText, type SearchOptions } from './services/searchService'
import { getWorkspaceFiles, getBlocksByFile, updateBlockTranslation } from './services/workspaceService'
import { preFlightAnalyzer, startQueue, stopQueue, translateBatchByBlockIds } from './services/translationEngine'
import { AIService } from './api/aiService'
import { getSettings, saveSettings } from './store/settings'
import type { AppSettings, ProjectConfig } from '../shared/types'

export function registerIpcHandlers(): void {
  // --- Project & Settings ---
  ipcMain.handle('project:scanLanguages', async (_, gamePath: string) => {
    return await scanAvailableLanguages(gamePath)
  })

  ipcMain.handle('project:setup', (_, config: ProjectConfig) => {
    return setupProject(config)
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

  // --- Settings ---
  ipcMain.handle('settings:get', () => {
    return getSettings()
  })

  ipcMain.handle('settings:save', (_, partial: Partial<AppSettings>) => {
    return saveSettings(partial)
  })

  ipcMain.handle('settings:testConnection', async () => {
    try {
      await AIService.translateBatch(['ping'])
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
    return updateBlockTranslation(blockId, text, status)
  })

  // --- Engine (AI Translation) ---
  ipcMain.handle('engine:preflight', (_, fileId?: number) => {
    return preFlightAnalyzer(fileId)
  })

  ipcMain.handle('engine:translateBatch', async (_, blockIds: number[]) => {
    return await translateBatchByBlockIds(blockIds)
  })

  ipcMain.handle('engine:startQueue', (_, options?: { fileId?: number }) => {
    return startQueue(options)
  })

  ipcMain.handle('engine:stopQueue', () => {
    return stopQueue()
  })
}
