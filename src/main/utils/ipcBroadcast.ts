import { BrowserWindow } from 'electron'

export type SystemLogType = 'info' | 'warning' | 'error' | 'success'

export interface SystemLogEntry {
  type: SystemLogType
  message: string
  timestamp: string
}

function getTimestamp(): string {
  // HH:mm:ss (24h)
  return new Date().toLocaleTimeString('en-GB', { hour12: false })
}

export function broadcastToAllWindows<T>(channel: string, payload: T): void {
  const windows = BrowserWindow.getAllWindows()
  for (const win of windows) {
    win.webContents.send(channel, payload)
  }
}

export function emitSystemLog(type: SystemLogType, message: string): void {
  const entry: SystemLogEntry = { type, message, timestamp: getTimestamp() }
  broadcastToAllWindows<SystemLogEntry>('system:log', entry)
}

export function emitEngineProgress(progress: { success: number; error: number }): void {
  broadcastToAllWindows('engine:progress', progress)
}
