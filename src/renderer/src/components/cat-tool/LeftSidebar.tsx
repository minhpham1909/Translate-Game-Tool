/**
 * LeftSidebar.tsx
 * Sidebar trái: Danh sách các file .rpy trong project.
 * Hiển thị progress bar và status icon cho từng file.
 * Cho phép lọc file theo tên.
 */
import { useState } from 'react'
import {
  Plus, Search, FileText, CheckCircle2, AlertTriangle,
  Circle, ChevronRight, ChevronDown, FolderOpen, Clock
} from 'lucide-react'
import { Button } from '@renderer/components/ui/button'
import { Input } from '@renderer/components/ui/input'
import { Progress } from '@renderer/components/ui/progress'
import { ScrollArea } from '@renderer/components/ui/scroll-area'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@renderer/components/ui/select'
import { cn } from '@renderer/lib/utils'
import type { RecentProject } from '../../../../shared/types'

export type FileStatus = 'completed' | 'in_progress' | 'pending' | 'warning'

export interface SidebarFile {
  id: number
  file_name: string
  file_path: string
  status: FileStatus
  total_blocks: number
  translated_blocks: number
}

interface LeftSidebarProps {
  files: SidebarFile[]
  activeFileId: number | null
  sourceLanguage: string
  onFileSelect: (fileId: number) => void
  onNewProject: () => void
  onChangeLocation: () => void
  recentProjects: RecentProject[]
  onOpenProject: (project: RecentProject) => void
}

const statusIcons: Record<FileStatus, React.ReactNode> = {
  completed:   <CheckCircle2 className="size-3 text-success flex-shrink-0" />,
  in_progress: <Circle className="size-3 text-info fill-info/30 flex-shrink-0" />,
  pending:     <Circle className="size-3 text-muted-foreground flex-shrink-0" />,
  warning:     <AlertTriangle className="size-3 text-warning flex-shrink-0" />,
}

const progressColors: Record<FileStatus, string> = {
  completed:   'bg-success',
  in_progress: 'bg-info',
  pending:     'bg-muted-foreground/30',
  warning:     'bg-warning',
}

/**
 * LeftSidebar component
 * @param files - Danh sách file từ DB
 * @param activeFileId - ID file đang được chọn
 * @param sourceLanguage - Tên thư mục nguồn (ví dụ: 'english')
 * @param onFileSelect - Callback khi chọn file
 * @param onNewProject - Callback mở Setup Wizard
 */
