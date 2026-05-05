/**
 * ExportModal.tsx
 * Modal Export project: cấu hình tuỳ chọn, progress bar,
 * terminal log và danh sách backup có thể restore.
 */
import { useState, useEffect, useCallback } from 'react'
import { Download, RotateCcw, CheckCircle2, AlertCircle, Loader2, Archive, FileText } from 'lucide-react'
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter,
} from '@renderer/components/ui/dialog'
import { Button } from '@renderer/components/ui/button'
import { Progress } from '@renderer/components/ui/progress'
import { ScrollArea } from '@renderer/components/ui/scroll-area'
import { cn } from '@renderer/lib/utils'
import type { BackupEntry, ExportFileEntry } from '../../../../shared/types'

type ExportStatus = 'idle' | 'exporting' | 'success' | 'error'

interface ExportModalProps {
  open: boolean
  onOpenChange: (open: boolean) => void
}

/**
 * ExportModal component
 */
export function ExportModal({ open, onOpenChange }: ExportModalProps) {
  const [approvedOnly, setApprovedOnly] = useState(true)
  const [exportStatus, setExportStatus] = useState<ExportStatus>('idle')
  const [exportProgress, setExportProgress] = useState(0)
  const [exportLogs, setExportLogs] = useState<string[]>([])
  const [activeTab, setActiveTab] = useState<'export' | 'backups'>('export')
  const [backups, setBackups] = useState<BackupEntry[]>([])
  const [files, setFiles] = useState<ExportFileEntry[]>([])
  const [selectedFileIds, setSelectedFileIds] = useState<number[]>([])

  const appendLog = (msg: string) => {
    setExportLogs((prev) => [...prev, `[${new Date().toLocaleTimeString()}] ${msg}`])
  }

  // Load files with changes when modal opens
  useEffect(() => {
    if (!open || activeTab !== 'export') return
    let cancelled = false
    void window.api.export.getFilesWithChanges().then((data) => {
      if (!cancelled) {
        setFiles(data)
        // Auto-select files with changes
        const changedIds = data.filter(f => f.hasChanges).map(f => f.id)
        setSelectedFileIds(changedIds)
      }
    }).catch((err) => {
      console.error('Failed to load files with changes:', err)
    })
    return () => { cancelled = true }
  }, [open, activeTab])

  // Load backups when modal opens
  useEffect(() => {
    if (!open || activeTab !== 'backups') return
    let cancelled = false
    void window.api.export.listBackups().then((data) => {
      if (!cancelled) setBackups(data)
    }).catch((err) => {
      console.error('Failed to load backups:', err)
    })
    return () => { cancelled = true }
  }, [open, activeTab])

  const toggleFileSelection = useCallback((fileId: number) => {
    setSelectedFileIds(prev =>
      prev.includes(fileId) ? prev.filter(id => id !== fileId) : [...prev, fileId]
    )
  }, [])

  const selectAll = useCallback(() => {
    setSelectedFileIds(files.map(f => f.id))
  }, [files])

  const selectNone = useCallback(() => {
    setSelectedFileIds([])
  }, [])

  const selectChangedOnly = useCallback(() => {
    setSelectedFileIds(files.filter(f => f.hasChanges).map(f => f.id))
  }, [files])

  const handleExport = async () => {
    if (selectedFileIds.length === 0) {
      appendLog('⚠ Không có file nào được chọn để export.')
      return
    }

    setExportStatus('exporting')
    setExportProgress(0)
    setExportLogs([])
    setActiveTab('export')
    appendLog(`Bắt đầu export ${selectedFileIds.length} file... [Approved only: ${approvedOnly}]`)

    try {
      const result = await window.api.export.exportSelected(selectedFileIds, approvedOnly)

      if (result.errors.length > 0) {
        for (const err of result.errors) {
          appendLog(`✗ ${err}`)
        }
      }

      // Calculate progress per file
      for (let i = 0; i <= result.totalFiles; i++) {
        setExportProgress(Math.round((i / result.totalFiles) * 100))
        if (i < result.totalFiles) {
          await new Promise((res) => setTimeout(res, 100))
        }
      }

      appendLog(`✓ Export hoàn tất — ${result.exportedFiles}/${result.totalFiles} files đã được ghi.`)
      if (result.skippedFiles > 0) {
        appendLog(`⚠ ${result.skippedFiles} file(s) bị bỏ qua do lỗi.`)
      }

      setExportStatus('success')

      // Refresh backups after export
      const updatedBackups = await window.api.export.listBackups()
      setBackups(updatedBackups)
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : String(err)
      appendLog(`✗ Export thất bại: ${message}`)
      setExportStatus('error')
    }
  }

  const handleRestore = async (backup: BackupEntry) => {
    appendLog(`Đang khôi phục ${backup.fileName} từ backup...`)
    try {
      await window.api.export.restoreBackup(backup.fileId, backup.backupPath)
      appendLog(`✓ Đã khôi phục ${backup.fileName} thành công.`)
      // Refresh backups
      const updatedBackups = await window.api.export.listBackups()
      setBackups(updatedBackups)
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : String(err)
      appendLog(`✗ Restore thất bại: ${message}`)
    }
  }

  const handleClose = () => {
    if (exportStatus === 'exporting') return
    setExportStatus('idle')
    setExportProgress(0)
    setExportLogs([])
    setBackups([])
    setFiles([])
    setSelectedFileIds([])
    onOpenChange(false)
  }

  const changedCount = files.filter(f => f.hasChanges).length
  const totalCount = files.length

  return (
    <Dialog open={open} onOpenChange={handleClose}>
      <DialogContent className="max-w-lg gap-0 p-0 overflow-hidden">
        <DialogHeader className="px-6 pt-5 pb-4 border-b border-border">
          <DialogTitle className="text-base font-semibold flex items-center gap-2">
            <Download className="size-4 text-primary" />
            Export Project
          </DialogTitle>

          {/* Tabs */}
          <div className="flex gap-1 mt-3">
            {(['export', 'backups'] as const).map((tab) => (
              <button
                key={tab}
                onClick={() => setActiveTab(tab)}
                className={cn(
                  'px-3 py-1 rounded-md text-xs font-medium transition-colors capitalize',
                  activeTab === tab
                    ? 'bg-primary text-primary-foreground'
                    : 'text-muted-foreground hover:text-foreground hover:bg-muted'
                )}
              >
                {tab === 'export' ? 'Export' : `Backups (${backups.length})`}
              </button>
            ))}
          </div>
        </DialogHeader>

        <div className="px-6 py-5 space-y-4 min-h-[280px]">

          {/* ======== EXPORT TAB ======== */}
          {activeTab === 'export' && (
            <>
              {/* File Selection List */}
              {exportStatus === 'idle' && files.length > 0 && (
                <div className="space-y-2">
                  <div className="flex items-center justify-between">
                    <p className="text-xs font-medium text-muted-foreground uppercase tracking-wider">
                      Files ({changedCount}/{totalCount} có thay đổi)
                    </p>
                    <div className="flex gap-1">
                      <Button variant="ghost" size="sm" className="h-6 text-[10px]" onClick={selectChangedOnly}>
                        Chọn files có thay đổi
                      </Button>
                      <Button variant="ghost" size="sm" className="h-6 text-[10px]" onClick={selectAll}>
                        Chọn tất cả
                      </Button>
                      <Button variant="ghost" size="sm" className="h-6 text-[10px]" onClick={selectNone}>
                        Bỏ chọn
                      </Button>
                    </div>
                  </div>

                  <ScrollArea className="h-40 rounded-md border border-border bg-muted/10">
                    <div className="p-2 space-y-0.5">
                      {files.map((file) => (
                        <label
                          key={file.id}
                          className={cn(
                            'flex items-center gap-2 px-2 py-1.5 rounded-sm cursor-pointer transition-colors text-xs',
                            selectedFileIds.includes(file.id)
                              ? 'bg-primary/10 text-foreground'
                              : 'hover:bg-muted/50 text-muted-foreground'
                          )}
                        >
                          <input
                            type="checkbox"
                            checked={selectedFileIds.includes(file.id)}
                            onChange={() => toggleFileSelection(file.id)}
                            className="accent-primary flex-shrink-0"
                          />
                          <FileText className="size-3 flex-shrink-0" />
                          <span className="truncate flex-1 font-mono">{file.fileName}</span>
                          <div className="flex items-center gap-1 flex-shrink-0">
                            {file.hasChanges && (
                              <span className="px-1 py-0.5 rounded bg-primary/20 text-primary text-[9px] font-medium">
                                {file.translatedBlocks}/{file.totalBlocks}
                              </span>
                            )}
                            {!file.hasChanges && (
                              <span className="text-[9px] text-muted-foreground italic">chưa dịch</span>
                            )}
                          </div>
                        </label>
                      ))}
                    </div>
                  </ScrollArea>
                  {selectedFileIds.length === 0 && (
                    <p className="text-[10px] text-warning">⚠ Chưa chọn file nào để export.</p>
                  )}
                </div>
              )}

              {/* Options */}
              {exportStatus === 'idle' && (
                <div className="space-y-3">
                  <label className="flex items-start gap-3 p-3 rounded-md border border-border bg-muted/30 cursor-pointer hover:bg-muted/50 transition-colors">
                    <input
                      id="checkbox-approved-only"
                      type="checkbox"
                      checked={approvedOnly}
                      onChange={(e) => setApprovedOnly(e.target.checked)}
                      className="mt-0.5 accent-primary"
                    />
                    <div>
                      <p className="text-sm font-medium text-foreground">Chỉ export Approved</p>
                      <p className="text-xs text-muted-foreground mt-0.5">
                        Block Draft/Empty/Warning sẽ fallback về bản gốc.
                      </p>
                    </div>
                  </label>
                </div>
              )}

              {/* Progress */}
              {(exportStatus === 'exporting' || exportStatus === 'success') && (
                <div className="space-y-3">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2">
                      {exportStatus === 'exporting'
                        ? <Loader2 className="size-4 text-primary animate-spin" />
                        : <CheckCircle2 className="size-4 text-success" />
                      }
                      <span className="text-sm font-medium">
                        {exportStatus === 'exporting' ? 'Đang export...' : 'Hoàn tất!'}
                      </span>
                    </div>
                    <span className="text-xs text-muted-foreground font-mono">{exportProgress}%</span>
                  </div>
                  <Progress
                    value={exportProgress}
                    indicatorClassName={exportStatus === 'success' ? 'bg-success' : 'bg-primary'}
                  />
                </div>
              )}

              {exportStatus === 'error' && (
                <div className="flex items-center gap-2 p-3 rounded-md border border-destructive/30 bg-destructive/10">
                  <AlertCircle className="size-4 text-destructive" />
                  <span className="text-sm text-destructive">Export thất bại. Kiểm tra console để biết chi tiết.</span>
                </div>
              )}

              {/* Terminal Log */}
              {exportLogs.length > 0 && (
                <div className="space-y-1.5">
                  <p className="text-[11px] font-medium text-muted-foreground uppercase tracking-wider">Log</p>
                  <ScrollArea className="h-28 rounded-md border border-border bg-terminal-bg">
                    <div className="p-3 space-y-0.5">
                      {exportLogs.map((log, i) => (
                        <p key={i} className="text-[11px] font-mono text-foreground/70">{log}</p>
                      ))}
                    </div>
                  </ScrollArea>
                </div>
              )}
            </>
          )}

          {/* ======== BACKUPS TAB ======== */}
          {activeTab === 'backups' && (
            <div className="space-y-2">
              <p className="text-xs text-muted-foreground">
                Chọn backup để khôi phục file .rpy về bản gốc trước khi dịch.
              </p>
              {backups.length === 0 ? (
                <div className="flex flex-col items-center justify-center h-40 gap-2 text-muted-foreground">
                  <Archive className="size-8 opacity-30" />
                  <p className="text-xs italic">Chưa có backup nào.</p>
                </div>
              ) : (
                <ScrollArea className="h-52">
                  <div className="space-y-1.5">
                    {backups.map((backup, i) => (
                      <div
                        key={i}
                        className="flex items-center justify-between p-3 rounded-md border border-border bg-card hover:bg-accent/50 transition-colors"
                      >
                        <div className="min-w-0">
                          <p className="text-sm font-medium text-foreground">{backup.fileName}</p>
                          <p className="text-[11px] text-muted-foreground font-mono truncate mt-0.5">
                            {backup.backupPath}
                          </p>
                          <p className="text-[10px] text-muted-foreground">{backup.createdAt}</p>
                        </div>
                        <Button
                          id={`btn-restore-${i}`}
                          variant="outline"
                          size="sm"
                          className="flex-shrink-0 ml-3 h-7 text-xs gap-1.5"
                          onClick={() => handleRestore(backup)}
                        >
                          <RotateCcw className="size-3" />
                          Restore
                        </Button>
                      </div>
                    ))}
                  </div>
                </ScrollArea>
              )}
            </div>
          )}
        </div>

        <DialogFooter className="px-6 py-4 border-t border-border bg-muted/20">
          <Button variant="outline" onClick={handleClose} disabled={exportStatus === 'exporting'}>
            {exportStatus === 'success' ? 'Close' : 'Cancel'}
          </Button>
          {activeTab === 'export' && exportStatus === 'idle' && (
            <Button
              id="btn-start-export"
              onClick={handleExport}
              disabled={selectedFileIds.length === 0}
            >
              <Download className="size-3.5 mr-1.5" />
              Export {selectedFileIds.length} file{selectedFileIds.length !== 1 ? 's' : ''}
            </Button>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
