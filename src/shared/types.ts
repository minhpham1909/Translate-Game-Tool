export interface TranslationBlock {
  id?: number;
  file_id?: number;
  file_name?: string; // transient, for UI
  block_hash: string;
  block_type: 'dialogue' | 'string';
  character_id: string | null;
  original_text: string;
  translated_text: string | null;
  status: 'empty' | 'draft' | 'approved' | 'warning' | 'skipped' | 'modified';
  indentation: string;
  line_index: number;
  translated_by?: string; // Ví dụ: 'gemini', 'claude', 'manual', 'tm', 'blacklist'
}

export interface GlossaryRecord {
  id?: number;
  source_text: string;
  target_text: string;
  notes?: string;
  created_at?: string;
  enabled?: boolean;
}

export interface FileRecord {
  id?: number;
  file_path: string;
  file_name: string;
  total_blocks: number;
  translated_blocks: number;
  status: 'pending' | 'in_progress' | 'completed';
  updated_at?: string;
}

export interface BackupEntry {
  fileId: number;
  fileName: string;
  backupPath: string;
  createdAt: string;
  fileSize: number;
}

export interface ExportResult {
  exportedFiles: number;
  totalFiles: number;
  skippedFiles: number;
  errors: string[];
}

export interface ExportFileEntry {
  id: number;
  fileName: string;
  filePath: string;
  totalBlocks: number;
  translatedBlocks: number;
  status: 'pending' | 'in_progress' | 'completed';
  hasChanges: boolean;
}

export interface TranslationMemoryRecord {
  id?: number;
  original_text: string;
  translated_text: string;
  usage_count: number;
  last_used_at?: string;
}

export interface ProjectConfig {
  gameFolderPath: string; // Đường dẫn tuyệt đối đến thư mục game/
  sourceLanguage: string; // Ngôn ngữ nguồn (ví dụ: 'english')
  targetLanguage: string; // Ngôn ngữ đích (ví dụ: 'vietnamese')
}

export interface RecentProject {
  gameFolderPath: string;
  sourceLanguage: string;
  targetLanguage: string;
  lastOpenedAt: string;
}

export interface BlacklistPattern {
  pattern: string;       // Regex pattern
  description: string;   // Human-readable description
  enabled: boolean;
}

// Định nghĩa các AI Provider được hỗ trợ chính thức
export type AIProvider = 'gemini' | 'claude' | 'gpt' | 'deepseek' | 'grok';

/**
 * Cấu hình cho một provider cụ thể.
 * Dùng chung cho OpenAI-compatible (OpenAI, DeepSeek, Grok, OpenRouter, Local LLM).
 */
export interface AIProviderConfig {
  apiKey: string;
  baseURL?: string;        // Override endpoint (OpenRouter, Ollama, vLLM...)
  modelId: string;
  customHeaders?: Record<string, string>;  // e.g., { "HTTP-Referer": "...", "X-Title": "..." } for OpenRouter
}

/**
 * Nhóm provider ID thực tế dùng trong routing.
 * Tất cả OpenAI-compatible providers (gpt, deepseek, grok, custom) → 'openai_compatible'
 */
export type ActiveProviderId = 'gemini' | 'openai_compatible' | 'claude';

export interface AppSettings {
  // =========================================
  // Group 1: AI & API Config (Phase 5 upgraded)
  // =========================================
  providers: {
    gemini: AIProviderConfig;
    openai_compatible: AIProviderConfig;   // OpenAI, DeepSeek, Grok, OpenRouter, Local LLM
    claude: AIProviderConfig;
  };
  activeProviderId: ActiveProviderId;

  /** Legacy field — kept for backward compatibility with pre-Phase 5 settings */
  apiKeys?: Partial<Record<AIProvider, string>>;
  /** Legacy field */
  activeProvider?: AIProvider;
  /** Legacy field */
  activeModelId?: string;
  /** Legacy field */
  customEndpoint?: string;

  // =========================================
  // Group 2: Prompting & Localization
  // =========================================
  targetLanguage: string; // Ngôn ngữ đích
  temperature: number; // Mức độ sáng tạo (Mặc định: 0.2 - Rất thấp để tránh lỗi format)
  userCustomPrompt: string; // Prompt do user tự định nghĩa

  // =========================================
  // Group 3: Queue & Performance
  // =========================================
  batchSize: number; // Số câu gửi đi trong 1 request
  concurrentRequests: number; // Số lượng request song song
  costWarningThreshold: number; // Ngưỡng cảnh báo chi phí (USD)