export function LeftSidebar({
  files,
  activeFileId,
  sourceLanguage,
  onFileSelect,
  onNewProject,
  onChangeLocation,
  recentProjects,
  onOpenProject,
}: LeftSidebarProps) {
  const [searchQuery, setSearchQuery] = useState('')
  const [isExpanded, setIsExpanded] = useState(true)
  const [selectedRecent, setSelectedRecent] = useState('')

  const filteredFiles = files.filter((file) =>
    file.file_name.toLowerCase().includes(searchQuery.toLowerCase())
  )

  const overallProgress = files.length > 0
    ? Math.round(files.reduce((acc, f) => acc + (f.translated_blocks / Math.max(f.total_blocks, 1)), 0) / files.length * 100)
    : 0

  const handleRecentSelect = (value: string): void => {
    const project = recentProjects.find((p) => p.gameFolderPath === value)
    if (project) {
      onOpenProject(project)
      setSelectedRecent('')
      return
    }
    setSelectedRecent(value)
  }

  return (
    <aside className="w-[270px] flex-shrink-0 border-r border-border bg-sidebar flex flex-col">
      {/* Search Input */}
      <div className="p-3 border-b border-sidebar-border">
        <div className="relative">
          <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 size-3.5 text-muted-foreground" />
          <Input
            id="input-file-search"
            placeholder="Filter files..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="pl-8 h-7 text-xs bg-sidebar-accent/50"
          />
        </div>
      </div>

      {/* File Tree */}
      <ScrollArea className="flex-1">
        <div className="p-2">
          {/* Project Folder Header */}
          <button
            onClick={() => setIsExpanded(!isExpanded)}
            className="flex items-center gap-1.5 w-full px-2 py-1.5 text-xs font-medium text-foreground hover:bg-sidebar-accent rounded-sm transition-colors"
          >
            {isExpanded
              ? <ChevronDown className="size-3.5 text-muted-foreground" />
              : <ChevronRight className="size-3.5 text-muted-foreground" />
            }
            <FolderOpen className="size-3.5 text-warning" />
            <span>tl / {sourceLanguage}</span>
          </button>

          {/* Project Helper Bar */}
          <div className="mt-2 px-2 flex items-center gap-1">
            <Button
              id="btn-project-new"
              variant="outline"
              size="sm"
              className="h-6 px-2 text-[10px] gap-1.5"
              onClick={onNewProject}
            >
              <Plus className="size-3" />
              New
            </Button>
            <Button
              id="btn-project-change-location"
              variant="outline"
              size="sm"
              className="h-6 px-2 text-[10px] gap-1.5"
              onClick={onChangeLocation}
            >
              <FolderOpen className="size-3" />
              Change
            </Button>
            <Select value={selectedRecent} onValueChange={handleRecentSelect}>
              <SelectTrigger
                id="select-recent-project"
                className="h-6 text-[10px] px-2 gap-1.5 bg-sidebar"
                disabled={recentProjects.length === 0}
              >
                <Clock className="size-3" />
                <SelectValue placeholder="Recent" />
              </SelectTrigger>
              <SelectContent>
                {recentProjects.map((project) => (
                  <SelectItem key={project.gameFolderPath} value={project.gameFolderPath}>
                    {project.sourceLanguage} → {project.targetLanguage} · {project.gameFolderPath}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          {/* File List */}
          {isExpanded && (
            <div className="ml-4 mt-1 space-y-0.5">
              {filteredFiles.length === 0 && (
                <p className="text-xs text-muted-foreground px-2 py-2 italic">
                  {files.length === 0 ? 'Chưa có project. Tạo mới!' : 'Không tìm thấy file.'}
                </p>
              )}
              {filteredFiles.map((file) => {
                const progress = Math.round((file.translated_blocks / Math.max(file.total_blocks, 1)) * 100)
                return (
                  <button
                    key={file.id}
                    id={`file-item-${file.id}`}
                    onClick={() => onFileSelect(file.id)}
                    className={cn(
                      'w-full text-left px-2 py-1.5 rounded-sm transition-colors',
                      activeFileId === file.id
                        ? 'bg-sidebar-accent text-sidebar-accent-foreground'
                        : 'hover:bg-sidebar-accent/50 text-muted-foreground hover:text-foreground'
                    )}
                  >
                    <div className="flex items-center gap-2">
                      <FileText className="size-3.5 flex-shrink-0 text-muted-foreground" />
                      <span className="text-xs truncate flex-1">{file.file_name}</span>
                      {statusIcons[file.status]}
                    </div>
                    <div className="ml-5.5 mt-1">
                      <div className="flex items-center justify-between text-[10px] text-muted-foreground mb-0.5">
                        <span>{file.total_blocks} blocks</span>
                        <span>{progress}%</span>
                      </div>
                      <Progress
                        value={progress}
                        indicatorClassName={progressColors[file.status]}
                      />
                    </div>
                  </button>
                )
              })}
            </div>
          )}
        </div>
      </ScrollArea>

      {/* Sidebar Footer Stats */}
      <div className="p-3 border-t border-sidebar-border text-[10px] text-muted-foreground">
        <div className="flex justify-between">
          <span>{files.length} files</span>
          <span>{overallProgress}% complete</span>
        </div>
      </div>
    </aside>
  )
}
