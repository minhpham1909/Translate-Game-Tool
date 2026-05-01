/**
 * KeyboardShortcutsModal.tsx
 * Modal hiển thị toàn bộ keyboard shortcuts theo nhóm,
 * với styling <kbd> như phím vật lý.
 */
import { Keyboard } from 'lucide-react'
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter,
} from '@renderer/components/ui/dialog'
import { Button } from '@renderer/components/ui/button'

interface Shortcut {
  keys: string[]
  description: string
}

interface ShortcutGroup {
  category: string
  shortcuts: Shortcut[]
}

const SHORTCUT_GROUPS: ShortcutGroup[] = [
  {
    category: 'Navigation',
    shortcuts: [
      { keys: ['Alt', '↑'], description: 'Di chuyển lên block trước' },
      { keys: ['Alt', '↓'], description: 'Di chuyển xuống block tiếp theo' },
      { keys: ['Ctrl', 'F'], description: 'Mở Global Search & Replace' },
      { keys: ['Ctrl', 'G'], description: 'Nhảy đến block theo số thứ tự' },
    ],
  },
  {
    category: 'Translation Actions',
    shortcuts: [
      { keys: ['Ctrl', 'Enter'], description: 'Approve bản dịch hiện tại và chuyển sang tiếp theo' },
      { keys: ['Ctrl', 'Shift', 'Z'], description: 'Revert block về trạng thái Empty' },
      { keys: ['Ctrl', 'Shift', 'T'], description: 'Dịch block hiện tại bằng AI' },
      { keys: ['Ctrl', 'Shift', 'A'], description: 'Dịch toàn bộ file bằng AI (Pre-flight)' },
      { keys: ['Ctrl', 'S'], description: 'Lưu bản dịch thủ công ngay lập tức' },
    ],
  },
  {
    category: 'System',
    shortcuts: [
      { keys: ['Ctrl', 'E'], description: 'Mở Export Modal' },
      { keys: ['Ctrl', ','], description: 'Mở Settings' },
      { keys: ['F1'], description: 'Xem Keyboard Shortcuts (màn hình này)' },
      { keys: ['Ctrl', 'Shift', 'Q'], description: 'Mở QA Report Dashboard' },
      { keys: ['Ctrl', 'Shift', 'G'], description: 'Mở Glossary Manager' },
    ],
  },
]

/**
 * KbdKey — hiển thị 1 phím như phím vật lý
 */
function KbdKey({ children }: { children: React.ReactNode }) {
  return (
    <kbd className="inline-flex items-center justify-center min-w-[1.6rem] h-6 px-1.5 text-[11px] font-mono font-semibold text-foreground bg-muted border border-border rounded-sm shadow-[0_2px_0_0_var(--border)]">
      {children}
    </kbd>
  )
}

/**
 * KeyboardShortcutsModal component
 * Không cần props dữ liệu — hoàn toàn tĩnh.
 */
export function KeyboardShortcutsModal({
  open,
  onOpenChange,
}: {
  open: boolean
  onOpenChange: (open: boolean) => void
}) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl gap-0 p-0 overflow-hidden">
        <DialogHeader className="px-6 pt-5 pb-4 border-b border-border">
          <DialogTitle className="text-base font-semibold flex items-center gap-2">
            <Keyboard className="size-4 text-primary" />
            Keyboard Shortcuts
          </DialogTitle>
          <p className="text-xs text-muted-foreground mt-0.5">
            Tất cả phím tắt trong VN Translator.
          </p>
        </DialogHeader>

        <div className="px-6 py-5 grid grid-cols-1 gap-6 max-h-[480px] overflow-y-auto">
          {SHORTCUT_GROUPS.map((group) => (
            <div key={group.category}>
              <h3 className="text-[11px] font-semibold text-muted-foreground uppercase tracking-wider mb-3 pb-1.5 border-b border-border">
                {group.category}
              </h3>
              <div className="space-y-2">
                {group.shortcuts.map((shortcut, i) => (
                  <div key={i} className="flex items-center justify-between gap-4">
                    {/* Key Combination */}
                    <div className="flex items-center gap-1 flex-shrink-0">
                      {shortcut.keys.map((key, ki) => (
                        <span key={ki} className="flex items-center gap-1">
                          <KbdKey>{key}</KbdKey>
                          {ki < shortcut.keys.length - 1 && (
                            <span className="text-[10px] text-muted-foreground">+</span>
                          )}
                        </span>
                      ))}
                    </div>
                    {/* Description */}
                    <span className="text-sm text-muted-foreground text-right">{shortcut.description}</span>
                  </div>
                ))}
              </div>
            </div>
          ))}
        </div>

        <DialogFooter className="px-6 py-3 border-t border-border bg-muted/20">
          <p className="text-xs text-muted-foreground flex-1">Nhấn <KbdKey>F1</KbdKey> bất kỳ lúc nào để xem lại.</p>
          <Button variant="outline" size="sm" onClick={() => onOpenChange(false)}>Close</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
