/**
 * SettingsModal.tsx
 * Modal cài đặt toàn cục, kết nối vào AppSettings.
 * Có 4 tab: AI & API, Prompt & Logic, Translation Memory, System.
 */
import { useState } from 'react'
import { Bot, Wand2, Database, Settings2, Eye, EyeOff, Sun, Moon, Monitor } from 'lucide-react'
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter,
} from '@renderer/components/ui/dialog'
import { Button } from '@renderer/components/ui/button'
import { Input } from '@renderer/components/ui/input'
import { Label } from '@renderer/components/ui/label'
import { Textarea } from '@renderer/components/ui/textarea'
import { Slider } from '@renderer/components/ui/slider'
import { Switch } from '@renderer/components/ui/switch'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@renderer/components/ui/select'
import { ScrollArea } from '@renderer/components/ui/scroll-area'
import { useTheme } from '@renderer/context/ThemeContext'
import { cn } from '@renderer/lib/utils'

type SettingsTab = 'ai-api' | 'prompt-logic' | 'translation-memory' | 'system'

const tabs: { id: SettingsTab; label: string; icon: React.ReactNode }[] = [
  { id: 'ai-api',              label: 'AI & API',            icon: <Bot className="size-4" /> },
  { id: 'prompt-logic',        label: 'Prompt & Logic',      icon: <Wand2 className="size-4" /> },
  { id: 'translation-memory',  label: 'Translation Memory',  icon: <Database className="size-4" /> },
  { id: 'system',              label: 'System',              icon: <Settings2 className="size-4" /> },
]

interface SettingsModalProps {
  open: boolean
  onOpenChange: (open: boolean) => void
}

/**
 * SettingsModal component
 * @param open - Trạng thái mở/đóng của modal
 * @param onOpenChange - Callback khi đóng modal
 */
