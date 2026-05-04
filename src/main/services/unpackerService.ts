/**
 * unpackerService.ts
 * Detects .rpa archives and .rpyc compiled scripts in Ren'Py game folders,
 * then spawns a Python subprocess to extract/decompile them.
 *
 * Covers 99% of compiled VN games by using:
 * - RPA-3.x archive format parser (pure Python, no deps)
 * - unrpyc decompiler (pip install unrpyc) for .rpyc → .rpy
 */
import path from 'path'
import fs from 'fs-extra'
import { spawn, ChildProcess } from 'child_process'
import { emitSystemLog } from '../utils/ipcBroadcast'
import { emitUnpackProgress, type UnpackProgressEvent } from '../utils/unpackBroadcast'

export interface UnpackResult {
  success: boolean
  rpaExtracted: number
  rpycDecompiled: number
  failed: number
  message: string
}

/**
 * Scan game folder for compiled files (.rpa, .rpyc).
 * Returns counts and file paths found.
 */
export async function scanCompiledFiles(gameDir: string): Promise<{
  rpaFiles: string[]
  rpycFiles: string[]
  rpyFiles: string[]
  hasCompiled: boolean
  hasSource: boolean
}> {
  const rpaFiles: string[] = []
  const rpycFiles: string[] = []
  const rpyFiles: string[] = []

  async function scan(dir: string): Promise<void> {
    const entries = await fs.readdir(dir, { withFileTypes: true })
    for (const entry of entries) {
      const fullPath = path.join(dir, entry.name)
      if (entry.isDirectory()) {
        // Skip cache and backup directories
        if (entry.name.toLowerCase() === 'cache') continue
        if (entry.name.toLowerCase() === 'backups') continue
        if (entry.name.toLowerCase() === 'saves') continue
        await scan(fullPath)
      } else {
        const ext = path.extname(entry.name).toLowerCase()
        if (ext === '.rpa') rpaFiles.push(fullPath)
        else if (ext === '.rpyc') rpycFiles.push(fullPath)
        else if (ext === '.rpy') rpyFiles.push(fullPath)
      }
    }
  }

  await scan(gameDir)

  return {
    rpaFiles,
    rpycFiles,
    rpyFiles,
    hasCompiled: rpaFiles.length > 0 || rpycFiles.length > 0,
    hasSource: rpyFiles.length > 0,
  }
}

/**
 * Find a Python executable on the system.
 * Tries: python, python3, py (Windows launcher), then common paths.
 */
async function findPython(): Promise<string | null> {
  const candidates = ['python', 'python3', 'py', 'python.exe', 'python3.exe']

  // Check PATH first
  for (const cmd of candidates) {
    try {
      const { spawn } = await import('child_process')
      const proc = spawn(cmd, ['--version'])
      return new Promise((resolve) => {
        proc.on('error', () => resolve(null))
        proc.on('close', (code) => {
          if (code === 0) resolve(cmd)
          else resolve(null)
        })
        // Timeout after 3s
        setTimeout(() => resolve(null), 3000)
      })
    } catch {
      // continue
    }
  }

  // Windows: try common installation paths
  if (process.platform === 'win32') {
    const winPaths = [
      path.join(process.env.LOCALAPPDATA || '', 'Programs', 'Python', 'Python311', 'python.exe'),
      path.join(process.env.LOCALAPPDATA || '', 'Programs', 'Python', 'Python312', 'python.exe'),
      path.join(process.env.LOCALAPPDATA || '', 'Programs', 'Python', 'Python310', 'python.exe'),
      'C:\\Python311\\python.exe',
      'C:\\Python312\\python.exe',
      'C:\\Python39\\python.exe',
    ]
    for (const p of winPaths) {
      if (await fs.pathExists(p)) return p
    }
  }

  // macOS / Linux: common paths
  if (await fs.pathExists('/usr/bin/python3')) return '/usr/bin/python3'
  if (await fs.pathExists('/usr/local/bin/python3')) return '/usr/local/bin/python3'

  return null
}

/**
 * Run the Python unpacker script.
 * Streams JSON-line events from stdout to the renderer via IPC.
 */
