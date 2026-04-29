"use client"

import { useState } from "react"
import { Bot, Wand2, Database, Settings2, Eye, EyeOff } from "lucide-react"
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Textarea } from "@/components/ui/textarea"
import { Slider } from "@/components/ui/slider"
import { Switch } from "@/components/ui/switch"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import { ScrollArea } from "@/components/ui/scroll-area"
import { cn } from "@/lib/utils"

interface SettingsModalProps {
  open: boolean
  onOpenChange: (open: boolean) => void
}

type SettingsTab = "ai-api" | "prompt-logic" | "translation-memory" | "system"

const tabs: { id: SettingsTab; label: string; icon: React.ReactNode }[] = [
  { id: "ai-api", label: "AI & API", icon: <Bot className="size-4" /> },
  { id: "prompt-logic", label: "Prompt & Logic", icon: <Wand2 className="size-4" /> },
  { id: "translation-memory", label: "Translation Memory", icon: <Database className="size-4" /> },
  { id: "system", label: "System", icon: <Settings2 className="size-4" /> },
]

export function SettingsModal({ open, onOpenChange }: SettingsModalProps) {
  const [activeTab, setActiveTab] = useState<SettingsTab>("ai-api")
  const [showApiKey, setShowApiKey] = useState(false)

  // AI & API Settings
  const [provider, setProvider] = useState("gemini")
  const [apiKey, setApiKey] = useState("")
  const [temperature, setTemperature] = useState([0.2])

  // Prompt & Logic Settings
  const [targetLanguage, setTargetLanguage] = useState("Vietnamese")
  const [systemPrompt, setSystemPrompt] = useState(
    "You are a professional translator specializing in Visual Novel game localization. Maintain character voice consistency and preserve all format tags like {i}, {b}, [variables]."
  )
  const [batchSize, setBatchSize] = useState("20")
  const [concurrentRequests, setConcurrentRequests] = useState("3")

  // Translation Memory Settings
  const [enableAutoFill, setEnableAutoFill] = useState(true)
  const [fuzzyThreshold, setFuzzyThreshold] = useState([95])

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
                onClick={() => setActiveTab(tab.id)}
                className={cn(
                  "w-full flex items-center gap-2.5 px-3 py-2 rounded-md text-sm transition-colors text-left",
                  activeTab === tab.id
                    ? "bg-primary text-primary-foreground font-medium"
                    : "text-muted-foreground hover:text-foreground hover:bg-muted"
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
              {/* AI & API Tab */}
              {activeTab === "ai-api" && (
                <>
                  <div className="space-y-2">
                    <Label htmlFor="provider">Active Provider</Label>
                    <Select value={provider} onValueChange={setProvider}>
                      <SelectTrigger id="provider" className="w-full">
                        <SelectValue placeholder="Select provider" />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="gemini">Google Gemini</SelectItem>
                        <SelectItem value="openai">OpenAI GPT-4</SelectItem>
                        <SelectItem value="claude">Anthropic Claude</SelectItem>
                        <SelectItem value="local">Local Custom</SelectItem>
                      </SelectContent>
                    </Select>
                    <p className="text-xs text-muted-foreground">
                      Select the AI provider for translation tasks.
                    </p>
                  </div>

                  <div className="space-y-2">
                    <Label htmlFor="api-key">API Key</Label>
                    <div className="relative">
                      <Input
                        id="api-key"
                        type={showApiKey ? "text" : "password"}
                        value={apiKey}
                        onChange={(e) => setApiKey(e.target.value)}
                        placeholder="Enter your API key..."
                        className="pr-10"
                      />
                      <button
                        type="button"
                        onClick={() => setShowApiKey(!showApiKey)}
                        className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground transition-colors"
                      >
                        {showApiKey ? (
                          <EyeOff className="size-4" />
                        ) : (
                          <Eye className="size-4" />
                        )}
                      </button>
                    </div>
                    <p className="text-xs text-muted-foreground">
                      Your API key is stored locally and never sent to our servers.
                    </p>
                  </div>

                  <div className="flex justify-start">
                    <Button variant="outline" size="sm">
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
                      min={0}
                      max={1}
                      step={0.1}
                      className="w-full"
                    />
                    <p className="text-xs text-warning flex items-center gap-1.5">
                      ⚠️ Keep below 0.3 for format stability and consistent output.
                    </p>
                  </div>
                </>
              )}

              {/* Prompt & Logic Tab */}
              {activeTab === "prompt-logic" && (
                <>
                  <div className="space-y-2">
                    <Label htmlFor="target-lang">Target Language</Label>
                    <Input
                      id="target-lang"
                      value={targetLanguage}
                      onChange={(e) => setTargetLanguage(e.target.value)}
                      placeholder="e.g., Vietnamese, Japanese, Korean"
                    />
                    <p className="text-xs text-muted-foreground">
                      The language you are translating into.
                    </p>
                  </div>

                  <div className="space-y-2">
                    <Label htmlFor="system-prompt">Custom System Prompt</Label>
                    <Textarea
                      id="system-prompt"
                      value={systemPrompt}
                      onChange={(e) => setSystemPrompt(e.target.value)}
                      placeholder="Enter custom instructions for the AI..."
                      className="min-h-[120px] resize-none"
                    />
                    <p className="text-xs text-muted-foreground">
                      Contextual rules and guidelines for the AI translator.
                    </p>
                  </div>

                  <div className="grid grid-cols-2 gap-4">
                    <div className="space-y-2">
                      <Label htmlFor="batch-size">Batch Size</Label>
                      <Input
                        id="batch-size"
                        type="number"
                        value={batchSize}
                        onChange={(e) => setBatchSize(e.target.value)}
                        min={1}
                        max={100}
                      />
                      <p className="text-xs text-muted-foreground">
                        Blocks per API request (default: 20)
                      </p>
                    </div>

                    <div className="space-y-2">
                      <Label htmlFor="concurrent">Concurrent Requests</Label>
                      <Input
                        id="concurrent"
                        type="number"
                        value={concurrentRequests}
                        onChange={(e) => setConcurrentRequests(e.target.value)}
                        min={1}
                        max={10}
                      />
                      <p className="text-xs text-muted-foreground">
                        Parallel API calls (1-10)
                      </p>
                    </div>
                  </div>
                </>
              )}

              {/* Translation Memory Tab */}
              {activeTab === "translation-memory" && (
                <>
                  <div className="flex items-center justify-between p-4 rounded-lg border border-border bg-muted/30">
                    <div className="space-y-0.5">
                      <Label className="text-sm font-medium">Enable Auto-fill from TM</Label>
                      <p className="text-xs text-muted-foreground">
                        Automatically fill translations from Translation Memory matches.
                      </p>
                    </div>
                    <Switch
                      checked={enableAutoFill}
                      onCheckedChange={setEnableAutoFill}
                    />
                  </div>

                  <div className="space-y-3">
                    <div className="flex items-center justify-between">
                      <Label>Fuzzy Match Threshold</Label>
                      <span className="text-sm font-mono text-muted-foreground">
                        {fuzzyThreshold[0]}%
                      </span>
                    </div>
                    <Slider
                      value={fuzzyThreshold}
                      onValueChange={setFuzzyThreshold}
                      min={90}
                      max={100}
                      step={1}
                      className="w-full"
                    />
                    <p className="text-xs text-muted-foreground">
                      Minimum similarity percentage for TM suggestions (90-100%).
                    </p>
                  </div>

                  <div className="p-4 rounded-lg border border-border bg-muted/30">
                    <div className="flex items-center justify-between mb-3">
                      <span className="text-sm font-medium">Translation Memory Status</span>
                      <span className="text-xs text-success">Connected</span>
                    </div>
                    <div className="grid grid-cols-2 gap-4 text-sm">
                      <div>
                        <span className="text-muted-foreground">Total entries:</span>
                        <span className="ml-2 font-mono">15,234</span>
                      </div>
                      <div>
                        <span className="text-muted-foreground">Last sync:</span>
                        <span className="ml-2 font-mono">2 min ago</span>
                      </div>
                    </div>
                  </div>
                </>
              )}

              {/* System Tab */}
              {activeTab === "system" && (
                <>
                  <div className="p-4 rounded-lg border border-border bg-muted/30">
                    <h3 className="text-sm font-medium mb-3">Application Info</h3>
                    <div className="space-y-2 text-sm">
                      <div className="flex justify-between">
                        <span className="text-muted-foreground">Version</span>
                        <span className="font-mono">1.0.0-beta</span>
                      </div>
                      <div className="flex justify-between">
                        <span className="text-muted-foreground">Electron</span>
                        <span className="font-mono">28.1.0</span>
                      </div>
                      <div className="flex justify-between">
                        <span className="text-muted-foreground">Node.js</span>
                        <span className="font-mono">20.10.0</span>
                      </div>
                    </div>
                  </div>

                  <div className="space-y-2">
                    <Label>Data Directory</Label>
                    <Input
                      value="~/.vn-localizer/data"
                      readOnly
                      className="font-mono text-sm bg-muted/50"
                    />
                    <p className="text-xs text-muted-foreground">
                      Location where project data and settings are stored.
                    </p>
                  </div>

                  <div className="flex gap-2">
                    <Button variant="outline" size="sm">
                      Clear Cache
                    </Button>
                    <Button variant="outline" size="sm">
                      Export Logs
                    </Button>
                    <Button variant="outline" size="sm" className="text-destructive hover:text-destructive">
                      Reset to Defaults
                    </Button>
                  </div>
                </>
              )}
            </div>
          </ScrollArea>
        </div>

        {/* Modal Footer */}
        <DialogFooter className="px-6 py-4 border-t border-border bg-muted/30">
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          <Button onClick={() => onOpenChange(false)}>
            Save Changes
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
