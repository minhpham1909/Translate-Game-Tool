/**
 * SetupWizardModal.tsx
 * Modal 3-bước để tạo project mới:
 * Step 1: Chọn thư mục game
 * Step 2: Chọn ngôn ngữ nguồn (scan từ game/tl/)
 * Step 3: Nhập ngôn ngữ đích + xác nhận parse
 */
import { useState, type ReactElement } from 'react'
import { Folder, ChevronRight, Loader2, CheckCircle2, AlertCircle } from 'lucide-react'
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter,
} from '@renderer/components/ui/dialog'
import { Button } from '@renderer/components/ui/button'
import { Input } from '@renderer/components/ui/input'
import { Label } from '@renderer/components/ui/label'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@renderer/components/ui/select'
import { Progress } from '@renderer/components/ui/progress'
import { cn } from '@renderer/lib/utils'

type WizardStep = 1 | 2 | 3
type ParseStatus = 'idle' | 'parsing' | 'success' | 'error'

interface SetupWizardModalProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  /** Callback khi setup hoàn tất, truyền config về App */
  onComplete: (config: { gameFolderPath: string; sourceLanguage: string; targetLanguage: string }) => void
}

const STEP_LABELS: Record<WizardStep, string> = {
  1: 'Select Game Folder',
  2: 'Select Source Language',
  3: 'Confirm & Parse',
}

/**
 * SetupWizardModal component
 * @param open - Trạng thái mở/đóng
 * @param onOpenChange - Callback đóng modal
 * @param onComplete - Callback nhận config hoàn chỉnh
 */