export async function runUnpacker(
  gameDir: string,
  options: {
    mode?: 'extract' | 'decompile' | 'auto'
    onProgress?: (event: UnpackProgressEvent) => void
  } = {}
): Promise<UnpackResult> {
  const { mode = 'auto', onProgress } = options

  // Find Python
  const pythonPath = await findPython()
  if (!pythonPath) {
    const msg = 'Python not found on system. Please install Python 3.x and ensure it is in PATH.'
    emitSystemLog('error', `[Unpacker] ${msg}`)
    return { success: false, rpaExtracted: 0, rpycDecompiled: 0, failed: 0, message: msg }
  }

  emitSystemLog('info', `[Unpacker] Python found: ${pythonPath}`)

  // Locate unpacker.py next to this script
  const unpackerScript = path.join(__dirname, '..', 'python-tools', 'unpacker.py')
  if (!await fs.pathExists(unpackerScript)) {
    const msg = `Unpacker script not found at: ${unpackerScript}`
    emitSystemLog('error', `[Unpacker] ${msg}`)
    return { success: false, rpaExtracted: 0, rpycDecompiled: 0, failed: 0, message: msg }
  }

  return new Promise((resolve) => {
    const proc: ChildProcess = spawn(pythonPath, [
      unpackerScript,
      gameDir,
      '--mode', mode,
    ], {
      stdio: ['ignore', 'pipe', 'pipe'],
      env: { ...process.env, PYTHONIOENCODING: 'utf-8' },
    })

    let rpaExtracted = 0
    let rpycDecompiled = 0
    let failed = 0
    let stderrData = ''

    const result: UnpackResult = {
      success: true,
      rpaExtracted: 0,
      rpycDecompiled: 0,
      failed: 0,
      message: 'Unpack completed',
    }

    proc.stdout?.on('data', (chunk: Buffer) => {
      const lines = chunk.toString('utf-8').split('\n').filter(Boolean)
      for (const line of lines) {
        try {
          const event = JSON.parse(line) as UnpackProgressEvent
          if (onProgress) onProgress(event)
          emitUnpackProgress(event)

          switch (event.event) {
            case 'info':
              emitSystemLog('info', `[Unpacker] ${event.message}`)
              break
            case 'error':
              emitSystemLog('error', `[Unpacker] ${event.message}: ${event.detail || ''}`)
              failed++
              break
            case 'complete':
              rpaExtracted = event.files_processed ?? 0
              rpycDecompiled = 0
              failed = event.files_failed ?? 0
              break
          }
        } catch {
          // Non-JSON line — ignore
        }
      }
    })

    proc.stderr?.on('data', (chunk: Buffer) => {
      stderrData += chunk.toString('utf-8')
    })

    proc.on('close', (code) => {
      result.rpaExtracted = rpaExtracted
      result.rpycDecompiled = rpycDecompiled
      result.failed = failed
      result.success = code === 0

      if (code !== 0 && stderrData) {
        result.message = `Python exited with code ${code}: ${stderrData.trim().split('\n').pop()}`
        emitSystemLog('error', `[Unpacker] ${result.message}`)
      } else {
        result.message = `Unpack complete: ${rpaExtracted} extracted, ${rpycDecompiled} decompiled, ${failed} failed`
        emitSystemLog('success', `[Unpacker] ${result.message}`)
      }

      resolve(result)
    })

    proc.on('error', (err) => {
      const msg = `Failed to spawn Python: ${err.message}`
      emitSystemLog('error', `[Unpacker] ${msg}`)
      resolve({ success: false, rpaExtracted: 0, rpycDecompiled: 0, failed: 0, message: msg })
    })
  })
}

/**
 * Install Python dependencies for the unpacker (unrpyc).
 * Runs: pip install unrpyc
 */
export async function installUnpackerDeps(): Promise<{ success: boolean; message: string }> {
  const pythonPath = await findPython()
  if (!pythonPath) {
    return { success: false, message: 'Python not found. Please install Python 3.x first.' }
  }

  return new Promise((resolve) => {
    emitSystemLog('info', '[Unpacker] Installing unrpyc decompiler...')
    const proc = spawn(pythonPath, ['-m', 'pip', 'install', '--user', 'unrpyc'], {
      stdio: ['ignore', 'pipe', 'pipe'],
    })

    let output = ''
    proc.stdout?.on('data', (d: Buffer) => { output += d.toString() })
    proc.stderr?.on('data', (d: Buffer) => { output += d.toString() })

    proc.on('close', (code) => {
      if (code === 0) {
        emitSystemLog('success', '[Unpacker] unrpyc installed successfully')
        resolve({ success: true, message: 'Dependencies installed' })
      } else {
        emitSystemLog('warning', `[Unpacker] pip install failed (code ${code}). Will use fallback decompiler.`)
        resolve({ success: false, message: `pip install failed: ${output.trim().split('\n').pop()}` })
      }
    })

    proc.on('error', (err) => {
      resolve({ success: false, message: `Failed to run pip: ${err.message}` })
    })
  })
}
