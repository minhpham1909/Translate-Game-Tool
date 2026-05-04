/**
 * FloatingActionBar.tsx
 * Thanh công cụ nổi hiển thị khi người dùng chọn nhiều block.
 * Cung cấp batch translate, batch approve, và clear selection.
 */
import { Sparkles, CheckCheck, X, CheckSquare } from 'lucide-react'
import { Button } from '@renderer/components/ui/button'

interface FloatingActionBarProps {
  selectedCount: number
  onBatchTranslate: () => void
  onBatchApprove: () => void
  onClearSelection: () => void
  onSelectAll?: () => void
}

export function FloatingActionBar({
  selectedCount,
  onBatchTranslate,
  onBatchApprove,
  onClearSelection,
  onSelectAll,
}: FloatingActionBarProps) {
  return (
    <div className="flex-shrink-0 border-t border-border bg-card/95 backdrop-blur supports-[backdrop-filter]:bg-card/80 px-4 py-2.5">
      <div className="flex items-center gap-3">
        <span className="text-xs font-medium text-foreground">
          {selectedCount} block{selectedCount > 1 ? 's' : ''} selected
        </span>

        <div className="flex items-center gap-1.5">
          {onSelectAll && (
            <Button
              size="sm"
              variant="outline"
              className="h-7 text-xs gap-1.5 border-border hover:border-foreground/30"
              onClick={onSelectAll}
            >
              <CheckSquare className="size-3.5" />
              Select All
            </Button>
          )}

          <Button
            size="sm"
            variant="outline"
            className="h-7 text-xs gap-1.5 border-primary/30 hover:border-primary hover:bg-primary/10"
            onClick={onBatchTranslate}
          >
            <Sparkles className="size-3.5" />
            AI Translate
          </Button>

          <Button
            size="sm"
            variant="outline"
            className="h-7 text-xs gap-1.5 border-success/30 text-success hover:border-success hover:bg-success/10"
            onClick={onBatchApprove}
          >
            <CheckCheck className="size-3.5" />
            Approve
          </Button>
        </div>

        <div className="ml-auto">
          <Button
            size="sm"
            variant="ghost"
            className="h-7 text-xs text-muted-foreground hover:text-foreground"
            onClick={onClearSelection}
          >
            <X className="size-3.5 mr-1" />
            Clear
          </Button>
        </div>
      </div>
    </div>
  )
}
