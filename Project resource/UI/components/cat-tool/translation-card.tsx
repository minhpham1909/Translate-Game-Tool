"use client"

import { Sparkles, RotateCcw, Check, AlertTriangle } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import { Textarea } from "@/components/ui/textarea"
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip"
import { cn } from "@/lib/utils"
import type { TranslationBlock, BlockStatus } from "@/app/page"

interface TranslationCardProps {
  block: TranslationBlock
  onTranslationChange: (value: string) => void
  onApprove: () => void
  onRevert: () => void
}

const statusConfig: Record<BlockStatus, { label: string; className: string }> = {
  empty: {
    label: "Empty",
    className: "bg-muted text-muted-foreground border-transparent",
  },
  draft: {
    label: "Draft",
    className: "bg-info/20 text-info border-info/30",
  },
  approved: {
    label: "Approved",
    className: "bg-success/20 text-success border-success/30",
  },
  warning: {
    label: "Warning",
    className: "bg-warning/20 text-warning border-warning/30",
  },
}

export function TranslationCard({
  block,
  onTranslationChange,
  onApprove,
  onRevert,
}: TranslationCardProps) {
  const config = statusConfig[block.status]

  return (
    <div
      className={cn(
        "rounded-md border bg-card transition-colors",
        block.status === "warning" && "border-warning/40",
        block.status === "approved" && "border-success/20"
      )}
    >
      {/* Card Header */}
      <div className="flex items-center justify-between px-3 py-2 border-b border-border/50 bg-surface-elevated/50">
        <div className="flex items-center gap-2">
          {block.character && (
            <Badge variant="secondary" className="h-5 px-2 text-[10px] font-semibold bg-primary/15 text-primary border-0">
              {block.character}
            </Badge>
          )}
          <code className="text-[10px] text-muted-foreground font-mono">
            {block.hash}
          </code>
          <span className="text-[10px] text-muted-foreground">
            Line {block.lineNumber}
          </span>
        </div>

        <Badge variant="outline" className={cn("h-5 px-2 text-[10px]", config.className)}>
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
          <p className="text-sm text-muted-foreground leading-relaxed select-all">
            {block.original}
          </p>
        </div>

        {/* Translated Text */}
        <div className="p-3">
          <p className="text-[11px] uppercase tracking-wider text-muted-foreground mb-1.5 font-medium">
            Translation
          </p>
          <Textarea
            value={block.translated}
            onChange={(e) => onTranslationChange(e.target.value)}
            placeholder="Enter translation..."
            className="min-h-[60px] text-sm resize-none bg-input/50 border-border/50 focus:border-ring"
          />
        </div>
      </div>

      {/* Card Footer */}
      <div className="flex items-center justify-between px-3 py-2 border-t border-border/50 bg-surface-elevated/30">
        {/* Warning Message */}
        <div className="flex items-center gap-1.5">
          {block.warningMessage && (
            <>
              <AlertTriangle className="size-3 text-warning" />
              <span className="text-[11px] text-warning">{block.warningMessage}</span>
            </>
          )}
        </div>

        {/* Action Buttons */}
        <div className="flex items-center gap-1">
          <TooltipProvider delayDuration={0}>
            <Tooltip>
              <TooltipTrigger asChild>
                <Button
                  variant="ghost"
                  size="sm"
                  className="h-6 w-6 p-0 text-muted-foreground hover:text-info hover:bg-info/10"
                >
                  <Sparkles className="size-3.5" />
                  <span className="sr-only">AI Translate</span>
                </Button>
              </TooltipTrigger>
              <TooltipContent side="top">
                <p>AI Translate</p>
              </TooltipContent>
            </Tooltip>

            <Tooltip>
              <TooltipTrigger asChild>
                <Button
                  variant="ghost"
                  size="sm"
                  className="h-6 w-6 p-0 text-muted-foreground hover:text-destructive hover:bg-destructive/10"
                  onClick={onRevert}
                >
                  <RotateCcw className="size-3.5" />
                  <span className="sr-only">Revert</span>
                </Button>
              </TooltipTrigger>
              <TooltipContent side="top">
                <p>Revert changes</p>
              </TooltipContent>
            </Tooltip>

            <Tooltip>
              <TooltipTrigger asChild>
                <Button
                  variant="ghost"
                  size="sm"
                  className={cn(
                    "h-6 w-6 p-0",
                    block.status === "approved"
                      ? "text-success bg-success/10"
                      : "text-muted-foreground hover:text-success hover:bg-success/10"
                  )}
                  onClick={onApprove}
                  disabled={!block.translated.trim()}
                >
                  <Check className="size-3.5" />
                  <span className="sr-only">Approve</span>
                </Button>
              </TooltipTrigger>
              <TooltipContent side="top">
                <p>Approve translation</p>
              </TooltipContent>
            </Tooltip>
          </TooltipProvider>
        </div>
      </div>
    </div>
  )
}
