import { createContext, useContext, useEffect, useMemo, useState, ReactNode } from 'react'
import { useColorScheme } from 'react-native'
import AsyncStorage from '@react-native-async-storage/async-storage'
import { ColorPalette, ColorScheme, getColors } from './tokens'

const STORAGE_KEY = 'veriskill:theme'

type ThemeOverride = ColorScheme | 'system'

interface ThemeContextValue {
  scheme: ColorScheme          // The scheme actually in use
  colors: ColorPalette
  override: ThemeOverride      // What the user chose: light, dark, or follow system
  setOverride: (next: ThemeOverride) => void
  toggle: () => void           // light ↔ dark; "system" resolves to its opposite
}

const ThemeContext = createContext<ThemeContextValue | null>(null)

export function ThemeProvider({ children }: { children: ReactNode }) {
  const systemScheme = useColorScheme() ?? 'light'
  const [override, setOverrideState] = useState<ThemeOverride>('system')
  const [hydrated, setHydrated] = useState(false)

  useEffect(() => {
    let active = true
    AsyncStorage.getItem(STORAGE_KEY).then(v => {
      if (!active) return
      if (v === 'light' || v === 'dark' || v === 'system') setOverrideState(v)
      setHydrated(true)
    }).catch(() => { if (active) setHydrated(true) })
    return () => { active = false }
  }, [])

  const scheme: ColorScheme = override === 'system' ? systemScheme : override
  const colors = useMemo(() => getColors(scheme), [scheme])

  const setOverride = (next: ThemeOverride) => {
    setOverrideState(next)
    AsyncStorage.setItem(STORAGE_KEY, next).catch(() => {})
  }

  const toggle = () => setOverride(scheme === 'dark' ? 'light' : 'dark')

  const value: ThemeContextValue = { scheme, colors, override, setOverride, toggle }

  // Render children regardless of hydration — initial frame uses system scheme,
  // and the stored override applies on the following frame. This avoids a
  // blocking splash and matches the web pre-hydration approach.
  void hydrated
  return <ThemeContext.Provider value={value}>{children}</ThemeContext.Provider>
}

export function useTheme(): ThemeContextValue {
  const ctx = useContext(ThemeContext)
  if (!ctx) throw new Error('useTheme must be used within <ThemeProvider>')
  return ctx
}

export function useColors(): ColorPalette {
  return useTheme().colors
}
