import { useCallback, useEffect, useState, type ReactElement } from 'react'
import { AlertCircle, CheckCircle2, Download, FileText, Loader2 } from 'lucide-react'
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter,
} from '@renderer/components/ui/dialog'
import { Button } from '@renderer/components/ui/button'
import { Progress } from '@renderer/components/ui/progress'
import { ScrollArea } from '@renderer/components/ui/scroll-area'
import { cn } from '@renderer/lib/utils'
import type { ExportFileEntry } from '../../../../shared/types'

type ExportStatus = 'idle' | 'exporting' | 'success' | 'error'

interface ExportModalProps {
  open: boolean
  onOpenChange: (open: boolean) => void
}

export function ExportModal({ open, onOpenChange }: ExportModalProps): ReactElement {
  const [approvedOnly, setApprovedOnly] = useState(true)
  const [exportStatus, setExportStatus] = useState<ExportStatus>('idle')
  const [exportProgress, setExportProgress] = useState(0)
  const [exportLogs, setExportLogs] = useState<string[]>([])
  const [files, setFiles] = useState<ExportFileEntry[]>([])
  const [selectedFileIds, setSelectedFileIds] = useState<number[]>([])

  const appendLog = (msg: string): void => {
    setExportLogs((prev) => [...prev, `[${new Date().toLocaleTimeString()}] ${msg}`])
  }

  useEffect(() => {
    if (!open) return
    let cancelled = false
    void window.api.export.getFilesWithChanges().then((data) => {
      if (cancelled) return
      setFiles(data)
      setSelectedFileIds(data.filter((file) => file.hasChanges).map((file) => file.id))
    }).catch((err) => {
      console.error('Failed to load files with changes:', err)
    })
    return () => { cancelled = true }
  }, [open])

  const toggleFileSelection = useCallback((fileId: number) => {
    setSelectedFileIds((prev) =>
      prev.includes(fileId) ? prev.filter((id) => id !== fileId) : [...prev, fileId]
    )
  }, [])

  const selectAll = useCallback(() => {
    setSelectedFileIds(files.map((file) => file.id))
  }, [files])

  const selectNone = useCallback(() => {
    setSelectedFileIds([])
  }, [])

  const selectChangedOnly = useCallback(() => {
    setSelectedFileIds(files.filter((file) => file.hasChanges).map((file) => file.id))
  }, [files])

  const handleExport = async (): Promise<void> => {
    if (selectedFileIds.length === 0) {
      appendLog('No files selected for export.')
      return
    }

    setExportStatus('exporting')
    setExportProgress(0)
    setExportLogs([])
    appendLog(`Starting export for ${selectedFileIds.length} file(s). Approved only: ${approvedOnly}`)

    try {
      const result = await window.api.export.exportSelected(selectedFileIds, approvedOnly)

      for (const err of result.errors) {
        appendLog(`Error: ${err}`)
      }

      for (let i = 0; i <= result.totalFiles; i++) {
        setExportProgress(Math.round((i / Math.max(1, result.totalFiles)) * 100))
        if (i < result.totalFiles) await new Promise((resolve) => setTimeout(resolve, 100))
      }

      appendLog(`Export complete: ${result.exportedFiles}/${result.totalFiles} file(s) written.`)
      if (result.skippedFiles > 0) appendLog(`${result.skippedFiles} file(s) skipped due to errors.`)
      setExportStatus('success')
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : String(err)
      appendLog(`Export failed: ${message}`)
      setExportStatus('error')
    }
  }

  const handleClose = (): void => {
    if (exportStatus === 'exporting') return
    setExportStatus('idle')
    setExportProgress(0)
    setExportLogs([])
    setFiles([])
    setSelectedFileIds([])
    onOpenChange(false)
  }

  const changedCount = files.filter((file) => file.hasChanges).length

  return (
    <Dialog open={open} onOpenChange={handleClose}>
      <DialogContent className="max-w-lg gap-0 p-0 overflow-hidden">
        <DialogHeader className="px-6 pt-5 pb-4 border-b border-border">
          <DialogTitle className="text-base font-semibold flex items-center gap-2">
            <Download className="size-4 text-primary" />
            Export Project
          </DialogTitle>
        </DialogHeader>

        <div className="px-6 py-5 space-y-4 min-h-[280px]">
          {exportStatus === 'idle' && files.length > 0 && (
            <div className="space-y-2">
              <div className="flex items-center justify-between">
                <p className="text-xs font-medium text-muted-foreground uppercase tracking-wider">
                  Files ({changedCount}/{files.length} changed)
                </p>
                <div className="flex gap-1">
                  <Button variant="ghost" size="sm" className="h-6 text-[10px]" onClick={selectChangedOnly}>
                    Changed
                  </Button>
                  <Button variant="ghost" size="sm" className="h-6 text-[10px]" onClick={selectAll}>
                    All
                  </Button>
                  <Button variant="ghost" size="sm" className="h-6 text-[10px]" onClick={selectNone}>
                    None
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
                      <span className="text-[9px] text-muted-foreground">
                        {file.translatedBlocks}/{file.totalBlocks}
                      </span>
                    </label>
                  ))}
                </div>
              </ScrollArea>
              {selectedFileIds.length === 0 && (
                <p className="text-[10px] text-warning">No files selected.</p>
              )}
            </div>
          )}

          {exportStatus === 'idle' && (
            <label className="flex items-start gap-3 p-3 rounded-md border border-border bg-muted/30 cursor-pointer hover:bg-muted/50 transition-colors">
              <input
                id="checkbox-approved-only"
                type="checkbox"
                checked={approvedOnly}
                onChange={(e) => setApprovedOnly(e.target.checked)}
                className="mt-0.5 accent-primary"
              />
              <div>
                <p className="text-sm font-medium text-foreground">Export approved only</p>
                <p className="text-xs text-muted-foreground mt-0.5">
                  Draft, warning, and empty blocks fall back to original text.
                </p>
              </div>
            </label>
          )}

          {(exportStatus === 'exporting' || exportStatus === 'success') && (
            <div className="space-y-3">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  {exportStatus === 'exporting'
                    ? <Loader2 className="size-4 text-primary animate-spin" />
                    : <CheckCircle2 className="size-4 text-success" />
                  }
                  <span className="text-sm font-medium">
                    {exportStatus === 'exporting' ? 'Exporting...' : 'Complete'}
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
              <span className="text-sm text-destructive">Export failed. Check the log for details.</span>
            </div>
          )}

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
        </div>

        <DialogFooter className="px-6 py-4 border-t border-border bg-muted/20">
          <Button variant="outline" onClick={handleClose} disabled={exportStatus === 'exporting'}>
            {exportStatus === 'success' ? 'Close' : 'Cancel'}
          </Button>
          {exportStatus === 'idle' && (
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