export function SetupWizardModal({ open, onOpenChange, onComplete }: SetupWizardModalProps): ReactElement {
  const [currentStep, setCurrentStep] = useState<WizardStep>(1)
  const [gameFolderPath, setGameFolderPath] = useState('')
  const [sourceLanguage, setSourceLanguage] = useState('')
  const [targetLanguage, setTargetLanguage] = useState('vietnamese')
  const [availableLanguages, setAvailableLanguages] = useState<string[]>([])
  const [parseStatus, setParseStatus] = useState<ParseStatus>('idle')
  const [parseProgress, setParseProgress] = useState(0)
  const [parseMessage, setParseMessage] = useState('')

  const resetWizard = (): void => {
    setCurrentStep(1)
    setGameFolderPath('')
    setSourceLanguage('')
    setTargetLanguage('vietnamese')
    setParseStatus('idle')
    setParseProgress(0)
  }

  const handleBrowseFolder = (): void => {
    // TODO: Gọi window.api.dialog.selectFolder() ở Phase 4E
    // Tạm mock bằng prompt
    const mockPath = 'D:\\Games\\MyVisualNovel\\game'
    setGameFolderPath(mockPath)
  }

  const handleScanLanguages = async (): Promise<void> => {
    if (!gameFolderPath) return
    try {
      const languages = await window.api.project.scanLanguages(gameFolderPath)
      if (languages.length === 0) {
        alert('Không tìm thấy thư mục ngôn ngữ nào trong game/tl/')
        return
      }
      setAvailableLanguages(languages)
      setCurrentStep(2)
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : String(err)
      alert(message || 'Lỗi quét ngôn ngữ')
    }
  }

  const handleStartParse = async (): Promise<void> => {
    setParseStatus('parsing')
    setParseProgress(0)
    setParseMessage('Đang quét và nạp dữ liệu vào Database, vui lòng đợi (có thể mất 1-2 phút)...')

    try {
      await window.api.project.setup({
        gameFolderPath,
        sourceLanguage,
        targetLanguage
      })

      setParseProgress(100)
      setParseMessage('Hoàn tất!')
      setParseStatus('success')

      setTimeout(() => {
        onComplete({ gameFolderPath, sourceLanguage, targetLanguage })
        onOpenChange(false)
        resetWizard()
      }, 1000)
    } catch (err: unknown) {
      setParseStatus('error')
      const message = err instanceof Error ? err.message : String(err)
      setParseMessage(message || 'Lỗi khi parse dữ liệu.')
    }
  }

  const canProceedStep1 = gameFolderPath.trim().length > 0
  const canProceedStep2 = sourceLanguage.length > 0
  const canProceedStep3 = targetLanguage.trim().length > 0

  return (
    <Dialog open={open} onOpenChange={(o) => { if (!o) resetWizard(); onOpenChange(o) }}>
      <DialogContent className="max-w-lg gap-0 p-0 overflow-hidden">
        <DialogHeader className="px-6 pt-5 pb-4 border-b border-border">
          <DialogTitle className="text-base font-semibold">New Project Setup</DialogTitle>

          {/* Step Indicator */}
          <div className="flex items-center gap-2 mt-3">
            {([1, 2, 3] as WizardStep[]).map((step, idx) => (
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
                  'text-xs transition-colors',
                  currentStep === step ? 'text-foreground font-medium' : 'text-muted-foreground'
                )}>
                  {STEP_LABELS[step]}
                </span>
                {idx < 2 && <ChevronRight className="size-3.5 text-border flex-shrink-0" />}
              </div>
            ))}
          </div>
        </DialogHeader>

        {/* Step Content */}
        <div className="px-6 py-5 min-h-[180px] flex flex-col justify-center">

          {/* Step 1: Select Game Folder */}
          {currentStep === 1 && (
            <div className="space-y-4">
              <div className="space-y-2">
                <Label htmlFor="input-game-folder">Game Folder Path</Label>
                <div className="flex gap-2">
                  <Input
                    id="input-game-folder"
                    value={gameFolderPath}
                    onChange={(e) => setGameFolderPath(e.target.value)}
                    placeholder="D:\Games\MyVisualNovel\game"
                    className="flex-1 font-mono text-xs"
                  />
                  <Button id="btn-browse-folder" variant="outline" size="sm" onClick={handleBrowseFolder}>
                    <Folder className="size-3.5 mr-1.5" />
                    Browse
                  </Button>
                </div>
                <p className="text-xs text-muted-foreground">
                  Trỏ đến thư mục <code className="font-mono bg-muted px-1 rounded text-[11px]">game/</code> trong thư mục game.
                </p>
              </div>
            </div>
          )}

          {/* Step 2: Select Source Language */}
          {currentStep === 2 && (
            <div className="space-y-4">
              <div className="space-y-2">
                <Label htmlFor="select-source-lang">Source Language</Label>
                <Select value={sourceLanguage} onValueChange={setSourceLanguage}>
                  <SelectTrigger id="select-source-lang">
                    <SelectValue placeholder="Chọn ngôn ngữ nguồn..." />
                  </SelectTrigger>
                  <SelectContent>
                    {availableLanguages.map((lang) => (
                      <SelectItem key={lang} value={lang}>{lang}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                <p className="text-xs text-muted-foreground">
                  Ngôn ngữ mà AI sẽ dịch <span className="text-foreground font-medium">từ</span> đó (thường là <code className="font-mono bg-muted px-1 rounded text-[11px]">english</code>).
                </p>
              </div>

              <div className="space-y-2">
                <Label htmlFor="input-target-lang-wizard">Target Language</Label>
                <Input
                  id="input-target-lang-wizard"
                  value={targetLanguage}
                  onChange={(e) => setTargetLanguage(e.target.value)}
                  placeholder="ví dụ: vietnamese, Tiếng Việt"
                />
                <p className="text-xs text-muted-foreground">
                  Ngôn ngữ AI sẽ dịch <span className="text-foreground font-medium">sang</span>.
                </p>
              </div>
            </div>
          )}

          {/* Step 3: Confirm & Parse */}
          {currentStep === 3 && (
            <div className="space-y-4">
              {parseStatus === 'idle' && (
                <div className="p-4 rounded-lg border border-border bg-muted/30 space-y-2 text-sm">
                  <div className="flex justify-between">
                    <span className="text-muted-foreground">Game Folder</span>
                    <code className="font-mono text-xs text-foreground truncate max-w-[200px]">{gameFolderPath}</code>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-muted-foreground">Source Language</span>
                    <span className="font-medium text-foreground">{sourceLanguage}</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-muted-foreground">Target Language</span>
                    <span className="font-medium text-foreground">{targetLanguage}</span>
                  </div>
                </div>
              )}

              {parseStatus === 'parsing' && (
                <div className="space-y-3">
                  <div className="flex items-center gap-2">
                    <Loader2 className="size-4 text-primary animate-spin" />
                    <span className="text-sm text-foreground">{parseMessage}</span>
                  </div>
                  <Progress value={parseProgress} className="h-2" />
                  <p className="text-xs text-muted-foreground text-right">{parseProgress}%</p>
                </div>
              )}

              {parseStatus === 'success' && (
                <div className="flex items-center gap-3 p-4 rounded-lg border border-success/30 bg-success/10">
                  <CheckCircle2 className="size-5 text-success" />
                  <div>
                    <p className="text-sm font-medium text-foreground">Parse thành công!</p>
                    <p className="text-xs text-muted-foreground mt-0.5">Đang mở workspace...</p>
                  </div>
                </div>
              )}

              {parseStatus === 'error' && (
                <div className="flex items-center gap-3 p-4 rounded-lg border border-destructive/30 bg-destructive/10">
                  <AlertCircle className="size-5 text-destructive" />
                  <div>
                    <p className="text-sm font-medium text-foreground">Parse thất bại</p>
                    <p className="text-xs text-muted-foreground mt-0.5">Kiểm tra đường dẫn và thử lại.</p>
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
            onClick={() => { onOpenChange(false); resetWizard() }}
            disabled={parseStatus === 'parsing'}
          >
            Cancel
          </Button>

          {currentStep < 3 ? (
            <Button
              id="btn-wizard-next"
              onClick={() => {
                if (currentStep === 1) handleScanLanguages()
                else setCurrentStep(3)
              }}
              disabled={
                (currentStep === 1 && !canProceedStep1) ||
                (currentStep === 2 && !canProceedStep2)
              }
            >
              Next <ChevronRight className="size-3.5 ml-1" />
            </Button>
          ) : (
            <Button
              id="btn-wizard-start-parse"
              onClick={handleStartParse}
              disabled={!canProceedStep3 || parseStatus !== 'idle'}
            >
              {parseStatus === 'parsing' ? (
                <><Loader2 className="size-3.5 mr-1.5 animate-spin" />Parsing...</>
              ) : 'Start Parsing'}
            </Button>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
