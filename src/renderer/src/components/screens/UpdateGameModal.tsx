/**
 * UpdateGameModal.tsx
 * Guided 4-step flow for updating a game project when a new version is released.
 *
 * Workflow:
 * Step 1: Instructions — explains what happens during update
 * Step 2: Select new game folder — user points to updated game directory
 * Step 3: Preview diff — shows what will change (unchanged/modified/new/removed)
 * Step 4: Apply update — runs the diff import, shows results
 */
import { useState, type ReactElement } from 'react'
import { Folder, ChevronRight, Loader2, CheckCircle2, AlertCircle, GitBranch, ArrowRightLeft, FilePlus, FileMinus, RefreshCw, Info } from 'lucide-react'
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter,
} from '@renderer/components/ui/dialog'
import { Button } from '@renderer/components/ui/button'
import { Label } from '@renderer/components/ui/label'
import { Progress } from '@renderer/components/ui/progress'
import { cn } from '@renderer/lib/utils'
import { useNotification } from '@renderer/context/NotificationContext'

type WizardStep = 1 | 2 | 3 | 4
type ApplyStatus = 'idle' | 'applying' | 'success' | 'error'

interface UpdateGameModalProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  /** Current project source language */
  sourceLanguage: string
  /** Callback when update completes successfully */
  onComplete: () => void
}

interface DiffPreview {
  newFileCount: number
  existingFileCount: number
  removedFileCount: number
  totalNewRpyFiles: number
}

interface DiffResult {
  unchanged: number
  modified: number
  newBlocks: number
  removed: number
  totalFiles: number
}

const STEP_LABELS: Record<WizardStep, string> = {
  1: 'Instructions',
  2: 'Select Update',
  3: 'Preview Changes',
  4: 'Apply Update',
}

/**
 * UpdateGameModal component
 * @param open - Modal open state
 * @param onOpenChange - Callback to change open state
 * @param sourceLanguage - Current project source language (e.g., 'english')
 * @param onComplete - Callback to refresh workspace after update
 */
