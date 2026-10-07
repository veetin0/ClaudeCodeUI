export const isMac = (typeof window !== 'undefined' ? window.harness?.platform : undefined) === 'darwin'

/**
 * Shortcut labels are written the macOS way ("⇧⌘T", "Run ⌘⏎"); elsewhere they read
 * "Ctrl+Shift+T" and "Ctrl+Enter", matching what the keys actually are there (CmdOrCtrl).
 */
export function shortcut(text: string, mac = isMac): string {
  if (mac) return text
  return text
    .replace(/([⇧⌥⌃]*)⌘([⇧⌥⌃]*)/g, (_m, a: string, b: string) => {
      const mods = a + b
      return `Ctrl+${mods.includes('⇧') ? 'Shift+' : ''}${mods.includes('⌥') ? 'Alt+' : ''}`
    })
    .replace(/⏎/g, 'Enter')
}
