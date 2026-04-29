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

export interface AppSettings {
  // Lưu trữ các API key linh hoạt theo provider id (ví dụ: 'gemini', 'claude', 'openai')
  apiKeys: Record<string, string>;
  
  // Nhà cung cấp đang được chọn
  activeProvider: string;
  
  // Mã model cụ thể của provider đó (ví dụ: 'gemini-1.5-flash', 'gpt-4o-mini')
  activeModelId: string;
  
  batchSize: number;
  targetLanguage: string;
}
