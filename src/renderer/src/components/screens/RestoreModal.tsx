import { useCallback, useEffect, useState, type ReactElement } from 'react'
import { AlertCircle, CheckCircle2, FileText, RotateCcw, TriangleAlert, X } from 'lucide-react'
import {
  Dialog, DialogContent, DialogHeader, DialogTitle,
} from '@renderer/components/ui/dialog'
import { Button } from '@renderer/components/ui/button'
import { ScrollArea } from '@renderer/components/ui/scroll-area'
import { cn } from '@renderer/lib/utils'
import type { ExportFileEntry } from '../../../../shared/types'

interface RestoreModalProps {
  open: boolean
  onOpenChange: (open: boolean) => void
}

export function RestoreModal({ open, onOpenChange }: RestoreModalProps): ReactElement {
  const [files, setFiles] = useState<ExportFileEntry[]>([])
  const [restoringId, setRestoringId] = useState<number | null>(null)
  const [confirmTarget, setConfirmTarget] = useState<ExportFileEntry | null>(null)
  const [message, setMessage] = useState<{ type: 'success' | 'error'; text: string } | null>(null)

  const loadFiles = useCallback(async () => {
    const data = await window.api.export.getFilesWithChanges()
    setFiles(data)
  }, [])

  useEffect(() => {
    if (!open) return
    const timer = setTimeout(() => {
      setMessage(null)
      setConfirmTarget(null)
      void loadFiles().catch((err: unknown) => {
        setMessage({ type: 'error', text: `Failed to load files: ${err instanceof Error ? err.message : String(err)}` })
      })
    }, 0)
    return () => clearTimeout(timer)
  }, [open, loadFiles])

  const doRestore = useCallback(async (file: ExportFileEntry) => {
    setRestoringId(file.id)
    setConfirmTarget(null)
    setMessage(null)
    try {
      await window.api.export.restoreOriginal(file.id)
      setMessage({ type: 'success', text: `${file.fileName} restored to original text.` })
      await loadFiles()
    } catch (err: unknown) {
      setMessage({ type: 'error', text: `Restore failed: ${err instanceof Error ? err.message : String(err)}` })
    } finally {
      setRestoringId(null)
    }
  }, [loadFiles])

  return (
    <Dialog open={open} onOpenChange={(nextOpen) => { if (!nextOpen) setConfirmTarget(null); onOpenChange(nextOpen) }}>
      <DialogContent className="max-w-2xl max-h-[80vh] flex flex-col">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <RotateCcw className="size-4" />
            Restore to Original
          </DialogTitle>
        </DialogHeader>

        {message && (
          <div className={cn(
            'flex items-center gap-2 px-3 py-2 rounded-md text-xs',
            message.type === 'success' ? 'bg-green-500/10 text-green-600' : 'bg-red-500/10 text-red-600'
          )}>
            {message.type === 'success'
              ? <CheckCircle2 className="size-3.5 flex-shrink-0" />
              : <AlertCircle className="size-3.5 flex-shrink-0" />}
            {message.text}
          </div>
        )}

        {confirmTarget && (
          <div className="flex items-center gap-3 px-3 py-2.5 rounded-md border border-amber-300 bg-amber-500/10">
            <TriangleAlert className="size-4 text-amber-500 flex-shrink-0" />
            <p className="text-xs text-foreground flex-1">
              Restore <strong>{confirmTarget.fileName}</strong>? This clears translations for this file and rewrites original text back into the .rpy file.
            </p>
            <Button variant="outline" size="sm" className="h-7 text-xs" onClick={() => setConfirmTarget(null)}>
              <X className="size-3 mr-1" />
              Cancel
            </Button>
            <Button variant="default" size="sm" className="h-7 text-xs gap-1" onClick={() => void doRestore(confirmTarget)}>
              {restoringId === confirmTarget.id
                ? <span className="size-3 animate-spin rounded-full border-2 border-current border-t-transparent" />
                : <RotateCcw className="size-3" />}
              Confirm Restore
            </Button>
          </div>
        )}

        <div className="flex-1 min-h-0">
          {files.length === 0 ? (
            <div className="flex flex-col items-center justify-center h-40 gap-2 text-muted-foreground">
              <FileText className="size-8 opacity-30" />
              <p className="text-xs italic">No files are loaded for this project.</p>
            </div>
          ) : (
            <ScrollArea className="h-[50vh] pr-3">
              <div className="space-y-1">
                {files.map((file) => (
                  <div key={file.id} className="rounded-md border border-border bg-card overflow-hidden">
                    <div className="flex items-center gap-2 px-3 py-2.5">
                      <FileText className="size-4 flex-shrink-0 text-primary" />
                      <div className="min-w-0 flex-1">
                        <span className="text-sm font-medium text-foreground truncate block">{file.fileName}</span>
                        <p className="text-[11px] text-muted-foreground font-mono truncate">{file.filePath}</p>
                      </div>
                      <span className="text-[10px] text-muted-foreground flex-shrink-0">
                        {file.translatedBlocks}/{file.totalBlocks}
                      </span>
                      <Button
                        variant="outline"
                        size="sm"
                        className="h-7 text-xs gap-1"
                        onClick={() => setConfirmTarget(file)}
                        disabled={restoringId !== null || confirmTarget !== null}
                      >
                        <RotateCcw className="size-3" />
                        Restore
                      </Button>
                    </div>
                  </div>
                ))}
              </div>
            </ScrollArea>
          )}
        </div>
      </DialogContent>
    </Dialog>
  )
}
