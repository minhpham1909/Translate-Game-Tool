"use client"

import { useState } from "react"
import { Plus, Search, FileText, CheckCircle2, AlertTriangle, Circle, ChevronRight, ChevronDown, FolderOpen } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Progress } from "@/components/ui/progress"
import { ScrollArea } from "@/components/ui/scroll-area"
import { cn } from "@/lib/utils"
import type { ProjectFile, FileStatus } from "@/app/page"

interface LeftSidebarProps {
  files: ProjectFile[]
  activeFileId: string
  onFileSelect: (fileId: string) => void
}

const statusIcons: Record<FileStatus, React.ReactNode> = {
  complete: <CheckCircle2 className="size-3 text-success" />,
  "in-progress": <Circle className="size-3 text-info fill-info/30" />,
  empty: <Circle className="size-3 text-muted-foreground" />,
  warning: <AlertTriangle className="size-3 text-warning" />,
}

const statusColors: Record<FileStatus, string> = {
  complete: "bg-success",
  "in-progress": "bg-info",
  empty: "bg-muted-foreground/30",
  warning: "bg-warning",
}

export function LeftSidebar({ files, activeFileId, onFileSelect }: LeftSidebarProps) {
  const [searchQuery, setSearchQuery] = useState("")
  const [isExpanded, setIsExpanded] = useState(true)

  const filteredFiles = files.filter((file) =>
    file.name.toLowerCase().includes(searchQuery.toLowerCase())
  )

  return (
    <aside className="w-[280px] flex-shrink-0 border-r border-border bg-sidebar flex flex-col">
      {/* New Project Button */}
      <div className="p-3 border-b border-sidebar-border">
        <Button variant="outline" size="sm" className="w-full justify-start gap-2 h-8 text-xs">
          <Plus className="size-3.5" />
          New Project
        </Button>
      </div>

      {/* Search Input */}
      <div className="p-3 border-b border-sidebar-border">
        <div className="relative">
          <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 size-3.5 text-muted-foreground" />
          <Input
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
            {isExpanded ? (
              <ChevronDown className="size-3.5 text-muted-foreground" />
            ) : (
              <ChevronRight className="size-3.5 text-muted-foreground" />
            )}
            <FolderOpen className="size-3.5 text-warning" />
            <span>tl / english</span>
          </button>

          {/* File List */}
          {isExpanded && (
            <div className="ml-4 mt-1 space-y-0.5">
              {filteredFiles.map((file) => (
                <button
                  key={file.id}
                  onClick={() => onFileSelect(file.id)}
                  className={cn(
                    "w-full text-left px-2 py-1.5 rounded-sm transition-colors group",
                    activeFileId === file.id
                      ? "bg-sidebar-accent text-sidebar-accent-foreground"
                      : "hover:bg-sidebar-accent/50 text-muted-foreground hover:text-foreground"
                  )}
                >
                  <div className="flex items-center gap-2">
                    <FileText className="size-3.5 flex-shrink-0 text-muted-foreground" />
                    <span className="text-xs truncate flex-1">{file.name}</span>
                    {statusIcons[file.status]}
                  </div>
                  <div className="ml-5.5 mt-1">
                    <div className="flex items-center justify-between text-[10px] text-muted-foreground mb-0.5">
                      <span>{file.lines} lines</span>
                      <span>{file.progress}%</span>
                    </div>
                    <Progress
                      value={file.progress}
                      className={cn("h-1", statusColors[file.status])}
                    />
                  </div>
                </button>
              ))}
            </div>
          )}
        </div>
      </ScrollArea>

      {/* Sidebar Footer Stats */}
      <div className="p-3 border-t border-sidebar-border text-[10px] text-muted-foreground">
        <div className="flex justify-between">
          <span>{files.length} files</span>
          <span>
            {Math.round(files.reduce((acc, f) => acc + f.progress, 0) / files.length)}% complete
          </span>
        </div>
      </div>
    </aside>
  )
}
