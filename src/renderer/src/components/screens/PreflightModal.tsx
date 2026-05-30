/**
 * PreflightModal.tsx
 * Modal xác nhận trước khi dịch hàng loạt bằng AI.
 * Hiển thị số block cần dịch, ước tính token và chi phí.
 */
import { Zap, FileText, Coins, AlertTriangle } from 'lucide-react'
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter,
} from '@renderer/components/ui/dialog'
import { Button } from '@renderer/components/ui/button'
import { Switch } from '@renderer/components/ui/switch'
import { cn } from '@renderer/lib/utils'
import { useI18n } from '@renderer/i18n'

type TranslateScope = 'file' | 'project'

interface PreflightData {
  pendingBlocks: number
  estimatedCharacters: number
  estimatedCost: number
  activeFileName?: string
}

interface PreflightModalProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  data: PreflightData
  scope: TranslateScope
  onScopeChange: (scope: TranslateScope) => void
  includeHidden: boolean
  onIncludeHiddenChange: (value: boolean) => void
  onConfirm: (includeHidden: boolean) => void
}

/**
 * StatCard — hiển thị 1 chỉ số tóm tắt
 */
function StatCard({
  icon,
  label,
  value,
  valueClassName,
}: {
  icon: React.ReactNode
  label: string
  value: string
  valueClassName?: string
}) {
  return (
    <div className="flex-1 flex flex-col items-center gap-1.5 p-4 rounded-lg border border-border bg-card">
      <div className="text-muted-foreground">{icon}</div>
      <span className={cn('text-xl font-bold font-mono tracking-tight', valueClassName)}>
        {value}
      </span>
      <span className="text-[11px] text-muted-foreground text-center">{label}</span>
    </div>
  )
}

/**
 * PreflightModal component
 * @param data - Thống kê pre-flight từ backend
 * @param scope - Dịch toàn project hay chỉ file hiện tại
 * @param onScopeChange - Callback đổi scope
 * @param onConfirm - Callback bắt đầu dịch
 */
export function PreflightModal({
  open,
  onOpenChange,
  data,
  scope,
  onScopeChange,
  includeHidden,
  onIncludeHiddenChange,
  onConfirm,
}: PreflightModalProps) {
  const { t } = useI18n()
  const estimatedTokens = Math.round(data.estimatedCharacters / 4)

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md gap-0 p-0 overflow-hidden">
        <DialogHeader className="px-6 pt-5 pb-4 border-b border-border">
          <DialogTitle className="text-base font-semibold flex items-center gap-2">
            <Zap className="size-4 text-primary" />
            {t('preflight.title')}
          </DialogTitle>
          <p className="text-xs text-muted-foreground mt-0.5">
            {t('preflight.subtitle')}
          </p>
        </DialogHeader>

        <div className="px-6 py-5 space-y-5">
          {/* Stat Cards */}
          <div className="flex gap-3">
            <StatCard
              icon={<FileText className="size-5" />}
              label={t('preflight.pendingBlocks')}
              value={data.pendingBlocks.toLocaleString()}
              valueClassName="text-foreground"
            />
            <StatCard
              icon={<Zap className="size-5" />}
              label={t('preflight.estTokens')}
              value={`~${(estimatedTokens / 1000).toFixed(0)}k`}
              valueClassName="text-info"
            />
            <StatCard
              icon={<Coins className="size-5" />}
              label={t('preflight.estCost')}
              value={`~$${data.estimatedCost.toFixed(2)}`}
              valueClassName="text-warning"
            />
          </div>

          {/* Scope Selection */}
          <div className="space-y-2">
            <p className="text-xs font-medium text-muted-foreground uppercase tracking-wider">
              {t('preflight.scope')}
            </p>
            <div className="grid grid-cols-2 gap-2">
              <button
                id="scope-current-file"
                onClick={() => onScopeChange('file')}
                className={cn(
                  'flex flex-col items-start gap-1 p-3 rounded-md border text-sm transition-colors text-left',
                  scope === 'file'
                    ? 'border-primary bg-primary/10 text-foreground'
                    : 'border-border hover:border-primary/40 text-muted-foreground'
                )}
              >
                <span className="font-medium">{t('preflight.currentFile')}</span>
                <span className="text-[11px] text-muted-foreground truncate w-full">
                  {data.activeFileName ?? t('preflight.noFileSelected')}
                </span>
              </button>

              <button
                id="scope-entire-project"
                onClick={() => onScopeChange('project')}
                className={cn(
                  'flex flex-col items-start gap-1 p-3 rounded-md border text-sm transition-colors text-left',
                  scope === 'project'
                    ? 'border-primary bg-primary/10 text-foreground'
                    : 'border-border hover:border-primary/40 text-muted-foreground'
                )}
              >
                <span className="font-medium">{t('preflight.entireProject')}</span>
                <span className="text-[11px] text-muted-foreground">
                  {t('preflight.allUntranslated')}
                </span>
              </button>
            </div>
          </div>

          <div className="flex items-center justify-between rounded-md border border-border px-3 py-2.5">
            <div className="space-y-0.5">
              <p className="text-sm font-medium text-foreground">{t('preflight.includeHiddenTitle')}</p>
              <p className="text-[11px] text-muted-foreground">
                {t('preflight.includeHiddenDesc')}
              </p>
            </div>
            <Switch
              id="include-hidden-blocks"
              checked={includeHidden}
              onCheckedChange={(checked) => onIncludeHiddenChange(checked)}
            />
          </div>

          {/* Warning */}
          {data.estimatedCost > 1 && (
            <div className="flex items-start gap-2 p-3 rounded-md border border-warning/30 bg-warning/10">
              <AlertTriangle className="size-4 text-warning flex-shrink-0 mt-0.5" />
              <p className="text-xs text-warning">
                {t('preflight.costWarning')}
              </p>
            </div>
          )}
        </div>

        <DialogFooter className="px-6 py-4 border-t border-border bg-muted/20">
          <Button variant="outline" onClick={() => onOpenChange(false)}>{t('common.cancel')}</Button>
          <Button
            id="btn-confirm-start-translation"
            onClick={() => { onConfirm(includeHidden); onOpenChange(false) }}
            disabled={data.pendingBlocks === 0}
          >
            <Zap className="size-3.5 mr-1.5" />
            {t('preflight.confirmStart')}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
