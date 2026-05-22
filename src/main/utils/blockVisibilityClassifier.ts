import { TranslationBlock } from '../../shared/types'

export type BlockVisibility = 'visible' | 'hidden'
export type HiddenReason = 'dialogue' | 'ui_text' | 'format_token' | 'symbol_only' | 'numeric_only' | 'script_meta' | 'mixed'

export interface VisibilityResult {
  visibility: BlockVisibility
  reason: HiddenReason
}

interface ClassifierCase {
  name: string
  block: Pick<TranslationBlock, 'block_type' | 'original_text'>
  expected: VisibilityResult
}

function isSymbolOnly(text: string): boolean {
  return /^[^\p{L}\p{N}]+$/u.test(text)
}

function isNumericOnly(text: string): boolean {
  return /^[\d\s.,:+\-/%]+$/.test(text)
}

function looksLikeFormatTokenOnly(text: string): boolean {
  if (!/%[A-Za-z]/.test(text) && !/\{#[^}]+\}/.test(text)) return false
  const stripped = text
    .replace(/\{#[^}]+\}/g, '')
    .replace(/%[0-9]*[$]?[A-Za-z]/g, '')
    .replace(/[\s.,:+\-/%_()\[\]{}'"`~|\\]+/g, '')
  return stripped.length === 0
}

function looksLikeScriptMeta(text: string): boolean {
  if (/^\{#/.test(text)) return true
  if (/^(jump|call|label|scene|show|hide|play|stop|menu|python):?/i.test(text.trim())) return true
  return false
}

export function classifyBlockVisibility(block: Pick<TranslationBlock, 'block_type' | 'original_text'>): VisibilityResult {
  const raw = block.original_text ?? ''
  const text = raw.trim()

  if (!text) return { visibility: 'hidden', reason: 'symbol_only' }
  if (isNumericOnly(text)) return { visibility: 'hidden', reason: 'numeric_only' }
  if (isSymbolOnly(text)) return { visibility: 'hidden', reason: 'symbol_only' }
  if (looksLikeFormatTokenOnly(text)) return { visibility: 'hidden', reason: 'format_token' }
  if (looksLikeScriptMeta(text)) return { visibility: 'hidden', reason: 'script_meta' }

  if (block.block_type === 'dialogue') return { visibility: 'visible', reason: 'dialogue' }

  const hasLetters = /\p{L}/u.test(text)
  if (hasLetters) return { visibility: 'visible', reason: 'ui_text' }

  return { visibility: 'visible', reason: 'mixed' }
}

export function runMandatoryClassifierTestCases(): { passed: number; failed: string[] } {
  const cases: ClassifierCase[] = [
    {
      name: 'Format token sample from screens.rpy',
      block: { block_type: 'string', original_text: '{#file_time}%A, %d de %B %Y, %H:%M' },
      expected: { visibility: 'hidden', reason: 'format_token' },
    },
    {
      name: 'Numeric only',
      block: { block_type: 'string', original_text: '12345' },
      expected: { visibility: 'hidden', reason: 'numeric_only' },
    },
    {
      name: 'Symbol only',
      block: { block_type: 'string', original_text: '...?!' },
      expected: { visibility: 'hidden', reason: 'symbol_only' },
    },
    {
      name: 'Script meta tag',
      block: { block_type: 'string', original_text: '{#meta_block}' },
      expected: { visibility: 'hidden', reason: 'script_meta' },
    },
    {
      name: 'Dialogue visible',
      block: { block_type: 'dialogue', original_text: 'I should go now.' },
      expected: { visibility: 'visible', reason: 'dialogue' },
    },
    {
      name: 'UI string visible',
      block: { block_type: 'string', original_text: 'Start Game' },
      expected: { visibility: 'visible', reason: 'ui_text' },
    },
  ]

  const failed: string[] = []
  for (const c of cases) {
    const actual = classifyBlockVisibility(c.block)
    if (actual.visibility !== c.expected.visibility || actual.reason !== c.expected.reason) {
      failed.push(`${c.name}: expected=${c.expected.visibility}/${c.expected.reason}, actual=${actual.visibility}/${actual.reason}`)
    }
  }
  return { passed: cases.length - failed.length, failed }
}
