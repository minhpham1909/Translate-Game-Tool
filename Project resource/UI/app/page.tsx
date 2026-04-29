"use client"

import { useState } from "react"
import { LeftSidebar } from "@/components/cat-tool/left-sidebar"
import { TopHeader } from "@/components/cat-tool/top-header"
import { TranslationWorkspace } from "@/components/cat-tool/translation-workspace"
import { BottomBar } from "@/components/cat-tool/bottom-bar"
import { SettingsModal } from "@/components/cat-tool/settings-modal"

export type FileStatus = "complete" | "in-progress" | "empty" | "warning"
export type BlockStatus = "empty" | "draft" | "approved" | "warning"

export interface ProjectFile {
  id: string
  name: string
  status: FileStatus
  progress: number
  lines: number
}

export interface TranslationBlock {
  id: string
  hash: string
  lineNumber: number
  character: string | null
  original: string
  translated: string
  status: BlockStatus
  warningMessage?: string
}

const MOCK_FILES: ProjectFile[] = [
  { id: "1", name: "script.rpy", status: "in-progress", progress: 75, lines: 1250 },
  { id: "2", name: "options.rpy", status: "complete", progress: 100, lines: 85 },
  { id: "3", name: "screens.rpy", status: "in-progress", progress: 45, lines: 320 },
  { id: "4", name: "chapter1.rpy", status: "empty", progress: 0, lines: 2100 },
  { id: "5", name: "chapter2.rpy", status: "warning", progress: 62, lines: 1890 },
  { id: "6", name: "characters.rpy", status: "complete", progress: 100, lines: 156 },
  { id: "7", name: "gui.rpy", status: "in-progress", progress: 30, lines: 420 },
]

const MOCK_BLOCKS: TranslationBlock[] = [
  {
    id: "1",
    hash: "#start_001",
    lineNumber: 45,
    character: "Eileen",
    original: "Welcome to the Ren'Py tutorial! This is a visual novel engine that makes it easy to create interactive stories.",
    translated: "Chào mừng đến với hướng dẫn Ren'Py! Đây là một engine visual novel giúp bạn dễ dàng tạo ra những câu chuyện tương tác.",
    status: "approved",
  },
  {
    id: "2",
    hash: "#start_002",
    lineNumber: 46,
    character: "Eileen",
    original: "I'll be your guide today. Let me show you around.",
    translated: "Hôm nay tôi sẽ là hướng dẫn viên của bạn. Để tôi chỉ cho bạn xung quanh nhé.",
    status: "draft",
  },
  {
    id: "3",
    hash: "#start_003",
    lineNumber: 47,
    character: null,
    original: "The screen fades to black as gentle music begins to play...",
    translated: "",
    status: "empty",
  },
  {
    id: "4",
    hash: "#start_004",
    lineNumber: 52,
    character: "Player",
    original: "This place is amazing! I can't believe I'm finally here.",
    translated: "Nơi này thật tuyệt vời! Tôi không thể tin là cuối cùng tôi cũng ở đây.",
    status: "warning",
    warningMessage: "Missing format tag: {i}",
  },
  {
    id: "5",
    hash: "#menu_001",
    lineNumber: 58,
    character: null,
    original: "What would you like to do?",
    translated: "Bạn muốn làm gì?",
    status: "approved",
  },
  {
    id: "6",
    hash: "#choice_001",
    lineNumber: 59,
    character: null,
    original: "Explore the garden",
    translated: "Khám phá khu vườn",
    status: "approved",
  },
  {
    id: "7",
    hash: "#choice_002",
    lineNumber: 60,
    character: null,
    original: "Talk to Eileen",
    translated: "",
    status: "empty",
  },
  {
    id: "8",
    hash: "#garden_001",
    lineNumber: 85,
    character: "Eileen",
    original: "The roses here are particularly beautiful this time of year. My grandmother planted them decades ago.",
    translated: "Những bông hồng ở đây đặc biệt đẹp vào thời điểm này trong năm. Bà tôi đã trồng chúng cách đây nhiều thập kỷ.",
    status: "draft",
  },
  {
    id: "9",
    hash: "#garden_002",
    lineNumber: 86,
    character: "Player",
    original: "They're lovely. Your grandmother must have had quite the green thumb.",
    translated: "",
    status: "empty",
  },
  {
    id: "10",
    hash: "#garden_003",
    lineNumber: 92,
    character: "Eileen",
    original: "She did. She taught me everything I know about gardening.",
    translated: "Đúng vậy. Bà đã dạy tôi tất cả những gì tôi biết về làm vườn.",
    status: "approved",
  },
]

export default function CATToolPage() {
  const [files] = useState<ProjectFile[]>(MOCK_FILES)
  const [activeFileId, setActiveFileId] = useState<string>("1")
  const [blocks, setBlocks] = useState<TranslationBlock[]>(MOCK_BLOCKS)
  const [isTerminalOpen, setIsTerminalOpen] = useState(false)
  const [isSettingsOpen, setIsSettingsOpen] = useState(false)
  const [filterStatus, setFilterStatus] = useState<string>("all")

  const activeFile = files.find((f) => f.id === activeFileId)

  const handleTranslationChange = (blockId: string, value: string) => {
    setBlocks((prev) =>
      prev.map((block) =>
        block.id === blockId
          ? {
              ...block,
              translated: value,
              status: value.trim() ? (block.status === "empty" ? "draft" : block.status) : "empty",
            }
          : block
      )
    )
  }

  const handleApprove = (blockId: string) => {
    setBlocks((prev) =>
      prev.map((block) =>
        block.id === blockId
          ? { ...block, status: "approved" as BlockStatus }
          : block
      )
    )
  }

  const handleRevert = (blockId: string) => {
    setBlocks((prev) =>
      prev.map((block) =>
        block.id === blockId
          ? { ...block, translated: "", status: "empty" as BlockStatus }
          : block
      )
    )
  }

  const filteredBlocks = blocks.filter((block) => {
    if (filterStatus === "all") return true
    return block.status === filterStatus
  })

  const totalLines = 100000
  const translatedLines = 15000

  return (
    <div className="flex flex-col h-screen bg-background text-foreground">
      {/* Top Header */}
      <TopHeader
        activeFile={activeFile}
        onSettingsClick={() => setIsSettingsOpen(true)}
      />

      {/* Main Content Area */}
      <div className="flex flex-1 overflow-hidden">
        {/* Left Sidebar */}
        <LeftSidebar
          files={files}
          activeFileId={activeFileId}
          onFileSelect={setActiveFileId}
        />

        {/* Translation Workspace */}
        <TranslationWorkspace
          blocks={filteredBlocks}
          filterStatus={filterStatus}
          onFilterChange={setFilterStatus}
          onTranslationChange={handleTranslationChange}
          onApprove={handleApprove}
          onRevert={handleRevert}
        />
      </div>

      {/* Bottom Bar */}
      <BottomBar
        totalLines={totalLines}
        translatedLines={translatedLines}
        apiCost={1.25}
        isTerminalOpen={isTerminalOpen}
        onToggleTerminal={() => setIsTerminalOpen(!isTerminalOpen)}
      />

      {/* Settings Modal */}
      <SettingsModal
        open={isSettingsOpen}
        onOpenChange={setIsSettingsOpen}
      />
    </div>
  )
}
