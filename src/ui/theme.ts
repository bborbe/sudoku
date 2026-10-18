// Theme: system → light → dark, cycled by one button. An explicit choice is a `data-theme` attribute on <html>;
// `system` is no attribute at all, so style.css's prefers-color-scheme block applies and follows an OS change live,
// with no script. index.html sets the attribute before first paint by the same rule (keep the two in step).
import { THEMES, type Theme } from '../store/storage'

/** The next mode a press switches to; anything unknown restarts the cycle at light, like a press from system. */
export function nextTheme(current: Theme): Theme {
  const i = THEMES.indexOf(current)
  return THEMES[(i + 1) % THEMES.length]
}

export function applyTheme(theme: Theme): void {
  const root = document.documentElement
  if (theme === 'system') delete root.dataset.theme
  else root.dataset.theme = theme
}
