/**
 * GlossaryModal.tsx
 * Modal quản lý từ điển thuật ngữ (Glossary):
 * xem, tìm kiếm, thêm, sửa, xóa từng term.
 */
import { useEffect, useState } from 'react'
import { BookMarked, Plus, Search, Pencil, Trash2, Check, X } from 'lucide-react'
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter,
} from '@renderer/components/ui/dialog'
import { Button } from '@renderer/components/ui/button'
import { Input } from '@renderer/components/ui/input'
import { ScrollArea } from '@renderer/components/ui/scroll-area'
import { Switch } from '@renderer/components/ui/switch'
import { cn } from '@renderer/lib/utils'

export interface GlossaryEntry {
  id: number
  source_text: string
  target_text: string
  notes?: string
  enabled?: boolean
}

interface GlossaryModalProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  entries?: GlossaryEntry[]
  onAdd: (entry: Omit<GlossaryEntry, 'id'>) => void
  onUpdate: (id: number, entry: Omit<GlossaryEntry, 'id'>) => void
  onDelete: (id: number) => void
  onSetEnabled: (ids: number[], enabled: boolean) => void
}

interface EditState {
  id: number | null // null = đang thêm mới
  source_text: string
  target_text: string
  notes: string
  enabled: boolean
}

/**
 * GlossaryModal component
 * @param entries - Danh sách thuật ngữ từ DB
 * @param onAdd - Thêm term mới
 * @param onUpdate - Cập nhật term
 * @param onDelete - Xóa term
 */
