import path from 'path'
import fs from 'fs-extra'
import { addRecentProject, getProjectConfig, getRecentProjects as readRecentProjects, saveProjectConfig } from '../store/settings'
import { ProjectConfig, RecentProject } from '../../shared/types'
import { parseProject } from '../services/parserService'
import { initDatabase } from '../store/database'

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
 * Khởi tạo/Lưu Project mới
 */
export async function setupProject(config: ProjectConfig): Promise<void> {
  // Validate cơ bản
  if (!config.gameFolderPath || !config.sourceLanguage || !config.targetLanguage) {
    throw new Error('Missing Project Config fields.')
  }

  if (config.sourceLanguage === config.targetLanguage) {
    throw new Error('Target language must differ from source language.')
  }

  // Đảm bảo DB được khởi tạo trước khi parse
  initDatabase()

  // Chạy parser quét file và nạp vào SQLite
  await parseProject(config.gameFolderPath, config.sourceLanguage)

  // Lưu cấu hình vào electron-store sau khi parse thành công
  saveProjectConfig(config)
  addRecentProject(config)
  console.log('[ProjectSetup] Project config saved:', config)
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
