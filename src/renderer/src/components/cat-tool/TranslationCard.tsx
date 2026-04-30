/**
 * TranslationCard.tsx
 * Card hiển thị một translation block: original text (trái) + textarea dịch (phải).
 * Có status badge, warning message, và các nút action (AI, Revert, Approve).
 * Debounce 500ms trước khi gọi update DB.
 */
import { useCallback, useRef } from 'react'
import { Sparkles, RotateCcw, Check, AlertTriangle } from 'lucide-react'
import { Button } from '@renderer/components/ui/button'
import { Badge } from '@renderer/components/ui/badge'
import { Textarea } from '@renderer/components/ui/textarea'
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@renderer/components/ui/tooltip'
import { cn } from '@renderer/lib/utils'

export type BlockStatus = 'empty' | 'draft' | 'approved' | 'warning'

export interface UITranslationBlock {
  id: number
  block_hash: string
  line_index: number
  character_id: string | null
  original_text: string
  translated_text: string | null
  status: BlockStatus
  block_type: 'dialogue' | 'string'
}

interface TranslationCardProps {
  block: UITranslationBlock
  /** Callback khi user sửa text (gọi sau debounce) */
  onTranslationChange: (blockId: number, value: string) => void
  onApprove: (blockId: number) => void
  onRevert: (blockId: number) => void
  onAITranslate: (blockId: number) => void
}

const statusConfig: Record<BlockStatus, { label: string; className: string }> = {
  empty:    { label: 'Empty',    className: 'bg-muted text-muted-foreground border-transparent' },
  draft:    { label: 'Draft',    className: 'bg-info/20 text-info border-info/30' },
  approved: { label: 'Approved', className: 'bg-success/20 text-success border-success/30' },
  warning:  { label: 'Warning',  className: 'bg-warning/20 text-warning border-warning/30' },
}

const DEBOUNCE_MS = 500

/**
 * TranslationCard component
 * @param block - Dữ liệu block từ DB
 * @param onTranslationChange - Gọi sau 500ms debounce
 * @param onApprove - Gán trạng thái approved
 * @param onRevert - Xóa bản dịch về empty
 * @param onAITranslate - Dịch block này bằng AI
 */
export function TranslationCard({
  block,
  onTranslationChange,
  onApprove,
  onRevert,
  onAITranslate,
}: TranslationCardProps) {
  const config = statusConfig[block.status]
  const debounceTimer = useRef<ReturnType<typeof setTimeout> | null>(null)

  // Debounce để tránh spam DB mỗi keystroke
  const handleTextChange = useCallback(
    (e: React.ChangeEvent<HTMLTextAreaElement>) => {
      const value = e.target.value
      if (debounceTimer.current) clearTimeout(debounceTimer.current)
      debounceTimer.current = setTimeout(() => {
        onTranslationChange(block.id, value)
      }, DEBOUNCE_MS)
    },
    [block.id, onTranslationChange]
  )

  return (
    <div
      id={`block-card-${block.id}`}
      className={cn(
        'rounded-md border bg-card transition-colors',
        block.status === 'warning' && 'border-warning/40',
        block.status === 'approved' && 'border-success/20'
      )}
    >
      {/* Card Header */}
      <div className="flex items-center justify-between px-3 py-2 border-b border-border/50 bg-surface-elevated/50">
        <div className="flex items-center gap-2">
          {block.character_id && (
            <Badge variant="secondary" className="h-5 px-2 text-[10px] font-semibold bg-primary/15 text-primary border-0">
              {block.character_id}
            </Badge>
          )}
          <code className="text-[10px] text-muted-foreground font-mono">
            {block.block_hash}
          </code>
          <span className="text-[10px] text-muted-foreground">
            L{block.line_index}
          </span>
          <span className="text-[10px] text-muted-foreground capitalize">
            [{block.block_type}]
          </span>
        </div>
        <Badge variant="outline" className={cn('h-5 px-2 text-[10px]', config.className)}>
          {config.label}
        </Badge>
      </div>

      {/* Card Body - Dual Pane */}
      <div className="grid grid-cols-2 divide-x divide-border/50">
        {/* Original Text */}
        <div className="p-3">
          <p className="text-[11px] uppercase tracking-wider text-muted-foreground mb-1.5 font-medium">
            Original
          </p>
          <p className="text-sm text-muted-foreground leading-relaxed select-all font-mono">
            {block.original_text}
          </p>
        </div>

        {/* Translated Text */}
        <div className="p-3">
          <p className="text-[11px] uppercase tracking-wider text-muted-foreground mb-1.5 font-medium">
            Translation
          </p>
          <Textarea
            defaultValue={block.translated_text ?? ''}
            onChange={handleTextChange}
            placeholder="Enter translation..."
            className="min-h-[60px] text-sm bg-input/50 border-border/50 focus:border-ring"
          />
        </div>
      </div>

      {/* Card Footer */}
      <div className="flex items-center justify-between px-3 py-2 border-t border-border/50 bg-surface-elevated/30">
        {/* Warning Message */}
        <div className="flex items-center gap-1.5">
          {block.status === 'warning' && (
            <>
              <AlertTriangle className="size-3 text-warning" />
              <span className="text-[11px] text-warning">
                Missing tags — sẽ fallback về bản gốc khi Export
              </span>
            </>
          )}
        </div>

        {/* Action Buttons */}
        <div className="flex items-center gap-1">
          <TooltipProvider delayDuration={0}>
            <Tooltip>
              <TooltipTrigger asChild>
                <Button
                  id={`btn-ai-translate-${block.id}`}
                  variant="ghost"
                  size="sm"
                  className="h-6 w-6 p-0 text-muted-foreground hover:text-info hover:bg-info/10"
                  onClick={() => onAITranslate(block.id)}
                >
                  <Sparkles className="size-3.5" />
                  <span className="sr-only">AI Translate</span>
                </Button>
              </TooltipTrigger>
              <TooltipContent side="top"><p>Dịch bằng AI</p></TooltipContent>
            </Tooltip>

            <Tooltip>
              <TooltipTrigger asChild>
                <Button
                  id={`btn-revert-${block.id}`}
                  variant="ghost"
                  size="sm"
                  className="h-6 w-6 p-0 text-muted-foreground hover:text-destructive hover:bg-destructive/10"
                  onClick={() => onRevert(block.id)}
                >
                  <RotateCcw className="size-3.5" />
                  <span className="sr-only">Revert</span>
                </Button>
              </TooltipTrigger>
              <TooltipContent side="top"><p>Hoàn tác về rỗng</p></TooltipContent>
            </Tooltip>

            <Tooltip>
              <TooltipTrigger asChild>
                <Button
                  id={`btn-approve-${block.id}`}
                  variant="ghost"
                  size="sm"
                  className={cn(
                    'h-6 w-6 p-0',
                    block.status === 'approved'
                      ? 'text-success bg-success/10'
                      : 'text-muted-foreground hover:text-success hover:bg-success/10'
                  )}
                  onClick={() => onApprove(block.id)}
                  disabled={!block.translated_text?.trim()}
                >
                  <Check className="size-3.5" />
                  <span className="sr-only">Approve</span>
                </Button>
              </TooltipTrigger>
              <TooltipContent side="top"><p>Duyệt bản dịch</p></TooltipContent>
            </Tooltip>
          </TooltipProvider>
        </div>
      </div>
    </div>
  )
}
