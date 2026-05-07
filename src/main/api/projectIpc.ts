import path from 'path'
import fs from 'fs-extra'
import { addRecentProject, getProjectConfig, getRecentProjects as readRecentProjects, saveProjectConfig, saveRecentProjects } from '../store/settings'
import { ProjectConfig, RecentProject, normalizeLanguageCode } from '../../shared/types'
import { parseProject } from '../services/parserService'
import { initDatabase, getDatabase, getGameFolderName, findExistingDbPath } from '../store/database'

/**
 * Quét thư mục game/tl/ để lấy danh sách các ngôn ngữ có sẵn.
 * @param gameFolderPath Đường dẫn tuyệt đối đến thư mục game/
 * @returns Danh sách các folder ngôn ngữ (vd: ['english', 'chinese'])
 */
export async function scanAvailableLanguages(gameFolderPath: string): Promise<string[]> {
  const tlPath = path.join(gameFolderPath, 'tl')

  try {
    const exists = await fs.pathExists(tlPath)
    if (!exists) {
      return [] // Không có thư mục tl, nghĩa là game chưa generate translation
    }

    const items = await fs.readdir(tlPath, { withFileTypes: true })
    // Lọc ra các directory, đó chính là tên các ngôn ngữ
    const languages = items
      .filter(item => item.isDirectory())
      .map(item => item.name)

    return languages
  } catch (error) {
    console.error(`[ProjectSetup] Failed to scan languages in ${tlPath}:`, error)
    throw new Error('Failed to read game language folder.')
  }
}

/**
 * Kiểm tra xem project đã được parse trước đó chưa (DB có files không).
 */
function isProjectAlreadyParsed(): boolean {
  try {
    const db = getDatabase()
    const count = db.prepare('SELECT COUNT(*) as c FROM files').get() as { c: number }
    return count.c > 0
  } catch {
    return false
  }
}

/**
 * Khởi tạo Project mới — Parse toàn bộ .rpy files vào DB.
 * Nếu project đã được parse trước đó, sẽ KHÔNG parse lại (bảo toàn bản dịch).
 * Dùng forceReparse = true để ép parse lại từ đầu.
 */
export async function setupProject(config: ProjectConfig, forceReparse: boolean = false): Promise<void> {
  if (!config.gameFolderPath || !config.sourceLanguage || !config.targetLanguage) {
    throw new Error('Missing Project Config fields.')
  }

  // Kiểm tra game folder có tồn tại không
  const gameFolderExists = await fs.pathExists(config.gameFolderPath)
  if (!gameFolderExists) {
    throw new Error(`Thư mục game không tồn tại: ${config.gameFolderPath}`)
  }

  // Normalize target language to ASCII-safe code
  const normalizedConfig = {
    ...config,
    targetLanguage: normalizeLanguageCode(config.targetLanguage),
  }

  if (normalizedConfig.sourceLanguage === normalizedConfig.targetLanguage) {
    throw new Error('Target language phải khác ngôn ngữ nguồn.')
  }

  // Không cho phép target = None (None là ngôn ngữ gốc, không phải đích dịch)
  if (normalizedConfig.targetLanguage === 'None') {
    throw new Error('Không thể chọn None làm ngôn ngữ đích. None là ngôn ngữ gốc của game.')
  }

  // Kiểm tra source language folder (xử lý riêng case None)
  if (normalizedConfig.sourceLanguage !== 'None') {
    const sourceDir = path.join(config.gameFolderPath, 'tl', normalizedConfig.sourceLanguage)
    const sourceExists = await fs.pathExists(sourceDir)
    if (!sourceExists) {
      throw new Error(`Thư mục ngôn ngữ nguồn không tồn tại: ${sourceDir}`)
    }
  } else {
    // Source = None: kiểm tra game/ có file .rpy không
    const gameFiles = await getAllFiles(config.gameFolderPath, '.rpy')
    const hasRpyInGame = gameFiles.some(f => !f.includes(path.sep + 'tl' + path.sep))
    if (!hasRpyInGame) {
      throw new Error('Không tìm thấy file .rpy trong thư mục game/. Vui lòng kiểm tra cấu trúc game hoặc unpack game trước.')
    }
  }

  // Khởi tạo DB
  initDatabase(normalizedConfig.gameFolderPath)

  // Nếu project đã được parse trước đó và không ép reparse → skip parsing
  if (isProjectAlreadyParsed() && !forceReparse) {
    console.log('[ProjectSetup] Project already parsed, skipping re-parse. Loading from existing DB.')
    saveProjectConfig(normalizedConfig)
    addRecentProject(normalizedConfig)
    return
  }

  // Parse toàn bộ .rpy files → nạp vào DB
  await parseProject(normalizedConfig.gameFolderPath, normalizedConfig.sourceLanguage)

  // Lưu cấu hình
  saveProjectConfig(normalizedConfig)
  addRecentProject(normalizedConfig)
  console.log('[ProjectSetup] Project setup complete:', normalizedConfig)
}

