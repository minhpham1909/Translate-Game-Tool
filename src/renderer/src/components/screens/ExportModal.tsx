/**
 * ExportModal.tsx
 * Modal Export project: cấu hình tuỳ chọn, progress bar,
 * terminal log và danh sách backup có thể restore.
 */
import { useState } from 'react'
import { Download, RotateCcw, CheckCircle2, AlertCircle, Loader2, Archive } from 'lucide-react'
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter,
} from '@renderer/components/ui/dialog'
import { Button } from '@renderer/components/ui/button'
import { Progress } from '@renderer/components/ui/progress'
import { ScrollArea } from '@renderer/components/ui/scroll-area'
import { cn } from '@renderer/lib/utils'

type ExportStatus = 'idle' | 'exporting' | 'success' | 'error'

interface BackupEntry {
  fileId: number
  fileName: string
  backupPath: string
  createdAt: string
}

interface ExportModalProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  backups?: BackupEntry[]
  onRestore: (backupPath: string) => void
}

/**
 * ExportModal component
 * @param backups - Danh sách file backup hiện có
 * @param onRestore - Callback khi user muốn restore backup
 */
export function ExportModal({ open, onOpenChange, backups = [], onRestore }: ExportModalProps) {
  const [createBackup, setCreateBackup] = useState(true)
  const [approvedOnly, setApprovedOnly] = useState(true)
  const [exportStatus, setExportStatus] = useState<ExportStatus>('idle')
  const [exportProgress, setExportProgress] = useState(0)
  const [exportLogs, setExportLogs] = useState<string[]>([])
  const [activeTab, setActiveTab] = useState<'export' | 'backups'>('export')

  const appendLog = (msg: string) => {
    setExportLogs((prev) => [...prev, `[${new Date().toLocaleTimeString()}] ${msg}`])
  }

  const handleExport = async () => {
    setExportStatus('exporting')
    setExportProgress(0)
    setExportLogs([])
    appendLog('Bắt đầu quá trình export...')

    // TODO: Thay bằng window.api.export.exportProject() ở Phase 4E
    const steps = [
      { p: 15, msg: 'Đang tải dữ liệu từ database...' },
      { p: 30, msg: 'Đang tạo backup cho script.rpy...' },
      { p: 50, msg: 'Đang ghi bản dịch vào script.rpy...' },
      { p: 70, msg: 'Đang xử lý chapter1.rpy...' },
      { p: 85, msg: 'Đang xử lý chapter2.rpy...' },
      { p: 100, msg: '✓ Export hoàn tất — 7 files đã được ghi.' },
    ]

    for (const step of steps) {
      await new Promise((res) => setTimeout(res, 500))
      setExportProgress(step.p)
      appendLog(step.msg)
    }

    setExportStatus('success')
  }

  const handleClose = () => {
    if (exportStatus === 'exporting') return
    setExportStatus('idle')
    setExportProgress(0)
    setExportLogs([])
    onOpenChange(false)
  }

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
              {/* Options */}
              {exportStatus === 'idle' && (
                <div className="space-y-3">
                  <p className="text-xs font-medium text-muted-foreground uppercase tracking-wider">Tuỳ chọn</p>
                  <label className="flex items-start gap-3 p-3 rounded-md border border-border bg-muted/30 cursor-pointer hover:bg-muted/50 transition-colors">
                    <input
                      id="checkbox-create-backup"
                      type="checkbox"
                      checked={createBackup}
                      onChange={(e) => setCreateBackup(e.target.checked)}
                      className="mt-0.5 accent-primary"
                    />
                    <div>
                      <p className="text-sm font-medium text-foreground">Tạo file backup</p>
                      <p className="text-xs text-muted-foreground mt-0.5">
                        Lưu bản gốc dưới dạng <code className="font-mono bg-background px-1 rounded">.backup_[timestamp]</code>
                      </p>
                    </div>
                  </label>
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
                        Block Draft/Empty/Warning sẽ fallback về bản gốc tiếng Anh.
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
                          onClick={() => onRestore(backup.backupPath)}
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
            <Button id="btn-start-export" onClick={handleExport}>
              <Download className="size-3.5 mr-1.5" />
              Start Export
            </Button>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
