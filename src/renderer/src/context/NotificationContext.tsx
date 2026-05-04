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

interface NotificationContextValue {
  notifications: Notification[]
  addNotification: (notification: Omit<Notification, 'id'>) => void
  removeNotification: (id: string) => void
  success: (title: string, message?: string) => void
  error: (title: string, message?: string) => void
  warning: (title: string, message?: string) => void
  info: (title: string, message?: string) => void
}

const NotificationContext = createContext<NotificationContextValue | null>(null)

let nextId = 0

/**
 * NotificationProvider — Bọc toàn bộ app.
 */
export function NotificationProvider({ children }: { children: React.ReactNode }) {
  const [notifications, setNotifications] = useState<Notification[]>([])
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

  return (
    <NotificationContext.Provider
      value={{ notifications, addNotification, removeNotification, success, error, warning, info }}
    >
      {children}
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
