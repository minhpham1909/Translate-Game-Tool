/**
 * SearchReplaceModal.tsx
 * Floating modal tìm kiếm và thay thế văn bản toàn project.
 * Hỗ trợ match case, whole word, và regex.
 */
import { useState } from 'react'
import { Search, Replace, ChevronRight, ChevronLeft, X, CaseSensitive, WholeWord, Regex } from 'lucide-react'
import {
  Dialog, DialogContent, DialogHeader, DialogTitle,
} from '@renderer/components/ui/dialog'
import { Button } from '@renderer/components/ui/button'
import { Input } from '@renderer/components/ui/input'
import { ScrollArea } from '@renderer/components/ui/scroll-area'
import { cn } from '@renderer/lib/utils'

interface SearchMatch {
  blockId: number
  fileName: string
  lineIndex: number
  text: string
  matchStart: number
  matchEnd: number
}

interface SearchReplaceModalProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  onSearch: (query: string, options: SearchOptions) => SearchMatch[]
  onReplace: (blockId: number, newText: string) => void
  onReplaceAll: (matches: SearchMatch[], replaceWith: string) => void
}

interface SearchOptions {
  matchCase: boolean
  wholeWord: boolean
  useRegex: boolean
}

const MOCK_MATCHES: SearchMatch[] = [
  { blockId: 1,  fileName: 'script.rpy',   lineIndex: 45,  text: "Welcome to the tutorial!", matchStart: 0,  matchEnd: 7 },
  { blockId: 8,  fileName: 'script.rpy',   lineIndex: 85,  text: "The roses here are beautiful this time of year.", matchStart: 4, matchEnd: 9 },
  { blockId: 12, fileName: 'chapter1.rpy', lineIndex: 120, text: "Welcome back, friend.", matchStart: 0, matchEnd: 7 },
]

/**
 * HighlightedText — render text với phần match được highlight vàng
 */
function HighlightedText({ text, start, end }: { text: string; start: number; end: number }) {
  return (
    <span className="text-xs">
      {text.slice(0, start)}
      <mark className="bg-warning/40 text-warning-foreground rounded-sm px-0.5">
        {text.slice(start, end)}
      </mark>
      {text.slice(end)}
    </span>
  )
}

/**
 * SearchReplaceModal component
 * @param onSearch - Callback tìm kiếm, trả về danh sách match
 * @param onReplace - Thay thế 1 match
 * @param onReplaceAll - Thay thế tất cả match
 */
