/**
 * App.tsx
 * Entry point chính — điều phối giữa WelcomeScreen và CATWorkspace.
 * Tất cả modals được quản lý ở đây và truyền xuống qua props.
 */
import { useEffect, useRef, useState, type ReactElement } from 'react'
import { ThemeProvider } from '@renderer/context/ThemeContext'
import { NotificationProvider, useNotification } from '@renderer/context/NotificationContext'
import { NotificationToast } from '@renderer/components/ui/notification-toast'
import { WelcomeScreen } from '@renderer/components/screens/WelcomeScreen'
import { SetupWizardModal } from '@renderer/components/screens/SetupWizardModal'
import { PreflightModal } from '@renderer/components/screens/PreflightModal'
import { ExportModal } from '@renderer/components/screens/ExportModal'
import { RestoreModal } from '@renderer/components/screens/RestoreModal'
import { QAReportModal } from '@renderer/components/screens/QAReportModal'
import { TMManagerModal } from '@renderer/components/screens/TMManagerModal'
import { GlossaryModal, type GlossaryEntry as GlossaryModalEntry } from '@renderer/components/screens/GlossaryModal'
import { SearchReplaceModal } from '@renderer/components/screens/SearchReplaceModal'
import { KeyboardShortcutsModal } from '@renderer/components/screens/KeyboardShortcutsModal'
import { UpdateGameModal } from '@renderer/components/screens/UpdateGameModal'
import { TopHeader } from '@renderer/components/cat-tool/TopHeader'
import { LeftSidebar, SidebarFile } from '@renderer/components/cat-tool/LeftSidebar'
import { TranslationWorkspace } from '@renderer/components/cat-tool/TranslationWorkspace'
import { BottomBar, LogEntry, LogType } from '@renderer/components/cat-tool/BottomBar'
import { SettingsModal } from '@renderer/components/cat-tool/SettingsModal'
import { UITranslationBlock } from '@renderer/components/cat-tool/TranslationCard'
import { TooltipProvider } from '@renderer/components/ui/tooltip'
import type { RecentProject } from '../../shared/types'
// ============================================================


const MAX_LOGS = 200

interface QueueRuntimeState {
  state: 'idle' | 'running' | 'paused' | 'stopped' | 'error' | 'done'
  fileId: number | null
  processed: number
  speedBlocksPerMin?: number
  etaSeconds?: number | null
  approxInputTokens?: number
  approxOutputTokens?: number
  errorCount: number
}

function normalizeLogType(type: unknown): LogType {
  switch (type) {
    case 'info':
    case 'warning':
    case 'error':
    case 'success':
      return type
    default:
      return 'info'
  }
}

// ============================================================
// MODAL STATE TYPE — Gom tất cả modals vào 1 object
// ============================================================
interface ModalState {
  settings: boolean
  setupWizard: boolean
  preflight: boolean
  export: boolean
  restore: boolean
  qaReport: boolean
  tmManager: boolean
  glossary: boolean
  searchReplace: boolean
  keyboardShortcuts: boolean
  updateGame: boolean
}

const DEFAULT_MODAL_STATE: ModalState = {
  settings: false, setupWizard: false, preflight: false, export: false,
  restore: false,
  qaReport: false, tmManager: false, glossary: false, searchReplace: false,
  keyboardShortcuts: false, updateGame: false,
}

