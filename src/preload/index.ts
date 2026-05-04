import { contextBridge, ipcRenderer, type IpcRendererEvent } from 'electron'
import { electronAPI } from '@electron-toolkit/preload'
import type { AppSettings, ProjectConfig, RecentProject } from '../shared/types'

type BlockStatus = 'empty' | 'draft' | 'approved' | 'warning' | 'skipped' | 'modified'

interface GlossaryEntry {
  id?: number
  source_text: string
  target_text: string
  notes?: string
  created_at?: string
}

type GlossaryEntryInput = Omit<GlossaryEntry, 'id' | 'created_at'>

interface TMEntry {
  id?: number
  original_text: string
  translated_text: string
  usage_count: number
  last_used_at?: string
}

interface SearchOptions {
  matchCase: boolean
  wholeWord: boolean
  useRegex: boolean
}

interface SearchMatch {
  blockId: number
  fileName: string
  lineIndex: number
  text: string
  matchStart: number
  matchEnd: number
}

interface WorkspaceFile {
  id: number
  file_path: string
  file_name: string
  total_blocks: number
  translated_blocks: number
  status: 'completed' | 'in_progress' | 'pending' | 'warning'
  updated_at: string
}

interface WorkspaceBlock {
  id: number
  block_hash: string
  line_index: number
  character_id: string | null
  original_text: string
  translated_text: string | null
  status: BlockStatus
  block_type: 'dialogue' | 'string'
}

type SystemLogType = 'info' | 'warning' | 'error' | 'success'

interface SystemLogEntry {
  type: SystemLogType
  message: string
  timestamp: string
}

interface EngineProgress {
  success: number
  error: number
}

interface CompiledScanResult {
  rpaFiles: string[]
  rpycFiles: string[]
  rpyFiles: string[]
  hasCompiled: boolean
  hasSource: boolean
}

interface UnpackResult {
  success: boolean
  rpaExtracted: number
  rpycDecompiled: number
  failed: number
  message: string
}

interface UnpackProgressEvent {
  event: 'info' | 'progress' | 'error' | 'complete'
  message?: string
  detail?: string
  current?: number
  total?: number
  percent?: number
  files_processed?: number
  files_failed?: number
}

interface DiffSummary {
  unchanged: number
  modified: number
  newBlocks: number
  removed: number
  totalFiles: number
}

interface RendererApi {
  project: {
    scanLanguages: (gamePath: string) => Promise<string[]>
    setup: (config: ProjectConfig) => Promise<void>
    getCurrent: () => Promise<ProjectConfig | null>
    selectFolder: () => Promise<string | null>
    getRecent: () => Promise<RecentProject[]>
    scanCompiled: (gameDir: string) => Promise<CompiledScanResult>
    unpackGame: (gameDir: string, mode?: 'extract' | 'decompile' | 'auto') => Promise<UnpackResult>
    installUnpackerDeps: () => Promise<{ success: boolean; message: string }>
    previewDiff: (newGameDir: string, sourceLanguage: string) => Promise<{
      newFileCount: number
      existingFileCount: number
      removedFileCount: number
      totalNewRpyFiles: number
    }>
    updateGame: (newGameDir: string, sourceLanguage: string) => Promise<DiffSummary>
  }
  glossary: {
    getAll: () => Promise<GlossaryEntry[]>
    add: (entry: GlossaryEntryInput) => Promise<GlossaryEntry>
    update: (id: number, entry: GlossaryEntryInput) => Promise<void>
    delete: (id: number) => Promise<void>
  }
  tm: {
    getAll: () => Promise<TMEntry[]>
    delete: (id: number) => Promise<void>
    clearUnused: () => Promise<void>
    search: (query: string) => Promise<TMEntry[]>
  }
  search: {
    searchBlocks: (query: string, options: SearchOptions) => Promise<SearchMatch[]>
    replaceBlockText: (blockId: number, newText: string, isOriginal: boolean) => Promise<void>
  }
  workspace: {
    getFiles: () => Promise<WorkspaceFile[]>
    getBlocks: (fileId: number) => Promise<WorkspaceBlock[]>
    updateBlock: (blockId: number, text: string | null, status: BlockStatus) => Promise<void>
    batchApprove: (blockIds: number[]) => Promise<void>
  }
  engine: {
    preflight: (fileId?: number) => Promise<{ pendingBlocks: number; estimatedCharacters: number; estimatedCost: number }>
    translateBatch: (blockIds: number[]) => Promise<void>
    startQueue: (options?: { fileId?: number }) => Promise<{ started: boolean; alreadyRunning: boolean }>
    stopQueue: () => Promise<{ stopped: boolean }>
  }
  events: {
    onSystemLog: (callback: (entry: SystemLogEntry) => void) => () => void
    onEngineProgress: (callback: (progress: EngineProgress) => void) => () => void
    onUnpackProgress: (callback: (event: UnpackProgressEvent) => void) => () => void
  }
  settings: {
    get: () => Promise<AppSettings>
    save: (settings: Partial<AppSettings>) => Promise<void>
    testConnection: () => Promise<{ ok: boolean; error?: string }>
    listModels: (provider?: string) => Promise<string[]>
  }
}

