import path from 'path'
import fs from 'fs-extra'
import { getProjectConfig, saveProjectConfig } from '../store/settings'
import { ProjectConfig } from '../../shared/types'

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
    console.error(`[ProjectSetup] Lỗi quét ngôn ngữ trong ${tlPath}:`, error)
    throw new Error('Không thể đọc thư mục ngôn ngữ của game.')
  }
}

/**
 * Khởi tạo/Lưu Project mới
 */
export function setupProject(config: ProjectConfig): void {
  // Validate cơ bản
  if (!config.gameFolderPath || !config.sourceLanguage || !config.targetLanguage) {
    throw new Error('Thiếu thông tin Project Config.')
  }
  
  if (config.sourceLanguage === config.targetLanguage) {
    throw new Error('Ngôn ngữ đích phải khác ngôn ngữ nguồn.')
  }

  saveProjectConfig(config)
  console.log('[ProjectSetup] Đã lưu cấu hình Project:', config)
}

/**
 * Lấy cấu hình Project đang làm việc
 */
export function getCurrentProject(): ProjectConfig | null {
  return getProjectConfig()
}
