import path from 'path'
import fs from 'fs-extra'
import { addRecentProject, getProjectConfig, getRecentProjects as readRecentProjects, saveProjectConfig } from '../store/settings'
import { ProjectConfig, RecentProject, normalizeLanguageCode } from '../../shared/types'
import { parseProject } from '../services/parserService'
import { initDatabase, getDatabase } from '../store/database'

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

  // Normalize target language to ASCII-safe code
  const normalizedConfig = {
    ...config,
    targetLanguage: normalizeLanguageCode(config.targetLanguage),
  }

  if (normalizedConfig.sourceLanguage === normalizedConfig.targetLanguage) {
    throw new Error('Target language phải khác ngôn ngữ nguồn.')
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

