/**
 * TranslationWorkspace.tsx
 * Khu vực làm việc chính: Filter tabs + Virtualized list các TranslationCard.
 * Dùng "Scroll-to-render" pattern: chỉ render 20 item, load thêm khi cuộn.
 */
import { useState, useRef, useCallback, useEffect } from 'react'
import { TranslationCard, UITranslationBlock, BlockStatus } from './TranslationCard'

interface TranslationWorkspaceProps {
  blocks: UITranslationBlock[]
  onTranslationChange: (blockId: number, value: string) => void
  onApprove: (blockId: number) => void
  onRevert: (blockId: number) => void
  onAITranslate: (blockId: number) => void
}

type FilterTab = 'all' | BlockStatus

const TABS: { id: FilterTab; label: string }[] = [
  { id: 'all',      label: 'All' },
  { id: 'empty',    label: 'Empty' },
  { id: 'draft',    label: 'Draft' },
  { id: 'approved', label: 'Approved' },
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
}: TranslationWorkspaceProps) {
  const [activeFilter, setActiveFilter] = useState<FilterTab>('all')
  const [renderedCount, setRenderedCount] = useState(RENDER_CHUNK_SIZE)
  const loaderRef = useRef<HTMLDivElement | null>(null)

  // Lọc theo tab
  const filteredBlocks = activeFilter === 'all'
    ? blocks
    : blocks.filter((b) => b.status === activeFilter)

  // Danh sách thực sự render
  const visibleBlocks = filteredBlocks.slice(0, renderedCount)

  // Reset về đầu mỗi khi đổi filter
  useEffect(() => {
    setRenderedCount(RENDER_CHUNK_SIZE)
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

  // Đếm theo từng status để hiển thị badge
  const counts: Record<FilterTab, number> = {
    all:      blocks.length,
    empty:    blocks.filter((b) => b.status === 'empty').length,
    draft:    blocks.filter((b) => b.status === 'draft').length,
    approved: blocks.filter((b) => b.status === 'approved').length,
    warning:  blocks.filter((b) => b.status === 'warning').length,
  }

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
        <div className="ml-auto text-[11px] text-muted-foreground">
          Hiển thị {visibleBlocks.length} / {filteredBlocks.length}
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
    </div>
  )
}
