/**
 * TopHeader.tsx
 * Thanh header trên cùng: breadcrumb file, action buttons, theme toggle.
 * Tất cả modals được mở từ đây thông qua callback props.
 */
import {
  BarChart3, Search, Settings, Download, RotateCcw, ChevronRight, Folder,
  Sun, Moon, Monitor, ShieldAlert, Database, BookMarked, Keyboard, RefreshCw,
  ArrowLeft,
} from 'lucide-react'
import { Button } from '@renderer/components/ui/button'
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@renderer/components/ui/tooltip'
import { useTheme } from '@renderer/context/ThemeContext'
import { cn } from '@renderer/lib/utils'
import { useI18n } from '@renderer/i18n'

interface TopHeaderProps {
  activeFileName?: string
  gameFolderPath?: string
  sourceLanguage?: string
  onSettingsClick: () => void
  onExportClick: () => void
  onRestoreClick: () => void
  onPreflightClick: () => void
  onSearchClick: () => void
  onQAClick: () => void
  onGlossaryClick: () => void
  onTMClick: () => void
  onShortcutsClick: () => void
  onGameUpdateClick: () => void
  onBackToWelcome: () => void
}

/**
 * TopHeader component
 * @param activeFileName - Tên file đang được chọn trong Sidebar
 * @param gameFolderPath - Đường dẫn thư mục game thực tế
 * @param sourceLanguage - Ngôn ngữ nguồn
 * @param onSettingsClick - Mở Settings Modal
 * @param onExportClick - Mở Export Modal
 * @param onRestoreClick - Mở Clear Translation Modal
 * @param onPreflightClick - Mở Pre-flight Modal
 * @param onSearchClick - Mở Search & Replace Modal
 * @param onQAClick - Mở QA Report Modal
 * @param onGlossaryClick - Mở Glossary Manager Modal
 * @param onTMClick - Mở TM Manager Modal
 * @param onShortcutsClick - Mở Keyboard Shortcuts Modal
 * @param onGameUpdateClick - Mở Update Game Modal
 * @param onBackToWelcome - Trở về Welcome Screen
 */
