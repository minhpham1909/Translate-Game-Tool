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
  const [processingId, setProcessingId] = useState<number | null>(null)
  const [clearingAll, setClearingAll] = useState(false)
  const [removingFromGame, setRemovingFromGame] = useState(false)
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

  const handleClearFile = useCallback(async (fileId: number) => {
    setProcessingId(fileId)
    setMessage(null)
    try {
      await window.api.export.clearFileTranslations(fileId, true)
      setMessage({ type: 'success', text: `Cleared translated content for selected file.` })
      await loadFiles()
    } catch (err: unknown) {
      setMessage({ type: 'error', text: `Clear failed: ${err instanceof Error ? err.message : String(err)}` })
    } finally {
      setProcessingId(null)
    }
  }, [loadFiles])

  const handleRemoveFromGame = useCallback(async () => {
    const step1 = window.confirm('Remove all exported translation files from game/tl/<target> and language bootstrap script?')
    if (!step1) return
    const step2 = window.prompt('Type REMOVE to confirm:')
    if (step2 !== 'REMOVE') return

    setRemovingFromGame(true)
    setMessage(null)
    try {
      const result = await window.api.export.removeFromGame()
      const folderStatus = result.removedTargetFolder ? 'target folder removed' : 'target folder not found'
      const bootstrapStatus = result.removedBootstrapScript ? 'bootstrap removed' : 'bootstrap not found'
      setMessage({ type: 'success', text: `Removed translation from game: ${folderStatus}, ${bootstrapStatus}.` })
      await loadFiles()
    } catch (err: unknown) {
      setMessage({ type: 'error', text: `Remove from game failed: ${err instanceof Error ? err.message : String(err)}` })
    } finally {
      setRemovingFromGame(false)
    }
  }, [loadFiles])

  const handleClearAll = useCallback(async () => {
    const step1 = window.confirm('Clear translations for ALL files? This cannot be undone from editor history.')
    if (!step1) return
    const step2 = window.prompt('Type CLEAR to confirm:')
    if (step2 !== 'CLEAR') return

    setClearingAll(true)
    setMessage(null)
    try {
      const result = await window.api.export.clearAllTranslations(true)
      setMessage({ type: 'success', text: `Cleared translations for ${result.clearedFiles} file(s).` })
      await loadFiles()
    } catch (err: unknown) {
      setMessage({ type: 'error', text: `Clear-all failed: ${err instanceof Error ? err.message : String(err)}` })
    } finally {
      setClearingAll(false)
    }
  }, [loadFiles])

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl max-h-[80vh] flex flex-col">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <RotateCcw className="size-4" />
            Translation Cleanup
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
                        onClick={() => handleClearFile(file.id)}
                        disabled={processingId === file.id || clearingAll}
                      >
                        {processingId === file.id ? (
                          <Loader2 className="size-3 animate-spin" />
                        ) : (
                          <RotateCcw className="size-3" />
                        )}
                        Clear file
                      </Button>
                    </div>
                  )
                })}
              </div>
            </ScrollArea>
          )}
        </div>
        <div className="pt-3 border-t border-border flex justify-end">
          <div className="flex items-center gap-2">
            <Button
              variant="outline"
              size="sm"
              className="text-destructive border-destructive/30 hover:text-destructive hover:bg-destructive/10"
              disabled={clearingAll || processingId !== null || removingFromGame}
              onClick={() => { void handleClearAll() }}
            >
              {clearingAll ? <Loader2 className="size-3 mr-1 animate-spin" /> : <RotateCcw className="size-3 mr-1" />}
              Clear all files
            </Button>
            <Button
              variant="outline"
              size="sm"
              className="text-destructive border-destructive/30 hover:text-destructive hover:bg-destructive/10"
              disabled={removingFromGame || processingId !== null || clearingAll}
              onClick={() => { void handleRemoveFromGame() }}
            >
              {removingFromGame ? <Loader2 className="size-3 mr-1 animate-spin" /> : <RotateCcw className="size-3 mr-1" />}
              Remove translation from game
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  )
}