export function SettingsModal({ open, onOpenChange }: SettingsModalProps) {
  const { theme, setTheme } = useTheme()
  const [activeTab, setActiveTab] = useState<SettingsTab>('ai-api')
  const [showApiKey, setShowApiKey] = useState(false)

  // AI & API
  const [provider, setProvider] = useState('gemini')
  const [apiKey, setApiKey] = useState('')
  const [customEndpoint, setCustomEndpoint] = useState('')
  const [temperature, setTemperature] = useState([0.2])

  // Prompt & Logic
  const [targetLanguage, setTargetLanguage] = useState('Tiếng Việt')
  const [systemPrompt, setSystemPrompt] = useState('')
  const [batchSize, setBatchSize] = useState('20')
  const [concurrentRequests, setConcurrentRequests] = useState('1')

  // Translation Memory
  const [enableAutoFill, setEnableAutoFill] = useState(true)
  const [fuzzyThreshold, setFuzzyThreshold] = useState([100])

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent
        className="max-w-3xl h-[600px] p-0 gap-0 overflow-hidden"
        showCloseButton={false}
      >
        <DialogHeader className="px-6 py-4 border-b border-border">
          <DialogTitle className="text-lg font-semibold">Global Settings</DialogTitle>
        </DialogHeader>

        <div className="flex flex-1 overflow-hidden">
          {/* Left Tab Menu */}
          <nav className="w-48 flex-shrink-0 border-r border-border bg-muted/30 p-2">
            {tabs.map((tab) => (
              <button
                key={tab.id}
                id={`settings-tab-${tab.id}`}
                onClick={() => setActiveTab(tab.id)}
                className={cn(
                  'w-full flex items-center gap-2.5 px-3 py-2 rounded-md text-sm transition-colors text-left',
                  activeTab === tab.id
                    ? 'bg-primary text-primary-foreground font-medium'
                    : 'text-muted-foreground hover:text-foreground hover:bg-muted'
                )}
              >
                {tab.icon}
                {tab.label}
              </button>
            ))}
          </nav>

          {/* Right Content Area */}
          <ScrollArea className="flex-1">
            <div className="p-6 space-y-6">

              {/* ======================== TAB: AI & API ======================== */}
              {activeTab === 'ai-api' && (
                <>
                  <div className="space-y-2">
                    <Label htmlFor="select-provider">Active Provider</Label>
                    <Select value={provider} onValueChange={setProvider}>
                      <SelectTrigger id="select-provider" className="w-full">
                        <SelectValue placeholder="Select provider" />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="gemini">Google Gemini</SelectItem>
                        <SelectItem value="gpt">OpenAI GPT</SelectItem>
                        <SelectItem value="claude">Anthropic Claude</SelectItem>
                        <SelectItem value="deepseek">DeepSeek</SelectItem>
                        <SelectItem value="grok">Grok (xAI)</SelectItem>
                      </SelectContent>
                    </Select>
                    <p className="text-xs text-muted-foreground">Model AI sẽ dùng để dịch.</p>
                  </div>

                  <div className="space-y-2">
                    <Label htmlFor="input-api-key">API Key</Label>
                    <div className="relative">
                      <Input
                        id="input-api-key"
                        type={showApiKey ? 'text' : 'password'}
                        value={apiKey}
                        onChange={(e) => setApiKey(e.target.value)}
                        placeholder="Nhập API key của bạn..."
                        className="pr-10"
                      />
                      <button
                        type="button"
                        onClick={() => setShowApiKey(!showApiKey)}
                        className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground transition-colors"
                      >
                        {showApiKey ? <EyeOff className="size-4" /> : <Eye className="size-4" />}
                      </button>
                    </div>
                    <p className="text-xs text-muted-foreground">
                      API key được lưu cục bộ và không bao giờ gửi lên server.
                    </p>
                  </div>

                  <div className="space-y-2">
                    <Label htmlFor="input-custom-endpoint">Custom Endpoint (tùy chọn)</Label>
                    <Input
                      id="input-custom-endpoint"
                      value={customEndpoint}
                      onChange={(e) => setCustomEndpoint(e.target.value)}
                      placeholder="https://api.example.com/v1"
                    />
                    <p className="text-xs text-muted-foreground">
                      Để trống nếu dùng endpoint mặc định. Dùng cho Local LLM / OpenRouter.
                    </p>
                  </div>

                  <div className="flex justify-start">
                    <Button id="btn-test-connection" variant="outline" size="sm">
                      Test Connection
                    </Button>
                  </div>

                  <div className="space-y-3">
                    <div className="flex items-center justify-between">
                      <Label>Temperature</Label>
                      <span className="text-sm font-mono text-muted-foreground">
                        {temperature[0].toFixed(1)}
                      </span>
                    </div>
                    <Slider
                      value={temperature}
                      onValueChange={setTemperature}
                      min={0} max={1} step={0.1}
                      className="w-full"
                    />
                    <p className="text-xs text-warning flex items-center gap-1.5">
                      ⚠️ Giữ dưới 0.3 để tránh AI bịa thêm tag hoặc quên biến.
                    </p>
                  </div>
                </>
              )}

              {/* ======================== TAB: PROMPT & LOGIC ======================== */}
              {activeTab === 'prompt-logic' && (
                <>
                  <div className="space-y-2">
                    <Label htmlFor="input-target-lang">Target Language</Label>
                    <Input
                      id="input-target-lang"
                      value={targetLanguage}
                      onChange={(e) => setTargetLanguage(e.target.value)}
                      placeholder="ví dụ: Tiếng Việt, Japanese"
                    />
                    <p className="text-xs text-muted-foreground">
                      Ngôn ngữ bạn muốn dịch sang.
                    </p>
                  </div>

                  <div className="space-y-2">
                    <Label htmlFor="textarea-system-prompt">Custom System Prompt</Label>
                    <Textarea
                      id="textarea-system-prompt"
                      value={systemPrompt}
                      onChange={(e) => setSystemPrompt(e.target.value)}
                      placeholder="Nhập hướng dẫn bổ sung cho AI..."
                      className="min-h-[120px]"
                    />
                    <p className="text-xs text-muted-foreground">
                      Hướng dẫn văn phong, lưu ý đặc biệt cho AI dịch.
                    </p>
                  </div>

                  <div className="grid grid-cols-2 gap-4">
                    <div className="space-y-2">
                      <Label htmlFor="input-batch-size">Batch Size</Label>
                      <Input
                        id="input-batch-size"
                        type="number"
                        value={batchSize}
                        onChange={(e) => setBatchSize(e.target.value)}
                        min={1} max={100}
                      />
                      <p className="text-xs text-muted-foreground">Blocks/request (mặc định: 20)</p>
                    </div>
                    <div className="space-y-2">
                      <Label htmlFor="input-concurrent">Concurrent Requests</Label>
                      <Input
                        id="input-concurrent"
                        type="number"
                        value={concurrentRequests}
                        onChange={(e) => setConcurrentRequests(e.target.value)}
                        min={1} max={5}
                      />
                      <p className="text-xs text-muted-foreground">Request song song (1-5)</p>
                    </div>
                  </div>
                </>
              )}

              {/* ======================== TAB: TRANSLATION MEMORY ======================== */}
              {activeTab === 'translation-memory' && (
                <>
                  <div className="flex items-center justify-between p-4 rounded-lg border border-border bg-muted/30">
                    <div className="space-y-0.5">
                      <Label className="text-sm font-medium">Enable Auto-fill from TM</Label>
                      <p className="text-xs text-muted-foreground">
                        Tự động điền từ Translation Memory khi tìm thấy match.
                      </p>
                    </div>
                    <Switch checked={enableAutoFill} onCheckedChange={setEnableAutoFill} />
                  </div>

                  <div className="space-y-3">
                    <div className="flex items-center justify-between">
                      <Label>Fuzzy Match Threshold</Label>
                      <span className="text-sm font-mono text-muted-foreground">{fuzzyThreshold[0]}%</span>
                    </div>
                    <Slider
                      value={fuzzyThreshold}
                      onValueChange={setFuzzyThreshold}
                      min={90} max={100} step={1}
                      className="w-full"
                    />
                    <p className="text-xs text-muted-foreground">
                      100% = khớp chính xác. Giảm xuống để dùng fuzzy matching.
                    </p>
                  </div>
                </>
              )}

              {/* ======================== TAB: SYSTEM ======================== */}
              {activeTab === 'system' && (
                <>
                  {/* Theme Selector */}
                  <div className="space-y-3">
                    <Label>Interface Theme</Label>
                    <div className="grid grid-cols-3 gap-2">
                      {[
                        { value: 'dark' as const,   label: 'Dark',   icon: <Moon className="size-4" /> },
                        { value: 'light' as const,  label: 'Light',  icon: <Sun className="size-4" /> },
                        { value: 'system' as const, label: 'System', icon: <Monitor className="size-4" /> },
                      ].map((option) => (
                        <button
                          key={option.value}
                          id={`btn-theme-${option.value}`}
                          onClick={() => setTheme(option.value)}
                          className={cn(
                            'flex flex-col items-center gap-2 p-3 rounded-lg border text-sm font-medium transition-colors',
                            theme === option.value
                              ? 'border-primary bg-primary/10 text-primary'
                              : 'border-border hover:border-primary/50 text-muted-foreground hover:text-foreground'
                          )}
                        >
                          {option.icon}
                          {option.label}
                        </button>
                      ))}
                    </div>
                    <p className="text-xs text-muted-foreground">
                      Chủ đề giao diện. System sẽ tự động theo cài đặt hệ điều hành.
                    </p>
                  </div>

                  {/* App Info */}
                  <div className="p-4 rounded-lg border border-border bg-muted/30">
                    <h3 className="text-sm font-medium mb-3">Application Info</h3>
                    <div className="space-y-2 text-sm">
                      <div className="flex justify-between">
                        <span className="text-muted-foreground">Version</span>
                        <span className="font-mono">1.0.0-beta</span>
                      </div>
                      <div className="flex justify-between">
                        <span className="text-muted-foreground">Electron</span>
                        <span className="font-mono">v39+</span>
                      </div>
                    </div>
                  </div>

                  <div className="flex gap-2">
                    <Button id="btn-clear-cache" variant="outline" size="sm">Clear Cache</Button>
                    <Button id="btn-reset-settings" variant="outline" size="sm" className="text-destructive hover:text-destructive">
                      Reset Defaults
                    </Button>
                  </div>
                </>
              )}
            </div>
          </ScrollArea>
        </div>

        {/* Modal Footer */}
        <DialogFooter className="px-6 py-4 border-t border-border bg-muted/30">
          <Button variant="outline" onClick={() => onOpenChange(false)}>Cancel</Button>
          <Button id="btn-save-settings" onClick={() => onOpenChange(false)}>Save Changes</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
