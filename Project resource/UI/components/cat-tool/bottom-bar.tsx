"use client"

import { useState, useEffect } from "react"
import { Terminal, ChevronUp, ChevronDown, Circle } from "lucide-react"
import { Button } from "@/components/ui/button"
import { ScrollArea } from "@/components/ui/scroll-area"
import { cn } from "@/lib/utils"

interface BottomBarProps {
  totalLines: number
  translatedLines: number
  apiCost: number
  isTerminalOpen: boolean
  onToggleTerminal: () => void
}

interface LogEntry {
  type: "info" | "warning" | "error" | "success"
  message: string
  timestamp: string
}

const MOCK_LOGS: LogEntry[] = [
  { type: "info", message: "Project loaded: visual_novel_en", timestamp: "10:24:15" },
  { type: "success", message: "Parsing complete. Found 7 files, 6221 lines.", timestamp: "10:24:16" },
  { type: "info", message: "Translation Memory loaded: 15,234 entries", timestamp: "10:24:17" },
  { type: "warning", message: "Rate limit approaching. 45/50 requests used.", timestamp: "10:25:01" },
  { type: "info", message: "AI batch translation started: 20 blocks", timestamp: "10:25:30" },
  { type: "success", message: "AI batch complete: 20/20 blocks translated", timestamp: "10:25:45" },
  { type: "warning", message: "Format tag mismatch detected in block #start_004", timestamp: "10:26:02" },
  { type: "info", message: "Auto-save triggered. Project state saved.", timestamp: "10:27:00" },
]

const logTypeStyles: Record<LogEntry["type"], string> = {
  info: "text-info",
  warning: "text-warning",
  error: "text-destructive",
  success: "text-success",
}

export function BottomBar({
  totalLines,
  translatedLines,
  apiCost,
  isTerminalOpen,
  onToggleTerminal,
}: BottomBarProps) {
  const [logs] = useState<LogEntry[]>(MOCK_LOGS)
  const [isConnected] = useState(true)
  const progress = Math.round((translatedLines / totalLines) * 100)

  return (
    <div className="flex-shrink-0 border-t border-border bg-card">
      {/* Terminal Panel */}
      <div
        className={cn(
          "overflow-hidden transition-all duration-200",
          isTerminalOpen ? "h-40" : "h-0"
        )}
      >
        <div className="h-full bg-terminal-bg border-b border-border">
          <div className="flex items-center justify-between px-3 py-1.5 border-b border-border/50 bg-card/30">
            <span className="text-[11px] font-medium text-muted-foreground uppercase tracking-wider">
              System Console
            </span>
            <span className="text-[10px] text-muted-foreground">
              {logs.length} entries
            </span>
          </div>
          <ScrollArea className="h-[calc(100%-28px)]">
            <div className="p-2 font-mono text-[11px] space-y-0.5">
              {logs.map((log, i) => (
                <div key={i} className="flex gap-2">
                  <span className="text-muted-foreground/60">[{log.timestamp}]</span>
                  <span className={logTypeStyles[log.type]}>
                    [{log.type.toUpperCase()}]
                  </span>
                  <span className="text-foreground/80">{log.message}</span>
                </div>
              ))}
            </div>
          </ScrollArea>
        </div>
      </div>

      {/* Status Bar */}
      <div className="h-7 flex items-center justify-between px-3 text-[11px]">
        {/* Left Side */}
        <div className="flex items-center gap-4">
          <div className="flex items-center gap-1.5">
            <Circle
              className={cn(
                "size-2",
                isConnected ? "fill-success text-success" : "fill-destructive text-destructive"
              )}
            />
            <span className="text-muted-foreground">
              {isConnected ? "Connected" : "Disconnected"}
            </span>
          </div>

          <div className="h-3 w-px bg-border" />

          <div className="flex items-center gap-1.5">
            <span className="text-muted-foreground">Total:</span>
            <span className="font-medium text-foreground">
              {translatedLines.toLocaleString()} / {totalLines.toLocaleString()}
            </span>
            <span className="text-muted-foreground">lines</span>
            <span className="text-muted-foreground ml-1">({progress}%)</span>
          </div>
        </div>

        {/* Right Side */}
        <div className="flex items-center gap-4">
          <div className="flex items-center gap-1.5">
            <span className="text-muted-foreground">API Cost:</span>
            <span className="font-medium text-warning">${apiCost.toFixed(2)}</span>
            <span className="text-muted-foreground">used</span>
          </div>

          <div className="h-3 w-px bg-border" />

          <Button
            variant="ghost"
            size="sm"
            className="h-5 px-2 gap-1 text-[11px]"
            onClick={onToggleTerminal}
          >
            <Terminal className="size-3" />
            Console
            {isTerminalOpen ? (
              <ChevronDown className="size-3" />
            ) : (
              <ChevronUp className="size-3" />
            )}
          </Button>
        </div>
      </div>
    </div>
  )
}
