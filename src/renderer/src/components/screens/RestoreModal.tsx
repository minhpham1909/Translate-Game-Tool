import { useState, useEffect, useCallback } from 'react'
import { RotateCcw, ChevronDown, ChevronRight, HardDrive, Clock, FileText, Archive, CheckCircle2, AlertCircle, TriangleAlert, X } from 'lucide-react'
import {
  Dialog, DialogContent, DialogHeader, DialogTitle,
} from '@renderer/components/ui/dialog'
import { Button } from '@renderer/components/ui/button'
import { ScrollArea } from '@renderer/components/ui/scroll-area'
import { cn } from '@renderer/lib/utils'
import type { BackupEntry } from '../../../../shared/types'

interface RestoreModalProps {
  open: boolean
  onOpenChange: (open: boolean) => void
}

interface FileGroup {
  fileId: number
  fileName: string
  filePath: string
  backups: BackupEntry[]
}

function formatFileSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`
}

export function RestoreModal({ open, onOpenChange }: RestoreModalProps) {
  const [groups, setGroups] = useState<FileGroup[]>([])
  const [expandedIds, setExpandedIds] = useState<Set<number>>(new Set())
  const [restoring, setRestoring] = useState<{ fileId: number; backupPath: string } | null>(null)
  const [confirmTarget, setConfirmTarget] = useState<{ fileId: number; backupPath: string; name: string } | null>(null)
  const [message, setMessage] = useState<{ type: 'success' | 'error'; text: string } | null>(null)

  // Load backups khi modal mở
  useEffect(() => {
    if (!open) return
    let cancelled = false
    setMessage(null)
    setConfirmTarget(null)
    void window.api.export.listBackups().then((data) => {
      if (cancelled) return
      // Group theo fileId
      const map = new Map<number, FileGroup>()
      for (const b of data) {
        let g = map.get(b.fileId)
        if (!g) {
          g = { fileId: b.fileId, fileName: b.fileName, filePath: b.filePath, backups: [] }
          map.set(b.fileId, g)
        }
        g.backups.push(b)
      }
      // Sort groups: fileName asc
      const sorted = Array.from(map.values()).sort((a, b) => a.fileName.localeCompare(b.fileName))
      // Mỗi nhóm sort backups: mới nhất lên đầu
      for (const g of sorted) {
        g.backups.sort((a, bb) => bb.createdAt.localeCompare(a.createdAt))
      }
      setGroups(sorted)
    }).catch((err) => {
      if (!cancelled) {
        setMessage({ type: 'error', text: `Failed to load backups: ${err instanceof Error ? err.message : String(err)}` })
      }
    })
    return () => { cancelled = true }
  }, [open])

  const toggleExpand = useCallback((fileId: number) => {
    setExpandedIds((prev) => {
      const next = new Set(prev)
      if (next.has(fileId)) next.delete(fileId)
      else next.add(fileId)
      return next
    })
  }, [])

  const doRestore = useCallback(async (fileId: number, backupPath: string) => {
    setRestoring({ fileId, backupPath })
    setConfirmTarget(null)
    setMessage(null)
    try {
      await window.api.export.restoreBackup(fileId, backupPath)
      setMessage({ type: 'success', text: 'Khôi phục thành công.' })
      // Refresh
      const data = await window.api.export.listBackups()
      const map = new Map<number, FileGroup>()
      for (const b of data) {
        let g = map.get(b.fileId)
        if (!g) {
          g = { fileId: b.fileId, fileName: b.fileName, filePath: b.filePath, backups: [] }
          map.set(b.fileId, g)
        }
        g.backups.push(b)
      }
      const sorted = Array.from(map.values()).sort((a, b) => a.fileName.localeCompare(b.fileName))
      for (const g of sorted) {
        g.backups.sort((a, bb) => bb.createdAt.localeCompare(a.createdAt))
      }
      setGroups(sorted)
    } catch (err: unknown) {
      setMessage({ type: 'error', text: `Restore thất bại: ${err instanceof Error ? err.message : String(err)}` })
    } finally {
      setRestoring(null)
    }
  }, [])

  return (
    <Dialog open={open} onOpenChange={(o) => { if (!o) setConfirmTarget(null); onOpenChange(o) }}>
      <DialogContent className="max-w-2xl max-h-[80vh] flex flex-col">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <RotateCcw className="size-4" />
            Restore Backup
          </DialogTitle>
        </DialogHeader>

        {message && (
          <div className={cn(
            'flex items-center gap-2 px-3 py-2 rounded-md text-xs',
            message.type === 'success' ? 'bg-green-500/10 text-green-600' : 'bg-red-500/10 text-red-600'
          )}>
            {message.type === 'success' ? <CheckCircle2 className="size-3.5 flex-shrink-0" /> : <AlertCircle className="size-3.5 flex-shrink-0" />}
            {message.text}
          </div>
        )}

        {/* Confirm bar */}
        {confirmTarget && (
          <div className="flex items-center gap-3 px-3 py-2.5 rounded-md border border-amber-300 bg-amber-500/10">
            <TriangleAlert className="size-4 text-amber-500 flex-shrink-0" />
            <p className="text-xs text-foreground flex-1">
              Khôi phục <strong>{confirmTarget.name}</strong>? Hành động này sẽ xoá toàn bộ bản dịch hiện tại của file này.
            </p>
            <Button variant="outline" size="sm" className="h-7 text-xs" onClick={() => setConfirmTarget(null)}>
              <X className="size-3 mr-1" />
              Cancel
            </Button>
            <Button variant="default" size="sm" className="h-7 text-xs gap-1" onClick={() => doRestore(confirmTarget.fileId, confirmTarget.backupPath)}>
              {restoring?.backupPath === confirmTarget.backupPath ? (
                <span className="size-3 animate-spin rounded-full border-2 border-current border-t-transparent" />
              ) : (
                <RotateCcw className="size-3" />
              )}
              Confirm Restore
            </Button>
          </div>
        )}

        <div className="flex-1 min-h-0">
          {groups.length === 0 ? (
            <div className="flex flex-col items-center justify-center h-40 gap-2 text-muted-foreground">
              <Archive className="size-8 opacity-30" />
              <p className="text-xs italic">Chưa có backup nào.</p>
            </div>
          ) : (
            <ScrollArea className="h-[50vh] pr-3">
              <div className="space-y-1">
                {groups.map((group) => {
                  const isExpanded = expandedIds.has(group.fileId)
                  const latestDate = group.backups[0]?.createdAt ?? ''
                  return (
                    <div key={group.fileId} className="rounded-md border border-border bg-card overflow-hidden">
                      {/* File group header */}
                      <button
                        onClick={() => toggleExpand(group.fileId)}
                        className="w-full flex items-center gap-2 px-3 py-2.5 text-left hover:bg-accent/50 transition-colors"
                      >
                        {isExpanded ? <ChevronDown className="size-3.5 flex-shrink-0 text-muted-foreground" /> : <ChevronRight className="size-3.5 flex-shrink-0 text-muted-foreground" />}
                        <FileText className="size-4 flex-shrink-0 text-primary" />
                        <div className="min-w-0 flex-1">
                          <div className="flex items-center gap-2">
                            <span className="text-sm font-medium text-foreground truncate">{group.fileName}</span>
                            <span className="text-[10px] px-1.5 py-0.5 rounded-full bg-muted text-muted-foreground flex-shrink-0">
                              {group.backups.length}
                            </span>
                          </div>
                          <p className="text-[11px] text-muted-foreground font-mono truncate">{group.filePath}</p>
                        </div>
                        <span className="text-[10px] text-muted-foreground flex-shrink-0">{latestDate}</span>
                      </button>

                      {/* Backup list (expandable) */}
                      {isExpanded && (
                        <div className="border-t border-border divide-y divide-border">
                          {group.backups.map((backup, i) => (
                            <div key={i} className="flex items-center justify-between px-3 py-2 pl-9 hover:bg-accent/30 transition-colors">
                              <div className="min-w-0 flex-1">
                                <p className="text-xs text-muted-foreground font-mono truncate" title={backup.backupPath}>
                                  {backup.backupPath.split(/[\\/]/).pop()}
                                </p>
                                <div className="flex items-center gap-3 mt-0.5">
                                  <span className="flex items-center gap-1 text-[10px] text-muted-foreground">
                                    <Clock className="size-3" />
                                    {backup.createdAt}
                                  </span>
                                  <span className="flex items-center gap-1 text-[10px] text-muted-foreground">
                                    <HardDrive className="size-3" />
                                    {formatFileSize(backup.fileSize)}
                                  </span>
                                </div>
                              </div>
                              <Button
                                variant="outline"
                                size="sm"
                                className="flex-shrink-0 ml-3 h-7 text-xs gap-1"
                                onClick={() => setConfirmTarget({
                                  fileId: backup.fileId,
                                  backupPath: backup.backupPath,
                                  name: backup.backupPath.split(/[\\/]/).pop() ?? backup.fileName,
                                })}
                                disabled={restoring !== null || confirmTarget !== null}
                              >
                                <RotateCcw className="size-3" />
                                Restore
                              </Button>
                            </div>
                          ))}
                        </div>
                      )}
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
