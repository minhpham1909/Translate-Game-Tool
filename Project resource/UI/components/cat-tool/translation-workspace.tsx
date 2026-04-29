"use client"

import { ScrollArea } from "@/components/ui/scroll-area"
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs"
import { TranslationCard } from "./translation-card"
import type { TranslationBlock } from "@/app/page"

interface TranslationWorkspaceProps {
  blocks: TranslationBlock[]
  filterStatus: string
  onFilterChange: (status: string) => void
  onTranslationChange: (blockId: string, value: string) => void
  onApprove: (blockId: string) => void
  onRevert: (blockId: string) => void
}

const filterTabs = [
  { value: "all", label: "All", count: null },
  { value: "empty", label: "Empty", count: 3 },
  { value: "draft", label: "Draft (AI)", count: 2 },
  { value: "approved", label: "Approved", count: 4 },
  { value: "warning", label: "Warnings", count: 1 },
]

export function TranslationWorkspace({
  blocks,
  filterStatus,
  onFilterChange,
  onTranslationChange,
  onApprove,
  onRevert,
}: TranslationWorkspaceProps) {
  return (
    <main className="flex-1 flex flex-col overflow-hidden bg-background">
      {/* Filter Bar */}
      <div className="flex-shrink-0 border-b border-border px-4 py-2 bg-card/50">
        <Tabs value={filterStatus} onValueChange={onFilterChange}>
          <TabsList className="h-7 p-0.5 bg-muted/50">
            {filterTabs.map((tab) => (
              <TabsTrigger
                key={tab.value}
                value={tab.value}
                className="h-6 px-2.5 text-[11px] data-[state=active]:bg-background data-[state=active]:text-foreground"
              >
                {tab.label}
                {tab.count !== null && (
                  <span className="ml-1.5 text-[10px] text-muted-foreground bg-muted px-1.5 py-0.5 rounded-full">
                    {tab.count}
                  </span>
                )}
              </TabsTrigger>
            ))}
          </TabsList>
        </Tabs>
      </div>

      {/* Translation Blocks List */}
      <ScrollArea className="flex-1">
        <div className="p-3 space-y-2">
          {blocks.map((block) => (
            <TranslationCard
              key={block.id}
              block={block}
              onTranslationChange={(value) => onTranslationChange(block.id, value)}
              onApprove={() => onApprove(block.id)}
              onRevert={() => onRevert(block.id)}
            />
          ))}

          {blocks.length === 0 && (
            <div className="flex items-center justify-center py-12 text-muted-foreground text-sm">
              No translation blocks match the current filter.
            </div>
          )}
        </div>
      </ScrollArea>
    </main>
  )
}
