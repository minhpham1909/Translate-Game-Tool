import { ElectronAPI } from '@electron-toolkit/preload'
import type { AppSettings, ProjectConfig, RecentProject } from '../shared/types'

type BlockStatus = 'empty' | 'draft' | 'approved' | 'warning' | 'skipped' | 'modified'

export interface WorkspaceFile {
  id: number
  file_path: string
  file_name: string
  total_blocks: number
  translated_blocks: number
  status: 'completed' | 'in_progress' | 'pending' | 'warning'
  updated_at: string
}

export interface WorkspaceBlock {
  id: number
  block_hash: string
  line_index: number
  character_id: string | null
  original_text: string
  translated_text: string | null
  status: BlockStatus
  block_type: 'dialogue' | 'string'
}

export interface GlossaryEntry {
  id?: number
  source_text: string
  target_text: string
  notes?: string
  created_at?: string
  enabled?: boolean
}

export type GlossaryEntryInput = Omit<GlossaryEntry, 'id' | 'created_at'>

export interface TMEntry {
  id?: number
  original_text: string
  translated_text: string
  usage_count: number
  last_used_at?: string
}

export interface SearchOptions {
  matchCase: boolean
  wholeWord: boolean
  useRegex: boolean
}

export interface SearchMatch {
  blockId: number
  fileName: string
  lineIndex: number
  text: string
  matchStart: number
  matchEnd: number
}

export type SystemLogType = 'info' | 'warning' | 'error' | 'success'

export interface SystemLogEntry {
  type: SystemLogType
  message: string
  timestamp: string
}

export interface EngineProgress {
  success: number
  error: number
}

export interface CompiledScanResult {
  rpaFiles: string[]
  rpycFiles: string[]
  rpyFiles: string[]
  hasCompiled: boolean
  hasSource: boolean
}

export interface UnpackResult {
  success: boolean
  rpaExtracted: number
  rpycDecompiled: number
  failed: number
  message: string
}

export interface UnpackProgressEvent {
  event: 'info' | 'progress' | 'error' | 'complete'
  message?: string
  detail?: string
  current?: number
  total?: number
  percent?: number
  files_processed?: number
  files_failed?: number
}

export interface DiffSummary {
  unchanged: number
  modified: number
  newBlocks: number
  removed: number
  totalFiles: number
}

declare global {
  interface Window {
    electron: ElectronAPI
    api: {
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
        setEnabled: (ids: number[], enabled: boolean) => Promise<void>
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
  }
}
