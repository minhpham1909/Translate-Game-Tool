/**
 * TMManagerModal.tsx
 * Modal quản lý Translation Memory:
 * xem, tìm kiếm, và xóa các entry cache dịch.
 */
import { useState } from 'react'
import { Database, Search, Trash2, RefreshCw } from 'lucide-react'
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter,
} from '@renderer/components/ui/dialog'
import { Button } from '@renderer/components/ui/button'
import { Input } from '@renderer/components/ui/input'
import { ScrollArea } from '@renderer/components/ui/scroll-area'
import { cn } from '@renderer/lib/utils'

export interface TMEntry {
  id: number
  original_text: string
  translated_text: string
  usage_count: number
  last_used_at: string
}

interface TMManagerModalProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  entries?: TMEntry[]
  onDelete: (id: number) => void
  onClearUnused: () => void
  onRefresh: () => void
}

const MOCK_ENTRIES: TMEntry[] = [
  { id: 1, original_text: 'Welcome to the tutorial!', translated_text: 'Chào mừng đến với hướng dẫn!', usage_count: 42, last_used_at: '30 phút trước' },
  { id: 2, original_text: 'What would you like to do?', translated_text: 'Bạn muốn làm gì?', usage_count: 18, last_used_at: '1 giờ trước' },
  { id: 3, original_text: 'The screen fades to black.', translated_text: 'Màn hình chuyển sang đen.', usage_count: 7, last_used_at: '2 giờ trước' },
  { id: 4, original_text: 'Explore the garden', translated_text: 'Khám phá khu vườn', usage_count: 3, last_used_at: 'Hôm qua' },
  { id: 5, original_text: 'Talk to Eileen', translated_text: 'Nói chuyện với Eileen', usage_count: 1, last_used_at: 'Hôm qua' },
]

/**
 * TMManagerModal component
 * @param entries - Danh sách TM entries từ DB
 * @param onDelete - Xóa một entry theo id
 * @param onClearUnused - Xóa tất cả entry có usage_count = 0
 * @param onRefresh - Reload danh sách từ DB
 */
export function TMManagerModal({
  open, onOpenChange, entries = MOCK_ENTRIES, onDelete, onClearUnused, onRefresh,
}: TMManagerModalProps) {
  const [search, setSearch] = useState('')
  const [deletingId, setDeletingId] = useState<number | null>(null)

  const filtered = entries.filter(
    (entry) =>
      entry.original_text.toLowerCase().includes(search.toLowerCase()) ||
      entry.translated_text.toLowerCase().includes(search.toLowerCase())
  )

  const handleDelete = (id: number) => {
    setDeletingId(id)
    setTimeout(() => {
      onDelete(id)
      setDeletingId(null)
    }, 200)
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl gap-0 p-0 overflow-hidden">
        <DialogHeader className="px-6 pt-5 pb-4 border-b border-border">
          <div className="flex items-center justify-between">
            <DialogTitle className="text-base font-semibold flex items-center gap-2">
              <Database className="size-4 text-info" />
              Translation Memory Manager
            </DialogTitle>
            <div className="flex items-center gap-2">
              <span className="text-xs text-muted-foreground">{entries.length} entries</span>
              <Button id="btn-refresh-tm" variant="ghost" size="sm" className="h-7 w-7 p-0" onClick={onRefresh}>
                <RefreshCw className="size-3.5" />
              </Button>
            </div>
          </div>

          {/* Search + Clear All */}
          <div className="flex items-center gap-2 mt-3">
            <div className="relative flex-1">
              <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 size-3.5 text-muted-foreground" />
              <Input
                id="input-tm-search"
                placeholder="Tìm theo văn bản gốc hoặc bản dịch..."
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                className="pl-8 h-7 text-xs"
              />
            </div>
            <Button
              id="btn-clear-unused-tm"
              variant="outline"
              size="sm"
              className="h-7 text-xs text-destructive hover:text-destructive border-destructive/30 hover:bg-destructive/10"
              onClick={onClearUnused}
            >
              <Trash2 className="size-3 mr-1.5" />
              Clear Unused
            </Button>
          </div>
        </DialogHeader>

        {/* Table */}
        <ScrollArea className="h-[360px]">
          {filtered.length === 0 ? (
            <div className="flex flex-col items-center justify-center h-40 gap-2 text-muted-foreground">
              <Database className="size-8 opacity-30" />
              <p className="text-sm italic">Không tìm thấy kết quả.</p>
            </div>
          ) : (
            <table className="w-full text-sm">
              <thead className="sticky top-0 bg-muted/80 backdrop-blur-sm">
                <tr className="border-b border-border">
                  <th className="text-left px-4 py-2.5 text-[11px] font-semibold text-muted-foreground uppercase tracking-wider">Original</th>
                  <th className="text-left px-4 py-2.5 text-[11px] font-semibold text-muted-foreground uppercase tracking-wider">Cached Translation</th>
                  <th className="text-left px-4 py-2.5 text-[11px] font-semibold text-muted-foreground uppercase tracking-wider w-28">Usage</th>
                  <th className="px-4 py-2.5 w-12" />
                </tr>
              </thead>
              <tbody>
                {filtered.map((entry) => (
                  <tr
                    key={entry.id}
                    className={cn(
                      'border-b border-border/50 transition-all',
                      deletingId === entry.id ? 'opacity-40' : 'hover:bg-accent/50'
                    )}
                  >
                    <td className="px-4 py-2.5 max-w-[200px]">
                      <p className="text-xs text-muted-foreground truncate">{entry.original_text}</p>
                    </td>
                    <td className="px-4 py-2.5 max-w-[200px]">
                      <p className="text-xs text-foreground truncate">{entry.translated_text}</p>
                    </td>
                    <td className="px-4 py-2.5">
                      <div>
                        <span className={cn(
                          'text-xs font-medium',
                          entry.usage_count === 0 ? 'text-muted-foreground' : 'text-success'
                        )}>
                          Used {entry.usage_count}×
                        </span>
                        <p className="text-[10px] text-muted-foreground mt-0.5">{entry.last_used_at}</p>
                      </div>
                    </td>
                    <td className="px-4 py-2.5">
                      <Button
                        id={`btn-delete-tm-${entry.id}`}
                        variant="ghost"
                        size="sm"
                        className="h-6 w-6 p-0 text-muted-foreground hover:text-destructive hover:bg-destructive/10"
                        onClick={() => handleDelete(entry.id)}
                      >
                        <Trash2 className="size-3.5" />
                      </Button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </ScrollArea>

        <DialogFooter className="px-6 py-3 border-t border-border bg-muted/20">
          <p className="text-xs text-muted-foreground flex-1">
            TM tự động được cập nhật sau mỗi lần AI dịch thành công.
          </p>
          <Button variant="outline" size="sm" onClick={() => onOpenChange(false)}>Close</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
