/**
 * NotificationContext.tsx
 * Quản lý thông báo (toast notifications) toàn ứng dụng.
 * Thay thế window.alert() bằng toast in-app phù hợp với theme.
 */
import { createContext, useCallback, useContext, useRef, useState } from 'react'

export type NotificationType = 'success' | 'error' | 'warning' | 'info'

export interface Notification {
  id: string
  type: NotificationType
  title: string
  message?: string
  duration?: number // ms, 0 = sticky
}

export interface ConfirmDialogOptions {
  title: string
  message: string
  confirmText?: string
  cancelText?: string
  type?: NotificationType
}

interface NotificationContextValue {
  notifications: Notification[]
  addNotification: (notification: Omit<Notification, 'id'>) => void
  removeNotification: (id: string) => void
  success: (title: string, message?: string) => void
  error: (title: string, message?: string) => void
  warning: (title: string, message?: string) => void
  info: (title: string, message?: string) => void
  confirm: (options: ConfirmDialogOptions) => Promise<boolean>
}

const NotificationContext = createContext<NotificationContextValue | null>(null)

let nextId = 0
let confirmResolve: ((value: boolean) => void) | null = null

/**
 * NotificationProvider — Bọc toàn bộ app.
 */
export function NotificationProvider({ children }: { children: React.ReactNode }) {
  const [notifications, setNotifications] = useState<Notification[]>([])
  const [confirmDialog, setConfirmDialog] = useState<(ConfirmDialogOptions & { id: string }) | null>(null)
  const timersRef = useRef<Map<string, ReturnType<typeof setTimeout>>>(new Map())

  const removeNotification = useCallback((id: string) => {
    setNotifications(prev => prev.filter(n => n.id !== id))
    const timer = timersRef.current.get(id)
    if (timer) {
      clearTimeout(timer)
      timersRef.current.delete(id)
    }
  }, [])

  const addNotification = useCallback((notification: Omit<Notification, 'id'>) => {
    const id = `notif-${++nextId}-${Date.now()}`
    const duration = notification.duration ?? 4000

    setNotifications(prev => [...prev, { ...notification, id }])

    if (duration > 0) {
      const timer = setTimeout(() => removeNotification(id), duration)
      timersRef.current.set(id, timer)
    }
  }, [removeNotification])

  const confirm = useCallback((options: ConfirmDialogOptions): Promise<boolean> => {
    return new Promise((resolve) => {
      confirmResolve = resolve
      const id = `confirm-${++nextId}-${Date.now()}`
      setConfirmDialog({ ...options, id })
    })
  }, [])

  const success = useCallback((title: string, message?: string) => {
    addNotification({ type: 'success', title, message })
  }, [addNotification])

  const error = useCallback((title: string, message?: string) => {
    addNotification({ type: 'error', title, message, duration: 6000 })
  }, [addNotification])

  const warning = useCallback((title: string, message?: string) => {
    addNotification({ type: 'warning', title, message })
  }, [addNotification])

  const info = useCallback((title: string, message?: string) => {
    addNotification({ type: 'info', title, message })
  }, [addNotification])

  const handleConfirm = (result: boolean) => {
    if (confirmResolve) {
      confirmResolve(result)
      confirmResolve = null
    }
    setConfirmDialog(null)
  }

  return (
    <NotificationContext.Provider
      value={{ notifications, addNotification, removeNotification, success, error, warning, info, confirm }}
    >
      {children}
      {confirmDialog && (
        <div className="fixed inset-0 z-[9999] flex items-center justify-center bg-black/50">
          <div className="bg-card border border-border rounded-lg p-6 max-w-sm w-full mx-4 space-y-4 shadow-xl">
            <h3 className="text-lg font-semibold text-foreground">{confirmDialog.title}</h3>
            <p className="text-sm text-muted-foreground">{confirmDialog.message}</p>
            <div className="flex gap-3 justify-end">
              <button
                onClick={() => handleConfirm(false)}
                className="px-4 py-2 rounded-md border border-border hover:bg-accent transition-colors text-sm"
              >
                {confirmDialog.cancelText || 'Cancel'}
              </button>
              <button
                onClick={() => handleConfirm(true)}
                className="px-4 py-2 rounded-md bg-destructive text-destructive-foreground hover:bg-destructive/90 transition-colors text-sm"
              >
                {confirmDialog.confirmText || 'Confirm'}
              </button>
            </div>
          </div>
        </div>
      )}
    </NotificationContext.Provider>
  )
}

export function useNotification(): NotificationContextValue {
  const context = useContext(NotificationContext)
  if (!context) {
    throw new Error('useNotification must be used within NotificationProvider')
  }
  return context
}
