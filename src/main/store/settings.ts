import Store from 'electron-store'
import { AppSettings, ProjectConfig } from '../../shared/types'

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
// Xử lý ESM to CJS interop cho electron-store
const StoreClass = ((Store && typeof Store !== 'function' && 'default' in Store) 
  ? (Store as any).default 
  : Store) as typeof Store;

const store = new StoreClass<{ settings: AppSettings, project: ProjectConfig | null }>({
  defaults: {
    settings: defaultSettings,
    project: null
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

/**
 * Lấy cấu hình Project hiện tại
 */
export function getProjectConfig(): ProjectConfig | null {
  return store.get('project')
}

/**
 * Lưu cấu hình Project mới (Setup)
 */
export function saveProjectConfig(project: ProjectConfig): void {
  store.set('project', project)
}
