export function getErrorMessage(error: unknown, fallback = 'Unknown error'): string {
  if (error instanceof Error) {
    return error.message || fallback
  }

  if (typeof error === 'string') {
    return error || fallback
  }

  if (error === null || error === undefined) {
    return fallback
  }

  return String(error)
}

export function formatErrorMessage(prefix: string, error: unknown, fallback?: string): string {
  const detail = getErrorMessage(error, fallback)
  return `${prefix}: ${detail}`
}
