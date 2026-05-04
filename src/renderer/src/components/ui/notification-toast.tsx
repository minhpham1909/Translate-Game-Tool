/**
 * NotificationToast.tsx
 * Component hiển thị danh sách toast notifications.
 * Design: Fixed position top-right, stack vertically, auto-dismiss with progress bar.
 * Style: Matches the app's dark/light theme using Tailwind CSS variables.
 */
import { useEffect, useState } from 'react'
import { CheckCircle2, AlertCircle, AlertTriangle, Info, X } from 'lucide-react'
import { useNotification, type Notification } from '@renderer/context/NotificationContext'
import { cn } from '@renderer/lib/utils'

const typeConfig: Record<Notification['type'], { icon: React.ReactNode; color: string; bg: string; border: string }> = {
  success: {
    icon: <CheckCircle2 className="size-4" />,
    color: 'text-emerald-400',
    bg: 'bg-emerald-500/10',
    border: 'border-emerald-500/30',
  },
  error: {
    icon: <AlertCircle className="size-4" />,
    color: 'text-red-400',
    bg: 'bg-red-500/10',
    border: 'border-red-500/30',
  },
  warning: {
    icon: <AlertTriangle className="size-4" />,
    color: 'text-amber-400',
    bg: 'bg-amber-500/10',
    border: 'border-amber-500/30',
  },
  info: {
    icon: <Info className="size-4" />,
    color: 'text-blue-400',
    bg: 'bg-blue-500/10',
    border: 'border-blue-500/30',
  },
}

function ToastItem({ notification, onDismiss }: { notification: Notification; onDismiss: () => void }) {
  const [progress, setProgress] = useState(100)
  const config = typeConfig[notification.type]
  const duration = notification.duration ?? 4000

  // Animate progress bar
  useEffect(() => {
    if (duration <= 0) return // Sticky notifications don't animate

    const startTime = Date.now()
    const interval = setInterval(() => {
      const elapsed = Date.now() - startTime
      const remaining = Math.max(0, 1 - elapsed / duration) * 100
      setProgress(remaining)
      if (remaining <= 0) clearInterval(interval)
    }, 50)

    return () => clearInterval(interval)
  }, [duration])

  return (
    <div
      className={cn(
        'group relative w-80 rounded-lg border shadow-lg backdrop-blur-sm',
        'animate-in slide-in-from-right fade-in duration-300',
        config.bg,
        config.border,
      )}
      role="alert"
    >
      {/* Progress bar */}
      {duration > 0 && (
        <div className="absolute top-0 left-0 right-0 h-0.5 bg-muted/20 rounded-t-lg overflow-hidden">
          <div
            className={cn('h-full transition-all duration-100 ease-linear', config.color.replace('text-', 'bg-'))}
            style={{ width: `${progress}%` }}
          />
        </div>
      )}

      <div className="p-3">
        <div className="flex items-start gap-2.5">
          {/* Icon */}
          <span className={cn('mt-0.5 flex-shrink-0', config.color)}>
            {config.icon}
          </span>

          {/* Content */}
          <div className="flex-1 min-w-0">
            <p className="text-sm font-medium text-foreground leading-tight">
              {notification.title}
            </p>
            {notification.message && (
              <p className="text-xs text-muted-foreground mt-0.5 leading-relaxed">
                {notification.message}
              </p>
            )}
          </div>

          {/* Close button */}
          <button
            onClick={onDismiss}
            className="flex-shrink-0 p-0.5 rounded text-muted-foreground opacity-0 group-hover:opacity-100 hover:text-foreground transition-all"
          >
            <X className="size-3.5" />
          </button>
        </div>
      </div>
    </div>
  )
}

/**
 * NotificationToast — Render the toast stack.
 * Place this once in the app root (inside AppContent).
 */
export function NotificationToast() {
  const { notifications, removeNotification } = useNotification()

  if (notifications.length === 0) return null

  return (
    <div className="fixed top-4 right-4 z-50 flex flex-col gap-2 pointer-events-none">
      {notifications.map((notif) => (
        <div key={notif.id} className="pointer-events-auto">
          <ToastItem
            notification={notif}
            onDismiss={() => removeNotification(notif.id)}
          />
        </div>
      ))}
    </div>
  )
}