export function UpdateGameModal({
  open,
  onOpenChange,
  sourceLanguage,
  onComplete,
}: UpdateGameModalProps): ReactElement {
  const notify = useNotification()
  const [currentStep, setCurrentStep] = useState<WizardStep>(1)
  const [newGameFolderPath, setNewGameFolderPath] = useState('')
  const [preview, setPreview] = useState<DiffPreview | null>(null)
  const [diffResult, setDiffResult] = useState<DiffResult | null>(null)
  const [applyStatus, setApplyStatus] = useState<ApplyStatus>('idle')
  const [applyProgress, setApplyProgress] = useState(0)
  const [applyMessage, setApplyMessage] = useState('')

  const resetModal = (): void => {
    setCurrentStep(1)
    setNewGameFolderPath('')
    setPreview(null)
    setDiffResult(null)
    setApplyStatus('idle')
    setApplyProgress(0)
    setApplyMessage('')
  }

  const handleBrowseFolder = async (): Promise<void> => {
    const selectedPath = await window.api.project.selectFolder()
    if (selectedPath) {
      setNewGameFolderPath(selectedPath)
    }
  }

  const handlePreview = async (): Promise<void> => {
    try {
      const result = await window.api.project.previewDiff(newGameFolderPath, sourceLanguage)
      setPreview(result)
      setCurrentStep(3)
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : String(err)
      notify.error('Failed to preview changes', message || 'Unable to preview update diff.')
    }
  }

  const handleApply = async (): Promise<void> => {
    setApplyStatus('applying')
    setApplyProgress(0)
    setApplyMessage('Starting update...')

    try {
      // Simulate progress since the operation is fast
      const progressInterval = setInterval(() => {
        setApplyProgress((prev) => Math.min(prev + 10, 90))
      }, 200)

      const result = await window.api.project.updateGame(newGameFolderPath, sourceLanguage)

      clearInterval(progressInterval)
      setApplyProgress(100)
      setApplyMessage('Update complete!')
      setApplyStatus('success')
      setDiffResult(result)

      setTimeout(() => {
        onComplete()
        onOpenChange(false)
        resetModal()
      }, 2000)
    } catch (err: unknown) {
      setApplyStatus('error')
      const message = err instanceof Error ? err.message : String(err)
      setApplyMessage(message || 'Update failed')
    }
  }

  return (
    <Dialog open={open} onOpenChange={(o) => { if (!o) resetModal(); onOpenChange(o) }}>
      <DialogContent className="max-w-xl gap-0 p-0 overflow-hidden">
        <DialogHeader className="px-6 pt-5 pb-4 border-b border-border">
          <DialogTitle className="flex items-center gap-2 text-base font-semibold">
            <RefreshCw className="size-4 text-primary" />
            Update Game Project
          </DialogTitle>

          {/* Step Indicator */}
          <div className="flex items-center gap-2 mt-3">
            {([1, 2, 3, 4] as WizardStep[]).map((step, idx) => (
              <div key={step} className="flex items-center gap-2">
                <div className={cn(
                  'flex items-center justify-center size-6 rounded-full text-[11px] font-bold transition-colors',
                  currentStep === step
                    ? 'bg-primary text-primary-foreground'
                    : currentStep > step
                    ? 'bg-success/20 text-success'
                    : 'bg-muted text-muted-foreground'
                )}>
                  {currentStep > step ? <CheckCircle2 className="size-3.5" /> : step}
                </div>
                <span className={cn(
                  'text-xs transition-colors hidden sm:inline',
                  currentStep === step ? 'text-foreground font-medium' : 'text-muted-foreground'
                )}>
                  {STEP_LABELS[step]}
                </span>
                {idx < 3 && <ChevronRight className="size-3.5 text-border flex-shrink-0" />}
              </div>
            ))}
          </div>
        </DialogHeader>

        {/* Step Content */}
        <div className="px-6 py-5 min-h-[240px] flex flex-col justify-center">

          {/* Step 1: Instructions */}
          {currentStep === 1 && (
            <div className="space-y-4">
              <div className="p-4 rounded-lg border border-info/30 bg-info/5 space-y-3">
                <div className="flex items-start gap-2">
                  <Info className="size-4 text-info mt-0.5 flex-shrink-0" />
                  <div>
                    <p className="text-sm font-medium text-info">How Game Update Works</p>
                    <p className="text-xs text-muted-foreground mt-1">
                      When your game updates (e.g., v1.0 → v1.1), the .rpy files may change.
                      This tool will compare the new version with your existing translations
                      and preserve what it can.
                    </p>
                  </div>
                </div>
              </div>

              <div className="space-y-3">
                <h4 className="text-sm font-medium text-foreground">What happens during update:</h4>
                <div className="space-y-2.5">
                  <div className="flex items-start gap-3 p-3 rounded-lg bg-muted/30">
                    <CheckCircle2 className="size-4 text-success mt-0.5 flex-shrink-0" />
                    <div>
                      <p className="text-xs font-medium text-foreground">Unchanged blocks</p>
                      <p className="text-[11px] text-muted-foreground">Same hash + same text → your translation is kept exactly as-is.</p>
                    </div>
                  </div>
                  <div className="flex items-start gap-3 p-3 rounded-lg bg-amber-500/5 border border-amber-500/20">
                    <GitBranch className="size-4 text-amber-500 mt-0.5 flex-shrink-0" />
                    <div>
                      <p className="text-xs font-medium text-amber-500">Modified blocks</p>
                      <p className="text-[11px] text-muted-foreground">Same hash but different text → old translation is kept for reference, marked with amber "Modified" badge. You can review and fix these.</p>
                    </div>
                  </div>
                  <div className="flex items-start gap-3 p-3 rounded-lg bg-muted/30">
                    <FilePlus className="size-4 text-muted-foreground mt-0.5 flex-shrink-0" />
                    <div>
                      <p className="text-xs font-medium text-foreground">New blocks</p>
                      <p className="text-[11px] text-muted-foreground">Brand new dialogue/strings in the update → added as "Empty" ready to translate.</p>
                    </div>
                  </div>
                  <div className="flex items-start gap-3 p-3 rounded-lg bg-muted/30">
                    <FileMinus className="size-4 text-muted-foreground mt-0.5 flex-shrink-0" />
                    <div>
                      <p className="text-xs font-medium text-foreground">Removed blocks</p>
                      <p className="text-[11px] text-muted-foreground">Lines that no longer exist in the new version → removed from database.</p>
                    </div>
                  </div>
                </div>
              </div>
            </div>
          )}

          {/* Step 2: Select new game folder */}
          {currentStep === 2 && (
            <div className="space-y-4">
              <div className="p-4 rounded-lg border border-border bg-muted/30 space-y-2 text-sm">
                <div className="flex justify-between">
                  <span className="text-muted-foreground">Current source language</span>
                  <span className="font-medium text-foreground">{sourceLanguage}</span>
                </div>
                <p className="text-xs text-muted-foreground">
                  The tool will scan the <code className="font-mono bg-muted px-1 rounded">tl/{sourceLanguage}/</code> folder in the new game directory.
                </p>
              </div>

              <div className="space-y-2">
                <Label htmlFor="input-update-folder">New Game Folder Path</Label>
                <div className="flex gap-2">
                  <input
                    id="input-update-folder"
                    value={newGameFolderPath}
                    onChange={(e) => setNewGameFolderPath(e.target.value)}
                    placeholder="D:\Games\MyVisualNovel_v1.1\game"
                    className="flex-1 h-9 px-3 rounded-md border border-border bg-background font-mono text-xs text-foreground focus:outline-none focus:ring-2 focus:ring-primary/30"
                  />
                  <Button variant="outline" size="sm" onClick={handleBrowseFolder}>
                    <Folder className="size-3.5 mr-1.5" />
                    Browse
                  </Button>
                </div>
                <p className="text-xs text-muted-foreground">
                  Select the <code className="font-mono bg-muted px-1 rounded text-[11px]">game/</code> folder of the updated game version.
                </p>
              </div>
            </div>
          )}

          {/* Step 3: Preview changes */}
          {currentStep === 3 && preview && (
            <div className="space-y-4">
              <div className="flex items-center gap-2 p-3 rounded-lg border border-border bg-muted/30">
                <ArrowRightLeft className="size-4 text-info" />
                <span className="text-sm font-medium text-foreground">Diff Preview</span>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div className="p-3 rounded-lg border border-border bg-muted/20">
                  <p className="text-[10px] uppercase tracking-wider text-muted-foreground mb-1">Files to process</p>
                  <p className="text-lg font-bold text-foreground">{preview.totalNewRpyFiles}</p>
                </div>
                <div className="p-3 rounded-lg border border-success/20 bg-success/5">
                  <p className="text-[10px] uppercase tracking-wider text-success mb-1">Existing files</p>
                  <p className="text-lg font-bold text-success">{preview.existingFileCount}</p>
                </div>
                <div className="p-3 rounded-lg border border-info/20 bg-info/5">
                  <p className="text-[10px] uppercase tracking-wider text-info mb-1">New files</p>
                  <p className="text-lg font-bold text-info">{preview.newFileCount}</p>
                </div>
                <div className="p-3 rounded-lg border border-destructive/20 bg-destructive/5">
                  <p className="text-[10px] uppercase tracking-wider text-destructive mb-1">Removed files</p>
                  <p className="text-lg font-bold text-destructive">{preview.removedFileCount}</p>
                </div>
              </div>

              <div className="p-3 rounded-lg border border-amber-500/20 bg-amber-500/5">
                <p className="text-xs text-amber-500 font-medium">Note</p>
                <p className="text-[11px] text-muted-foreground mt-1">
                  The exact count of unchanged/modified/new blocks will be shown after applying.
                  Translation data will NOT be lost — modified blocks keep their old translation for reference.
                </p>
              </div>
            </div>
          )}

          {/* Step 4: Apply update */}
          {currentStep === 4 && (
            <div className="space-y-4">
              {applyStatus === 'applying' && (
                <div className="space-y-3">
                  <div className="flex items-center gap-2">
                    <Loader2 className="size-4 text-primary animate-spin" />
                    <span className="text-sm text-foreground">{applyMessage}</span>
                  </div>
                  <Progress value={applyProgress} className="h-2" />
                  <p className="text-xs text-muted-foreground text-right">{applyProgress}%</p>
                </div>
              )}

              {applyStatus === 'success' && diffResult && (
                <div className="space-y-3">
                  <div className="flex items-center gap-3 p-4 rounded-lg border border-success/30 bg-success/10">
                    <CheckCircle2 className="size-5 text-success" />
                    <div>
                      <p className="text-sm font-medium text-foreground">Update successful!</p>
                      <p className="text-xs text-muted-foreground mt-0.5">{applyMessage}</p>
                    </div>
                  </div>

                  <div className="grid grid-cols-2 gap-3">
                    <div className="p-3 rounded-lg border border-success/20 bg-success/5">
                      <p className="text-[10px] uppercase tracking-wider text-success mb-1">Unchanged</p>
                      <p className="text-lg font-bold text-success">{diffResult.unchanged}</p>
                    </div>
                    <div className="p-3 rounded-lg border border-amber-500/20 bg-amber-500/5">
                      <p className="text-[10px] uppercase tracking-wider text-amber-500 mb-1">Modified</p>
                      <p className="text-lg font-bold text-amber-500">{diffResult.modified}</p>
                    </div>
                    <div className="p-3 rounded-lg border border-info/20 bg-info/5">
                      <p className="text-[10px] uppercase tracking-wider text-info mb-1">New</p>
                      <p className="text-lg font-bold text-info">{diffResult.newBlocks}</p>
                    </div>
                    <div className="p-3 rounded-lg border border-muted bg-muted/20">
                      <p className="text-[10px] uppercase tracking-wider text-muted-foreground mb-1">Removed</p>
                      <p className="text-lg font-bold text-muted-foreground">{diffResult.removed}</p>
                    </div>
                  </div>
                </div>
              )}

              {applyStatus === 'error' && (
                <div className="flex items-center gap-3 p-4 rounded-lg border border-destructive/30 bg-destructive/10">
                  <AlertCircle className="size-5 text-destructive" />
                  <div>
                    <p className="text-sm font-medium text-foreground">Update failed</p>
                    <p className="text-xs text-muted-foreground mt-0.5">{applyMessage}</p>
                  </div>
                </div>
              )}
            </div>
          )}
        </div>

        {/* Footer */}
        <DialogFooter className="px-6 py-4 border-t border-border bg-muted/20">
          <Button
            variant="outline"
            onClick={() => { onOpenChange(false); resetModal() }}
            disabled={applyStatus === 'applying'}
          >
            Cancel
          </Button>

          {currentStep === 1 && (
            <Button onClick={() => setCurrentStep(2)}>
              Next <ChevronRight className="size-3.5 ml-1" />
            </Button>
          )}

          {currentStep === 2 && (
            <Button
              onClick={handlePreview}
              disabled={newGameFolderPath.trim().length === 0}
            >
              Preview Changes <ChevronRight className="size-3.5 ml-1" />
            </Button>
          )}

          {currentStep === 3 && (
            <Button onClick={handleApply}>
              Apply Update <ChevronRight className="size-3.5 ml-1" />
            </Button>
          )}

          {currentStep === 4 && (
            <Button
              onClick={() => { onOpenChange(false); resetModal() }}
              disabled={applyStatus === 'applying'}
            >
              {applyStatus === 'success' ? 'Open Workspace' : 'Close'}
            </Button>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
