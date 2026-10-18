// Light/dark theme: the stored choice wins, `system` follows prefers-color-scheme. The theme is a single
// `data-theme` attribute on <html>; style.css keys every colour off it. index.html sets it before first paint
// with the same rule (keep the two in step), so this module only re-applies it on a toggle or an OS change.
import type { Theme } from '../store/storage'

export type Resolved = 'light' | 'dark'

const DARK_QUERY = '(prefers-color-scheme: dark)'

export function resolveTheme(theme: Theme, prefersDark: boolean): Resolved {
  if (theme === 'light' || theme === 'dark') return theme
  return prefersDark ? 'dark' : 'light'
}

/** The choice a toggle press stores: the opposite of what is on screen now, always explicit. */
export function nextTheme(current: Resolved): Theme {
  return current === 'dark' ? 'light' : 'dark'
}

export function prefersDark(): boolean {
  return window.matchMedia(DARK_QUERY).matches
}

export function applyTheme(theme: Theme): Resolved {
  const resolved = resolveTheme(theme, prefersDark())
  document.documentElement.dataset.theme = resolved
  return resolved
}

/** Re-apply on an OS theme change while the stored choice is `system`. */
export function watchSystemTheme(current: () => Theme, onChange: (resolved: Resolved) => void): void {
  window.matchMedia(DARK_QUERY).addEventListener('change', () => {
    if (current() === 'system') onChange(applyTheme('system'))
  })
}
