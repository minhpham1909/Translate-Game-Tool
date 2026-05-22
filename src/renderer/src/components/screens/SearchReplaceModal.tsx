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
  fileId: number
  fileName: string
  lineIndex: number
  text: string
  matchStart: number
  matchEnd: number
  field: 'original' | 'translated'
}

interface SearchReplaceModalProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  activeFileId?: number | null
  onSearch: (query: string, options: SearchOptions) => Promise<SearchMatch[]> | SearchMatch[]
  onReplace: (match: SearchMatch, newText: string) => Promise<void> | void
  onReplaceAll: (matches: SearchMatch[], replaceWith: string) => Promise<void> | void
  onNavigateToMatch?: (match: SearchMatch) => void
}

interface SearchOptions {
  matchCase: boolean
  wholeWord: boolean
  useRegex: boolean
  searchTarget?: 'original' | 'translated' | 'both'
  includeHidden?: boolean
  fileId?: number
}

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
export function SearchReplaceModal({
  open,
  onOpenChange,
  activeFileId,
  onSearch,
  onReplace,
  onReplaceAll,
  onNavigateToMatch,
}: SearchReplaceModalProps) {
  const [query, setQuery] = useState('')
  const [replaceWith, setReplaceWith] = useState('')
  const [options, setOptions] = useState<SearchOptions>({
    matchCase: false,
    wholeWord: false,
    useRegex: false,
    searchTarget: 'both',
    includeHidden: false,
    fileId: undefined,
  })
  const [matches, setMatches] = useState<SearchMatch[]>([])
  const [currentIndex, setCurrentIndex] = useState(0)
  const [hasSearched, setHasSearched] = useState(false)
  const [isWorking, setIsWorking] = useState(false)

  const toggleOption = (key: keyof SearchOptions) => {
    setOptions((prev) => ({ ...prev, [key]: !prev[key] }))
  }

  const handleSearch = () => {
    if (!query.trim()) return
    void (async () => {
      try {
        setIsWorking(true)
        const result = await onSearch(query, options)
        setMatches(result)
        setCurrentIndex(0)
        setHasSearched(true)
      } finally {
        setIsWorking(false)
      }
    })()
  }

  const handleReplaceOne = () => {
    const current = matches[currentIndex]
    if (!current) return
    const nextText = current.text.slice(0, current.matchStart) + replaceWith + current.text.slice(current.matchEnd)
    void (async () => {
      try {
        setIsWorking(true)
        await onReplace(current, nextText)
        handleSearch()
      } finally {
        setIsWorking(false)
      }
    })()
  }

  const handleReplaceAll = () => {
    if (matches.length === 0) return
    void (async () => {
      try {
        setIsWorking(true)
        await onReplaceAll(matches, replaceWith)
        handleSearch()
      } finally {
        setIsWorking(false)
      }
    })()
  }

  const handleResultClick = (match: SearchMatch, index: number): void => {
    setCurrentIndex(index)
    onNavigateToMatch?.(match)
  }

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter') handleSearch()
  }

  const goToPrevMatch = () => {
    const next = Math.max(0, currentIndex - 1)
    setCurrentIndex(next)
    const match = matches[next]
    if (match) onNavigateToMatch?.(match)
  }

  const goToNextMatch = () => {
    const next = Math.min(matches.length - 1, currentIndex + 1)
    setCurrentIndex(next)
    const match = matches[next]
    if (match) onNavigateToMatch?.(match)
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
              <Button id="btn-search" size="sm" className="h-8 text-xs px-3" onClick={handleSearch} disabled={!query.trim() || isWorking}>
                Search
              </Button>
            </div>
            <p className="text-[11px] text-muted-foreground">
              Quick search: <code>id:123</code>, <code>#123</code>, <code>line:648</code>, <code>l:648</code>, <code>hash:abc123</code>
            </p>
          </div>

          <div className="flex items-center justify-between gap-2 rounded-md border border-border px-3 py-2">
            <div className="flex items-center gap-1">
              {(['both', 'translated', 'original'] as const).map((target) => (
                <button
                  key={target}
                  onClick={() => setOptions((prev) => ({ ...prev, searchTarget: target }))}
                  className={cn(
                    'px-2 py-1 text-[11px] rounded border transition-colors',
                    options.searchTarget === target
                      ? 'border-primary bg-primary/10 text-foreground'
                      : 'border-border text-muted-foreground hover:text-foreground'
                  )}
                >
                  {target === 'both' ? 'Both' : target === 'translated' ? 'Translated' : 'Original'}
                </button>
              ))}
            </div>
            <div className="flex items-center gap-1">
              <button
                onClick={() => setOptions((prev) => ({ ...prev, fileId: prev.fileId == null ? activeFileId ?? undefined : undefined }))}
                className={cn(
                  'px-2 py-1 text-[11px] rounded border transition-colors',
                  options.fileId != null
                    ? 'border-primary bg-primary/10 text-foreground'
                    : 'border-border text-muted-foreground hover:text-foreground'
                )}
                disabled={activeFileId == null}
              >
                Current file
              </button>
              <button
                onClick={() => setOptions((prev) => ({ ...prev, includeHidden: !(prev.includeHidden === true) }))}
                className={cn(
                  'px-2 py-1 text-[11px] rounded border transition-colors',
                  options.includeHidden === true
                    ? 'border-primary bg-primary/10 text-foreground'
                    : 'border-border text-muted-foreground hover:text-foreground'
                )}
              >
                Include hidden
              </button>
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
            <Button id="btn-replace" variant="outline" size="sm" className="h-8 text-xs px-3" onClick={handleReplaceOne} disabled={matches.length === 0 || isWorking}>
              Replace
            </Button>
            <Button id="btn-replace-all" variant="outline" size="sm" className="h-8 text-xs px-3 text-warning border-warning/30 hover:bg-warning/10 hover:text-warning" onClick={handleReplaceAll} disabled={matches.length === 0 || isWorking}>
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
                      onClick={goToPrevMatch}
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
                      onClick={goToNextMatch}
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
                        key={`${match.blockId}-${match.field}-${i}`}
                        onClick={() => handleResultClick(match, i)}
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
                          <span className="text-[10px] text-muted-foreground uppercase">{match.field}</span>
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
