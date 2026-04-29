import Store from 'electron-store'
import { AppSettings } from '../../shared/types'

const defaultSettings: AppSettings = {
  // Group 1
  apiKeys: {},
  activeProvider: 'gemini',
  activeModelId: 'gemini-1.5-flash',
  customEndpoint: '',

  // Group 2
  targetLanguage: 'Tiếng Việt',
  temperature: 0.2,
  userCustomPrompt: '',

  // Group 3
  batchSize: 20,
  concurrentRequests: 1,
  costWarningThreshold: 2.0,

  // Group 4
  enableTranslationMemory: true,
  tmFuzzyThreshold: 1.0,

  // Group 5
  theme: 'system',
  editorFontSize: 14,
  autoSaveInterval: 5
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

export function updateApiKey(provider: import('../../shared/types').AIProvider, key: string): void {
  const current = getSettings()
  const apiKeys = { ...current.apiKeys, [provider]: key }
  store.set('settings', { ...current, apiKeys })
}