  // =========================================
  // Group 4: Translation Memory (TM)
  // =========================================
  enableTranslationMemory: boolean; // Công tắc bật/tắt tự động điền từ TM
  tmFuzzyThreshold: number; // Độ nhạy của TM (0.0 đến 1.0)
  enableSmartGlossary: boolean; // Chỉ inject glossary terms liên quan đến batch hiện tại
  enableStrictGlossary: boolean; // Bắt buộc AI dịch đúng thuật ngữ trong glossary, linter sẽ report vi phạm

  // =========================================
  // Group 5: System UI
  // =========================================
  theme: 'light' | 'dark' | 'system';
  editorFontSize: number; // Kích thước chữ
  autoSaveInterval: number; // Thời gian tự lưu (phút)

  // =========================================
  // Group 6: Text Filter (Regex Blacklist)
  // =========================================
  enableRegexBlacklist: boolean; // Bật/tắt auto-skip strings matching patterns
  regexBlacklist: BlacklistPattern[];

  // =========================================
  // Group 7: AI Self-Correction
  // =========================================
  enableSelfCorrection: boolean; // Bật/tắt AI tự sửa lỗi khi linter phát hiện vấn đề
  maxRetryAttempts: number; // Số lần retry tối đa per batch (1-3)

  // =========================================
  // Group 8: Text Overflow Linter
  // =========================================
  enableLengthCheck: boolean; // Bật/tắt cảnh báo bản dịch quá dài so với bản gốc
  maxLengthRatio: number; // Tỉ lệ tối đa (1.3 = dịch dài hơn 30% so với gốc)

  // =========================================
  // Group 9: Context Windowing
  // =========================================
  contextWindowSize: number; // Số block trước đó để làm ngữ cảnh (0 = tắt, default 5)

  // =========================================
  // Group 10: Database Storage
  // =========================================
  customDbFolder: string; // Đường dẫn tùy chọn để lưu file SQLite. Empty = dùng userData default.

  // =========================================
  // Group 11: Language Patch
  // =========================================
  languagePatchKey?: string;   // Shortcut key (e.g., 'K_F8', 'K_F9', 'K_L')
  languagePatchIcon?: boolean;  // Show 🔤 icon in game corner
}

/**
 * Danh sách ngôn ngữ đích hỗ trợ.
 * code: dùng cho folder path + translate header (ASCII-safe)
 * label: hiển thị UI (có dấu)
 */
export const TARGET_LANGUAGES: { code: string; label: string }[] = [
  { code: 'vietnamese', label: 'Tiếng Việt' },
  { code: 'english', label: 'English' },
  { code: 'chinese_simplified', label: '简体中文' },
  { code: 'chinese_traditional', label: '繁體中文' },
  { code: 'japanese', label: '日本語' },
  { code: 'korean', label: '한국어' },
  { code: 'thai', label: 'ภาษาไทย' },
  { code: 'spanish', label: 'Español' },
  { code: 'french', label: 'Français' },
  { code: 'german', label: 'Deutsch' },
  { code: 'italian', label: 'Italiano' },
  { code: 'portuguese', label: 'Português' },
  { code: 'russian', label: 'Русский' },
  { code: 'arabic', label: 'العربية' },
  { code: 'hindi', label: 'हिन्दी' },
  { code: 'indonesian', label: 'Bahasa Indonesia' },
  { code: 'malay', label: 'Bahasa Melayu' },
]

/**
 * Chuyển đổi ngôn ngữ đích sang code chuẩn (ASCII-safe).
 * Hỗ trợ backward compatibility: nếu user đã lưu display name ("Tiếng Việt"),
 * sẽ convert sang code ("vietnamese").
 */
export function normalizeLanguageCode(value: string): string {
  const lower = value.toLowerCase().trim()
  // Nếu đã là code → trả về luôn
  const byCode = TARGET_LANGUAGES.find(l => l.code.toLowerCase() === lower)
  if (byCode) return byCode.code
  // Nếu là display name → tìm và trả về code
  const byLabel = TARGET_LANGUAGES.find(l => l.label.toLowerCase() === lower || normalizeDiacritics(l.label).toLowerCase() === normalizeDiacritics(lower))
  if (byLabel) return byLabel.code
  // Fallback: lowercase + replace spaces with underscores
  return lower.replace(/\s+/g, '_')
}

/**
 * Lấy display name từ language code.
 */
export function getLanguageLabel(code: string): string {
  const lang = TARGET_LANGUAGES.find(l => l.code.toLowerCase() === code.toLowerCase())
  return lang?.label || code
}

/**
 * Loại bỏ dấu tiếng Việt để so khớp.
 */
function normalizeDiacritics(s: string): string {
  return s.normalize('NFD').replace(/[\u0300-\u036f]/g, '')
    .replace(/đ/g, 'd').replace(/Đ/g, 'D')
}
