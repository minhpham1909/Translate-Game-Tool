/**
 * App.tsx
 * Entry point chính của React App.
 * Dùng Mock Data ở Step 2, sẽ kết nối window.api thật ở Step 3.
 */
import { useState } from 'react'
import { ThemeProvider } from '@renderer/context/ThemeContext'
import { TopHeader } from '@renderer/components/cat-tool/TopHeader'
import { LeftSidebar, SidebarFile } from '@renderer/components/cat-tool/LeftSidebar'
import { TranslationWorkspace } from '@renderer/components/cat-tool/TranslationWorkspace'
import { BottomBar, LogEntry } from '@renderer/components/cat-tool/BottomBar'
import { SettingsModal } from '@renderer/components/cat-tool/SettingsModal'
import { UITranslationBlock } from '@renderer/components/cat-tool/TranslationCard'

// ============================================================
// MOCK DATA (Sẽ thay bằng window.api ở Step 3)
// ============================================================
const MOCK_FILES: SidebarFile[] = [
  { id: 1, file_name: 'script.rpy',    file_path: 'script.rpy',    status: 'in_progress', total_blocks: 1250, translated_blocks: 937  },
  { id: 2, file_name: 'options.rpy',   file_path: 'options.rpy',   status: 'completed',   total_blocks: 85,   translated_blocks: 85   },
  { id: 3, file_name: 'screens.rpy',   file_path: 'screens.rpy',   status: 'in_progress', total_blocks: 320,  translated_blocks: 144  },
  { id: 4, file_name: 'chapter1.rpy',  file_path: 'chapter1.rpy',  status: 'pending',     total_blocks: 2100, translated_blocks: 0    },
  { id: 5, file_name: 'chapter2.rpy',  file_path: 'chapter2.rpy',  status: 'warning',     total_blocks: 1890, translated_blocks: 1172 },
  { id: 6, file_name: 'characters.rpy',file_path: 'characters.rpy',status: 'completed',   total_blocks: 156,  translated_blocks: 156  },
  { id: 7, file_name: 'gui.rpy',       file_path: 'gui.rpy',       status: 'in_progress', total_blocks: 420,  translated_blocks: 126  },
]

const MOCK_BLOCKS: UITranslationBlock[] = [
  {
    id: 1, block_hash: '#start_001', line_index: 45, character_id: 'Eileen', block_type: 'dialogue',
    original_text: "Welcome to the Ren'Py tutorial! This is a visual novel engine.",
    translated_text: 'Chào mừng đến với hướng dẫn Ren\'Py! Đây là một engine visual novel.',
    status: 'approved',
  },
  {
    id: 2, block_hash: '#start_002', line_index: 46, character_id: 'Eileen', block_type: 'dialogue',
    original_text: "I'll be your guide today. Let me show you around.",
    translated_text: 'Hôm nay tôi sẽ là hướng dẫn viên của bạn.',
    status: 'draft',
  },
  {
    id: 3, block_hash: '#start_003', line_index: 47, character_id: null, block_type: 'dialogue',
    original_text: 'The screen fades to black as gentle music begins to play...',
    translated_text: null,
    status: 'empty',
  },
  {
    id: 4, block_hash: '#start_004', line_index: 52, character_id: 'Player', block_type: 'dialogue',
    original_text: 'This place is amazing! I {i}can\'t{/i} believe I\'m finally here.',
    translated_text: 'Nơi này thật tuyệt vời! Tôi không thể tin là tôi ở đây.',
    status: 'warning',
  },
  {
    id: 5, block_hash: '#menu_001', line_index: 58, character_id: null, block_type: 'string',
    original_text: 'What would you like to do?',
    translated_text: 'Bạn muốn làm gì?',
    status: 'approved',
  },
  {
    id: 6, block_hash: '#choice_001', line_index: 59, character_id: null, block_type: 'string',
    original_text: 'Explore the garden',
    translated_text: 'Khám phá khu vườn',
    status: 'approved',
  },
  {
    id: 7, block_hash: '#choice_002', line_index: 60, character_id: null, block_type: 'string',
    original_text: 'Talk to Eileen',
    translated_text: null,
    status: 'empty',
  },
  {
    id: 8, block_hash: '#garden_001', line_index: 85, character_id: 'Eileen', block_type: 'dialogue',
    original_text: 'The roses here are beautiful this time of year. My grandmother planted them.',
    translated_text: 'Những bông hồng ở đây đặc biệt đẹp. Bà tôi đã trồng chúng.',
    status: 'draft',
  },
]