export function TopHeader({
  activeFileName,
  gameFolderPath,
  sourceLanguage,
  onSettingsClick,
  onExportClick,
  onRestoreClick,
  onPreflightClick,
  onSearchClick,
  onQAClick,
  onGlossaryClick,
  onTMClick,
  onShortcutsClick,
  onGameUpdateClick,
  onBackToWelcome,
}: TopHeaderProps) {
  const { theme, setTheme } = useTheme()
  const { t } = useI18n()

  const cycleTheme = () => {
    if (theme === 'dark') setTheme('light')
    else if (theme === 'light') setTheme('system')
    else setTheme('dark')
  }

  const themeIcon =
    theme === 'dark'   ? <Moon className="size-3.5" /> :
    theme === 'light'  ? <Sun className="size-3.5" />  :
                         <Monitor className="size-3.5" />

  const themeLabel =
    theme === 'dark'   ? t('topHeader.darkMode')   :
    theme === 'light'  ? t('topHeader.lightMode')  :
                         t('topHeader.systemTheme')

  const displayName = gameFolderPath
    ? gameFolderPath.split(/[\\/]/).pop() || gameFolderPath
    : t('topHeader.project')

  return (
    <header className="h-11 flex-shrink-0 border-b border-border bg-card flex items-center justify-between px-3">
      {/* Breadcrumbs */}
      <nav className="flex items-center gap-1 text-xs text-muted-foreground min-w-0">
        <Folder className="size-3.5 flex-shrink-0" />
        <span className="font-medium text-foreground flex-shrink-0">{displayName}</span>
        <ChevronRight className="size-3 flex-shrink-0" />
        <span className="flex-shrink-0">tl</span>
        <ChevronRight className="size-3 flex-shrink-0" />
        <span className="flex-shrink-0">{sourceLanguage || 'english'}</span>
        <ChevronRight className="size-3 flex-shrink-0" />
        <span className={cn(
          'font-medium font-mono truncate',
          activeFileName ? 'text-foreground' : 'text-muted-foreground'
        )}>
          {activeFileName || t('topHeader.selectFile')}
        </span>
        {gameFolderPath && (
          <>
            <ChevronRight className="size-3 flex-shrink-0" />
            <span className="text-muted-foreground truncate font-mono text-[10px]" title={gameFolderPath}>
              {gameFolderPath}
            </span>
          </>
        )}
      </nav>

      {/* Action Buttons */}
      <TooltipProvider delayDuration={0}>
        <div className="flex items-center gap-0.5 flex-shrink-0">

          {/* Back to Welcome */}
          <Tooltip>
            <TooltipTrigger asChild>
              <Button id="btn-back-to-welcome" variant="ghost" size="sm" className="h-7 px-2 text-xs gap-1.5" onClick={onBackToWelcome}>
                <ArrowLeft className="size-3.5" />
                <span className="hidden xl:inline">{t('topHeader.home')}</span>
              </Button>
            </TooltipTrigger>
            <TooltipContent side="bottom"><p>{t('topHeader.backToHome')}</p></TooltipContent>
          </Tooltip>

          <div className="w-px h-5 bg-border mx-0.5" />

          {/* Pre-flight */}
          <Tooltip>
            <TooltipTrigger asChild>
              <Button id="btn-open-preflight" variant="ghost" size="sm" className="h-7 px-2 text-xs gap-1.5" onClick={onPreflightClick}>
                <BarChart3 className="size-3.5" />
                <span className="hidden xl:inline">{t('topHeader.preflight')}</span>
              </Button>
            </TooltipTrigger>
            <TooltipContent side="bottom"><p>{t('topHeader.preflightTooltip')} <kbd className="ml-1 text-[10px] bg-muted px-1 rounded border border-border">Ctrl+Shift+A</kbd></p></TooltipContent>
          </Tooltip>

          {/* Search */}
          <Tooltip>
            <TooltipTrigger asChild>
              <Button id="btn-open-search" variant="ghost" size="sm" className="h-7 px-2 text-xs gap-1.5" onClick={onSearchClick}>
                <Search className="size-3.5" />
                <span className="hidden xl:inline">{t('topHeader.search')}</span>
              </Button>
            </TooltipTrigger>
            <TooltipContent side="bottom"><p>{t('topHeader.searchTooltip')} <kbd className="ml-1 text-[10px] bg-muted px-1 rounded border border-border">Ctrl+F</kbd></p></TooltipContent>
          </Tooltip>

          {/* QA Report */}
          <Tooltip>
            <TooltipTrigger asChild>
              <Button id="btn-open-qa" variant="ghost" size="sm" className="h-7 w-7 p-0" onClick={onQAClick}>
                <ShieldAlert className="size-3.5" />
              </Button>
            </TooltipTrigger>
            <TooltipContent side="bottom"><p>{t('topHeader.qaTooltip')} <kbd className="ml-1 text-[10px] bg-muted px-1 rounded border border-border">Ctrl+Shift+Q</kbd></p></TooltipContent>
          </Tooltip>

          {/* Glossary */}
          <Tooltip>
            <TooltipTrigger asChild>
              <Button id="btn-open-glossary" variant="ghost" size="sm" className="h-7 w-7 p-0" onClick={onGlossaryClick}>
                <BookMarked className="size-3.5" />
              </Button>
            </TooltipTrigger>
            <TooltipContent side="bottom"><p>{t('topHeader.glossaryTooltip')} <kbd className="ml-1 text-[10px] bg-muted px-1 rounded border border-border">Ctrl+Shift+G</kbd></p></TooltipContent>
          </Tooltip>

          {/* TM Manager */}
          <Tooltip>
            <TooltipTrigger asChild>
              <Button id="btn-open-tm" variant="ghost" size="sm" className="h-7 w-7 p-0" onClick={onTMClick}>
                <Database className="size-3.5" />
              </Button>
            </TooltipTrigger>
            <TooltipContent side="bottom"><p>{t('topHeader.tmTooltip')}</p></TooltipContent>
          </Tooltip>

          {/* Keyboard Shortcuts */}
          <Tooltip>
            <TooltipTrigger asChild>
              <Button id="btn-open-shortcuts" variant="ghost" size="sm" className="h-7 w-7 p-0" onClick={onShortcutsClick}>
                <Keyboard className="size-3.5" />
              </Button>
            </TooltipTrigger>
            <TooltipContent side="bottom"><p>{t('topHeader.shortcutsTooltip')} <kbd className="ml-1 text-[10px] bg-muted px-1 rounded border border-border">F1</kbd></p></TooltipContent>
          </Tooltip>

          {/* Update Game */}
          <Tooltip>
            <TooltipTrigger asChild>
              <Button id="btn-open-update-game" variant="ghost" size="sm" className="h-7 w-7 p-0" onClick={onGameUpdateClick}>
                <RefreshCw className="size-3.5" />
              </Button>
            </TooltipTrigger>
            <TooltipContent side="bottom"><p>{t('topHeader.updateGameTooltip')}</p></TooltipContent>
          </Tooltip>

          {/* Clear Translation */}
          <Tooltip>
            <TooltipTrigger asChild>
              <Button id="btn-open-restore" variant="ghost" size="sm" className="h-7 w-7 p-0" onClick={onRestoreClick}>
                <RotateCcw className="size-3.5" />
              </Button>
            </TooltipTrigger>
            <TooltipContent side="bottom"><p>{t('topHeader.clearTooltip')}</p></TooltipContent>
          </Tooltip>

          <div className="w-px h-5 bg-border mx-1" />

          {/* Theme Toggle */}
          <Tooltip>
            <TooltipTrigger asChild>
              <Button id="btn-toggle-theme" variant="ghost" size="sm" className="h-7 w-7 p-0" onClick={cycleTheme}>
                {themeIcon}
                <span className="sr-only">{t('topHeader.toggleTheme')}</span>
              </Button>
            </TooltipTrigger>
            <TooltipContent side="bottom"><p>{themeLabel}</p></TooltipContent>
          </Tooltip>

          {/* Settings */}
          <Tooltip>
            <TooltipTrigger asChild>
              <Button id="btn-open-settings" variant="ghost" size="sm" className="h-7 w-7 p-0" onClick={onSettingsClick}>
                <Settings className="size-3.5" />
              </Button>
            </TooltipTrigger>
            <TooltipContent side="bottom"><p>{t('topHeader.settingsTooltip')} <kbd className="ml-1 text-[10px] bg-muted px-1 rounded border border-border">Ctrl+,</kbd></p></TooltipContent>
          </Tooltip>

          <div className="w-px h-5 bg-border mx-1" />

          {/* Export */}
          <Tooltip>
            <TooltipTrigger asChild>
              <Button id="btn-open-export" size="sm" className="h-7 px-3 text-xs gap-1.5" onClick={onExportClick}>
                <Download className="size-3.5" />
                {t('common.export')}
              </Button>
            </TooltipTrigger>
            <TooltipContent side="bottom"><p>{t('topHeader.exportTooltip')} <kbd className="ml-1 text-[10px] bg-muted px-1 rounded border border-border">Ctrl+E</kbd></p></TooltipContent>
          </Tooltip>
        </div>
      </TooltipProvider>
    </header>
  )
}
