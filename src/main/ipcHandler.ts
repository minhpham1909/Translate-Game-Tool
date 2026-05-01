import { ipcMain } from 'electron'
import { scanAvailableLanguages, setupProject, getCurrentProject } from './api/projectIpc'
import { getAllGlossaries, addGlossary, updateGlossary, deleteGlossary } from './services/glossaryService'
import { getTMEntries, deleteTMEntry, clearUnusedTM, searchTM } from './services/tmService'
import { searchBlocks, replaceBlockText } from './services/searchService'

export function registerIpcHandlers() {
  // --- Project & Settings ---
  ipcMain.handle('project:scanLanguages', async (_, gamePath: string) => {
    return await scanAvailableLanguages(gamePath)
  })
  
  ipcMain.handle('project:setup', (_, config: any) => {
    return setupProject(config)
  })

  ipcMain.handle('project:getCurrent', () => {
    return getCurrentProject()
  })

  // --- Glossary ---
  ipcMain.handle('glossary:getAll', () => {
    return getAllGlossaries()
  })
  
  ipcMain.handle('glossary:add', (_, entry: any) => {
    return addGlossary(entry)
  })
  
  ipcMain.handle('glossary:update', (_, id: number, entry: any) => {
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
  ipcMain.handle('search:searchBlocks', (_, query: string, options: any) => {
    return searchBlocks(query, options)
  })

  ipcMain.handle('search:replaceBlockText', (_, blockId: number, newText: string, isOriginal: boolean) => {
    return replaceBlockText(blockId, newText, isOriginal)
  })
}
