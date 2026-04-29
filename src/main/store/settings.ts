import Store from 'electron-store'
import { AppSettings } from '../../shared/types'

const defaultSettings: AppSettings = {
  apiKeys: {},
  activeProvider: 'gemini',
  activeModelId: 'gemini-1.5-flash',
  batchSize: 20,
  targetLanguage: 'Vietnamese'
}

// Khởi tạo electron-store. Data sẽ được lưu dưới dạng file JSON 
// trong thư mục AppData của hệ điều hành.
const store = new Store<{ settings: AppSettings }>({
  defaults: {
    settings: defaultSettings
  }
})

/**
 * Lấy toàn bộ settings hiện tại
 */
export function getSettings(): AppSettings {
  return store.get('settings')
}

/**
 * Cập nhật settings
 * @param settings Object chứa các trường cần update
 */
export function saveSettings(settings: Partial<AppSettings>): void {
  const current = getSettings()
  store.set('settings', { ...current, ...settings })
}

/**
 * Hàm hỗ trợ lưu API key nhanh cho 1 provider
 * @param provider 'gemini', 'claude', 'openai', ...
 * @param key Chuỗi API Key
 */
export function updateApiKey(provider: string, key: string): void {
  const current = getSettings()
  const apiKeys = { ...current.apiKeys, [provider]: key }
  store.set('settings', { ...current, apiKeys })
}
