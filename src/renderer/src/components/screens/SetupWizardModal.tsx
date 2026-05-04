/**
 * SetupWizardModal.tsx
 * Modal 3-bước để tạo project mới:
 * Step 1: Chọn thư mục game
 * Step 2: Chọn ngôn ngữ nguồn (scan từ game/tl/)
 * Step 3: Nhập ngôn ngữ đích + xác nhận parse
 */
import { useState, useEffect, type ReactElement } from 'react'
import { Folder, ChevronRight, Loader2, CheckCircle2, AlertCircle, AlertTriangle, Package } from 'lucide-react'
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
type UnpackStatus = 'idle' | 'checking' | 'warning' | 'unpacking' | 'done' | 'error'

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

  // Unpacker state
  const [unpackStatus, setUnpackStatus] = useState<UnpackStatus>('idle')
  const [unpackProgress, setUnpackProgress] = useState(0)
  const [unpackMessage, setUnpackMessage] = useState('')
  const [compiledInfo, setCompiledInfo] = useState<{
    rpaCount: number
    rpycCount: number
    rpyCount: number
  } | null>(null)

  // Listen for unpack progress events
  useEffect(() => {
    if (!open) return
    const cleanup = window.api.events.onUnpackProgress((event) => {
      if (event.event === 'progress' && event.total) {
        setUnpackProgress(event.percent ?? 0)
        setUnpackMessage(event.message ?? '')
      } else if (event.event === 'info') {
        setUnpackMessage(event.message ?? '')
      } else if (event.event === 'complete') {
        setUnpackProgress(100)
        setUnpackMessage(`Done: ${(event.files_processed ?? 0)} processed, ${(event.files_failed ?? 0)} failed`)
      } else if (event.event === 'error') {
        setUnpackMessage(event.message ?? 'Unpack error')
      }
    })
    return cleanup
  }, [open])

  const resetWizard = (): void => {
    setCurrentStep(1)
    setGameFolderPath('')
    setSourceLanguage('')
    setTargetLanguage('vietnamese')
    setParseStatus('idle')
    setParseProgress(0)
    setUnpackStatus('idle')
    setUnpackProgress(0)
    setUnpackMessage('')
    setCompiledInfo(null)
  }

  const handleBrowseFolder = async (): Promise<void> => {
    const selectedPath = await window.api.project.selectFolder()
    if (selectedPath) {
      setGameFolderPath(selectedPath)
      await scanCompiledFiles(selectedPath)
    }
  }

  const scanCompiledFiles = async (folderPath: string): Promise<void> => {
    setUnpackStatus('checking')
    setCompiledInfo(null)
    try {
      const result = await window.api.project.scanCompiled(folderPath)
      setCompiledInfo({
        rpaCount: result.rpaFiles.length,
        rpycCount: result.rpycFiles.length,
        rpyCount: result.rpyFiles.length,
      })
      if (result.hasCompiled && !result.hasSource) {
        setUnpackStatus('warning')
      } else if (result.hasCompiled && result.hasSource) {
        setUnpackStatus('idle') // Has both — show info but let user proceed
      } else {
        setUnpackStatus('idle')
      }
    } catch {
      setUnpackStatus('idle')
    }
  }

  const handleUnpack = async (): Promise<void> => {
    setUnpackStatus('unpacking')
    setUnpackProgress(0)
    setUnpackMessage('Starting unpacker...')

    try {
      // First try to install unrpyc for better decompilation
      await window.api.project.installUnpackerDeps()

      const result = await window.api.project.unpackGame(gameFolderPath, 'auto')
      if (result.success) {
        setUnpackStatus('done')
        setUnpackMessage(result.message)
        // Re-scan after unpack
        await scanCompiledFiles(gameFolderPath)
      } else {
        setUnpackStatus('error')
        setUnpackMessage(result.message)
      }
    } catch (err: unknown) {
      setUnpackStatus('error')
      const message = err instanceof Error ? err.message : String(err)
      setUnpackMessage(message)
    }
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

              {/* Compiled File Warning + Unpacker UI */}
              {unpackStatus === 'checking' && (
                <div className="flex items-center gap-2 p-3 rounded-lg border border-border bg-muted/30">
                  <Loader2 className="size-4 text-muted-foreground animate-spin" />
                  <span className="text-xs text-muted-foreground">Scanning for compiled files...</span>
                </div>
              )}

              {unpackStatus === 'warning' && compiledInfo && (
                <div className="space-y-3 p-3 rounded-lg border border-amber-500/30 bg-amber-500/5">
                  <div className="flex items-start gap-2">
                    <AlertTriangle className="size-4 text-amber-500 mt-0.5 flex-shrink-0" />
                    <div className="space-y-1">
                      <p className="text-sm font-medium text-amber-500">Compiled game detected</p>
                      <p className="text-xs text-muted-foreground">
                        This game uses compiled files ({compiledInfo.rpaCount} .rpa, {compiledInfo.rpycCount} .rpyc) with no source .rpy files.
                        You need to unpack them before translating.
                      </p>
                    </div>
                  </div>
                  <Button
                    id="btn-unpack-game"
                    size="sm"
                    className="w-full gap-1.5 bg-amber-600 hover:bg-amber-700 text-white"
                    onClick={handleUnpack}
                  >
                    <Package className="size-3.5" />
                    Unpack Game First
                  </Button>
                </div>
              )}

              {unpackStatus === 'unpacking' && (
                <div className="space-y-2 p-3 rounded-lg border border-primary/30 bg-primary/5">
                  <div className="flex items-center gap-2">
                    <Loader2 className="size-4 text-primary animate-spin" />
                    <span className="text-xs text-foreground">{unpackMessage || 'Unpacking...'}</span>
                  </div>
                  <div className="w-full bg-muted rounded-full h-1.5 overflow-hidden">
                    <div
                      className="h-full bg-primary transition-all duration-300 rounded-full"
                      style={{ width: `${Math.min(unpackProgress, 100)}%` }}
                    />
                  </div>
                </div>
              )}

              {unpackStatus === 'done' && (
                <div className="flex items-center gap-2 p-3 rounded-lg border border-success/30 bg-success/5">
                  <CheckCircle2 className="size-4 text-success" />
                  <span className="text-xs text-success">{unpackMessage}</span>
                </div>
              )}

              {unpackStatus === 'error' && (
                <div className="p-3 rounded-lg border border-destructive/30 bg-destructive/5">
                  <div className="flex items-start gap-2">
                    <AlertCircle className="size-4 text-destructive mt-0.5 flex-shrink-0" />
                    <div>
                      <p className="text-xs font-medium text-destructive">Unpack failed</p>
                      <p className="text-[11px] text-muted-foreground mt-0.5">{unpackMessage}</p>
                      <p className="text-[11px] text-muted-foreground mt-1">
                        Tip: Install Python 3.x and run <code className="font-mono bg-muted px-1 rounded">pip install unrpyc</code> for best results.
                      </p>
                    </div>
                  </div>
                </div>
              )}

              {unpackStatus === 'idle' && compiledInfo && compiledInfo.rpaCount + compiledInfo.rpycCount > 0 && (
                <div className="flex items-center gap-2 p-2 rounded-lg border border-border/50 bg-muted/20">
                  <Package className="size-3.5 text-muted-foreground" />
                  <span className="text-[11px] text-muted-foreground">
                    Found {compiledInfo.rpaCount} archive(s), {compiledInfo.rpycCount} compiled script(s), {compiledInfo.rpyCount} source file(s).
                  </span>
                </div>
              )}
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
