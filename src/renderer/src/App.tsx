/**
 * App.tsx
 * Entry point chính — điều phối giữa WelcomeScreen và CATWorkspace.
 * Tất cả modals được quản lý ở đây và truyền xuống qua props.
 * Step 2: Mock Data. Step 3 sẽ kết nối window.api thật.
 */
import { useEffect, useRef, useState, type ReactElement } from 'react'
import { ThemeProvider } from '@renderer/context/ThemeContext'
import { WelcomeScreen } from '@renderer/components/screens/WelcomeScreen'
import { SetupWizardModal } from '@renderer/components/screens/SetupWizardModal'
import { PreflightModal } from '@renderer/components/screens/PreflightModal'
import { ExportModal } from '@renderer/components/screens/ExportModal'
import { QAReportModal } from '@renderer/components/screens/QAReportModal'
import { TMManagerModal } from '@renderer/components/screens/TMManagerModal'
import { GlossaryModal } from '@renderer/components/screens/GlossaryModal'
import { SearchReplaceModal } from '@renderer/components/screens/SearchReplaceModal'
import { KeyboardShortcutsModal } from '@renderer/components/screens/KeyboardShortcutsModal'
import { TopHeader } from '@renderer/components/cat-tool/TopHeader'
import { LeftSidebar, SidebarFile } from '@renderer/components/cat-tool/LeftSidebar'
import { TranslationWorkspace } from '@renderer/components/cat-tool/TranslationWorkspace'
import { BottomBar, LogEntry, LogType } from '@renderer/components/cat-tool/BottomBar'
import { SettingsModal } from '@renderer/components/cat-tool/SettingsModal'
import { UITranslationBlock } from '@renderer/components/cat-tool/TranslationCard'
import { TooltipProvider } from '@renderer/components/ui/tooltip'
// ============================================================


const MAX_LOGS = 200

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
  qaReport: boolean
  tmManager: boolean
  glossary: boolean
  searchReplace: boolean
  keyboardShortcuts: boolean
}

const DEFAULT_MODAL_STATE: ModalState = {
  settings: false, setupWizard: false, preflight: false, export: false,
  qaReport: false, tmManager: false, glossary: false, searchReplace: false,
  keyboardShortcuts: false,
}

// ============================================================
// CAT WORKSPACE — Màn hình làm việc chính
// ============================================================
function CATWorkspace({
  onNewProject,
}: {
  onNewProject: () => void
}): ReactElement {
  const [files, setFiles] = useState<SidebarFile[]>([])
  const [activeFileId, setActiveFileId] = useState<number | null>(null)
  const [blocks, setBlocks] = useState<UITranslationBlock[]>([])
  const [modals, setModals] = useState<ModalState>(DEFAULT_MODAL_STATE)
  const [preflightScope, setPreflightScope] = useState<'file' | 'project'>('file')
  const [logs, setLogs] = useState<LogEntry[]>([])
  const [preflightData, setPreflightData] = useState({ pendingBlocks: 0, estimatedCharacters: 0, estimatedCost: 0 })
  const activeFileIdRef = useRef<number | null>(null)
  const refreshTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)

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

    const unsubscribeProgress = window.api.events.onEngineProgress(() => {
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
      } catch (err: unknown) {
        const message = err instanceof Error ? err.message : String(err)
        console.error('AI translate failed:', message)
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

  return (
    <div className="flex flex-col h-full w-full bg-background text-foreground overflow-hidden">
      <TopHeader
        activeFileName={activeFile?.file_name}
        sourceLanguage="english"
        onSettingsClick={() => openModal('settings')}
        onExportClick={() => openModal('export')}
        onPreflightClick={() => openModal('preflight')}
        onSearchClick={() => openModal('searchReplace')}
        onQAClick={() => openModal('qaReport')}
        onGlossaryClick={() => openModal('glossary')}
        onTMClick={() => openModal('tmManager')}
        onShortcutsClick={() => openModal('keyboardShortcuts')}
      />

      <div className="flex flex-1 overflow-hidden">
        <LeftSidebar
          files={files}
          activeFileId={activeFileId}
          sourceLanguage="english"
          onFileSelect={setActiveFileId}
          onNewProject={onNewProject}
        />
        <TranslationWorkspace
          blocks={blocks}
          onTranslationChange={handleTranslationChange}
          onApprove={handleApprove}
          onRevert={handleRevert}
          onAITranslate={handleAITranslate}
        />
      </div>

      <BottomBar
        totalBlocks={totalBlocks}
        translatedBlocks={translatedBlocks}
        apiCost={0.0012}
        logs={logs}
        isConnected={true}
      />

      {/* All Modals */}
      <SettingsModal open={modals.settings} onOpenChange={(o) => setModals((p) => ({ ...p, settings: o }))} />

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
        backups={[]}
        onRestore={(path) => console.log('[TODO] Restore:', path)}
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
        entries={[]}
        onDelete={(id) => console.log('[TODO] Delete TM:', id)}
        onClearUnused={() => console.log('[TODO] Clear unused TM')}
        onRefresh={() => console.log('[TODO] Refresh TM')}
      />

      <GlossaryModal
        open={modals.glossary}
        onOpenChange={(o) => setModals((p) => ({ ...p, glossary: o }))}
        entries={[]}
        onAdd={(e) => console.log('[TODO] Add glossary:', e)}
        onUpdate={(id, e) => console.log('[TODO] Update glossary:', id, e)}
        onDelete={(id) => console.log('[TODO] Delete glossary:', id)}
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
    </div>
  )
}

// ============================================================
// APP ROOT — Điều phối Welcome ↔ Workspace
// ============================================================
function AppContent(): ReactElement {
  const [hasProject, setHasProject] = useState(false)
  const [isWizardOpen, setIsWizardOpen] = useState(false)

  // Khởi động: check xem có project config nào trong DB không
  useEffect(() => {
    const checkProject = async (): Promise<void> => {
      const project = await window.api.project.getCurrent()
      setHasProject(!!project)
    }
    checkProject()
  }, [])

  if (!hasProject) {
    return (
      <TooltipProvider>
        <WelcomeScreen
          hasApiKey={false} // TODO: Đọc từ electron-store ở Phase 4E
          recentProjects={[]}
          onNewProject={() => setIsWizardOpen(true)}
          onOpenProject={(project) => {
            console.log('[TODO] Open project:', project)
            setHasProject(true)
          }}
        />
        <SetupWizardModal
          open={isWizardOpen}
          onOpenChange={setIsWizardOpen}
          onComplete={(config) => {
            console.log('[App] New project setup complete:', config)
            setHasProject(true)
          }}
        />
      </TooltipProvider>
    )
  }

  return (
    <TooltipProvider>
      <CATWorkspace onNewProject={() => setIsWizardOpen(true)} />
    </TooltipProvider>
  )
}

/**
 * App — Root component bọc ThemeProvider.
 */
export default function App(): ReactElement {
  return (
    <ThemeProvider defaultTheme="dark">
      <AppContent />
    </ThemeProvider>
  )
}
