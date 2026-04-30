/**
 * TopHeader.tsx
 * Thanh header trên cùng: hiển thị breadcrumb file đang mở,
 * và các nút action chính (Pre-flight, Search, Settings, Export).
 */
import { BarChart3, Search, Settings, Download, ChevronRight, Folder, Sun, Moon, Monitor } from 'lucide-react'
import { Button } from '@renderer/components/ui/button'
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@renderer/components/ui/tooltip'
import { useTheme } from '@renderer/context/ThemeContext'
import { cn } from '@renderer/lib/utils'

interface TopHeaderProps {
  activeFileName?: string
  sourceLanguage?: string
  onSettingsClick: () => void
  onExportClick: () => void
}

/**
 * TopHeader component
 * @param activeFileName - Tên file đang được chọn
 * @param sourceLanguage - Ngôn ngữ nguồn (ví dụ: 'english')
 * @param onSettingsClick - Callback mở Settings Modal
 * @param onExportClick - Callback trigger Export
 */
export function TopHeader({ activeFileName, sourceLanguage, onSettingsClick, onExportClick }: TopHeaderProps) {
  const { theme, setTheme } = useTheme()

  // Cycle: dark -> light -> system -> dark
  const cycleTheme = () => {
    if (theme === 'dark') setTheme('light')
    else if (theme === 'light') setTheme('system')
    else setTheme('dark')
  }

  const themeIcon =
    theme === 'dark' ? <Moon className="size-3.5" /> :
    theme === 'light' ? <Sun className="size-3.5" /> :
    <Monitor className="size-3.5" />

  const themeLabel =
    theme === 'dark' ? 'Dark mode' :
    theme === 'light' ? 'Light mode' :
    'System theme'

  return (
    <header className="h-11 flex-shrink-0 border-b border-border bg-card flex items-center justify-between px-3">
      {/* Breadcrumbs */}
      <nav className="flex items-center gap-1 text-xs text-muted-foreground">
        <Folder className="size-3.5" />
        <span className="font-medium text-foreground">Project</span>
        <ChevronRight className="size-3" />
        <span>tl</span>
        <ChevronRight className="size-3" />
        <span>{sourceLanguage || 'english'}</span>
        <ChevronRight className="size-3" />
        <span className={cn('font-medium font-mono', activeFileName ? 'text-foreground' : 'text-muted-foreground')}>
          {activeFileName || 'Select a file'}
        </span>
      </nav>

      {/* Action Buttons */}
      <div className="flex items-center gap-1.5">
        <TooltipProvider delayDuration={0}>
          <Tooltip>
            <TooltipTrigger asChild>
              <Button variant="ghost" size="sm" className="h-7 px-2.5 text-xs gap-1.5">
                <BarChart3 className="size-3.5" />
                <span className="hidden lg:inline">Pre-flight</span>
              </Button>
            </TooltipTrigger>
            <TooltipContent side="bottom"><p>Phân tích trước khi dịch</p></TooltipContent>
          </Tooltip>

          <Tooltip>
            <TooltipTrigger asChild>
              <Button variant="ghost" size="sm" className="h-7 px-2.5 text-xs gap-1.5">
                <Search className="size-3.5" />
                <span className="hidden lg:inline">Search</span>
              </Button>
            </TooltipTrigger>
            <TooltipContent side="bottom"><p>Tìm kiếm toàn cục (Ctrl+F)</p></TooltipContent>
          </Tooltip>

          {/* Theme Toggle */}
          <Tooltip>
            <TooltipTrigger asChild>
              <Button variant="ghost" size="sm" className="h-7 w-7 p-0" onClick={cycleTheme}>
                {themeIcon}
                <span className="sr-only">Toggle theme</span>
              </Button>
            </TooltipTrigger>
            <TooltipContent side="bottom"><p>{themeLabel}</p></TooltipContent>
          </Tooltip>

          <Tooltip>
            <TooltipTrigger asChild>
              <Button variant="ghost" size="sm" className="h-7 w-7 p-0" onClick={onSettingsClick}>
                <Settings className="size-3.5" />
                <span className="sr-only">Settings</span>
              </Button>
            </TooltipTrigger>
            <TooltipContent side="bottom"><p>Cài đặt</p></TooltipContent>
          </Tooltip>
        </TooltipProvider>

        <div className="w-px h-5 bg-border mx-1" />

        <Button size="sm" className="h-7 px-3 text-xs gap-1.5" onClick={onExportClick}>
          <Download className="size-3.5" />
          Export
        </Button>
      </div>
    </header>
  )
}
