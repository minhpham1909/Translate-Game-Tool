export interface TranslationBlock {
  id?: number;
  file_id?: number;
  file_name?: string; // transient, for UI
  block_hash: string;
  block_type: 'dialogue' | 'string';
  character_id: string | null;
  original_text: string;
  translated_text: string | null;
  status: 'empty' | 'draft' | 'approved' | 'warning';
  indentation: string;
  line_index: number;
  translated_by?: string; // Ví dụ: 'gemini', 'claude', 'manual', 'tm'
}

export interface GlossaryRecord {
  id?: number;
  source_text: string;
  target_text: string;
  notes?: string;
  created_at?: string;
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

// Định nghĩa các AI Provider được hỗ trợ chính thức
export type AIProvider = 'gemini' | 'claude' | 'gpt' | 'deepseek' | 'grok';

export interface AppSettings {
  // ==========================================
  // Group 1: AI & API Config
  // ==========================================
  apiKeys: Partial<Record<AIProvider, string>>;
  activeProvider: AIProvider;
  activeModelId: string;
  customEndpoint?: string; // Tùy chọn cho Local LLM hoặc OpenRouter

  // ==========================================
  // Group 2: Prompting & Localization
  // ==========================================
  targetLanguage: string; // Ngôn ngữ đích
  temperature: number; // Mức độ sáng tạo (Mặc định: 0.2 - Rất thấp để tránh vỡ format)
  userCustomPrompt: string; // Prompt do user tự định nghĩa

  // ==========================================
  // Group 3: Queue & Performance
  // ==========================================
  batchSize: number; // Số câu gửi đi trong 1 request
  concurrentRequests: number; // Số lượng request song song
  costWarningThreshold: number; // Ngưỡng cảnh báo chi phí (USD)

  // ==========================================
  // Group 4: Translation Memory (TM)
  // ==========================================
  enableTranslationMemory: boolean; // Công tắc bật/tắt tự động điền từ TM
  tmFuzzyThreshold: number; // Độ nhạy của TM (0.0 đến 1.0)

  // ==========================================
  // Group 5: System UI
  // ==========================================
  theme: 'light' | 'dark' | 'system';
  editorFontSize: number; // Kích thước chữ
  autoSaveInterval: number; // Thời gian tự lưu (phút)
}