// ============================================================
// CAT WORKSPACE — Màn hình làm việc chính
// ============================================================
function CATWorkspace({
  onNewProject,
  onChangeLocation,
  recentProjects,
  onOpenProject,
  onBackToWelcome,
  onRefreshApiKey,
}: {
  onNewProject: () => void
  onChangeLocation: () => void
  recentProjects: RecentProject[]
  onOpenProject: (project: RecentProject) => void
  onBackToWelcome: () => void
  onRefreshApiKey: () => void
}): ReactElement {
  const [files, setFiles] = useState<SidebarFile[]>([])
  const [activeFileId, setActiveFileId] = useState<number | null>(null)
  const [blocks, setBlocks] = useState<UITranslationBlock[]>([])
  const [modals, setModals] = useState<ModalState>(DEFAULT_MODAL_STATE)
  const [preflightScope, setPreflightScope] = useState<'file' | 'project'>('file')
  const [logs, setLogs] = useState<LogEntry[]>([])
  const [preflightData, setPreflightData] = useState({ pendingBlocks: 0, estimatedCharacters: 0, estimatedCost: 0 })
  const [glossaryEntries, setGlossaryEntries] = useState<GlossaryModalEntry[]>([])
  const [tmEntries, setTmEntries] = useState<Array<{
    id: number
    original_text: string
    translated_text: string
    usage_count: number
    last_used_at: string
  }>>([])
  const [gameFolderPath, setGameFolderPath] = useState<string>('')
  const [queueRuntime, setQueueRuntime] = useState<QueueRuntimeState>({
    state: 'idle',
    fileId: null,
    processed: 0,
    etaSeconds: null,
    errorCount: 0,
  })
  const activeFileIdRef = useRef<number | null>(null)
  const refreshTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const notify = useNotification()

  useEffect(() => {
    void window.api.project.getCurrent().then((config) => {
      if (config?.gameFolderPath) setGameFolderPath(config.gameFolderPath)
    })
  }, [])

  const fetchFiles = async (): Promise<void> => {
    try {
      const data = await window.api.workspace.getFiles()
      setFiles(data)
      if (data.length > 0) {
        setActiveFileId((prev) => (prev === null ? data[0].id : prev))
      }
    } catch (err) {
      console.error('Failed to fetch files:', err)
    }
  }

  const fetchBlocks = async (fileId: number): Promise<void> => {
    try {
      const data = await window.api.workspace.getBlocks(fileId)
      setBlocks(data)
    } catch (err) {
      console.error('Failed to fetch blocks:', err)
    }
  }

  // Khởi tạo
  useEffect(() => {
    let cancelled = false
    void window.api.workspace
      .getFiles()
      .then((data) => {
        if (cancelled) return
        setFiles(data)
        if (data.length > 0) {
          setActiveFileId((prev) => (prev === null ? data[0].id : prev))
        }
      })
      .catch((err) => {
        console.error('Failed to fetch files:', err)
      })

    return () => {
      cancelled = true
    }
  }, [])

  // Khi chọn file
  useEffect(() => {
    if (activeFileId === null) return
    let cancelled = false
    void window.api.workspace
      .getBlocks(activeFileId)
      .then((data) => {
        if (cancelled) return
        setBlocks(data)
      })
      .catch((err) => {
        console.error('Failed to fetch blocks:', err)
      })

    return () => {
      cancelled = true
    }
  }, [activeFileId])

  useEffect(() => {
    activeFileIdRef.current = activeFileId
  }, [activeFileId])

  // Subscribe to backend logs + progress
  useEffect(() => {
    const unsubscribeLog = window.api.events.onSystemLog((entry) => {
      setLogs((prev) => {
        const next = [
          ...prev,
          {
            type: normalizeLogType(entry.type),
            message: entry.message,
            timestamp: entry.timestamp,
          },
        ]
        return next.length > MAX_LOGS ? next.slice(next.length - MAX_LOGS) : next
      })
    })

    const unsubscribeProgress = window.api.events.onEngineProgress((progress) => {
      setQueueRuntime((prev) => ({
        ...prev,
        state: progress.state ?? prev.state,
        fileId: progress.fileId ?? prev.fileId,
        processed: progress.processed ?? prev.processed,
        speedBlocksPerMin: progress.speedBlocksPerMin ?? prev.speedBlocksPerMin,
        etaSeconds: progress.etaSeconds ?? prev.etaSeconds,
        approxInputTokens: progress.approxInputTokens ?? prev.approxInputTokens,
        approxOutputTokens: progress.approxOutputTokens ?? prev.approxOutputTokens,
        errorCount: progress.error,
      }))
      // Debounce refresh; queue can emit often.
      if (refreshTimerRef.current) return
      refreshTimerRef.current = setTimeout(() => {
        refreshTimerRef.current = null
        fetchFiles()
        const fid = activeFileIdRef.current
        if (fid !== null) fetchBlocks(fid)
      }, 500)
    })

    return () => {
      unsubscribeLog()
      unsubscribeProgress()
    }
  }, [])

  useEffect(() => {
    let cancelled = false
    const syncQueueStatus = async (): Promise<void> => {
      try {
        const status = await window.api.engine.getQueueStatus()
        if (cancelled) return
        setQueueRuntime((prev) => ({
          ...prev,
          state: status.state,
          fileId: status.fileId,
          processed: status.processedCount + status.errorCount,
          errorCount: status.errorCount,
        }))
      } catch (err) {
        console.error('Failed to sync queue status:', err)
      }
    }
    void syncQueueStatus()
    const timer = setInterval(() => {
      void syncQueueStatus()
    }, 3000)
    return () => {
      cancelled = true
      clearInterval(timer)
    }
  }, [])

  const activeFile = files.find((f) => f.id === activeFileId)
  const totalBlocks = files.reduce((acc, f) => acc + f.total_blocks, 0)
  const translatedBlocks = files.reduce((acc, f) => acc + f.translated_blocks, 0)

  const openModal = (key: keyof ModalState): void =>
    setModals((prev) => ({ ...prev, [key]: true }))
  const closeModal = (key: keyof ModalState): void =>
    setModals((prev) => ({ ...prev, [key]: false }))

  const handleTranslationChange = async (blockId: number, value: string): Promise<void> => {
    // 1. Optimistic update (UI update nhanh)
    const newStatus = value.trim() ? 'draft' : 'empty'
    setBlocks((prev) =>
      prev.map((b) =>
        b.id === blockId
          ? { ...b, translated_text: value, status: newStatus }
          : b
      )
    )

    // 2. Gọi API lưu DB
    await window.api.workspace.updateBlock(blockId, value, newStatus)
    // 3. Cập nhật Sidebar (Progress)
    fetchFiles()
  }

  const handleApprove = async (blockId: number): Promise<void> => {
    setBlocks((prev) =>
      prev.map((b) => (b.id === blockId ? { ...b, status: 'approved' } : b))
    )
    const block = blocks.find((b) => b.id === blockId)
    if (block) {
      await window.api.workspace.updateBlock(blockId, block.translated_text || '', 'approved')
      fetchFiles()
    }
  }

  const handleRevert = async (blockId: number): Promise<void> => {
    setBlocks((prev) =>
      prev.map((b) => (b.id === blockId ? { ...b, translated_text: null, status: 'empty' } : b))
    )
    await window.api.workspace.updateBlock(blockId, null, 'empty')
    fetchFiles()
  }

  const handleAITranslate = (blockId: number): void => {
    void (async () => {
      try {
        await window.api.engine.translateBatch([blockId])
        if (activeFileId !== null) await fetchBlocks(activeFileId)
        await fetchFiles()
        notify.success('AI Translation', 'Block translated successfully')
      } catch (err: unknown) {
        const message = err instanceof Error ? err.message : String(err)
        console.error('AI translate failed:', message)
        notify.error('AI Translation Failed', message)
        setLogs((prev) => {
          const next = [
            ...prev,
            {
              type: 'error' as const,
              message: message || 'AI translate failed',
              timestamp: new Date().toLocaleTimeString('en-GB', { hour12: false }),
            },
          ]
          return next.length > MAX_LOGS ? next.slice(next.length - MAX_LOGS) : next
        })
      }
    })()
  }

  const handleBatchTranslate = (blockIds: number[]): void => {
    void (async () => {
      try {
        await window.api.engine.translateBatch(blockIds)
        if (activeFileId !== null) await fetchBlocks(activeFileId)
        await fetchFiles()
        notify.success('Batch Translate', `${blockIds.length} blocks translated`)
      } catch (err: unknown) {
        const message = err instanceof Error ? err.message : String(err)
        console.error('Batch translate failed:', message)
        notify.error('Batch Translate Failed', message)
      }
    })()
  }

  const handleBatchApprove = (blockIds: number[]): void => {
    void (async () => {
      try {
        await window.api.workspace.batchApprove(blockIds)
        if (activeFileId !== null) await fetchBlocks(activeFileId)
        notify.success('Batch Approve', `${blockIds.length} blocks approved`)
      } catch (err: unknown) {
        const message = err instanceof Error ? err.message : String(err)
        console.error('Batch approve failed:', message)
        notify.error('Batch Approve Failed', message)
      }
    })()
  }

  const handleQueuePause = (): void => {
    void window.api.engine.pauseQueue().catch((err: unknown) => {
      const message = err instanceof Error ? err.message : String(err)
      notify.error('Pause Queue Failed', message)
    })
  }

  const handleQueueResume = (): void => {
    void window.api.engine.resumeQueue().then((result) => {
      if (!result.resumed && !result.alreadyRunning) {
        notify.error('Resume Queue', 'No paused queue checkpoint found.')
      }
    }).catch((err: unknown) => {
      const message = err instanceof Error ? err.message : String(err)
      notify.error('Resume Queue Failed', message)
    })
  }

  const handleQueueStop = (): void => {
    void window.api.engine.stopQueue().catch((err: unknown) => {
      const message = err instanceof Error ? err.message : String(err)
      notify.error('Stop Queue Failed', message)
    })
  }

  // Load preflight data when modal opens or scope changes
  useEffect(() => {
    if (!modals.preflight) return
    void (async () => {
      try {
        if (preflightScope === 'file') {
          if (activeFileId === null) {
            setPreflightData({ pendingBlocks: 0, estimatedCharacters: 0, estimatedCost: 0 })
            return
          }
          const data = await window.api.engine.preflight(activeFileId)
          setPreflightData(data)
        } else {
          const data = await window.api.engine.preflight()
          setPreflightData(data)
        }
      } catch (err) {
        console.error('Failed to load preflight:', err)
      }
    })()
  }, [modals.preflight, preflightScope, activeFileId])

  useEffect(() => {
    if (!modals.glossary) return
    let cancelled = false
    void (async () => {
      try {
        const raw = await window.api.glossary.getAll()
        if (!cancelled) setGlossaryEntries(transformGlossaryEntries(raw))
      } catch (err: unknown) {
        const message = err instanceof Error ? err.message : String(err)
        console.error('Failed to load glossaries:', message)
        if (!cancelled) notify.error('Glossary load failed', message)
      }
    })()
    return () => { cancelled = true }
  }, [modals.glossary])

  useEffect(() => {
    if (!modals.tmManager) return
    let cancelled = false
    void (async () => {
      try {
        const raw = await window.api.tm.getAll()
        if (!cancelled) {
          setTmEntries(
            raw
              .filter((entry): entry is { id: number; original_text: string; translated_text: string; usage_count: number; last_used_at?: string } => typeof entry.id === 'number')
              .map((entry) => ({
                id: entry.id,
                original_text: entry.original_text,
                translated_text: entry.translated_text,
                usage_count: entry.usage_count,
                last_used_at: entry.last_used_at ?? '',
              }))
          )
        }
      } catch (err: unknown) {
        const message = err instanceof Error ? err.message : String(err)
        if (!cancelled) notify.error('TM load failed', message)
      }
    })()
    return () => { cancelled = true }
  }, [modals.tmManager])

  // --- Keyboard Shortcuts ---
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent): void => {
      // Bỏ qua nếu user đang gõ trong input/textarea
      const target = e.target as HTMLElement
      if (target.tagName === 'INPUT' || target.tagName === 'TEXTAREA') return

      if (e.key === 'F1') {
        e.preventDefault()
        openModal('keyboardShortcuts')
      } else if (e.ctrlKey && e.key.toLowerCase() === 'e') {
        e.preventDefault()
        openModal('export')
      } else if (e.ctrlKey && e.key === ',') {
        e.preventDefault()
        openModal('settings')
      } else if (e.ctrlKey && e.key.toLowerCase() === 'f') {
        e.preventDefault()
        openModal('searchReplace')
      } else if (e.ctrlKey && e.shiftKey && e.key.toLowerCase() === 'q') {
        e.preventDefault()
        openModal('qaReport')
      } else if (e.ctrlKey && e.shiftKey && e.key.toLowerCase() === 'g') {
        e.preventDefault()
        openModal('glossary')
      } else if (e.ctrlKey && e.shiftKey && e.key.toLowerCase() === 'a') {
        e.preventDefault()
        openModal('preflight')
      }
    }

    window.addEventListener('keydown', handleKeyDown)
    return () => window.removeEventListener('keydown', handleKeyDown)
  }, [])

  const transformGlossaryEntries = (entries: unknown[]): GlossaryModalEntry[] =>
    entries
      .filter((e): e is { id: number; source_text: string; target_text: string; notes?: string; enabled?: boolean } =>
        typeof e === 'object' && e !== null && 'id' in e && (e as Record<string, unknown>).id != null
      )
      .map((e) => ({ id: e.id, source_text: e.source_text, target_text: e.target_text, notes: e.notes, enabled: e.enabled !== false }))

  return (
    <div className="flex flex-col h-full w-full bg-background text-foreground overflow-hidden">
      <TopHeader
        activeFileName={activeFile?.file_name}
        gameFolderPath={gameFolderPath}
        sourceLanguage="english"
        onSettingsClick={() => openModal('settings')}
        onExportClick={() => openModal('export')}
        onRestoreClick={() => openModal('restore')}
        onPreflightClick={() => openModal('preflight')}
        onSearchClick={() => openModal('searchReplace')}
        onQAClick={() => openModal('qaReport')}
        onGlossaryClick={() => openModal('glossary')}
        onTMClick={() => openModal('tmManager')}
        onShortcutsClick={() => openModal('keyboardShortcuts')}
        onGameUpdateClick={() => openModal('updateGame')}
        onBackToWelcome={onBackToWelcome}
      />

      <div className="flex flex-1 overflow-hidden">
        <LeftSidebar
          files={files}
          activeFileId={activeFileId}
          sourceLanguage="english"
          onFileSelect={setActiveFileId}
          onNewProject={onNewProject}
          onChangeLocation={onChangeLocation}
          recentProjects={recentProjects}
          onOpenProject={onOpenProject}
        />
        <TranslationWorkspace
          blocks={blocks}
          onTranslationChange={handleTranslationChange}
          onApprove={handleApprove}
          onRevert={handleRevert}
          onAITranslate={handleAITranslate}
          onBatchTranslate={handleBatchTranslate}
          onBatchApprove={handleBatchApprove}
        />
      </div>

      <BottomBar
        totalBlocks={totalBlocks}
        translatedBlocks={translatedBlocks}
        apiCost={0.0012}
        logs={logs}
        isConnected={true}
        queueState={queueRuntime.state}
        queueSpeedBlocksPerMin={queueRuntime.speedBlocksPerMin}
        queueEtaSeconds={queueRuntime.etaSeconds}
        queueProcessed={queueRuntime.processed}
        queueApproxInputTokens={queueRuntime.approxInputTokens}
        queueApproxOutputTokens={queueRuntime.approxOutputTokens}
        onQueuePause={handleQueuePause}
        onQueueResume={handleQueueResume}
        onQueueStop={handleQueueStop}
      />

      {/* All Modals */}
      <SettingsModal open={modals.settings} onOpenChange={(o) => {
        setModals((p) => ({ ...p, settings: o }))
        if (!o) onRefreshApiKey()
      }} />

      <PreflightModal
        open={modals.preflight}
        onOpenChange={() => closeModal('preflight')}
        data={{ ...preflightData, activeFileName: activeFile?.file_name }}
        scope={preflightScope}
        onScopeChange={setPreflightScope}
        onConfirm={() => {
          if (preflightScope === 'file') {
            if (activeFileId !== null) void window.api.engine.startQueue({ fileId: activeFileId })
          } else {
            void window.api.engine.startQueue()
          }
        }}
      />

      <ExportModal
        open={modals.export}
        onOpenChange={(o) => setModals((p) => ({ ...p, export: o }))}
      />

      <RestoreModal
        open={modals.restore}
        onOpenChange={(o) => setModals((p) => ({ ...p, restore: o }))}
      />

      <QAReportModal
        open={modals.qaReport}
        onOpenChange={(o) => setModals((p) => ({ ...p, qaReport: o }))}
        issues={[]}
        onGoToBlock={(id) => console.log('[TODO] Go to block:', id)}
      />

      <TMManagerModal
        open={modals.tmManager}
        onOpenChange={(o) => setModals((p) => ({ ...p, tmManager: o }))}
        entries={tmEntries}
        onDelete={(id) => {
          void (async () => {
            try {
              await window.api.tm.delete(id)
              const raw = await window.api.tm.getAll()
              setTmEntries(
                raw
                  .filter((entry): entry is { id: number; original_text: string; translated_text: string; usage_count: number; last_used_at?: string } => typeof entry.id === 'number')
                  .map((entry) => ({
                    id: entry.id,
                    original_text: entry.original_text,
                    translated_text: entry.translated_text,
                    usage_count: entry.usage_count,
                    last_used_at: entry.last_used_at ?? '',
                  }))
              )
              notify.success('TM updated', 'Entry deleted')
            } catch (err: unknown) {
              const message = err instanceof Error ? err.message : String(err)
              notify.error('TM delete failed', message)
            }
          })()
        }}
        onClearUnused={() => {
          if (!window.confirm('Clear TM entries with usage <= 1? A snapshot will be created automatically.')) return
          void (async () => {
            try {
              await window.api.globalData.clear({ scope: 'tm', mode: 'unused' })
              const raw = await window.api.tm.getAll()
              setTmEntries(
                raw
                  .filter((entry): entry is { id: number; original_text: string; translated_text: string; usage_count: number; last_used_at?: string } => typeof entry.id === 'number')
                  .map((entry) => ({
                    id: entry.id,
                    original_text: entry.original_text,
                    translated_text: entry.translated_text,
                    usage_count: entry.usage_count,
                    last_used_at: entry.last_used_at ?? '',
                  }))
              )
              notify.success('TM cleanup complete', 'Unused entries cleared')
            } catch (err: unknown) {
              const message = err instanceof Error ? err.message : String(err)
              notify.error('TM cleanup failed', message)
            }
          })()
        }}
        onClearAll={() => {
          const step1 = window.confirm('This will clear ALL TM entries and create a snapshot. Continue?')
          if (!step1) return
          const confirmText = window.prompt('Type CLEAR to confirm:')
          if (confirmText !== 'CLEAR') return
          void (async () => {
            try {
              await window.api.globalData.clear({ scope: 'tm', mode: 'all' })
              setTmEntries([])
              notify.success('TM cleared', 'All TM entries were removed')
            } catch (err: unknown) {
              const message = err instanceof Error ? err.message : String(err)
              notify.error('TM clear failed', message)
            }
          })()
        }}
        onRestoreLatest={() => {
          void (async () => {
            try {
              const result = await window.api.globalData.restoreLatestSnapshot()
              if (!result.restored) {
                notify.error('Restore failed', 'No snapshot found')
                return
              }
              const raw = await window.api.tm.getAll()
              setTmEntries(
                raw
                  .filter((entry): entry is { id: number; original_text: string; translated_text: string; usage_count: number; last_used_at?: string } => typeof entry.id === 'number')
                  .map((entry) => ({
                    id: entry.id,
                    original_text: entry.original_text,
                    translated_text: entry.translated_text,
                    usage_count: entry.usage_count,
                    last_used_at: entry.last_used_at ?? '',
                  }))
              )
              notify.success('Restore complete', 'Global DB restored from latest snapshot')
            } catch (err: unknown) {
              const message = err instanceof Error ? err.message : String(err)
              notify.error('Restore failed', message)
            }
          })()
        }}
        onRefresh={() => {
          void (async () => {
            try {
              const raw = await window.api.tm.getAll()
              setTmEntries(
                raw
                  .filter((entry): entry is { id: number; original_text: string; translated_text: string; usage_count: number; last_used_at?: string } => typeof entry.id === 'number')
                  .map((entry) => ({
                    id: entry.id,
                    original_text: entry.original_text,
                    translated_text: entry.translated_text,
                    usage_count: entry.usage_count,
                    last_used_at: entry.last_used_at ?? '',
                  }))
              )
            } catch (err: unknown) {
              const message = err instanceof Error ? err.message : String(err)
              notify.error('TM refresh failed', message)
            }
          })()
        }}
      />

      <GlossaryModal
        open={modals.glossary}
        onOpenChange={(o) => setModals((p) => ({ ...p, glossary: o }))}
        entries={glossaryEntries}
        onAdd={async (e) => {
          try {
            await window.api.glossary.add({ ...e, enabled: e.enabled !== false })
            const raw = await window.api.glossary.getAll()
            setGlossaryEntries(transformGlossaryEntries(raw))
            notify.success('Term added', `${e.source_text} → ${e.target_text}`)
          } catch (err: unknown) {
            const message = err instanceof Error ? err.message : String(err)
            notify.error('Add failed', message)
          }
        }}
        onUpdate={async (id, e) => {
          try {
            await window.api.glossary.update(id, { ...e, enabled: e.enabled !== false })
            const raw = await window.api.glossary.getAll()
            setGlossaryEntries(transformGlossaryEntries(raw))
            notify.success('Term updated', e.source_text)
          } catch (err: unknown) {
            const message = err instanceof Error ? err.message : String(err)
            notify.error('Update failed', message)
          }
        }}
        onDelete={async (id) => {
          try {
            await window.api.glossary.delete(id)
            const raw = await window.api.glossary.getAll()
            setGlossaryEntries(transformGlossaryEntries(raw))
            notify.success('Term deleted', 'Removed from glossary')
          } catch (err: unknown) {
            const message = err instanceof Error ? err.message : String(err)
            notify.error('Delete failed', message)
          }
        }}
        onSetEnabled={async (ids, enabled) => {
          try {
            await window.api.glossary.setEnabled(ids, enabled)
            const raw = await window.api.glossary.getAll()
            setGlossaryEntries(transformGlossaryEntries(raw))
          } catch (err: unknown) {
            const message = err instanceof Error ? err.message : String(err)
            notify.error('Toggle failed', message)
          }
        }}
      />

      <SearchReplaceModal
        open={modals.searchReplace}
        onOpenChange={(o) => setModals((p) => ({ ...p, searchReplace: o }))}
        onSearch={() => []}
        onReplace={() => {}}
        onReplaceAll={() => {}}
      />

      <KeyboardShortcutsModal
        open={modals.keyboardShortcuts}
        onOpenChange={(o) => setModals((p) => ({ ...p, keyboardShortcuts: o }))}
      />

      <UpdateGameModal
        open={modals.updateGame}
        onOpenChange={(o) => setModals((p) => ({ ...p, updateGame: o }))}
        sourceLanguage="english"
        onComplete={() => {
          if (activeFileId !== null) void fetchBlocks(activeFileId)
          void fetchFiles()
        }}
      />
    </div>
  )
}

