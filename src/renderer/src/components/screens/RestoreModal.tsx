import { useState, useEffect, useCallback } from 'react'
import { RotateCcw, FileText, CheckCircle2, AlertCircle, Loader2 } from 'lucide-react'
import {
  Dialog, DialogContent, DialogHeader, DialogTitle,
} from '@renderer/components/ui/dialog'
import { Button } from '@renderer/components/ui/button'
import { ScrollArea } from '@renderer/components/ui/scroll-area'
import { Badge } from '@renderer/components/ui/badge'
import { Progress } from '@renderer/components/ui/progress'
import { cn } from '@renderer/lib/utils'
import type { ExportFileEntry } from '../../../../shared/types'

interface RestoreModalProps {
  open: boolean
  onOpenChange: (open: boolean) => void
}

export function RestoreModal({ open, onOpenChange }: RestoreModalProps) {
  const [files, setFiles] = useState<ExportFileEntry[]>([])
  const [restoringId, setRestoringId] = useState<number | null>(null)
  const [message, setMessage] = useState<{ type: 'success' | 'error'; text: string } | null>(null)

  useEffect(() => {
    if (!open) return
    setMessage(null)
    loadFiles()
  }, [open])

  const loadFiles = useCallback(async () => {
    try {
      const data = await window.api.export.getFilesWithChanges()
      setFiles(data)
    } catch (err: unknown) {
      setMessage({ type: 'error', text: `Failed to load files: ${err instanceof Error ? err.message : String(err)}` })
    }
  }, [])

  const handleRestore = useCallback(async (fileId: number) => {
    setRestoringId(fileId)
    setMessage(null)
    try {
      await window.api.export.restoreToOriginal(fileId)
      setMessage({ type: 'success', text: `File restored to original successfully.` })
      await loadFiles()
    } catch (err: unknown) {
      setMessage({ type: 'error', text: `Restore failed: ${err instanceof Error ? err.message : String(err)}` })
    } finally {
      setRestoringId(null)
    }
  }, [loadFiles])

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
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

        <div className="flex-1 min-h-0">
          {files.length === 0 ? (
            <div className="flex flex-col items-center justify-center h-40 gap-2 text-muted-foreground">
              <FileText className="size-8 opacity-30" />
              <p className="text-xs italic">No files in project.</p>
            </div>
          ) : (
            <ScrollArea className="h-[50vh] pr-3">
              <div className="space-y-1.5">
                {files.map((file) => {
                  const percent = file.totalBlocks > 0 ? Math.round((file.translatedBlocks / file.totalBlocks) * 100) : 0
                  return (
                    <div key={file.id} className="flex items-center justify-between p-3 rounded-md border border-border bg-card hover:bg-accent/30 transition-colors">
                      <div className="min-w-0 flex-1">
                        <div className="flex items-center gap-2">
                          <FileText className="size-4 flex-shrink-0 text-primary" />
                          <span className="text-sm font-medium text-foreground truncate">{file.fileName}</span>
                          {file.hasChanges && (
                            <Badge variant="secondary" className="text-[10px] px-1 py-0 h-4">Changes</Badge>
                          )}
                        </div>
                        <p className="text-[11px] text-muted-foreground font-mono truncate mt-0.5">{file.filePath}</p>
                        <div className="flex items-center gap-3 mt-1.5">
                          <Progress value={percent} className="h-1.5 w-24" />
                          <span className="text-[10px] text-muted-foreground tabular-nums">
                            {file.translatedBlocks}/{file.totalBlocks}
                          </span>
                        </div>
                      </div>
                      <Button
                        variant="outline"
                        size="sm"
                        className="flex-shrink-0 ml-3 h-7 text-xs gap-1"
                        onClick={() => handleRestore(file.id)}
                        disabled={restoringId === file.id}
                      >
                        {restoringId === file.id ? (
                          <Loader2 className="size-3 animate-spin" />
                        ) : (
                          <RotateCcw className="size-3" />
                        )}
                        Restore
                      </Button>
                    </div>
                  )
                })}
              </div>
            </ScrollArea>
          )}
        </div>
      </DialogContent>
    </Dialog>
  )
}