// Custom APIs for renderer
const api: RendererApi = {
  project: {
    scanLanguages: (gamePath: string) => ipcRenderer.invoke('project:scanLanguages', gamePath),
    setup: (config: ProjectConfig) => ipcRenderer.invoke('project:setup', config) as Promise<void>,
    getCurrent: () => ipcRenderer.invoke('project:getCurrent') as Promise<ProjectConfig | null>,
    selectFolder: () => ipcRenderer.invoke('project:selectFolder') as Promise<string | null>,
    getRecent: () => ipcRenderer.invoke('project:getRecent') as Promise<RecentProject[]>,
    scanCompiled: (gameDir: string) => ipcRenderer.invoke('project:scanCompiled', gameDir) as Promise<CompiledScanResult>,
    unpackGame: (gameDir: string, mode?: 'extract' | 'decompile' | 'auto') =>
      ipcRenderer.invoke('project:unpackGame', gameDir, mode) as Promise<UnpackResult>,
    installUnpackerDeps: () =>
      ipcRenderer.invoke('project:installUnpackerDeps') as Promise<{ success: boolean; message: string }>,
    previewDiff: (newGameDir: string, sourceLanguage: string) =>
      ipcRenderer.invoke('project:previewDiff', newGameDir, sourceLanguage) as Promise<{
        newFileCount: number
        existingFileCount: number
        removedFileCount: number
        totalNewRpyFiles: number
      }>,
    updateGame: (newGameDir: string, sourceLanguage: string) =>
      ipcRenderer.invoke('project:updateGame', newGameDir, sourceLanguage) as Promise<DiffSummary>
  },
  glossary: {
    getAll: () => ipcRenderer.invoke('glossary:getAll') as Promise<GlossaryEntry[]>,
    add: (entry: GlossaryEntryInput) => ipcRenderer.invoke('glossary:add', entry) as Promise<GlossaryEntry>,
    update: (id: number, entry: GlossaryEntryInput) => ipcRenderer.invoke('glossary:update', id, entry) as Promise<void>,
    delete: (id: number) => ipcRenderer.invoke('glossary:delete', id) as Promise<void>
  },
  tm: {
    getAll: () => ipcRenderer.invoke('tm:getAll') as Promise<TMEntry[]>,
    delete: (id: number) => ipcRenderer.invoke('tm:delete', id) as Promise<void>,
    clearUnused: () => ipcRenderer.invoke('tm:clearUnused') as Promise<void>,
    search: (query: string) => ipcRenderer.invoke('tm:search', query) as Promise<TMEntry[]>
  },
  search: {
    searchBlocks: (query: string, options: SearchOptions) =>
      ipcRenderer.invoke('search:searchBlocks', query, options) as Promise<SearchMatch[]>,
    replaceBlockText: (blockId: number, newText: string, isOriginal: boolean) =>
      ipcRenderer.invoke('search:replaceBlockText', blockId, newText, isOriginal) as Promise<void>
  },
  workspace: {
    getFiles: () => ipcRenderer.invoke('workspace:getFiles') as Promise<WorkspaceFile[]>,
    getBlocks: (fileId: number) => ipcRenderer.invoke('workspace:getBlocks', fileId) as Promise<WorkspaceBlock[]>,
    updateBlock: (blockId: number, text: string | null, status: BlockStatus) =>
      ipcRenderer.invoke('workspace:updateBlock', blockId, text, status) as Promise<void>,
    batchApprove: (blockIds: number[]) =>
      ipcRenderer.invoke('workspace:batchApprove', blockIds) as Promise<void>
  },
  engine: {
    preflight: (fileId?: number) =>
      ipcRenderer.invoke('engine:preflight', fileId) as Promise<{
        pendingBlocks: number
        estimatedCharacters: number
        estimatedCost: number
      }>,
    translateBatch: (blockIds: number[]) => ipcRenderer.invoke('engine:translateBatch', blockIds) as Promise<void>,
    startQueue: (options?: { fileId?: number }) =>
      ipcRenderer.invoke('engine:startQueue', options) as Promise<{ started: boolean; alreadyRunning: boolean }>,
    stopQueue: () => ipcRenderer.invoke('engine:stopQueue') as Promise<{ stopped: boolean }>
  },
  events: {
    onSystemLog: (callback: (entry: SystemLogEntry) => void): (() => void) => {
      const handler = (_: IpcRendererEvent, entry: SystemLogEntry): void => callback(entry)
      ipcRenderer.on('system:log', handler)
      return () => ipcRenderer.removeListener('system:log', handler)
    },
    onEngineProgress: (callback: (progress: EngineProgress) => void): (() => void) => {
      const handler = (_: IpcRendererEvent, progress: EngineProgress): void => callback(progress)
      ipcRenderer.on('engine:progress', handler)
      return () => ipcRenderer.removeListener('engine:progress', handler)
    },
    onUnpackProgress: (callback: (event: UnpackProgressEvent) => void): (() => void) => {
      const handler = (_: IpcRendererEvent, event: UnpackProgressEvent): void => callback(event)
      ipcRenderer.on('unpack:progress', handler)
      return () => ipcRenderer.removeListener('unpack:progress', handler)
    }
  },
  settings: {
    get: () => ipcRenderer.invoke('settings:get') as Promise<AppSettings>,
    save: (settings: Partial<AppSettings>) => ipcRenderer.invoke('settings:save', settings) as Promise<void>,
    testConnection: () => ipcRenderer.invoke('settings:testConnection') as Promise<{ ok: boolean; error?: string }>,
    listModels: (provider?: string) => ipcRenderer.invoke('settings:listModels', provider) as Promise<string[]>
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
