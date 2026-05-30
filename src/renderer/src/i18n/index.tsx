import { createContext, useContext, type ReactNode } from 'react'
import { vi } from './vi'

type Dictionary = typeof vi
type DictLeaf = string | Dictionary | Record<string, unknown>

const I18nContext = createContext<Dictionary>(vi)

function lookup(dict: DictLeaf, path: string): string | null {
  const parts = path.split('.')
  let node: DictLeaf = dict
  for (const part of parts) {
    if (typeof node !== 'object' || node == null || !(part in node)) return null
    node = (node as Record<string, unknown>)[part] as DictLeaf
  }
  return typeof node === 'string' ? node : null
}

function interpolate(template: string, vars?: Record<string, string | number>): string {
  if (!vars) return template
  return template.replace(/\{(\w+)\}/g, (_, key: string) => String(vars[key] ?? ''))
}

export function I18nProvider({ children }: { children: ReactNode }) {
  return <I18nContext.Provider value={vi}>{children}</I18nContext.Provider>
}

export function useI18n() {
  const dict = useContext(I18nContext)
  const t = (key: string, vars?: Record<string, string | number>): string => {
    const raw = lookup(dict, key)
    if (!raw) return key
    return interpolate(raw, vars)
  }
  return { t }
}

