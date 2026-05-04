import Store from 'electron-store'
import { AppSettings, ProjectConfig, RecentProject } from '../../shared/types'

const defaultSettings: AppSettings = {
  // Group 1
  apiKeys: {},
  activeProvider: 'gemini',
  activeModelId: 'gemini-2.5-flash',
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

const store = new StoreClass<{ settings: AppSettings; project: ProjectConfig | null; recentProjects: RecentProject[] }>({
  defaults: {
    settings: defaultSettings,
    project: null,
    recentProjects: []
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

/**
 * Lấy danh sách Recent Projects
 */
export function getRecentProjects(): RecentProject[] {
  return store.get('recentProjects')
}

/**
 * Lưu toàn bộ danh sách Recent Projects
 */
export function saveRecentProjects(projects: RecentProject[]): void {
  store.set('recentProjects', projects)
}

/**
 * Thêm/Cập nhật 1 recent project, đồng thời đưa lên đầu danh sách
 */
export function addRecentProject(project: ProjectConfig): RecentProject[] {
  const nextEntry: RecentProject = {
    ...project,
    lastOpenedAt: new Date().toLocaleString('vi-VN')
  }
  const current = getRecentProjects()
  const filtered = current.filter((p) => p.gameFolderPath !== project.gameFolderPath)
  const updated = [nextEntry, ...filtered].slice(0, 8)
  store.set('recentProjects', updated)
  return updated
}
