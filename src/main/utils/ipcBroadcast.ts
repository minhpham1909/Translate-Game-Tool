import { BrowserWindow } from 'electron'

export type SystemLogType = 'info' | 'warning' | 'error' | 'success'

export interface SystemLogEntry {
  type: SystemLogType
  message: string
  timestamp: string
}

export interface EngineProgressPayload {
  success: number
  error: number
  state?: 'idle' | 'running' | 'paused' | 'stopped' | 'error' | 'done'
  fileId?: number | null
  processed?: number
  speedBlocksPerMin?: number
  etaSeconds?: number | null
  batchSize?: number
  approxInputTokens?: number
  approxOutputTokens?: number
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

export function emitEngineProgress(progress: EngineProgressPayload): void {
  broadcastToAllWindows('engine:progress', progress)
}