const MOCK_LOGS: LogEntry[] = [
  { type: 'info',    message: 'Project loaded: visual_novel_en',          timestamp: '19:30:15' },
  { type: 'success', message: 'Parsing complete. Found 7 files, 6221 blocks.', timestamp: '19:30:16' },
  { type: 'info',    message: 'Translation Memory loaded: 15,234 entries', timestamp: '19:30:17' },
  { type: 'warning', message: 'Format tag mismatch in block #start_004',  timestamp: '19:31:02' },
]

// ============================================================
// APP COMPONENT
// ============================================================
function CATApp() {
  const [files] = useState<SidebarFile[]>(MOCK_FILES)
  const [activeFileId, setActiveFileId] = useState<number | null>(1)
  const [blocks, setBlocks] = useState<UITranslationBlock[]>(MOCK_BLOCKS)
  const [isSettingsOpen, setIsSettingsOpen] = useState(false)

  const activeFile = files.find((f) => f.id === activeFileId)

  const totalBlocks = files.reduce((acc, f) => acc + f.total_blocks, 0)
  const translatedBlocks = files.reduce((acc, f) => acc + f.translated_blocks, 0)

  // Handlers (Mock — sẽ gọi window.api thật ở Step 3)
  const handleTranslationChange = (blockId: number, value: string) => {
    setBlocks((prev) =>
      prev.map((b) =>
        b.id === blockId
          ? { ...b, translated_text: value, status: value.trim() ? (b.status === 'empty' ? 'draft' : b.status) : 'empty' }
          : b
      )
    )
  }

  const handleApprove = (blockId: number) => {
    setBlocks((prev) =>
      prev.map((b) => (b.id === blockId ? { ...b, status: 'approved' } : b))
    )
  }

  const handleRevert = (blockId: number) => {
    setBlocks((prev) =>
      prev.map((b) => (b.id === blockId ? { ...b, translated_text: null, status: 'empty' } : b))
    )
  }

  const handleAITranslate = (blockId: number) => {
    // TODO: Gọi window.api.engine.translateBatch([blockId]) ở Step 3
    console.log('[TODO] AI Translate block:', blockId)
  }

  const handleExport = () => {
    // TODO: Gọi window.api.engine.exportProject() ở Step 3
    console.log('[TODO] Export project')
  }

  return (
    <div className="flex flex-col h-screen bg-background text-foreground overflow-hidden">
      <TopHeader
        activeFileName={activeFile?.file_name}
        sourceLanguage="english"
        onSettingsClick={() => setIsSettingsOpen(true)}
        onExportClick={handleExport}
      />

      <div className="flex flex-1 overflow-hidden">
        <LeftSidebar
          files={files}
          activeFileId={activeFileId}
          sourceLanguage="english"
          onFileSelect={setActiveFileId}
          onNewProject={() => console.log('[TODO] Open Setup Wizard')}
        />
        <TranslationWorkspace
          blocks={blocks}
          onTranslationChange={handleTranslationChange}
          onApprove={handleApprove}
          onRevert={handleRevert}
          onAITranslate={handleAITranslate}
        />
      </div>

      <BottomBar
        totalBlocks={totalBlocks}
        translatedBlocks={translatedBlocks}
        apiCost={0.0012}
        logs={MOCK_LOGS}
        isConnected={true}
      />

      <SettingsModal open={isSettingsOpen} onOpenChange={setIsSettingsOpen} />
    </div>
  )
}

/**
 * App — Bọc toàn bộ app trong ThemeProvider với dark mode mặc định.
 */
export default function App() {
  return (
    <ThemeProvider defaultTheme="dark">
      <CATApp />
    </ThemeProvider>
  )
}
