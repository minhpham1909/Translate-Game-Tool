import { useCallback, useRef, type ReactElement } from 'react'
import { AlertTriangle, Check, GitBranch, RotateCcw, Sparkles } from 'lucide-react'
import { Button } from '@renderer/components/ui/button'
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@renderer/components/ui/tooltip'
import { cn } from '@renderer/lib/utils'

export type BlockStatus = 'empty' | 'draft' | 'approved' | 'warning' | 'skipped' | 'modified'

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
  onTranslationChange: (blockId: number, value: string) => void
  onApprove: (blockId: number) => void
  onRevert: (blockId: number) => void
  onAITranslate: (blockId: number) => void
  isSelected?: boolean
  onSelect?: (blockId: number, event: React.MouseEvent) => void
}

const statusConfig: Record<BlockStatus, { label: string; dot: string; rail: string; input: string }> = {
  empty: {
    label: 'Empty',
    dot: 'bg-muted-foreground/40',
    rail: 'border-l-transparent',
    input: 'bg-muted/20',
  },
  draft: {
    label: 'Draft',
    dot: 'bg-info',
    rail: 'border-l-info/70',
    input: 'bg-info/[0.03]',
  },
  approved: {
    label: 'Approved',
    dot: 'bg-success',
    rail: 'border-l-success/80',
    input: 'bg-success/[0.03]',
  },
  warning: {
    label: 'Warning',
    dot: 'bg-warning',
    rail: 'border-l-warning/80',
    input: 'bg-warning/[0.04]',
  },
  skipped: {
    label: 'Skipped',
    dot: 'bg-muted-foreground/50',
    rail: 'border-l-muted-foreground/40',
    input: 'bg-muted/20',
  },
  modified: {
    label: 'Modified',
    dot: 'bg-amber-500',
    rail: 'border-l-amber-500/80',
    input: 'bg-amber-500/[0.04]',
  },
}

const DEBOUNCE_MS = 500

function resizeTextarea(textarea: HTMLTextAreaElement): void {
  textarea.style.height = 'auto'
  textarea.style.height = `${textarea.scrollHeight}px`
}

export function TranslationCard({
  block,
  onTranslationChange,
  onApprove,
  onRevert,
  onAITranslate,
  isSelected,
  onSelect,
}: TranslationCardProps): ReactElement {
  const config = statusConfig[block.status]
  const debounceTimer = useRef<ReturnType<typeof setTimeout> | null>(null)
  const textareaKey = `${block.id}:${block.status}:${block.translated_text ?? ''}`

  const handleTextChange = useCallback(
    (e: React.ChangeEvent<HTMLTextAreaElement>) => {
      resizeTextarea(e.currentTarget)
      const value = e.currentTarget.value
      if (debounceTimer.current) clearTimeout(debounceTimer.current)
      debounceTimer.current = setTimeout(() => {
        onTranslationChange(block.id, value)
      }, DEBOUNCE_MS)
    },
    [block.id, onTranslationChange]
  )

  const handleInitialResize = useCallback((node: HTMLTextAreaElement | null) => {
    if (node) resizeTextarea(node)
  }, [])

  const selectBlock = (event: React.MouseEvent): void => {
    onSelect?.(block.id, event)
  }

  return (
    <div
      id={`block-card-${block.id}`}
      className={cn(
        'group flex w-full border-b border-border/40 border-l-2 bg-background hover:bg-accent/35 transition-colors',
        config.rail,
        isSelected && 'bg-primary/[0.05] border-l-primary'
      )}
    >
      <div className="w-[92px] flex-shrink-0 flex flex-col items-center gap-1.5 px-2 py-2 border-r border-border/40">
        {onSelect && (
          <button
            type="button"
            className={cn(
              'size-4 rounded-sm border flex items-center justify-center transition-colors',
              isSelected ? 'bg-primary border-primary text-primary-foreground' : 'border-border/70 hover:border-primary/70'
            )}
            aria-label={`Select block ${block.id}`}
            aria-pressed={!!isSelected}
            onClick={selectBlock}
          >
            {isSelected && <Check className="size-3" />}
          </button>
        )}
        <TooltipProvider delayDuration={0}>
          <Tooltip>
            <TooltipTrigger asChild>
              <span className={cn('size-2.5 rounded-full', config.dot)} />
            </TooltipTrigger>
            <TooltipContent side="right"><p>{config.label}</p></TooltipContent>
          </Tooltip>
        </TooltipProvider>
        <span className="text-[10px] text-muted-foreground font-mono">L{block.line_index}</span>
        {block.character_id && (
          <span className="max-w-full truncate rounded-sm bg-primary/10 px-1.5 py-0.5 text-[10px] text-primary font-semibold">
            {block.character_id}
          </span>
        )}
        {block.status === 'warning' && <AlertTriangle className="size-3 text-warning" />}
        {block.status === 'modified' && <GitBranch className="size-3 text-amber-500" />}
      </div>

      <div className="min-w-0 flex-1 grid grid-cols-2 gap-3 px-3 py-2">
        <div className="min-w-0 text-sm leading-5 text-foreground/80 font-mono whitespace-pre-wrap select-all">
          {block.original_text}
        </div>
        <textarea
          key={textareaKey}
          ref={handleInitialResize}
          rows={1}
          defaultValue={block.translated_text ?? ''}
          onChange={handleTextChange}
          placeholder="Translation"
          className={cn(
            'w-full min-h-[28px] overflow-hidden resize-none rounded border border-transparent bg-transparent px-2 py-1 text-sm leading-5 outline-none transition-colors',
            'hover:border-border focus:border-primary focus:bg-background',
            config.input
          )}
        />
      </div>

      <div className="w-[108px] flex-shrink-0 flex items-start justify-end gap-1 px-2 py-2 opacity-0 group-hover:opacity-100 focus-within:opacity-100 transition-opacity">
        <TooltipProvider delayDuration={0}>
          <Tooltip>
            <TooltipTrigger asChild>
              <Button
                id={`btn-ai-translate-${block.id}`}
                variant="ghost"
                size="sm"
                className="h-7 w-7 p-0 text-muted-foreground hover:text-info hover:bg-info/10"
                onClick={() => onAITranslate(block.id)}
              >
                <Sparkles className="size-3.5" />
                <span className="sr-only">AI Translate</span>
              </Button>
            </TooltipTrigger>
            <TooltipContent side="top"><p>AI Translate</p></TooltipContent>
          </Tooltip>

          <Tooltip>
            <TooltipTrigger asChild>
              <Button
                id={`btn-revert-${block.id}`}
                variant="ghost"
                size="sm"
                className="h-7 w-7 p-0 text-muted-foreground hover:text-destructive hover:bg-destructive/10"
                onClick={() => onRevert(block.id)}
              >
                <RotateCcw className="size-3.5" />
                <span className="sr-only">Revert</span>
              </Button>
            </TooltipTrigger>
            <TooltipContent side="top"><p>Revert</p></TooltipContent>
          </Tooltip>

          <Tooltip>
            <TooltipTrigger asChild>
              <Button
                id={`btn-approve-${block.id}`}
                variant="ghost"
                size="sm"
                className={cn(
                  'h-7 w-7 p-0',
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
            <TooltipContent side="top"><p>Approve</p></TooltipContent>
          </Tooltip>
        </TooltipProvider>
      </div>
    </div>
  )
}
