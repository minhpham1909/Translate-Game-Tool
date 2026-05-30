import { useEffect, useMemo, useState } from 'react'
import { Button } from '@renderer/components/ui/button'

interface TutorialOverlayProps {
  open: boolean
  onFinish: () => void
  onSkip: () => void
}

interface TutorialStep {
  id: string
  title: string
  description: string
  targetId: string
}

const STEPS: TutorialStep[] = [
  {
    id: 'select-file',
    title: 'Chọn file cần dịch',
    description: 'Bắt đầu bằng cách chọn file ở sidebar bên trái.',
    targetId: 'input-file-search',
  },
  {
    id: 'translate-batch',
    title: 'Dịch hàng loạt',
    description: 'Mở Pre-flight để ước tính token/cost trước khi chạy queue.',
    targetId: 'btn-open-preflight',
  },
  {
    id: 'search-replace',
    title: 'Tìm và thay thế',
    description: 'Dùng Search để sửa hàng loạt nhanh theo block.',
    targetId: 'btn-open-search',
  },
  {
    id: 'export',
    title: 'Xuất bản dịch',
    description: 'Khi ổn rồi, dùng Export để ghi file dịch vào game.',
    targetId: 'btn-open-export',
  },
]

export function TutorialOverlay({ open, onFinish, onSkip }: TutorialOverlayProps) {
  const [index, setIndex] = useState(0)
  const [rect, setRect] = useState<DOMRect | null>(null)

  const step = useMemo(() => STEPS[index], [index])

  useEffect(() => {
    if (!open) return
    const refresh = () => {
      const el = document.getElementById(step.targetId)
      if (!el) {
        setRect(null)
        return
      }
      setRect(el.getBoundingClientRect())
      el.scrollIntoView({ behavior: 'smooth', block: 'center', inline: 'center' })
    }
    refresh()
    window.addEventListener('resize', refresh)
    return () => window.removeEventListener('resize', refresh)
  }, [open, step.targetId])

  useEffect(() => {
    if (!open) setIndex(0)
  }, [open])

  if (!open) return null

  const isLast = index === STEPS.length - 1
  const panelTop = rect ? Math.min(window.innerHeight - 220, rect.bottom + 12) : 120
  const panelLeft = rect ? Math.min(window.innerWidth - 360, Math.max(16, rect.left)) : 16

  return (
    <div className="fixed inset-0 z-[120] pointer-events-auto">
      <div className="absolute inset-0 bg-black/55" />
      {rect && (
        <div
          className="absolute border-2 border-primary rounded-md shadow-[0_0_0_9999px_rgba(0,0,0,0.35)] pointer-events-none"
          style={{
            top: rect.top - 4,
            left: rect.left - 4,
            width: rect.width + 8,
            height: rect.height + 8,
          }}
        />
      )}
      <div
        className="absolute w-[340px] rounded-lg border border-border bg-card text-foreground p-4 shadow-xl"
        style={{ top: panelTop, left: panelLeft }}
      >
        <p className="text-xs text-muted-foreground mb-1">Hướng dẫn nhanh {index + 1}/{STEPS.length}</p>
        <h3 className="text-sm font-semibold mb-1">{step.title}</h3>
        <p className="text-xs text-muted-foreground mb-4">{step.description}</p>
        <div className="flex items-center justify-between">
          <Button variant="ghost" size="sm" onClick={onSkip}>Bỏ qua</Button>
          <div className="flex items-center gap-2">
            <Button
              variant="outline"
              size="sm"
              disabled={index === 0}
              onClick={() => setIndex((v) => Math.max(0, v - 1))}
            >
              Trước
            </Button>
            <Button
              size="sm"
              onClick={() => {
                if (isLast) onFinish()
                else setIndex((v) => Math.min(STEPS.length - 1, v + 1))
              }}
            >
              {isLast ? 'Hoàn tất' : 'Tiếp theo'}
            </Button>
          </div>
        </div>
      </div>
    </div>
  )
}

