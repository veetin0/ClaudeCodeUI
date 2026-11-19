import type { AppSettings } from '@shared/ipc'

export type Theme = AppSettings['theme']

/** A copy of the theme in localStorage, so the first frame already has it (settings load async). */
const KEY = 'harness-theme'

export function applyTheme(theme: Theme): void {
  document.documentElement.dataset.theme = theme
  try {
    localStorage.setItem(KEY, theme)
  } catch {
    // Storage can be unavailable; the setting still applies for this run.
  }
}

/** Before the first render: the last theme used, or the 8-bit default. */
export function bootTheme(): void {
  let theme: Theme = 'pixel'
  try {
    const saved = localStorage.getItem(KEY)
    if (saved === 'pixel' || saved === 'classic') theme = saved
  } catch {
    // Keep the default.
  }
  document.documentElement.dataset.theme = theme
}
