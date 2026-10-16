/** An element picked in the Preview ("Click to change"), as the page described it. */
export interface PickedElement {
  tag: string
  id?: string
  classes: string[]
  /** Visible text, trimmed. */
  text?: string
  /** A CSS path that finds it again. */
  selector: string
  /** Its opening tag (or the whole element when short). */
  html: string
  /** Position and size in the preview, CSS pixels. */
  rect: { x: number; y: number; width: number; height: number }
  attrs: Record<string, string>
  /** Component names from the framework's dev tools data, innermost first. */
  components?: string[]
  framework?: 'react' | 'vue' | 'svelte'
  /** Source file (and line) when the framework's dev build records it. */
  source?: string
  /** Page the element was on. */
  url: string
  styles?: Record<string, string>
}

const clip = (s: string, n: number) => (s.length > n ? `${s.slice(0, n - 1)}…` : s)

/** How a Click to change message starts (the Usage saver reads only the requested change). */
export const PICK_PREFIX = 'Change this element in the running app'

/** The part you typed, from a Click to change message; undefined for other messages. */
export function pickRequest(text: string): string | undefined {
  if (!text.startsWith(PICK_PREFIX)) return undefined
  return /\nRequested change: ([^\n]+)/.exec(text)?.[1]
}

/** The message Claude gets (with a screenshot of the element attached). */
export function changePrompt(el: PickedElement, request: string): string {
  const label = `<${el.tag}${el.id ? ` id="${el.id}"` : ''}${el.classes.length ? ` class="${el.classes.join(' ')}"` : ''}>`
  const lines = [
    `${PICK_PREFIX} (picked in Harness's preview at ${el.url}; a screenshot of it is attached):`,
    `- Element: ${clip(label, 200)}${el.text ? ` with text "${clip(el.text, 120)}"` : ''}`,
    `- Selector: ${clip(el.selector, 240)}`,
  ]
  if (el.components?.length) lines.push(`- Component${el.components.length > 1 ? 's' : ''} (${el.framework}): ${el.components.join(' › ')}`)
  if (el.source) lines.push(`- Source: ${el.source}`)
  const attrs = Object.entries(el.attrs)
  if (attrs.length) lines.push(`- Attributes: ${attrs.map(([k, v]) => `${k}="${clip(v, 80)}"`).join(' ')}`)
  if (el.styles && Object.keys(el.styles).length) lines.push(`- Current style: ${Object.entries(el.styles).map(([k, v]) => `${k}: ${v}`).join('; ')}`)
  lines.push(`- On screen: ${Math.round(el.rect.width)}×${Math.round(el.rect.height)} px`, `- HTML: ${clip(el.html, 400)}`, '', `Requested change: ${request.trim()}`, '')
  lines.push(
    el.source
      ? 'Make the change in that source file, keep everything else as it is, and check the result in the preview.'
      : 'Find where this element comes from (search for its text, classes or component name), make the change, keep everything else as it is, and check the result in the preview.',
  )
  return lines.join('\n')
}
