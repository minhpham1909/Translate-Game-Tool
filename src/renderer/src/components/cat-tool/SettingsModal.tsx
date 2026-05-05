/**
 * SettingsModal.tsx
 * Modal cài đặt toàn cục, kết nối vào AppSettings (Phase 5 schema).
 * Có 4 tab: AI & API, Prompt & Logic, Translation Memory, System.
 */
import { useEffect, useState, useRef, useCallback } from 'react'
import { Bot, Wand2, Database, Settings2, Eye, EyeOff, Sun, Moon, Monitor, Filter, Plus, Trash2, Search, Check, ChevronDown } from 'lucide-react'
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter,
} from '@renderer/components/ui/dialog'
import { Button } from '@renderer/components/ui/button'
import { Input } from '@renderer/components/ui/input'
import { Label } from '@renderer/components/ui/label'
import { Textarea } from '@renderer/components/ui/textarea'
import { Slider } from '@renderer/components/ui/slider'
import { Switch } from '@renderer/components/ui/switch'
import { ScrollArea } from '@renderer/components/ui/scroll-area'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@renderer/components/ui/select'
import { useTheme } from '@renderer/context/ThemeContext'
import { useNotification } from '@renderer/context/NotificationContext'
import { cn } from '@renderer/lib/utils'
import { TARGET_LANGUAGES, normalizeLanguageCode } from '../../../../shared/types'
import type { ActiveProviderId, AIProviderConfig, BlacklistPattern } from '../../../../shared/types'

type SettingsTab = 'ai-api' | 'prompt-logic' | 'translation-memory' | 'text-filter' | 'system'

const tabs: { id: SettingsTab; label: string; icon: React.ReactNode }[] = [
  { id: 'ai-api',              label: 'AI & API',            icon: <Bot className="size-4" /> },
  { id: 'prompt-logic',        label: 'Prompt & Logic',      icon: <Wand2 className="size-4" /> },
  { id: 'translation-memory',  label: 'Translation Memory',  icon: <Database className="size-4" /> },
  { id: 'text-filter',         label: 'Text Filter',         icon: <Filter className="size-4" /> },
  { id: 'system',              label: 'System',              icon: <Settings2 className="size-4" /> },
]

const providerOptions: { id: ActiveProviderId; label: string; description: string }[] = [
  { id: 'gemini', label: 'Google Gemini', description: 'Gemini 2.5 Pro / Flash' },
  { id: 'openai_compatible', label: 'OpenAI Compatible', description: 'GPT, DeepSeek, Grok, OpenRouter, Local LLM' },
  { id: 'claude', label: 'Anthropic Claude', description: 'Claude Sonnet / Opus / Haiku' },
]

interface SettingsModalProps {
  open: boolean
  onOpenChange: (open: boolean) => void
}

