/**
 * QAReportModal.tsx
 * Modal hiển thị toàn bộ lỗi format tag từ QA Linter.
 * Dạng bảng có thể click để nhảy đến block lỗi.
 */
import { useState } from 'react'
import { ShieldAlert, ExternalLink, Search, AlertTriangle, XCircle } from 'lucide-react'
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter,
} from '@renderer/components/ui/dialog'
import { Button } from '@renderer/components/ui/button'
import { Input } from '@renderer/components/ui/input'
import { Badge } from '@renderer/components/ui/badge'
import { ScrollArea } from '@renderer/components/ui/scroll-area'
import { cn } from '@renderer/lib/utils'

type Severity = 'warning' | 'error'

export interface QAIssue {
  id: number
  fileName: string
  lineIndex: number
  blockHash: string
  severity: Severity
  description: string
}

interface QAReportModalProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  issues: QAIssue[]
  onGoToBlock: (blockId: number) => void
}

const MOCK_ISSUES: QAIssue[] = [
  { id: 4,  fileName: 'script.rpy',    lineIndex: 52,  blockHash: '#start_004', severity: 'warning', description: 'Missing {i} closing tag in translation' },
  { id: 12, fileName: 'chapter1.rpy',  lineIndex: 120, blockHash: '#ch1_012',   severity: 'warning', description: 'Missing [player_name] variable' },
  { id: 28, fileName: 'chapter1.rpy',  lineIndex: 310, blockHash: '#ch1_028',   severity: 'error',   description: 'Mismatched {color=} tag count (1 open, 0 close)' },
  { id: 55, fileName: 'chapter2.rpy',  lineIndex: 78,  blockHash: '#ch2_055',   severity: 'warning', description: 'Missing [gold] variable' },
  { id: 89, fileName: 'screens.rpy',   lineIndex: 45,  blockHash: '#scr_089',   severity: 'warning', description: 'Missing {b} bold tag' },
]

/**
 * QAReportModal component
 * @param issues - Danh sách lỗi từ QA Linter (qua DB query)
 * @param onGoToBlock - Callback nhảy đến block lỗi trong workspace
 */
export function QAReportModal({ open, onOpenChange, issues = MOCK_ISSUES, onGoToBlock }: QAReportModalProps) {
  const [search, setSearch] = useState('')
  const [filterSeverity, setFilterSeverity] = useState<'all' | Severity>('all')

  const filtered = issues.filter((issue) => {
    const matchSearch =
      issue.fileName.toLowerCase().includes(search.toLowerCase()) ||
      issue.description.toLowerCase().includes(search.toLowerCase())
    const matchSeverity = filterSeverity === 'all' || issue.severity === filterSeverity
    return matchSearch && matchSeverity
  })

  const errorCount = issues.filter((i) => i.severity === 'error').length
  const warningCount = issues.filter((i) => i.severity === 'warning').length

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl gap-0 p-0 overflow-hidden">
        <DialogHeader className="px-6 pt-5 pb-4 border-b border-border">
          <div className="flex items-center justify-between">
            <DialogTitle className="text-base font-semibold flex items-center gap-2">
              <ShieldAlert className="size-4 text-warning" />
              QA Linter Results
            </DialogTitle>
            <div className="flex items-center gap-2">
              {errorCount > 0 && (
                <Badge variant="outline" className="bg-destructive/20 text-destructive border-destructive/30 gap-1">
                  <XCircle className="size-3" />
                  {errorCount} Error{errorCount > 1 ? 's' : ''}
                </Badge>
              )}
              <Badge variant="outline" className="bg-warning/20 text-warning border-warning/30 gap-1">
                <AlertTriangle className="size-3" />
                {warningCount} Warning{warningCount > 1 ? 's' : ''}
              </Badge>
            </div>
          </div>

          {/* Filter Bar */}
          <div className="flex items-center gap-2 mt-3">
            <div className="relative flex-1">
              <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 size-3.5 text-muted-foreground" />
              <Input
                id="input-qa-search"
                placeholder="Tìm theo tên file hoặc mô tả..."
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                className="pl-8 h-7 text-xs"
              />
            </div>
            {(['all', 'warning', 'error'] as const).map((s) => (
              <button
                key={s}
                onClick={() => setFilterSeverity(s)}
                className={cn(
                  'px-2.5 py-1 text-xs rounded-md transition-colors capitalize',
                  filterSeverity === s
                    ? 'bg-primary text-primary-foreground'
                    : 'text-muted-foreground hover:text-foreground hover:bg-muted'
                )}
              >
                {s}
              </button>
            ))}
          </div>
        </DialogHeader>

        {/* Table */}
        <ScrollArea className="h-[380px]">
          {filtered.length === 0 ? (
            <div className="flex flex-col items-center justify-center h-40 gap-2 text-muted-foreground">
              <ShieldAlert className="size-8 opacity-30" />
              <p className="text-sm">Không tìm thấy vấn đề nào.</p>
            </div>
          ) : (
            <table className="w-full text-sm">
              <thead className="sticky top-0 bg-muted/80 backdrop-blur-sm">
                <tr className="border-b border-border">
                  <th className="text-left px-4 py-2.5 text-[11px] font-semibold text-muted-foreground uppercase tracking-wider w-[120px]">File</th>
                  <th className="text-left px-4 py-2.5 text-[11px] font-semibold text-muted-foreground uppercase tracking-wider w-16">Line</th>
                  <th className="text-left px-4 py-2.5 text-[11px] font-semibold text-muted-foreground uppercase tracking-wider w-24">Severity</th>
                  <th className="text-left px-4 py-2.5 text-[11px] font-semibold text-muted-foreground uppercase tracking-wider">Description</th>
                  <th className="px-4 py-2.5 w-16" />
                </tr>
              </thead>
              <tbody>
                {filtered.map((issue) => (
                  <tr
                    key={issue.id}
                    onClick={() => { onGoToBlock(issue.id); onOpenChange(false) }}
                    className="border-b border-border/50 hover:bg-accent/50 cursor-pointer transition-colors group"
                  >
                    <td className="px-4 py-2.5">
                      <span className="text-xs font-mono text-foreground">{issue.fileName}</span>
                    </td>
                    <td className="px-4 py-2.5">
                      <span className="text-xs font-mono text-muted-foreground">L{issue.lineIndex}</span>
                    </td>
                    <td className="px-4 py-2.5">
                      <Badge
                        variant="outline"
                        className={cn(
                          'text-[10px] px-1.5',
                          issue.severity === 'error'
                            ? 'bg-destructive/20 text-destructive border-destructive/30'
                            : 'bg-warning/20 text-warning border-warning/30'
                        )}
                      >
                        {issue.severity}
                      </Badge>
                    </td>
                    <td className="px-4 py-2.5">
                      <span className="text-xs text-foreground/80">{issue.description}</span>
                    </td>
                    <td className="px-4 py-2.5 text-right">
                      <ExternalLink className="size-3.5 text-muted-foreground group-hover:text-primary transition-colors ml-auto" />
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </ScrollArea>

        <DialogFooter className="px-6 py-3 border-t border-border bg-muted/20">
          <p className="text-xs text-muted-foreground flex-1">
            Click vào dòng để nhảy đến block lỗi trong workspace.
          </p>
          <Button variant="outline" size="sm" onClick={() => onOpenChange(false)}>Close</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
