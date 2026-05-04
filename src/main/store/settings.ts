import Store from 'electron-store'
import { AppSettings, ProjectConfig, RecentProject, BlacklistPattern } from '../../shared/types'

const defaultProviderConfig = {
  apiKey: '',
  baseURL: '',
  modelId: '',
  customHeaders: {},
}

const DEFAULT_BLACKLIST_PATTERNS: BlacklistPattern[] = [
  { pattern: '^\\s*$', description: 'Empty or whitespace-only strings', enabled: true },
  { pattern: '^\\[Image\\s*\\d*\\]$', description: 'Image placeholder [Image 1]', enabled: true },
  { pattern: '^\\[CG\\s*\\d*\\]$', description: 'CG placeholder [CG 1]', enabled: true },
  { pattern: '^\\[BG\\s*\\d*\\]$', description: 'BG placeholder [BG 1]', enabled: true },
  { pattern: '^\\[Scene\\s*\\d*\\]$', description: 'Scene placeholder [Scene 1]', enabled: true },
  { pattern: '^[^\\p{L}\\p{N}]+$', description: 'Punctuation/symbols only', enabled: true },
  { pattern: '^[0-9]+$', description: 'Pure numbers', enabled: true },
  { pattern: '^\\p{Lu}$', description: 'Single uppercase letter', enabled: false },
]

const defaultSettings: AppSettings = {
  // Group 1 (Phase 5 upgraded)
  providers: {
    gemini: {
      apiKey: '',
      baseURL: '',
      modelId: '',
      customHeaders: {},
    },
    openai_compatible: {
      apiKey: '',
      baseURL: 'https://api.openai.com/v1',
      modelId: '',
      customHeaders: {},
    },
    claude: {
      apiKey: '',
      baseURL: '',
      modelId: '',
      customHeaders: {},
    },
  },
  activeProviderId: 'gemini',

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
  enableSmartGlossary: true,
  enableStrictGlossary: true,

  // Group 5
  theme: 'system',
  editorFontSize: 14,
  autoSaveInterval: 5,

  // Group 6
  enableRegexBlacklist: true,
  regexBlacklist: DEFAULT_BLACKLIST_PATTERNS,

  // Group 7
  enableSelfCorrection: true,
  maxRetryAttempts: 2,

  // Group 8
  enableLengthCheck: true,
  maxLengthRatio: 1.3,

  // Group 9
  contextWindowSize: 5,
}

/**
 * Migrate legacy settings (pre-Phase 5) to the new provider-based schema.
 * Old schema had: apiKeys, activeProvider, activeModelId, customEndpoint
 * New schema has: providers.{gemini,openai_compatible,claude}, activeProviderId
 */
function migrateSettings(raw: Partial<AppSettings>): AppSettings {
  const next = { ...defaultSettings, ...raw }

  // Only migrate if legacy fields exist and new fields are missing
  if (raw.apiKeys || raw.activeProvider || raw.activeModelId) {
    // Migrate API keys
    if (raw.apiKeys) {
      if (raw.apiKeys['gemini']) {
        next.providers.gemini.apiKey = raw.apiKeys['gemini']
      }
      if (raw.apiKeys['gpt'] || raw.apiKeys['openai']) {
        next.providers.openai_compatible.apiKey = raw.apiKeys['gpt'] || raw.apiKeys['openai'] || ''
      }
      if (raw.apiKeys['deepseek']) {
        next.providers.openai_compatible.apiKey = raw.apiKeys['deepseek']
        next.providers.openai_compatible.baseURL = 'https://api.deepseek.com/v1'
      }
      if (raw.apiKeys['grok']) {
        next.providers.openai_compatible.apiKey = raw.apiKeys['grok']
        next.providers.openai_compatible.baseURL = 'https://api.x.ai/v1'
      }
      if (raw.apiKeys['claude']) {
        next.providers.claude.apiKey = raw.apiKeys['claude']
      }
    }

    // Migrate active provider
    if (raw.activeProvider) {
      const legacy = raw.activeProvider.toLowerCase()
      if (legacy === 'gemini') {
        next.activeProviderId = 'gemini'
      } else if (legacy === 'claude') {
        next.activeProviderId = 'claude'
      } else {
        // gpt, deepseek, grok → openai_compatible
        next.activeProviderId = 'openai_compatible'
      }
    }

    // Migrate model ID
    if (raw.activeModelId) {
      if (next.activeProviderId === 'gemini') {
        next.providers.gemini.modelId = raw.activeModelId
      } else if (next.activeProviderId === 'claude') {
        next.providers.claude.modelId = raw.activeModelId
      } else {
        next.providers.openai_compatible.modelId = raw.activeModelId
      }
    }

    // Migrate custom endpoint
    if (raw.customEndpoint) {
      next.providers.openai_compatible.baseURL = raw.customEndpoint
    }

    // Clean up legacy fields after migration
    delete (next as any).apiKeys
    delete (next as any).activeProvider
    delete (next as any).activeModelId
    delete (next as any).customEndpoint
  }

  // Ensure provider configs are complete
  next.providers.gemini = { ...defaultProviderConfig, ...next.providers.gemini }
  next.providers.openai_compatible = { ...defaultProviderConfig, ...next.providers.openai_compatible }
  next.providers.claude = { ...defaultProviderConfig, ...next.providers.claude }

  return next
}

// Khởi tạo electron-store
const StoreClass = ((Store && typeof Store !== 'function' && 'default' in Store)
  ? (Store as any).default
  : Store) as typeof Store;

const store = new StoreClass<{ settings: Partial<AppSettings>; project: ProjectConfig | null; recentProjects: RecentProject[] }>({
  defaults: {
    settings: defaultSettings,
    project: null,
    recentProjects: []
  }
})

/**
 * Lấy toàn bộ settings hiện tại (đã migrate sang schema mới nếu cần)
 */
export function getSettings(): AppSettings {
  const raw = store.get('settings') as Partial<AppSettings>
  return migrateSettings(raw)
}

/**
 * Cập nhật settings
 */
export function saveSettings(settings: Partial<AppSettings>): void {
  const current = getSettings()
  // Merge deeply for providers
  const merged = {
    ...current,
    ...settings,
    providers: {
      ...current.providers,
      ...(settings.providers ?? {}),
    },
  }
  // Remove legacy fields if new schema is being used
  if (settings.providers || settings.activeProviderId !== undefined) {
    delete (merged as any).apiKeys
    delete (merged as any).activeProvider
    delete (merged as any).activeModelId
    delete (merged as any).customEndpoint
  }
  store.set('settings', merged)
}

export function updateApiKey(provider: import('../../shared/types').AIProvider, key: string): void {
  const current = getSettings()
  // Map legacy provider to new config
  const config = { ...current.providers }
  if (provider === 'gemini') {
    config.gemini = { ...config.gemini, apiKey: key }
  } else if (provider === 'claude') {
    config.claude = { ...config.claude, apiKey: key }
  } else {
    config.openai_compatible = { ...config.openai_compatible, apiKey: key }
  }
  store.set('settings', { ...current, providers: config })
}

/**
 * Lấy cấu hình provider đang active
 */
export function getActiveProviderConfig(): { providerId: string; config: import('../../shared/types').AIProviderConfig } {
  const settings = getSettings()
  const providerId = settings.activeProviderId
  return { providerId, config: settings.providers[providerId as keyof typeof settings.providers] }
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