/**
 * Mở lại project đã có — KHÔNG parse lại, chỉ load từ DB.
 * Đảm bảo bản dịch không bị mất khi restart app.
 */
export async function openProject(config: ProjectConfig): Promise<void> {
  if (!config.gameFolderPath || !config.sourceLanguage || !config.targetLanguage) {
    throw new Error('Missing Project Config fields.')
  }

  // Normalize target language
  const normalizedConfig = {
    ...config,
    targetLanguage: normalizeLanguageCode(config.targetLanguage),
  }

  // Không cho phép target = None
  if (normalizedConfig.targetLanguage === 'None') {
    throw new Error('Không thể chọn None làm ngôn ngữ đích. None là ngôn ngữ gốc của game.')
  }

  // Chỉ khởi tạo DB connection, KHÔNG gọi parseProject
  initDatabase(normalizedConfig.gameFolderPath)

  // Update recent list
  addRecentProject(normalizedConfig)
  console.log('[ProjectSetup] Project opened from existing DB:', normalizedConfig)
}

/**
 * Lấy cấu hình Project đang làm việc
 */
export function getCurrentProject(): ProjectConfig | null {
  return getProjectConfig()
}

/**
 * Lấy danh sách recent projects
 */
export function getRecentProjects(): RecentProject[] {
  return readRecentProjects()
}

/**
 * Xóa project khỏi danh sách recent VÀ xóa database.
 * @param gameFolderPath Đường dẫn game cần xóa
 * @param deleteFiles Có xóa cả file dịch trong tl/{target}/ không
 */
export function deleteProject(gameFolderPath: string, deleteFiles: boolean = false): void {
  // 1. Xóa khỏi recent list
  const current = readRecentProjects()
  const filtered = current.filter(p => p.gameFolderPath !== gameFolderPath)
  saveRecentProjects(filtered)

  // 2. Xóa database file (tìm file thực tế, không tạo mới)
  try {
    const gameName = getGameFolderName(gameFolderPath)
    const dbPath = findExistingDbPath(gameName)
    if (dbPath && fs.existsSync(dbPath)) {
      fs.removeSync(dbPath)
      // Xóa cả WAL/SHM files
      try { fs.removeSync(dbPath + '-wal') } catch {}
      try { fs.removeSync(dbPath + '-shm') } catch {}
      console.log(`[ProjectSetup] Deleted database: ${dbPath}`)
    } else {
      console.log(`[ProjectSetup] No database found for ${gameName}`)
    }
  } catch (err) {
    console.error('[ProjectSetup] Failed to delete database:', err)
  }

  // 3. Xóa file dịch nếu user yêu cầu
  if (deleteFiles) {
    try {
      const project = filtered.find(p => p.gameFolderPath === gameFolderPath)
      if (project) {
        const targetPath = path.join(gameFolderPath, 'tl', project.targetLanguage)
        if (fs.existsSync(targetPath)) {
          fs.removeSync(targetPath)
          console.log(`[ProjectSetup] Deleted translation files: ${targetPath}`)
        }
      }
    } catch (err) {
      console.error('[ProjectSetup] Failed to delete translation files:', err)
    }
  }

  console.log(`[ProjectSetup] Deleted project: ${gameFolderPath}`)
}

