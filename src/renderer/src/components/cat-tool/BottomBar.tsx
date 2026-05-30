/**
 * BottomBar.tsx
 * Thanh trạng thái dưới cùng: Progress tổng thể, API cost, và Console Terminal.
 * Terminal có thể mở/đóng, hiển thị log real-time từ Backend (qua IPC ở Step 3).
 */
import { useState } from 'react'
import { Terminal, ChevronUp, ChevronDown, Circle, Pause, Play, Square } from 'lucide-react'
import { Button } from '@renderer/components/ui/button'
import { ScrollArea } from '@renderer/components/ui/scroll-area'
import { cn } from '@renderer/lib/utils'
import { useI18n } from '@renderer/i18n'

export type LogType = 'info' | 'warning' | 'error' | 'success'

export interface LogEntry {
  type: LogType
  message: string
  timestamp: string
}

interface BottomBarProps {
  totalBlocks: number
  translatedBlocks: number
  apiCost: number
  logs: LogEntry[]
  isConnected?: boolean
  queueState?: 'idle' | 'running' | 'paused' | 'stopped' | 'error' | 'done'
  queueSpeedBlocksPerMin?: number
  queueEtaSeconds?: number | null
  queueProcessed?: number
  queueApproxInputTokens?: number
  queueApproxOutputTokens?: number
  onQueuePause?: () => void
  onQueueResume?: () => void
  onQueueStop?: () => void
}

const logTypeStyles: Record<LogType, string> = {
  info:    'text-info',
  warning: 'text-warning',
  error:   'text-destructive',
  success: 'text-success',
}

/**
 * BottomBar component
 * @param totalBlocks - Tổng số block trong project
 * @param translatedBlocks - Số block đã dịch
 * @param apiCost - Chi phí API (USD) đã dùng
 * @param logs - Mảng log entries từ Backend
 * @param isConnected - Trạng thái kết nối với Main process
 */
export function BottomBar({
  totalBlocks,
  translatedBlocks,
  apiCost,
  logs,
  isConnected = true,
  queueState = 'idle',
  queueSpeedBlocksPerMin,
  queueEtaSeconds,
  queueProcessed,
  queueApproxInputTokens,
  queueApproxOutputTokens,
  onQueuePause,
  onQueueResume,
  onQueueStop,
}: BottomBarProps) {
  const { t } = useI18n()
  const [isTerminalOpen, setIsTerminalOpen] = useState(false)
  const progress = totalBlocks > 0 ? Math.round((translatedBlocks / totalBlocks) * 100) : 0
  const canPause = queueState === 'running'
  const canResume = queueState === 'paused' || queueState === 'stopped' || queueState === 'error'
  const canStop = queueState === 'running' || queueState === 'paused'
  const etaLabel = queueEtaSeconds == null ? '--' : `${Math.max(0, queueEtaSeconds)}s`

  return (
    <div className="flex-shrink-0 border-t border-border bg-card">
      {/* Terminal Panel */}
      <div
        className={cn(
          'overflow-hidden transition-all duration-200',
          isTerminalOpen ? 'h-40' : 'h-0'
        )}
      >
        <div className="h-full bg-terminal-bg border-b border-border">
          <div className="flex items-center justify-between px-3 py-1.5 border-b border-border/50 bg-card/30">
            <span className="text-[11px] font-medium text-muted-foreground uppercase tracking-wider">
              {t('bottomBar.systemConsole')}
            </span>
            <span className="text-[10px] text-muted-foreground">{logs.length} {t('bottomBar.entries')}</span>
          </div>
          <ScrollArea className="h-[calc(100%-28px)]">
            <div className="p-2 font-mono text-[11px] space-y-0.5">
              {logs.length === 0 ? (
                <span className="text-muted-foreground italic">{t('bottomBar.noLog')}</span>
              ) : (
                logs.map((log, i) => (
                  <div key={i} className="flex gap-2">
                    <span className="text-muted-foreground/60">[{log.timestamp}]</span>
                    <span className={logTypeStyles[log.type]}>[{log.type.toUpperCase()}]</span>
                    <span className="text-foreground/80">{log.message}</span>
                  </div>
                ))
              )}
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
                'size-2',
                isConnected ? 'fill-success text-success' : 'fill-destructive text-destructive'
              )}
            />
            <span className="text-muted-foreground">
              {isConnected ? t('bottomBar.connected') : t('bottomBar.disconnected')}
            </span>
          </div>

          <div className="h-3 w-px bg-border" />

          <div className="flex items-center gap-1.5">
            <span className="text-muted-foreground">{t('bottomBar.total')}:</span>
            <span className="font-medium text-foreground">
              {translatedBlocks.toLocaleString()} / {totalBlocks.toLocaleString()}
            </span>
            <span className="text-muted-foreground">{t('bottomBar.blocks')} ({progress}%)</span>
          </div>
        </div>

        {/* Right Side */}
        <div className="flex items-center gap-4">
          <div className="flex items-center gap-1.5">
            <span className="text-muted-foreground">{t('bottomBar.apiCost')}:</span>
            <span className="font-medium text-warning">${apiCost.toFixed(4)}</span>
          </div>

          <div className="h-3 w-px bg-border" />

          <div className="flex items-center gap-2">
            <span className="text-muted-foreground">{t('bottomBar.queue')}:</span>
            <span className="font-medium text-foreground">{queueState.toUpperCase()}</span>
            <span className="text-muted-foreground">{t('bottomBar.eta')} {etaLabel}</span>
            {typeof queueSpeedBlocksPerMin === 'number' && (
              <span className="text-muted-foreground">{queueSpeedBlocksPerMin.toFixed(1)} blk/min</span>
            )}
            {typeof queueProcessed === 'number' && (
              <span className="text-muted-foreground">{t('bottomBar.done')} {queueProcessed}</span>
            )}
            {typeof queueApproxInputTokens === 'number' && (
              <span className="text-muted-foreground">{t('bottomBar.inTok')} {queueApproxInputTokens}</span>
            )}
            {typeof queueApproxOutputTokens === 'number' && (
              <span className="text-muted-foreground">{t('bottomBar.outTok')} {queueApproxOutputTokens}</span>
            )}
          </div>

          <div className="flex items-center gap-1">
            <Button
              id="btn-queue-pause"
              variant="ghost"
              size="sm"
              className="h-5 px-1.5 gap-1 text-[11px]"
              onClick={onQueuePause}
              disabled={!canPause || !onQueuePause}
            >
              <Pause className="size-3" />
            </Button>
            <Button
              id="btn-queue-resume"
              variant="ghost"
              size="sm"
              className="h-5 px-1.5 gap-1 text-[11px]"
              onClick={onQueueResume}
              disabled={!canResume || !onQueueResume}
            >
              <Play className="size-3" />
            </Button>
            <Button
              id="btn-queue-stop"
              variant="ghost"
              size="sm"
              className="h-5 px-1.5 gap-1 text-[11px]"
              onClick={onQueueStop}
              disabled={!canStop || !onQueueStop}
            >
              <Square className="size-3" />
            </Button>
          </div>

          <div className="h-3 w-px bg-border" />

          <Button
            id="btn-toggle-console"
            variant="ghost"
            size="sm"
            className="h-5 px-2 gap-1 text-[11px]"
            onClick={() => setIsTerminalOpen(!isTerminalOpen)}
          >
            <Terminal className="size-3" />
            {t('bottomBar.console')}
            {isTerminalOpen
              ? <ChevronDown className="size-3" />
              : <ChevronUp className="size-3" />
            }
          </Button>
        </div>
      </div>
    </div>
  )
}
