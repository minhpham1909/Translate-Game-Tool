import { contextBridge, ipcRenderer } from 'electron'
import { electronAPI } from '@electron-toolkit/preload'

// Custom APIs for renderer
const api = {
  project: {
    scanLanguages: (gamePath: string) => ipcRenderer.invoke('project:scanLanguages', gamePath),
    setup: (config: any) => ipcRenderer.invoke('project:setup', config),
    getCurrent: () => ipcRenderer.invoke('project:getCurrent')
  },
  glossary: {
    getAll: () => ipcRenderer.invoke('glossary:getAll'),
    add: (entry: any) => ipcRenderer.invoke('glossary:add', entry),
    update: (id: number, entry: any) => ipcRenderer.invoke('glossary:update', id, entry),
    delete: (id: number) => ipcRenderer.invoke('glossary:delete', id)
  },
  tm: {
    getAll: () => ipcRenderer.invoke('tm:getAll'),
    delete: (id: number) => ipcRenderer.invoke('tm:delete', id),
    clearUnused: () => ipcRenderer.invoke('tm:clearUnused'),
    search: (query: string) => ipcRenderer.invoke('tm:search', query)
  },
  search: {
    searchBlocks: (query: string, options: any) => ipcRenderer.invoke('search:searchBlocks', query, options),
    replaceBlockText: (blockId: number, newText: string, isOriginal: boolean) => ipcRenderer.invoke('search:replaceBlockText', blockId, newText, isOriginal)
  }
}

// Use `contextBridge` APIs to expose Electron APIs to
// renderer only if context isolation is enabled, otherwise
// just add to the DOM global.
if (process.contextIsolated) {
  try {
    contextBridge.exposeInMainWorld('electron', electronAPI)
    contextBridge.exposeInMainWorld('api', api)
  } catch (error) {
    console.error(error)
  }
} else {
  // @ts-ignore (define in dts)
  window.electron = electronAPI
  // @ts-ignore (define in dts)
  window.api = api
}