export function GlossaryModal({
  open, onOpenChange, entries = [], onAdd, onUpdate, onDelete, onSetEnabled,
}: GlossaryModalProps) {
  const [search, setSearch] = useState('')
  const [editState, setEditState] = useState<EditState | null>(null)
  const [selectedIds, setSelectedIds] = useState<number[]>([])

  const filtered = entries.filter(
    (entry) =>
      entry.source_text.toLowerCase().includes(search.toLowerCase()) ||
      entry.target_text.toLowerCase().includes(search.toLowerCase())
  )

  const filteredIds = filtered.map((entry) => entry.id)
  const allSelected = filteredIds.length > 0 && filteredIds.every((id) => selectedIds.includes(id))
  const enabledCount = entries.filter((entry) => entry.enabled !== false).length

  useEffect(() => {
    setSelectedIds((prev) => prev.filter((id) => entries.some((entry) => entry.id === id)))
  }, [entries])

  const startAdd = () => {
    setEditState({ id: null, source_text: '', target_text: '', notes: '', enabled: true })
  }

  const startEdit = (entry: GlossaryEntry) => {
    setEditState({
      id: entry.id,
      source_text: entry.source_text,
      target_text: entry.target_text,
      notes: entry.notes ?? '',
      enabled: entry.enabled !== false,
    })
  }

  const cancelEdit = () => setEditState(null)

  const commitEdit = () => {
    if (!editState) return
    const payload = {
      source_text: editState.source_text,
      target_text: editState.target_text,
      notes: editState.notes,
      enabled: editState.enabled,
    }
    if (editState.id === null) {
      onAdd(payload)
    } else {
      onUpdate(editState.id, payload)
    }
    setEditState(null)
  }

  const isEditValid = editState && editState.source_text.trim() && editState.target_text.trim()

  const toggleSelectAll = () => {
    if (allSelected) {
      setSelectedIds((prev) => prev.filter((id) => !filteredIds.includes(id)))
      return
    }
    setSelectedIds((prev) => Array.from(new Set([...prev, ...filteredIds])))
  }

  const toggleSelect = (id: number) => {
    setSelectedIds((prev) =>
      prev.includes(id) ? prev.filter((value) => value !== id) : [...prev, id]
    )
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl gap-0 p-0 overflow-hidden">
        <DialogHeader className="px-6 pt-5 pb-4 border-b border-border">
          <div className="flex items-center justify-between">
            <DialogTitle className="text-base font-semibold flex items-center gap-2">
              <BookMarked className="size-4 text-primary" />
              Glossary Manager
            </DialogTitle>
            <Button id="btn-add-glossary-term" size="sm" className="h-7 text-xs gap-1.5" onClick={startAdd}>
              <Plus className="size-3.5" />
              Add Term
            </Button>
          </div>

          {/* Search */}
          <div className="relative mt-3">
            <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 size-3.5 text-muted-foreground" />
            <Input
              id="input-glossary-search"
              placeholder="Tìm theo từ gốc hoặc bản dịch..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="pl-8 h-7 text-xs"
            />
          </div>

          {/* Bulk actions */}
          <div className="flex flex-wrap items-center gap-2 mt-3">
            <Button
              id="btn-enable-selected"
              variant="outline"
              size="sm"
              className="h-7 text-xs"
              disabled={selectedIds.length === 0}
              onClick={() => onSetEnabled(selectedIds, true)}
            >
              Enable selected
            </Button>
            <Button
              id="btn-disable-selected"
              variant="outline"
              size="sm"
              className="h-7 text-xs"
              disabled={selectedIds.length === 0}
              onClick={() => onSetEnabled(selectedIds, false)}
            >
              Disable selected
            </Button>
            <Button
              id="btn-enable-all"
              variant="ghost"
              size="sm"
              className="h-7 text-xs"
              disabled={entries.length === 0}
              onClick={() => onSetEnabled(entries.map((entry) => entry.id), true)}
            >
              Enable all
            </Button>
            <Button
              id="btn-disable-all"
              variant="ghost"
              size="sm"
              className="h-7 text-xs"
              disabled={entries.length === 0}
              onClick={() => onSetEnabled(entries.map((entry) => entry.id), false)}
            >
              Disable all
            </Button>
            <span className="text-[11px] text-muted-foreground">
              Selected: {selectedIds.length}
            </span>
          </div>
        </DialogHeader>

        <ScrollArea className="h-[380px]">
          <table className="w-full text-sm">
            <thead className="sticky top-0 bg-muted/80 backdrop-blur-sm">
              <tr className="border-b border-border">
                <th className="px-4 py-2.5 w-10">
                  <input
                    type="checkbox"
                    aria-label="Select all"
                    checked={allSelected}
                    onChange={toggleSelectAll}
                    className="size-3.5 accent-primary"
                  />
                </th>
                <th className="text-left px-4 py-2.5 text-[11px] font-semibold text-muted-foreground uppercase tracking-wider">Source (EN)</th>
                <th className="text-left px-4 py-2.5 text-[11px] font-semibold text-muted-foreground uppercase tracking-wider">Target (VI)</th>
                <th className="text-left px-4 py-2.5 text-[11px] font-semibold text-muted-foreground uppercase tracking-wider">Enabled</th>
                <th className="text-left px-4 py-2.5 text-[11px] font-semibold text-muted-foreground uppercase tracking-wider">Notes</th>
                <th className="px-4 py-2.5 w-20" />
              </tr>
            </thead>
            <tbody>
              {/* Add New Row */}
              {editState?.id === null && (
                <tr className="border-b border-primary/30 bg-primary/5">
                  <td className="px-4 py-2" />
                  <td className="px-4 py-2">
                    <Input
                      autoFocus
                      value={editState.source_text}
                      onChange={(e) => setEditState({ ...editState, source_text: e.target.value })}
                      placeholder="English term"
                      className="h-7 text-xs"
                    />
                  </td>
                  <td className="px-4 py-2">
                    <Input
                      value={editState.target_text}
                      onChange={(e) => setEditState({ ...editState, target_text: e.target.value })}
                      placeholder="Bản dịch"
                      className="h-7 text-xs"
                    />
                  </td>
                  <td className="px-4 py-2">
                    <Switch
                      checked={editState.enabled}
                      onCheckedChange={(checked) => setEditState({ ...editState, enabled: checked })}
                    />
                  </td>
                  <td className="px-4 py-2">
                    <Input
                      value={editState.notes}
                      onChange={(e) => setEditState({ ...editState, notes: e.target.value })}
                      placeholder="Ghi chú (tuỳ chọn)"
                      className="h-7 text-xs"
                    />
                  </td>
                  <td className="px-4 py-2">
                    <div className="flex items-center gap-1">
                      <Button
                        id="btn-commit-new-term"
                        size="sm"
                        className="h-6 w-6 p-0"
                        disabled={!isEditValid}
                        onClick={commitEdit}
                      >
                        <Check className="size-3.5" />
                      </Button>
                      <Button variant="ghost" size="sm" className="h-6 w-6 p-0" onClick={cancelEdit}>
                        <X className="size-3.5" />
                      </Button>
                    </div>
                  </td>
                </tr>
              )}

              {/* Entry Rows */}
              {filtered.length === 0 && editState?.id === null ? null : filtered.length === 0 ? (
                <tr>
                  <td colSpan={6} className="px-4 py-8 text-center text-xs text-muted-foreground italic">
                    {entries.length === 0 ? 'Chưa có từ nào. Nhấn "Add Term" để bắt đầu.' : 'Không tìm thấy kết quả.'}
                  </td>
                </tr>
              ) : (
                filtered.map((entry) => {
                  const isEditing = editState?.id === entry.id
                  return (
                    <tr
                      key={entry.id}
                      className={cn(
                        'border-b border-border/50 transition-colors',
                        isEditing ? 'bg-primary/5' : 'hover:bg-accent/50'
                      )}
                    >
                      <td className="px-4 py-2.5">
                        <input
                          type="checkbox"
                          aria-label={`Select term ${entry.id}`}
                          checked={selectedIds.includes(entry.id)}
                          onChange={() => toggleSelect(entry.id)}
                          className="size-3.5 accent-primary"
                        />
                      </td>
                      <td className="px-4 py-2.5">
                        {isEditing ? (
                          <Input value={editState!.source_text} onChange={(e) => setEditState({ ...editState!, source_text: e.target.value })} className="h-7 text-xs" autoFocus />
                        ) : (
                          <span className="text-xs font-medium text-foreground">{entry.source_text}</span>
                        )}
                      </td>
                      <td className="px-4 py-2.5">
                        {isEditing ? (
                          <Input value={editState!.target_text} onChange={(e) => setEditState({ ...editState!, target_text: e.target.value })} className="h-7 text-xs" />
                        ) : (
                          <span className="text-xs text-foreground">{entry.target_text}</span>
                        )}
                      </td>
                      <td className="px-4 py-2.5">
                        {isEditing ? (
                          <Switch
                            checked={editState!.enabled}
                            onCheckedChange={(checked) => setEditState({ ...editState!, enabled: checked })}
                          />
                        ) : (
                          <Switch
                            checked={entry.enabled !== false}
                            onCheckedChange={(checked) => onSetEnabled([entry.id], checked)}
                          />
                        )}
                      </td>
                      <td className="px-4 py-2.5">
                        {isEditing ? (
                          <Input value={editState!.notes} onChange={(e) => setEditState({ ...editState!, notes: e.target.value })} className="h-7 text-xs" placeholder="Ghi chú..." />
                        ) : (
                          <span className="text-xs text-muted-foreground italic">{entry.notes || '—'}</span>
                        )}
                      </td>
                      <td className="px-4 py-2.5">
                        <div className="flex items-center gap-1 justify-end">
                          {isEditing ? (
                            <>
                              <Button id={`btn-save-term-${entry.id}`} size="sm" className="h-6 w-6 p-0" disabled={!isEditValid} onClick={commitEdit}>
                                <Check className="size-3.5" />
                              </Button>
                              <Button variant="ghost" size="sm" className="h-6 w-6 p-0" onClick={cancelEdit}>
                                <X className="size-3.5" />
                              </Button>
                            </>
                          ) : (
                            <>
                              <Button
                                id={`btn-edit-term-${entry.id}`}
                                variant="ghost"
                                size="sm"
                                className="h-6 w-6 p-0 text-muted-foreground hover:text-foreground"
                                onClick={() => startEdit(entry)}
                              >
                                <Pencil className="size-3.5" />
                              </Button>
                              <Button
                                id={`btn-delete-term-${entry.id}`}
                                variant="ghost"
                                size="sm"
                                className="h-6 w-6 p-0 text-muted-foreground hover:text-destructive hover:bg-destructive/10"
                                onClick={() => onDelete(entry.id)}
                              >
                                <Trash2 className="size-3.5" />
                              </Button>
                            </>
                          )}
                        </div>
                      </td>
                    </tr>
                  )
                })
              )}
            </tbody>
          </table>
        </ScrollArea>

        <DialogFooter className="px-6 py-3 border-t border-border bg-muted/20">
          <p className="text-xs text-muted-foreground flex-1">
            {enabledCount}/{entries.length} thuật ngữ đang bật · Chỉ các term bật được nhúng vào System Prompt.
          </p>
          <Button variant="outline" size="sm" onClick={() => onOpenChange(false)}>Close</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
