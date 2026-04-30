/**
 * ThemeContext.tsx
 * Quản lý chủ đề giao diện (Dark/Light/System) toàn ứng dụng.
 * Đọc theme từ electron-store khi khởi động qua window.api (sẽ kết nối ở Step 3).
 * Hiện tại dùng localStorage làm fallback cho Step 2 (Mock Data).
 */
import { createContext, useContext, useEffect, useState } from 'react'

type Theme = 'dark' | 'light' | 'system'

interface ThemeContextValue {
  theme: Theme
  setTheme: (theme: Theme) => void
  resolvedTheme: 'dark' | 'light' // theme thực sự đang áp dụng (sau khi resolve 'system')
}

const ThemeContext = createContext<ThemeContextValue | null>(null)

const STORAGE_KEY = 'vn-translator-theme'

/**
 * ThemeProvider component
 * Bọc toàn bộ app. Tự động thêm/xóa class 'dark'/'light' trên <html>.
 * @param children React children
 * @param defaultTheme Theme mặc định nếu chưa có giá trị lưu
 */
export function ThemeProvider({
  children,
  defaultTheme = 'dark',
}: {
  children: React.ReactNode
  defaultTheme?: Theme
}) {
  // Đọc từ localStorage trước (sau này sẽ thay bằng electron-store qua IPC)
  const [theme, setThemeState] = useState<Theme>(() => {
    const stored = localStorage.getItem(STORAGE_KEY) as Theme | null
    return stored ?? defaultTheme
  })

  // Tính toán resolvedTheme dựa trên system preference nếu chọn 'system'
  const getResolvedTheme = (t: Theme): 'dark' | 'light' => {
    if (t === 'system') {
      return window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light'
    }
    return t
  }

  const [resolvedTheme, setResolvedTheme] = useState<'dark' | 'light'>(() =>
    getResolvedTheme(theme)
  )

  useEffect(() => {
    const resolved = getResolvedTheme(theme)
    setResolvedTheme(resolved)

    // Áp dụng class lên <html> element
    const root = document.documentElement
    root.classList.remove('dark', 'light')
    root.classList.add(resolved)

    // Lưu preference
    localStorage.setItem(STORAGE_KEY, theme)
  }, [theme])

  // Lắng nghe thay đổi system preference khi đang ở mode 'system'
  useEffect(() => {
    if (theme !== 'system') return

    const mediaQuery = window.matchMedia('(prefers-color-scheme: dark)')
    const handleChange = () => {
      const resolved = getResolvedTheme('system')
      setResolvedTheme(resolved)
      const root = document.documentElement
      root.classList.remove('dark', 'light')
      root.classList.add(resolved)
    }

    mediaQuery.addEventListener('change', handleChange)
    return () => mediaQuery.removeEventListener('change', handleChange)
  }, [theme])

  const setTheme = (newTheme: Theme) => {
    setThemeState(newTheme)
  }

  return (
    <ThemeContext.Provider value={{ theme, setTheme, resolvedTheme }}>
      {children}
    </ThemeContext.Provider>
  )
}

/**
 * Hook để sử dụng ThemeContext trong bất kỳ component nào.
 * @returns { theme, setTheme, resolvedTheme }
 */
export function useTheme(): ThemeContextValue {
  const context = useContext(ThemeContext)
  if (!context) {
    throw new Error('useTheme phải được dùng bên trong ThemeProvider')
  }
  return context
}