export function SettingsModal({ open, onOpenChange }: SettingsModalProps) {
  const { theme, setTheme } = useTheme()
  const notify = useNotification()
  const [activeTab, setActiveTab] = useState<SettingsTab>('ai-api')
  const [showApiKey, setShowApiKey] = useState(false)
  const [isTesting, setIsTesting] = useState(false)
  const [availableModels, setAvailableModels] = useState<string[]>([])
  const [modelSearch, setModelSearch] = useState('')
  const [modelDropdownOpen, setModelDropdownOpen] = useState(false)
  const modelDropdownRef = useRef<HTMLDivElement>(null)

  // Provider state
  const [providerId, setProviderId] = useState<ActiveProviderId>('gemini')
  const [providerConfigs, setProviderConfigs] = useState<Record<ActiveProviderId, AIProviderConfig>>({
    gemini: { apiKey: '', baseURL: '', modelId: '', customHeaders: {} },
    openai_compatible: { apiKey: '', baseURL: 'https://api.openai.com/v1', modelId: '', customHeaders: {} },
    claude: { apiKey: '', baseURL: '', modelId: '', customHeaders: {} },
  })

  // Quick-access refs to current provider config
  const currentConfig = providerConfigs[providerId]
  const setField = <K extends keyof AIProviderConfig>(key: K, value: AIProviderConfig[K]) => {
    setProviderConfigs(prev => ({
      ...prev,
      [providerId]: { ...prev[providerId], [key]: value },
    }))
  }

  // Prompt & Logic
  const [targetLanguageCode, setTargetLanguageCode] = useState('vietnamese')
  const [systemPrompt, setSystemPrompt] = useState('')
  const [batchSize, setBatchSize] = useState('20')
  const [concurrentRequests, setConcurrentRequests] = useState('1')
  const [temperature, setTemperature] = useState([0.2])

  // Translation Memory
  const [enableAutoFill, setEnableAutoFill] = useState(true)
  const [fuzzyThreshold, setFuzzyThreshold] = useState([100])
  const [enableSmartGlossary, setEnableSmartGlossary] = useState(true)
  const [enableStrictGlossary, setEnableStrictGlossary] = useState(true)

  // Text Filter (Regex Blacklist)
  const [enableBlacklist, setEnableBlacklist] = useState(true)
  const [blacklistPatterns, setBlacklistPatterns] = useState<BlacklistPattern[]>([])

  // AI Self-Correction
  const [enableSelfCorrection, setEnableSelfCorrection] = useState(true)
  const [maxRetryAttempts, setMaxRetryAttempts] = useState('2')

  // Text Overflow Linter
  const [enableLengthCheck, setEnableLengthCheck] = useState(true)
  const [maxLengthRatio, setMaxLengthRatio] = useState([1.3])

  // Context Windowing
  const [contextWindowSize, setContextWindowSize] = useState([5])

  // Database Storage
  const [customDbFolder, setCustomDbFolder] = useState('')

  // Language Patch
  const [languagePatchKey, setLanguagePatchKey] = useState('K_F8')
  const [languagePatchIcon, setLanguagePatchIcon] = useState(true)

  useEffect(() => {
    if (!open) return
    let cancelled = false
    void window.api.settings.get().then((settings) => {
      if (cancelled) return

      // Extract provider configs
      const providers = settings.providers || {
        gemini: { apiKey: '', baseURL: '', modelId: '', customHeaders: {} },
        openai_compatible: { apiKey: '', baseURL: 'https://api.openai.com/v1', modelId: '', customHeaders: {} },
        claude: { apiKey: '', baseURL: '', modelId: '', customHeaders: {} },
      }

      setProviderConfigs({
        gemini: providers.gemini,
        openai_compatible: providers.openai_compatible,
        claude: providers.claude,
      })
      setProviderId(settings.activeProviderId || 'gemini')
      setTemperature([settings.temperature ?? 0.2])
      setSystemPrompt(settings.userCustomPrompt || '')
      setBatchSize(String(settings.batchSize ?? 20))
      setConcurrentRequests(String(settings.concurrentRequests ?? 1))
      setEnableAutoFill(settings.enableTranslationMemory ?? true)
      setFuzzyThreshold([Math.round((settings.tmFuzzyThreshold ?? 1) * 100)])
      setEnableSmartGlossary(settings.enableSmartGlossary ?? true)
      setEnableStrictGlossary(settings.enableStrictGlossary ?? true)
      setEnableBlacklist(settings.enableRegexBlacklist ?? true)
      setBlacklistPatterns(settings.regexBlacklist ?? [])
      setEnableSelfCorrection(settings.enableSelfCorrection ?? true)
      setMaxRetryAttempts(String(settings.maxRetryAttempts ?? 2))
      setEnableLengthCheck(settings.enableLengthCheck ?? true)
      setMaxLengthRatio([settings.maxLengthRatio ?? 1.3])
      setContextWindowSize([settings.contextWindowSize ?? 5])
      setCustomDbFolder(settings.customDbFolder || '')
      setLanguagePatchKey(settings.languagePatchKey || 'K_F8')
      setLanguagePatchIcon(settings.languagePatchIcon !== false)

      // Normalize target language to code (backward compat with display names)
      const rawLang = settings.targetLanguage || 'vietnamese'
      const normalized = normalizeLanguageCode(rawLang)
      setTargetLanguageCode(normalized)
    })
    return () => { cancelled = true }
  }, [open])

  // Load models when provider changes
  useEffect(() => {
    if (!open) return
    let cancelled = false

    const listModelProvider = providerId === 'openai_compatible' ? 'openai_compatible' : providerId

    void window.api.settings
      .listModels(listModelProvider)
      .then((models) => {
        if (cancelled) return
        setAvailableModels(models)
        const currentModel = providerConfigs[providerId]?.modelId || ''
        if (models.length > 0 && !models.includes(currentModel)) {
          setField('modelId', models[0])
        }
      })
      .catch(() => {
        if (!cancelled) setAvailableModels([])
      })
    return () => { cancelled = true }
  }, [open, providerId])

  // Close model dropdown when clicking outside
  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (modelDropdownRef.current && !modelDropdownRef.current.contains(e.target as Node)) {
        setModelDropdownOpen(false)
      }
    }
    document.addEventListener('mousedown', handleClickOutside)
    return () => document.removeEventListener('mousedown', handleClickOutside)
  }, [])

  // Filtered models based on search
  const filteredModels = modelSearch.trim()
    ? availableModels.filter((m) => m.toLowerCase().includes(modelSearch.toLowerCase()))
    : availableModels

  const handleSelectModel = useCallback((modelId: string) => {
    setField('modelId', modelId)
    setModelSearch('')
    setModelDropdownOpen(false)
  }, [])

  const handleSave = async (): Promise<void> => {
    await window.api.settings.save({
      providers: providerConfigs,
      activeProviderId: providerId,
      temperature: temperature[0],
      targetLanguage: targetLanguageCode,
      userCustomPrompt: systemPrompt,
      batchSize: Number(batchSize) || 20,
      concurrentRequests: Number(concurrentRequests) || 1,
      enableTranslationMemory: enableAutoFill,
      tmFuzzyThreshold: (fuzzyThreshold[0] || 100) / 100,
      enableSmartGlossary,
      enableStrictGlossary,
      enableRegexBlacklist: enableBlacklist,
      regexBlacklist: blacklistPatterns,
      enableSelfCorrection,
      maxRetryAttempts: Number(maxRetryAttempts) || 2,
      enableLengthCheck,
      maxLengthRatio: maxLengthRatio[0],
      contextWindowSize: contextWindowSize[0],
      customDbFolder,
      languagePatchKey,
      languagePatchIcon,
      theme,
    })
    onOpenChange(false)
  }

  const handleTestConnection = async (): Promise<void> => {
    setIsTesting(true)
    try {
      // Temporarily save to apply config for test
      await window.api.settings.save({
        providers: providerConfigs,
        activeProviderId: providerId,
      })
      const result = await window.api.settings.testConnection()
      if (result.ok) {
        notify.success('Connection OK', 'Provider is reachable and API key is valid.')
      } else {
        notify.error('Connection failed', result.error || 'Unable to reach the provider.')
      }
    } finally {
      setIsTesting(false)
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent
        className="max-w-3xl h-[600px] p-0 gap-0 overflow-hidden"
        showCloseButton={false}
      >
        <DialogHeader className="px-6 py-4 border-b border-border">
          <DialogTitle className="text-lg font-semibold">Global Settings</DialogTitle>
        </DialogHeader>

        <div className="flex flex-1 overflow-hidden min-h-0">
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
                  {/* Provider Selection */}
                  <div className="space-y-3">
                    <Label>Active Provider</Label>
                    <div className="grid grid-cols-3 gap-2">
                      {providerOptions.map((opt) => (
                        <button
                          key={opt.id}
                          id={`btn-provider-${opt.id}`}
                          onClick={() => setProviderId(opt.id)}
                          className={cn(
                            'flex flex-col items-start gap-1 p-3 rounded-lg border text-sm transition-colors',
                            providerId === opt.id
                              ? 'border-primary bg-primary/10 text-primary'
                              : 'border-border hover:border-primary/50 text-muted-foreground hover:text-foreground'
                          )}
                        >
                          <span className="font-medium text-xs">{opt.label}</span>
                          <span className="text-[10px] opacity-70 leading-tight">{opt.description}</span>
                        </button>
                      ))}
                    </div>
                  </div>

                  {/* API Key */}
                  <div className="space-y-2">
                    <Label htmlFor="input-api-key">API Key</Label>
                    <div className="relative">
                      <Input
                        id="input-api-key"
                        type={showApiKey ? 'text' : 'password'}
                        value={currentConfig?.apiKey || ''}
                        onChange={(e) => setField('apiKey', e.target.value)}
                        placeholder="Enter your API key..."
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
                      Stored locally. Never sent to any server except the provider's API.
                    </p>
                  </div>

                  {/* Model Selection */}
                  <div className="space-y-2" ref={modelDropdownRef}>
                    <Label>Model</Label>
                    <div className="relative">
                      {/* Trigger */}
                      <button
                        type="button"
                        onClick={() => {
                          setModelDropdownOpen(!modelDropdownOpen)
                          setModelSearch('')
                        }}
                        className="w-full h-9 px-3 text-left text-sm rounded-md border border-input bg-background hover:bg-accent/50 focus:outline-none focus:ring-1 focus:ring-ring flex items-center justify-between gap-2"
                      >
                        <span className={cn('truncate', currentConfig?.modelId ? 'text-foreground' : 'text-muted-foreground')}>
                          {currentConfig?.modelId || 'Select model'}
                        </span>
                        <ChevronDown className={cn('size-4 text-muted-foreground flex-shrink-0 transition-transform', modelDropdownOpen && 'rotate-180')} />
                      </button>

                      {/* Dropdown */}
                      {modelDropdownOpen && (
                        <div className="absolute z-50 w-full mt-1 bg-popover border border-border rounded-md shadow-lg overflow-hidden">
                          {/* Search */}
                          <div className="p-2 border-b border-border">
                            <div className="relative">
                              <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 size-3.5 text-muted-foreground" />
                              <Input
                                autoFocus
                                placeholder="Search models..."
                                value={modelSearch}
                                onChange={(e) => setModelSearch(e.target.value)}
                                className="h-7 text-xs pl-8"
                                onKeyDown={(e) => {
                                  if (e.key === 'Escape') setModelDropdownOpen(false)
                                }}
                              />
                            </div>
                          </div>

                          {/* Model List */}
                          <ScrollArea className="max-h-80">
                            <div className="p-1">
                              {filteredModels.length > 0 ? (
                                filteredModels.map((model) => (
                                  <button
                                    key={model}
                                    type="button"
                                    onClick={() => handleSelectModel(model)}
                                    className={cn(
                                      'w-full flex items-center gap-2 px-2 py-1.5 text-xs rounded-sm hover:bg-accent transition-colors',
                                      model === currentConfig?.modelId && 'bg-accent'
                                    )}
                                  >
                                    <Check className={cn('size-3.5 flex-shrink-0', model === currentConfig?.modelId ? 'text-primary' : 'text-transparent')} />
                                    <span className="truncate">{model}</span>
                                  </button>
                                ))
                              ) : currentConfig?.modelId ? (
                                <button
                                  type="button"
                                  onClick={() => handleSelectModel(currentConfig.modelId)}
                                  className="w-full flex items-center gap-2 px-2 py-1.5 text-xs rounded-sm hover:bg-accent transition-colors bg-accent"
                                >
                                  <Check className="size-3.5 flex-shrink-0 text-primary" />
                                  <span className="truncate">{currentConfig.modelId}</span>
                                </button>
                              ) : (
                                <div className="px-2 py-4 text-center text-xs text-muted-foreground italic">
                                  {modelSearch.trim() ? 'No matching models' : 'No models available'}
                                </div>
                              )}
                            </div>
                          </ScrollArea>
                        </div>
                      )}
                    </div>
                    <p className="text-xs text-muted-foreground">
                      {providerId === 'openai_compatible'
                        ? 'Auto-detected from endpoint. Enter manually if using custom LLM.'
                        : 'Model ID for the selected provider.'}
                    </p>
                  </div>

                  {/* OpenAI Compatible: Base URL */}
                  {providerId === 'openai_compatible' && (
                    <>
                      <div className="space-y-2">
                        <Label htmlFor="input-base-url">Base URL</Label>
                        <Input
                          id="input-base-url"
                          value={currentConfig?.baseURL || ''}
                          onChange={(e) => setField('baseURL', e.target.value)}
                          placeholder="https://api.openai.com/v1"
                        />
                        <p className="text-xs text-muted-foreground">
                          Override for DeepSeek, Grok, OpenRouter, Ollama, etc. Default: OpenAI.
                        </p>
                      </div>

                      <div className="space-y-2">
                        <Label htmlFor="input-custom-headers">Custom Headers (JSON, optional)</Label>
                        <Textarea
                          id="input-custom-headers"
                          value={JSON.stringify(currentConfig?.customHeaders || {}, null, 2)}
                          onChange={(e) => {
                            try {
                              const parsed = JSON.parse(e.target.value)
                              setField('customHeaders', parsed)
                            } catch {
                              // Invalid JSON — ignore until user fixes
                            }
                          }}
                          placeholder={`{\n  "HTTP-Referer": "your-app.com",\n  "X-Title": "VN Translator"\n}`}
                          className="font-mono text-xs min-h-[80px]"
                        />
                        <p className="text-xs text-muted-foreground">
                          Required for OpenRouter (HTTP-Referer, X-Title). Valid JSON only.
                        </p>
                      </div>
                    </>
                  )}

                  {/* Test Connection */}
                  <div className="flex justify-start">
                    <Button
                      id="btn-test-connection"
                      variant="outline"
                      size="sm"
                      onClick={handleTestConnection}
                      disabled={isTesting || !currentConfig?.apiKey}
                    >
                      {isTesting ? 'Testing...' : 'Test Connection'}
                    </Button>
                  </div>

                  {/* Temperature */}
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
                      ⚠️ Keep below 0.3 to avoid AI hallucinating tags or forgetting variables.
                    </p>
                  </div>
                </>
              )}

              {/* ======================== TAB: PROMPT & LOGIC ======================== */}
              {activeTab === 'prompt-logic' && (
                <>
                  <div className="space-y-2">
                    <Label htmlFor="select-target-lang">Target Language</Label>
                    <Select value={targetLanguageCode} onValueChange={setTargetLanguageCode}>
                      <SelectTrigger id="select-target-lang">
                        <SelectValue placeholder="Chọn ngôn ngữ đích..." />
                      </SelectTrigger>
                      <SelectContent>
                        {TARGET_LANGUAGES.map((lang) => (
                          <SelectItem key={lang.code} value={lang.code}>
                            {lang.label}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                    <p className="text-xs text-muted-foreground">
                      Language AI will translate to. Used for folder path (ASCII-safe) and translate header.
                    </p>
                  </div>

                  <div className="space-y-2">
                    <Label htmlFor="textarea-system-prompt">Custom System Prompt</Label>
                    <Textarea
                      id="textarea-system-prompt"
                      value={systemPrompt}
                      onChange={(e) => setSystemPrompt(e.target.value)}
                      placeholder="Additional instructions for AI..."
                      className="min-h-[120px]"
                    />
                    <p className="text-xs text-muted-foreground">
                      Style guidelines, context notes for the translator.
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
                      <p className="text-xs text-muted-foreground">Blocks per request (default: 20)</p>
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
                      <p className="text-xs text-muted-foreground">Parallel requests (1-5)</p>
                    </div>
                  </div>

                  <div className="flex items-center justify-between p-4 rounded-lg border border-border bg-muted/30">
                    <div className="space-y-0.5">
                      <Label className="text-sm font-medium">AI Self-Correction</Label>
                      <p className="text-xs text-muted-foreground">
                        When the linter finds errors (missing tags/vars), the AI automatically retries to fix them.
                      </p>
                    </div>
                    <Switch checked={enableSelfCorrection} onCheckedChange={setEnableSelfCorrection} />
                  </div>

                  {enableSelfCorrection && (
                    <div className="space-y-2">
                      <Label htmlFor="input-max-retries">Max Retry Attempts</Label>
                      <Input
                        id="input-max-retries"
                        type="number"
                        value={maxRetryAttempts}
                        onChange={(e) => setMaxRetryAttempts(e.target.value)}
                        min={1} max={3}
                      />
                      <p className="text-xs text-muted-foreground">
                        1 = quick fix, 2 = thorough (default), 3 = maximum quality (more API cost).
                      </p>
                    </div>
                  )}

                  <div className="flex items-center justify-between p-4 rounded-lg border border-border bg-muted/30">
                    <div className="space-y-0.5">
                      <Label className="text-sm font-medium">Text Overflow Warning</Label>
                      <p className="text-xs text-muted-foreground">
                        Warn when translation is significantly longer than source (can overflow game UI).
                      </p>
                    </div>
                    <Switch checked={enableLengthCheck} onCheckedChange={setEnableLengthCheck} />
                  </div>

                  {enableLengthCheck && (
                    <div className="space-y-3">
                      <div className="flex items-center justify-between">
                        <Label>Max Length Ratio</Label>
                        <span className="text-sm font-mono text-muted-foreground">{maxLengthRatio[0].toFixed(1)}x</span>
                      </div>
                      <Slider
                        value={maxLengthRatio}
                        onValueChange={setMaxLengthRatio}
                        min={1.1} max={2.0} step={0.1}
                        className="w-full"
                      />
                      <p className="text-xs text-muted-foreground">
                        1.3x = Vietnamese typical (30% longer). Lower = stricter.
                      </p>
                    </div>
                  )}

                  <div className="space-y-3">
                    <div className="flex items-center justify-between">
                      <Label>Context Window Size</Label>
                      <span className="text-sm font-mono text-muted-foreground">{contextWindowSize[0]} blocks</span>
                    </div>
                    <Slider
                      value={contextWindowSize}
                      onValueChange={setContextWindowSize}
                      min={0} max={15} step={1}
                      className="w-full"
                    />
                    <p className="text-xs text-muted-foreground">
                      Number of previous translated blocks sent as context to AI (0 = disabled). Helps maintain pronoun/tone consistency.
                    </p>
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
                        Auto-fill from Translation Memory when exact match found.
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
                      100% = exact match only. Lower for fuzzy matching.
                    </p>
                  </div>

                  <div className="flex items-center justify-between p-4 rounded-lg border border-border bg-muted/30">
                    <div className="space-y-0.5">
                      <Label className="text-sm font-medium">Smart Glossary Injection</Label>
                      <p className="text-xs text-muted-foreground">
                        Only inject glossary terms relevant to the current batch. Saves tokens and reduces AI confusion.
                      </p>
                    </div>
                    <Switch checked={enableSmartGlossary} onCheckedChange={setEnableSmartGlossary} />
                  </div>

                  <div className="flex items-center justify-between p-4 rounded-lg border border-border bg-muted/30">
                    <div className="space-y-0.5">
                      <Label className="text-sm font-medium">Strict Glossary Verification</Label>
                      <p className="text-xs text-muted-foreground">
                        Linter checks that glossary terms in source text are translated exactly as specified. Triggers AI self-correction if violated.
                      </p>
                    </div>
                    <Switch checked={enableStrictGlossary} onCheckedChange={setEnableStrictGlossary} />
                  </div>
                </>
              )}

              {/* ======================== TAB: TEXT FILTER ======================== */}
              {activeTab === 'text-filter' && (
                <>
                  <div className="flex items-center justify-between p-4 rounded-lg border border-border bg-muted/30">
                    <div className="space-y-0.5">
                      <Label className="text-sm font-medium">Enable Regex Blacklist</Label>
                      <p className="text-xs text-muted-foreground">
                        Auto-skip strings matching patterns (saves tokens, prevents hallucination).
                      </p>
                    </div>
                    <Switch checked={enableBlacklist} onCheckedChange={setEnableBlacklist} />
                  </div>

                  <div className="space-y-3">
                    <div className="flex items-center justify-between">
                      <Label className="text-sm">Filter Patterns</Label>
                      <Button
                        variant="outline"
                        size="sm"
                        className="h-7 text-xs"
                        onClick={() => {
                          setBlacklistPatterns(prev => [
                            ...prev,
                            { pattern: '', description: 'New pattern', enabled: true },
                          ])
                        }}
                      >
                        <Plus className="size-3 mr-1" /> Add Pattern
                      </Button>
                    </div>

                    <div className="space-y-2">
                      {blacklistPatterns.map((pattern, idx) => (
                        <div
                          key={idx}
                          className="flex items-start gap-2 p-3 rounded-lg border border-border bg-muted/20"
                        >
                          <Switch
                            checked={pattern.enabled}
                            onCheckedChange={(checked) => {
                              setBlacklistPatterns(prev =>
                                prev.map((p, i) => (i === idx ? { ...p, enabled: checked } : p))
                              )
                            }}
                          />
                          <div className="flex-1 space-y-1 min-w-0">
                            <Input
                              value={pattern.description}
                              onChange={(e) => {
                                setBlacklistPatterns(prev =>
                                  prev.map((p, i) => (i === idx ? { ...p, description: e.target.value } : p))
                                )
                              }}
                              placeholder="Description..."
                              className="h-7 text-xs"
                            />
                            <Input
                              value={pattern.pattern}
                              onChange={(e) => {
                                setBlacklistPatterns(prev =>
                                  prev.map((p, i) => (i === idx ? { ...p, pattern: e.target.value } : p))
                                )
                              }}
                              placeholder="Regex pattern (e.g., ^\\s*$)"
                              className="h-7 text-xs font-mono"
                            />
                          </div>
                          <Button
                            variant="ghost"
                            size="sm"
                            className="h-7 w-7 p-0 text-muted-foreground hover:text-destructive flex-shrink-0"
                            onClick={() => {
                              setBlacklistPatterns(prev => prev.filter((_, i) => i !== idx))
                            }}
                          >
                            <Trash2 className="size-3.5" />
                          </Button>
                        </div>
                      ))}

                      {blacklistPatterns.length === 0 && (
                        <div className="text-center py-8 text-muted-foreground text-sm">
                          No patterns configured. Add a pattern to get started.
                        </div>
                      )}
                    </div>

                    <p className="text-xs text-muted-foreground">
                      Common patterns: <code className="bg-muted px-1 py-0.5 rounded">^\s*$</code> (empty),{' '}
                      <code className="bg-muted px-1 py-0.5 rounded">^[^a-zA-Z0-9]+$</code> (symbols only),{' '}
                      <code className="bg-muted px-1 py-0.5 rounded">^[0-9]+$</code> (numbers)
                    </p>
                  </div>
                </>
              )}

              {/* ======================== TAB: SYSTEM ======================== */}
              {activeTab === 'system' && (
                <>
                  <div className="space-y-3">
                    <Label>Language Patch Settings</Label>
                    <p className="text-xs text-muted-foreground">
                      Cấu hình phương thức chuyển đổi ngôn ngữ trong game sau khi export.
                    </p>
                    <div className="grid grid-cols-2 gap-3">
                      <div className="space-y-1">
                        <Label className="text-xs">Shortcut Key</Label>
                        <Select
                          value={languagePatchKey || 'K_F8'}
                          onValueChange={(value) => {
                            setLanguagePatchKey(value)
                          }}
                        >
                          <SelectTrigger className="h-8 text-xs">
                            <SelectValue />
                          </SelectTrigger>
                          <SelectContent>
                            <SelectItem value="K_F8">F8</SelectItem>
                            <SelectItem value="K_F9">F9</SelectItem>
                            <SelectItem value="K_F10">F10</SelectItem>
                            <SelectItem value="K_F11">F11</SelectItem>
                            <SelectItem value="K_F12">F12</SelectItem>
                            <SelectItem value="K_l">Shift + L</SelectItem>
                          </SelectContent>
                        </Select>
                        <p className="text-[10px] text-muted-foreground">
                          Phím tắt trong game để mở Language Switcher
                        </p>
                      </div>
                      <div className="space-y-1">
                        <Label className="text-xs">Show 🔤 Icon</Label>
                        <div className="flex items-center gap-2 pt-1">
                          <Switch
                            checked={languagePatchIcon !== false}
                            onCheckedChange={(checked) => setLanguagePatchIcon(checked)}
                          />
                          <span className="text-xs text-muted-foreground">
                            Hiển thị icon ở góc phải trên để chọn ngôn ngữ
                          </span>
                        </div>
                      </div>
                    </div>
                  </div>

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
                  </div>

                  <div className="space-y-3">
                    <Label>Database Storage Location</Label>
                    <div className="flex items-center gap-2">
                      <Input
                        value={customDbFolder}
                        onChange={(e) => setCustomDbFolder(e.target.value)}
                        placeholder="Default: AppData/Local/vn-translator/db"
                        className="flex-1 text-xs"
                        readOnly
                      />
                      <Button
                        variant="outline"
                        size="sm"
                        className="h-8 text-xs flex-shrink-0"
                        onClick={async () => {
                          const selected = await window.api.settings.selectDbFolder()
                          if (selected) {
                            setCustomDbFolder(selected)
                          }
                        }}
                      >
                        Browse...
                      </Button>
                      {customDbFolder && (
                        <Button
                          variant="ghost"
                          size="sm"
                          className="h-8 text-xs flex-shrink-0"
                          onClick={() => setCustomDbFolder('')}
                        >
                          Reset
                        </Button>
                      )}
                    </div>
                    <p className="text-xs text-muted-foreground">
                      Choose a custom folder to store SQLite database files. Empty = use default location. Each project gets its own file: <code className="bg-muted px-1 py-0.5 rounded">vnt_&lt;GameName&gt;.sqlite</code>
                    </p>
                  </div>

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
                </>
              )}
            </div>
          </ScrollArea>
        </div>

        {/* Footer */}
        <DialogFooter className="px-6 py-4 border-t border-border bg-muted/30">
          <Button variant="outline" onClick={() => onOpenChange(false)}>Cancel</Button>
          <Button id="btn-save-settings" onClick={handleSave}>Save Changes</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
