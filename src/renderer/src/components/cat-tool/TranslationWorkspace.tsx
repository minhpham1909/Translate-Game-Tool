/**
 * TranslationWorkspace.tsx
 * Khu vực làm việc chính: Filter tabs + Virtualized list các TranslationCard.
 * Dùng "Scroll-to-render" pattern: chỉ render 20 item, load thêm khi cuộn.
 */
import { useState, useRef, useCallback, useEffect } from 'react'
import { TranslationCard, UITranslationBlock, BlockStatus } from './TranslationCard'
import { FloatingActionBar } from './FloatingActionBar'

interface TranslationWorkspaceProps {
  blocks: UITranslationBlock[]
  onTranslationChange: (blockId: number, value: string) => void
  onApprove: (blockId: number) => void
  onRevert: (blockId: number) => void
  onAITranslate: (blockId: number) => void
  onBatchTranslate?: (blockIds: number[]) => void
  onBatchApprove?: (blockIds: number[]) => void
}

type FilterTab = 'all' | BlockStatus

const TABS: { id: FilterTab; label: string }[] = [
  { id: 'all',      label: 'All' },
  { id: 'empty',    label: 'Empty' },
  { id: 'draft',    label: 'Draft' },
  { id: 'approved', label: 'Approved' },
  { id: 'modified', label: 'Modified' },
  { id: 'warning',  label: 'Warning' },
]

const RENDER_CHUNK_SIZE = 20 // Số card render mỗi lần

/**
 * TranslationWorkspace component
 * Điều phối filter + lazy-load render card.
 * @param blocks - Tất cả blocks của file đang chọn
 */
