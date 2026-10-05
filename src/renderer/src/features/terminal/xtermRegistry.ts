import { FitAddon } from '@xterm/addon-fit'
import { Terminal, type ITheme } from '@xterm/xterm'
import '@xterm/xterm/css/xterm.css'

/**
 * xterm instances live outside React: they keep scrollback while a tab is hidden or the panel
 * is closed, and output keeps flowing into them. Components only attach the DOM element.
 */
interface Entry {
  term: Terminal
  fit: FitAddon
  el: HTMLDivElement
}

const entries = new Map<string, Entry>()
let listening = false

const LIGHT: ITheme = { background: '#ffffff', foreground: '#1d1d1f', cursor: '#d97757', selectionBackground: '#d9775740' }
const DARK: ITheme = { background: '#1c1c1e', foreground: '#f5f5f7', cursor: '#d97757', selectionBackground: '#d9775750' }
const dark = () => window.matchMedia('(prefers-color-scheme: dark)')

function listen() {
  if (listening) return
  listening = true
  window.harness.onPtyData((id, data) => entries.get(id)?.term.write(data))
  window.harness.onPtyExit((id, code) => entries.get(id)?.term.write(`\r\n\x1b[2m[process exited with code ${code}]\x1b[0m\r\n`))
  dark().addEventListener('change', (e) => entries.forEach(({ term }) => (term.options.theme = e.matches ? DARK : LIGHT)))
}

export function getTerminal(id: string): Entry {
  listen()
  let e = entries.get(id)
  if (!e) {
    const term = new Terminal({
      fontFamily: '"SF Mono", Menlo, ui-monospace, monospace',
      fontSize: 12,
      cursorBlink: true,
      allowProposedApi: true,
      scrollback: 10_000,
      macOptionIsMeta: true,
      theme: dark().matches ? DARK : LIGHT,
    })
    const fit = new FitAddon()
    term.loadAddon(fit)
    const el = document.createElement('div')
    el.style.height = '100%'
    term.open(el)
    term.onData((d) => window.harness.ptyWrite(id, d))
    term.onResize(({ cols, rows }) => window.harness.ptyResize(id, cols, rows))
    e = { term, fit, el }
    entries.set(id, e)
  }
  return e
}

export function disposeTerminal(id: string) {
  entries.get(id)?.term.dispose()
  entries.delete(id)
}
