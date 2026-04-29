"use client"

import { BarChart3, Search, Settings, Download, ChevronRight, Folder } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip"
import { Kbd } from "@/components/ui/kbd"
import type { ProjectFile } from "@/app/page"

interface TopHeaderProps {
  activeFile: ProjectFile | undefined
  onSettingsClick: () => void
}

export function TopHeader({ activeFile, onSettingsClick }: TopHeaderProps) {
  return (
    <header className="h-11 flex-shrink-0 border-b border-border bg-card flex items-center justify-between px-3">
      {/* Breadcrumbs */}
      <nav className="flex items-center gap-1 text-xs text-muted-foreground">
        <Folder className="size-3.5" />
        <span className="font-medium text-foreground">Project</span>
        <ChevronRight className="size-3" />
        <span>tl</span>
        <ChevronRight className="size-3" />
        <span>english</span>
        <ChevronRight className="size-3" />
        <span className="font-medium text-foreground font-mono">
          {activeFile?.name || "Select a file"}
        </span>
      </nav>

      {/* Action Buttons */}
      <div className="flex items-center gap-1.5">
        <TooltipProvider delayDuration={0}>
          <Tooltip>
            <TooltipTrigger asChild>
              <Button variant="ghost" size="sm" className="h-7 px-2.5 text-xs gap-1.5">
                <BarChart3 className="size-3.5" />
                <span className="hidden lg:inline">Pre-flight Analytics</span>
              </Button>
            </TooltipTrigger>
            <TooltipContent side="bottom">
              <p>Check project consistency</p>
            </TooltipContent>
          </Tooltip>

          <Tooltip>
            <TooltipTrigger asChild>
              <Button variant="ghost" size="sm" className="h-7 px-2.5 text-xs gap-1.5">
                <Search className="size-3.5" />
                <span className="hidden lg:inline">Global Search</span>
                <Kbd className="ml-1 hidden lg:inline-flex">Ctrl+F</Kbd>
              </Button>
            </TooltipTrigger>
            <TooltipContent side="bottom">
              <p>Search across all files</p>
            </TooltipContent>
          </Tooltip>

          <Tooltip>
            <TooltipTrigger asChild>
              <Button
                variant="ghost"
                size="sm"
                className="h-7 w-7 p-0"
                onClick={onSettingsClick}
              >
                <Settings className="size-3.5" />
                <span className="sr-only">Settings</span>
              </Button>
            </TooltipTrigger>
            <TooltipContent side="bottom">
              <p>Open settings</p>
            </TooltipContent>
          </Tooltip>
        </TooltipProvider>

        <div className="w-px h-5 bg-border mx-1" />

        <Button size="sm" className="h-7 px-3 text-xs gap-1.5 bg-primary hover:bg-primary/90 text-primary-foreground">
          <Download className="size-3.5" />
          Export Project
        </Button>
      </div>
    </header>
  )
}
