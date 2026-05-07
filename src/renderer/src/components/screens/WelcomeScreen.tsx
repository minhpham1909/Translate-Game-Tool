/**
 * WelcomeScreen.tsx
 * Màn hình chào mừng khi chưa có project nào được tải.
 * Hiển thị nút tạo/mở project, danh sách recent projects,
 * và cảnh báo nếu chưa có API key.
 */
import { type ReactElement } from 'react'
import { FolderOpen, Plus, Clock, AlertTriangle, ChevronRight, BookOpen, Trash2 } from 'lucide-react'
import { getLanguageLabel } from '../../../../shared/types'
import { useNotification } from '../../context/NotificationContext'

interface RecentProject {
  gameFolderPath: string
  sourceLanguage: string
  targetLanguage: string
  onDeleteProject?: (gameFolderPath: string) => void
  lastOpenedAt: string
}

interface WelcomeScreenProps {
  recentProjects?: RecentProject[]
  hasApiKey: boolean
  onNewProject: () => void
  onOpenProject: (project: RecentProject) => void
  onDeleteProject?: (gameFolderPath: string) => void
}

/**
 * WelcomeScreen component
 * @param recentProjects - Danh sách project đã mở gần đây
 * @param hasApiKey - Kiểm tra xem đã có API key chưa
 * @param onNewProject - Callback mở Setup Wizard
 * @param onOpenProject - Callback load lại project cũ
 */
export function WelcomeScreen({ recentProjects = [], hasApiKey, onNewProject, onOpenProject, onDeleteProject }: WelcomeScreenProps): ReactElement {
  const notify = useNotification()

  return (
    <div className="flex flex-col h-screen bg-background text-foreground">

      {/* API Key Warning Banner */}
      {!hasApiKey && (
        <div className="flex-shrink-0 flex items-center gap-2 px-4 py-2.5 bg-warning/10 border-b border-warning/30">
          <AlertTriangle className="size-4 text-warning flex-shrink-0" />
          <span className="text-sm text-warning">
            API Key chưa được cài đặt. Vào{' '}
            <button className="underline underline-offset-2 font-medium hover:text-warning/80 transition-colors">
              Settings
            </button>
            {' '}để cấu hình trước khi dịch.
          </span>
        </div>
      )}

      {/* Main Content - Centered */}
      <div className="flex-1 flex flex-col items-center justify-center px-6 gap-10">

        {/* Logo & Title */}
        <div className="flex flex-col items-center gap-3 text-center">
          <div className="size-14 rounded-xl bg-primary/15 border border-primary/30 flex items-center justify-center">
            <BookOpen className="size-7 text-primary" />
          </div>
          <div>
            <h1 className="text-2xl font-semibold text-foreground tracking-tight">VN Translator</h1>
            <p className="text-sm text-muted-foreground mt-1">
              Computer-Assisted Translation Tool cho Visual Novel
            </p>
          </div>
        </div>

        {/* Action Cards */}
        <div className="flex gap-4 w-full max-w-lg">
          <button
            id="btn-create-new-project"
            onClick={onNewProject}
            className="flex-1 flex flex-col items-center gap-3 p-6 rounded-lg border border-border bg-card hover:border-primary/50 hover:bg-card/80 transition-all group cursor-pointer"
          >
            <div className="size-10 rounded-md bg-primary/10 flex items-center justify-center group-hover:bg-primary/20 transition-colors">
              <Plus className="size-5 text-primary" />
            </div>
            <div className="text-center">
              <p className="text-sm font-medium text-foreground">Tạo Project Mới</p>
              <p className="text-xs text-muted-foreground mt-0.5">
                Chọn thư mục game và ngôn ngữ
              </p>
            </div>
          </button>

          <button
            id="btn-open-existing-project"
            onClick={onNewProject}
            className="flex-1 flex flex-col items-center gap-3 p-6 rounded-lg border border-border bg-card hover:border-primary/50 hover:bg-card/80 transition-all group cursor-pointer"
          >
            <div className="size-10 rounded-md bg-muted flex items-center justify-center group-hover:bg-muted/80 transition-colors">
              <FolderOpen className="size-5 text-muted-foreground group-hover:text-foreground transition-colors" />
            </div>
            <div className="text-center">
              <p className="text-sm font-medium text-foreground">Mở Project</p>
              <p className="text-xs text-muted-foreground mt-0.5">
                Tiếp tục từ thư mục đã có
              </p>
            </div>
          </button>
        </div>

        {/* Recent Projects */}
        <div className="w-full max-w-xl">
          <div className="flex items-center gap-2 mb-3">
            <Clock className="size-3.5 text-muted-foreground" />
            <span className="text-xs font-medium text-muted-foreground uppercase tracking-wider">
              Recent Projects ({recentProjects.length})
            </span>
          </div>

           {recentProjects.length === 0 ? (
             <div className="flex items-center justify-center h-24 rounded-lg border border-dashed border-border">
               <p className="text-xs text-muted-foreground italic">Chưa có project nào gần đây</p>
             </div>
           ) : (
             <div className="space-y-2 max-h-64 overflow-auto pr-1">
               {recentProjects.map((project, index) => (
                 <div
                   key={index}
                   className="relative flex items-start gap-3 px-3 py-3 rounded-md border border-border bg-card hover:border-primary/40 hover:bg-accent transition-all group"
                 >
                   <button
                     onClick={() => onOpenProject(project)}
                     className="flex-1 flex items-start gap-3 min-w-0 text-left"
                   >
                     <FolderOpen className="size-4 text-muted-foreground flex-shrink-0 mt-0.5" />
                     <div className="min-w-0">
                       <p className="text-xs font-medium text-foreground font-mono whitespace-normal break-all">
                         {project.gameFolderPath}
                       </p>
                       <div className="flex flex-wrap items-center gap-2 mt-1 text-[10px] text-muted-foreground">
                         <span className="px-1.5 py-0.5 rounded border border-border bg-muted/40">
                           {project.sourceLanguage} → {getLanguageLabel(project.targetLanguage)}
                         </span>
                         <span>{project.lastOpenedAt}</span>
                       </div>
                     </div>
                   </button>
                   <button
                     onClick={async (e) => {
                       e.stopPropagation()
                       const confirmed = await notify.confirm({
                         title: 'Xóa Project',
                         message: 'Xóa project này khỏi danh sách recent?',
                         confirmText: 'Xóa',
                         cancelText: 'Hủy'
                       })
                       if (confirmed) {
                         const deleteFiles = await notify.confirm({
                           title: 'Xóa file dịch?',
                           message: 'Xóa cả file dịch trong thư mục game?\n(Chọn Hủy nếu chỉ muốn xóa khỏi danh sách)',
                           confirmText: 'Xóa luôn file',
                           cancelText: 'Chỉ xóa project'
                         })
                         onDeleteProject?.(project.gameFolderPath, deleteFiles)
                       }
                     }}
                     className="opacity-0 group-hover:opacity-100 p-1 rounded hover:bg-destructive/20 text-muted-foreground hover:text-destructive transition-all"
                     title="Xóa project"
                   >
                     <Trash2 className="size-3.5" />
                   </button>
                 </div>
               ))}
             </div>
           )}
        </div>
      </div>

      {/* Footer */}
      <div className="flex-shrink-0 flex items-center justify-center py-3 border-t border-border">
        <span className="text-[11px] text-muted-foreground">VN Translator v1.0.0-beta · Cross-Translation Edition</span>
      </div>
    </div>
  )
}