export function TranslationWorkspace({
  blocks,
  onTranslationChange,
  onApprove,
  onRevert,
  onAITranslate,
  onBatchTranslate,
  onBatchApprove,
}: TranslationWorkspaceProps) {
  const [activeFilter, setActiveFilter] = useState<FilterTab>('all')
  const [renderedCount, setRenderedCount] = useState(RENDER_CHUNK_SIZE)
  const [selectedIds, setSelectedIds] = useState<Set<number>>(new Set())
  const [lastClickedId, setLastClickedId] = useState<number | null>(null)
  const loaderRef = useRef<HTMLDivElement | null>(null)

  // Map block.id to its index for shift-click range selection
  const blockIndexMap = new Map<number, number>()
  blocks.forEach((b, idx) => blockIndexMap.set(b.id, idx))

  // Lọc theo tab
  const filteredBlocks = activeFilter === 'all'
    ? blocks
    : blocks.filter((b) => b.status === activeFilter)

  // Danh sách thực sự render
  const visibleBlocks = filteredBlocks.slice(0, renderedCount)

  // Reset về đầu mỗi khi đổi filter
  useEffect(() => {
    setRenderedCount(RENDER_CHUNK_SIZE)
    setSelectedIds(new Set())
    setLastClickedId(null)
  }, [activeFilter, blocks])

  // IntersectionObserver: load thêm khi loader div vào viewport
  const handleObserver = useCallback(
    (entries: IntersectionObserverEntry[]) => {
      const [entry] = entries
      if (entry.isIntersecting && renderedCount < filteredBlocks.length) {
        setRenderedCount((prev) => Math.min(prev + RENDER_CHUNK_SIZE, filteredBlocks.length))
      }
    },
    [renderedCount, filteredBlocks.length]
  )

  useEffect(() => {
    const observer = new IntersectionObserver(handleObserver, { threshold: 0.1 })
    const currentLoader = loaderRef.current
    if (currentLoader) observer.observe(currentLoader)
    return () => {
      if (currentLoader) observer.unobserve(currentLoader)
    }
  }, [handleObserver])

  // Multi-select handler with shift-click support
  const handleSelect = useCallback((blockId: number, _event: React.MouseEvent) => {
    setSelectedIds((prev) => {
      const next = new Set(prev)
      if (_event.shiftKey && lastClickedId !== null) {
        // Range select
        const startIdx = blockIndexMap.get(lastClickedId) ?? 0
        const endIdx = blockIndexMap.get(blockId) ?? 0
        const lo = Math.min(startIdx, endIdx)
        const hi = Math.max(startIdx, endIdx)
        for (let i = lo; i <= hi; i++) {
          next.add(blocks[i].id)
        }
      } else {
        if (next.has(blockId)) {
          next.delete(blockId)
        } else {
          next.add(blockId)
        }
      }
      setLastClickedId(blockId)
      return next
    })
  }, [blocks, blockIndexMap, lastClickedId])

  const handleClearSelection = useCallback(() => {
    setSelectedIds(new Set())
    setLastClickedId(null)
  }, [])

  const handleSelectAll = useCallback(() => {
    setSelectedIds(new Set(visibleBlocks.map((b) => b.id)))
    setLastClickedId(visibleBlocks[0]?.id ?? null)
  }, [visibleBlocks])

  const handleDeselectAll = useCallback(() => {
    setSelectedIds(new Set())
    setLastClickedId(null)
  }, [])

  // Đếm theo từng status để hiển thị badge
  const counts: Record<FilterTab, number> = {
    all:      blocks.length,
    empty:    blocks.filter((b) => b.status === 'empty').length,
    draft:    blocks.filter((b) => b.status === 'draft').length,
    approved: blocks.filter((b) => b.status === 'approved').length,
    modified: blocks.filter((b) => b.status === 'modified').length,
    warning:  blocks.filter((b) => b.status === 'warning').length,
    skipped:  blocks.filter((b) => b.status === 'skipped').length,
  }

  const selectedCount = selectedIds.size

  return (
    <div className="flex-1 flex flex-col overflow-hidden bg-background">
      {/* Filter Tabs */}
      <div className="flex-shrink-0 flex items-center gap-1 px-4 py-2 border-b border-border bg-card">
        {TABS.map((tab) => (
          <button
            key={tab.id}
            id={`tab-filter-${tab.id}`}
            onClick={() => setActiveFilter(tab.id)}
            className={
              activeFilter === tab.id
                ? 'px-3 py-1 text-xs font-medium rounded-md bg-primary text-primary-foreground transition-colors'
                : 'px-3 py-1 text-xs font-medium rounded-md text-muted-foreground hover:text-foreground hover:bg-accent transition-colors'
            }
          >
            {tab.label}
            <span className="ml-1.5 text-[10px] opacity-70">({counts[tab.id]})</span>
          </button>
        ))}
        <div className="ml-auto flex items-center gap-2">
          {selectedCount > 0 && (
            <button
              id="btn-deselect-all"
              onClick={handleDeselectAll}
              className="text-[11px] text-muted-foreground hover:text-foreground transition-colors"
            >
              Deselect all
            </button>
          )}
          {selectedCount === 0 && visibleBlocks.length > 0 && (
            <button
              id="btn-select-all"
              onClick={handleSelectAll}
              className="text-[11px] text-muted-foreground hover:text-primary transition-colors"
            >
              Select all ({visibleBlocks.length})
            </button>
          )}
          <span className="text-[11px] text-muted-foreground">
            {selectedCount > 0
              ? `${selectedCount} selected · `
              : ''}
            Hiển thị {visibleBlocks.length} / {filteredBlocks.length}
          </span>
        </div>
      </div>

      {/* Virtualized Card List */}
      <div className="flex-1 overflow-y-auto">
        <div className="p-4 space-y-3">
          {visibleBlocks.length === 0 ? (
            <div className="flex items-center justify-center h-48 text-muted-foreground text-sm">
              {blocks.length === 0
                ? 'Chưa có dữ liệu. Chọn file từ sidebar.'
                : 'Không có block nào với trạng thái này.'}
            </div>
          ) : (
            <>
              {visibleBlocks.map((block) => (
                <TranslationCard
                  key={block.id}
                  block={block}
                  onTranslationChange={onTranslationChange}
                  onApprove={onApprove}
                  onRevert={onRevert}
                  onAITranslate={onAITranslate}
                  isSelected={selectedIds.has(block.id)}
                  onSelect={handleSelect}
                />
              ))}

              {/* Loader trigger — IntersectionObserver sẽ detect khi div này vào viewport */}
              {renderedCount < filteredBlocks.length && (
                <div ref={loaderRef} className="flex justify-center py-4">
                  <span className="text-xs text-muted-foreground animate-pulse">
                    Đang tải thêm...
                  </span>
                </div>
              )}
            </>
          )}
        </div>
      </div>

      {/* Floating Action Bar */}
      {selectedCount > 0 && onBatchTranslate && onBatchApprove && (
        <FloatingActionBar
          selectedCount={selectedCount}
          onBatchTranslate={() => onBatchTranslate(Array.from(selectedIds))}
          onBatchApprove={() => onBatchApprove(Array.from(selectedIds))}
          onClearSelection={handleClearSelection}
          onSelectAll={handleSelectAll}
        />
      )}
    </div>
  )
}
