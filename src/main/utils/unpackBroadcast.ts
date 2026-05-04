/**
 * unpackBroadcast.ts
 * IPC event broadcasting for unpacker progress.
 */
import { BrowserWindow } from 'electron'

export interface UnpackProgressEvent {
  event: 'info' | 'progress' | 'error' | 'complete'
  message?: string
  detail?: string
  current?: number
  total?: number
  percent?: number
  files_processed?: number
  files_failed?: number
}

export function emitUnpackProgress(event: UnpackProgressEvent): void {
  const windows = BrowserWindow.getAllWindows()
  for (const win of windows) {
    win.webContents.send('unpack:progress', event)
  }
}