export function SearchReplaceModal({ open, onOpenChange }: SearchReplaceModalProps) {
  const [query, setQuery] = useState('')
  const [replaceWith, setReplaceWith] = useState('')
  const [options, setOptions] = useState<SearchOptions>({ matchCase: false, wholeWord: false, useRegex: false })
  const [matches, setMatches] = useState<SearchMatch[]>([])
  const [currentIndex, setCurrentIndex] = useState(0)
  const [hasSearched, setHasSearched] = useState(false)

  const toggleOption = (key: keyof SearchOptions) => {
    setOptions((prev) => ({ ...prev, [key]: !prev[key] }))
  }

  const handleSearch = () => {
    if (!query.trim()) return
    // TODO: Gọi window.api.search.searchBlocks() ở Phase 4E
    setMatches(MOCK_MATCHES)
    setCurrentIndex(0)
    setHasSearched(true)
  }

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter') handleSearch()
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-lg gap-0 p-0 overflow-hidden">
        <DialogHeader className="px-5 pt-4 pb-3 border-b border-border">
          <div className="flex items-center justify-between">
            <DialogTitle className="text-sm font-semibold flex items-center gap-2">
              <Search className="size-3.5 text-primary" />
              Global Search & Replace
            </DialogTitle>
            <Button variant="ghost" size="sm" className="h-6 w-6 p-0" onClick={() => onOpenChange(false)}>
              <X className="size-3.5" />
            </Button>
          </div>
        </DialogHeader>

        <div className="px-5 py-4 space-y-3">
          {/* Find Input */}
          <div className="space-y-1.5">
            <div className="flex gap-2">
              <div className="relative flex-1">
                <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 size-3.5 text-muted-foreground" />
                <Input
                  id="input-search-query"
                  value={query}
                  onChange={(e) => setQuery(e.target.value)}
                  onKeyDown={handleKeyDown}
                  placeholder="Find what..."
                  className="pl-8 h-8 text-xs pr-28"
                />
                {/* Toggle Buttons inside input */}
                <div className="absolute right-2 top-1/2 -translate-y-1/2 flex items-center gap-0.5">
                  <button
                    onClick={() => toggleOption('matchCase')}
                    title="Match Case"
                    className={cn('size-5 flex items-center justify-center rounded transition-colors', options.matchCase ? 'bg-primary text-primary-foreground' : 'text-muted-foreground hover:text-foreground hover:bg-muted')}
                  >
                    <CaseSensitive className="size-3.5" />
                  </button>
                  <button
                    onClick={() => toggleOption('wholeWord')}
                    title="Whole Word"
                    className={cn('size-5 flex items-center justify-center rounded transition-colors', options.wholeWord ? 'bg-primary text-primary-foreground' : 'text-muted-foreground hover:text-foreground hover:bg-muted')}
                  >
                    <WholeWord className="size-3.5" />
                  </button>
                  <button
                    onClick={() => toggleOption('useRegex')}
                    title="Use Regex"
                    className={cn('size-5 flex items-center justify-center rounded transition-colors', options.useRegex ? 'bg-primary text-primary-foreground' : 'text-muted-foreground hover:text-foreground hover:bg-muted')}
                  >
                    <Regex className="size-3.5" />
                  </button>
                </div>
              </div>
              <Button id="btn-search" size="sm" className="h-8 text-xs px-3" onClick={handleSearch} disabled={!query.trim()}>
                Search
              </Button>
            </div>
          </div>

          {/* Replace Input */}
          <div className="flex gap-2">
            <div className="relative flex-1">
              <Replace className="absolute left-2.5 top-1/2 -translate-y-1/2 size-3.5 text-muted-foreground" />
              <Input
                id="input-replace-with"
                value={replaceWith}
                onChange={(e) => setReplaceWith(e.target.value)}
                placeholder="Replace with..."
                className="pl-8 h-8 text-xs"
              />
            </div>
            <Button id="btn-replace" variant="outline" size="sm" className="h-8 text-xs px-3" disabled={matches.length === 0}>
              Replace
            </Button>
            <Button id="btn-replace-all" variant="outline" size="sm" className="h-8 text-xs px-3 text-warning border-warning/30 hover:bg-warning/10 hover:text-warning" disabled={matches.length === 0}>
              Replace All
            </Button>
          </div>

          {/* Results */}
          {hasSearched && (
            <div className="space-y-2">
              <div className="flex items-center justify-between">
                <span className="text-xs text-muted-foreground">
                  {matches.length === 0 ? 'Không tìm thấy kết quả' : `${matches.length} kết quả tìm được`}
                </span>
                {matches.length > 0 && (
                  <div className="flex items-center gap-1">
                    <Button
                      variant="ghost"
                      size="sm"
                      className="h-5 w-5 p-0"
                      onClick={() => setCurrentIndex((prev) => Math.max(0, prev - 1))}
                      disabled={currentIndex === 0}
                    >
                      <ChevronLeft className="size-3" />
                    </Button>
                    <span className="text-[11px] text-muted-foreground">
                      {currentIndex + 1} / {matches.length}
                    </span>
                    <Button
                      variant="ghost"
                      size="sm"
                      className="h-5 w-5 p-0"
                      onClick={() => setCurrentIndex((prev) => Math.min(matches.length - 1, prev + 1))}
                      disabled={currentIndex === matches.length - 1}
                    >
                      <ChevronRight className="size-3" />
                    </Button>
                  </div>
                )}
              </div>

              {matches.length > 0 && (
                <ScrollArea className="h-48 rounded-md border border-border bg-muted/30">
                  <div className="p-2 space-y-1">
                    {matches.map((match, i) => (
                      <div
                        key={match.blockId}
                        onClick={() => setCurrentIndex(i)}
                        className={cn(
                          'flex flex-col gap-0.5 px-3 py-2 rounded-sm cursor-pointer transition-colors',
                          i === currentIndex
                            ? 'bg-primary/10 border border-primary/20'
                            : 'hover:bg-accent'
                        )}
                      >
                        <div className="flex items-center gap-1.5">
                          <span className="text-[10px] font-mono text-muted-foreground">{match.fileName}</span>
                          <span className="text-[10px] text-muted-foreground">L{match.lineIndex}</span>
                        </div>
                        <HighlightedText text={match.text} start={match.matchStart} end={match.matchEnd} />
                      </div>
                    ))}
                  </div>
                </ScrollArea>
              )}
            </div>
          )}
        </div>
      </DialogContent>
    </Dialog>
  )
}