// ============================================================
// APP ROOT — Điều phối Welcome ↔ Workspace
// ============================================================
function AppContent(): ReactElement {
  const notify = useNotification()
  const [hasProject, setHasProject] = useState(false)
  const [isWizardOpen, setIsWizardOpen] = useState(false)
  const [recentProjects, setRecentProjects] = useState<RecentProject[]>([])
  const [hasApiKey, setHasApiKey] = useState(false)
  const [workspaceKey, setWorkspaceKey] = useState(0)

  // Khởi động: luôn vào Welcome, chỉ load danh sách recent
  useEffect(() => {
    const loadRecent = async (): Promise<void> => {
      try {
        const recent = await window.api.project.getRecent()
        setRecentProjects(recent)
      } catch (err) {
        console.error('Failed to load recent projects:', err)
      }
      try {
        const settings = await window.api.settings.get()
        const providers = settings.providers
        const keySet = (providers?.gemini?.apiKey || '') !== ''
          || (providers?.claude?.apiKey || '') !== ''
          || (providers?.openai_compatible?.apiKey || '') !== ''
        setHasApiKey(keySet)
      } catch (err) {
        console.error('Failed to check API key:', err)
      }
    }
    loadRecent()
  }, [])

  const refreshRecent = async (): Promise<void> => {
    try {
      const recent = await window.api.project.getRecent()
      setRecentProjects(recent)
    } catch (err) {
      console.error('Failed to refresh recent projects:', err)
    }
  }

  const handleOpenProject = async (project: RecentProject): Promise<void> => {
    try {
      const { gameFolderPath, sourceLanguage, targetLanguage } = project
      // Mở lại project đã có — KHÔNG parse lại, chỉ load từ DB
      await window.api.project.open({ gameFolderPath, sourceLanguage, targetLanguage })
      await refreshRecent()
      setHasProject(true)
      setWorkspaceKey((prev) => prev + 1)
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : String(err)
      console.error('Failed to open project:', message)
      notify.error('Failed to open project', message)
    }
  }

  const handleDeleteProject = async (gameFolderPath: string, deleteFiles: boolean = false): Promise<void> => {
    try {
      await window.api.project.delete(gameFolderPath, deleteFiles)
      await refreshRecent()
      const msg = deleteFiles ? 'Project và file dịch đã được xóa.' : 'Project đã được xóa khỏi danh sách recent.'
      notify.success('Đã xóa project', msg)
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : String(err)
      console.error('Failed to delete project:', message)
      notify.error('Failed to delete project', message)
    }
  }

  return (
    <TooltipProvider>
      {hasProject ? (
        <CATWorkspace
          key={workspaceKey}
          onNewProject={() => setIsWizardOpen(true)}
          onChangeLocation={() => setIsWizardOpen(true)}
          recentProjects={recentProjects}
          onOpenProject={handleOpenProject}
          onBackToWelcome={() => setHasProject(false)}
          onRefreshApiKey={() => {
            void window.api.settings.get().then((settings) => {
              const providers = settings.providers
              const keySet = (providers?.gemini?.apiKey || '') !== ''
                || (providers?.claude?.apiKey || '') !== ''
                || (providers?.openai_compatible?.apiKey || '') !== ''
              setHasApiKey(keySet)
            })
          }}
        />
      ) : (
        <WelcomeScreen
          hasApiKey={hasApiKey}
          recentProjects={recentProjects}
          onNewProject={() => setIsWizardOpen(true)}
          onOpenProject={handleOpenProject}
          onDeleteProject={handleDeleteProject}
        />
      )}
      <SetupWizardModal
        open={isWizardOpen}
        onOpenChange={setIsWizardOpen}
        onComplete={(config) => {
          void config
          void refreshRecent()
          setHasProject(true)
          setWorkspaceKey((prev) => prev + 1)
        }}
      />
      <NotificationToast />
    </TooltipProvider>
  )
}

/**
 * App — Root component bọc ThemeProvider + NotificationProvider.
 */
export default function App(): ReactElement {
  return (
    <ThemeProvider defaultTheme="dark">
      <NotificationProvider>
        <AppContent />
      </NotificationProvider>
    </ThemeProvider>
  )
}
