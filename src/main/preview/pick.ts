import type { WebContents, WebFrameMain } from 'electron'
import type { ImageAttachment } from '@shared/events'
import type { PickedElement } from '@shared/pick'

/**
 * Runs inside the previewed page: outlines the element under the mouse, and on click resolves with
 * a description of it (Escape or cancel resolves null). Leaves nothing behind afterwards.
 */
export const PICK_SCRIPT = String.raw`new Promise((resolve) => {
  if (window.__harnessPickCancel) window.__harnessPickCancel()
  const ACCENT = '#d97757'
  const box = document.createElement('div')
  box.style.cssText = 'position:fixed;z-index:2147483647;pointer-events:none;border:2px solid ' + ACCENT + ';background:rgba(217,119,87,.12);border-radius:3px;display:none'
  const tag = document.createElement('div')
  tag.style.cssText = 'position:fixed;z-index:2147483647;pointer-events:none;background:' + ACCENT + ';color:#fff;font:11px/1.5 -apple-system,system-ui,sans-serif;padding:1px 6px;border-radius:3px;white-space:nowrap;display:none'
  document.documentElement.append(box, tag)
  const cursor = document.documentElement.style.cursor
  document.documentElement.style.cursor = 'crosshair'
  let current = null
  const short = (el) => el.tagName.toLowerCase() + (el.id ? '#' + el.id : '') + [...el.classList].filter((c) => !c.includes(':') && c.length < 30).slice(0, 2).map((c) => '.' + c).join('')
  const cssPath = (el) => {
    const parts = []
    for (let e = el, i = 0; e && e.nodeType === 1 && e !== document.documentElement && i < 6; e = e.parentElement, i++) {
      if (e.id && /^[A-Za-z][\w-]*$/.test(e.id)) { parts.unshift('#' + e.id); break }
      let p = e.tagName.toLowerCase()
      const cls = [...e.classList].filter((c) => /^[A-Za-z_][\w-]*$/.test(c) && c.length < 30).slice(0, 2)
      if (cls.length) p += '.' + cls.join('.')
      const parent = e.parentElement
      if (parent) {
        const same = [...parent.children].filter((c) => c.tagName === e.tagName)
        if (same.length > 1) p += ':nth-of-type(' + (same.indexOf(e) + 1) + ')'
      }
      parts.unshift(p)
    }
    return parts.join(' > ')
  }
  const framework = (el) => {
    for (let e = el; e; e = e.parentElement) {
      const key = Object.keys(e).find((k) => k.startsWith('__reactFiber$'))
      if (key) {
        const names = []
        let source
        for (let f = e[key]; f && names.length < 4; f = f.return) {
          const t = f.type
          const name = typeof t === 'function' ? t.displayName || t.name : t && typeof t === 'object' ? t.displayName || (t.render && (t.render.displayName || t.render.name)) : null
          if (name && /^[A-Z]/.test(name) && !names.includes(name)) names.push(name)
          if (!source && f._debugSource) source = f._debugSource.fileName + ':' + f._debugSource.lineNumber
        }
        return { framework: 'react', components: names, source }
      }
      if (e.__vueParentComponent) {
        const names = []
        let file
        for (let c = e.__vueParentComponent; c && names.length < 4; c = c.parent) {
          const n = c.type && (c.type.__name || c.type.name)
          if (n && !names.includes(n)) names.push(n)
          if (!file && c.type && c.type.__file) file = c.type.__file
        }
        return { framework: 'vue', components: names, source: file }
      }
      if (e.__svelte_meta && e.__svelte_meta.loc) {
        const l = e.__svelte_meta.loc
        return { framework: 'svelte', components: [], source: l.file + ':' + l.line }
      }
    }
    return {}
  }
  const describe = (el) => {
    const r = el.getBoundingClientRect()
    const attrs = {}
    for (const a of ['role', 'aria-label', 'data-testid', 'name', 'type', 'href', 'alt', 'placeholder', 'title']) {
      const v = el.getAttribute(a)
      if (v) attrs[a] = v.slice(0, 120)
    }
    const s = getComputedStyle(el)
    const styles = { color: s.color, background: s.backgroundColor, 'font-size': s.fontSize, 'font-weight': s.fontWeight, padding: s.padding, 'border-radius': s.borderRadius }
    const outer = el.outerHTML
    const html = outer.length <= 400 ? outer : el.cloneNode(false).outerHTML.replace(/<\/[^>]+>$/, '') + '…'
    const fw = framework(el)
    return {
      tag: el.tagName.toLowerCase(),
      id: el.id || undefined,
      classes: [...el.classList].slice(0, 12),
      text: (el.innerText || el.textContent || '').trim().replace(/\s+/g, ' ').slice(0, 160) || undefined,
      selector: cssPath(el),
      html,
      rect: { x: r.left, y: r.top, width: r.width, height: r.height },
      attrs,
      components: fw.components && fw.components.length ? fw.components : undefined,
      framework: fw.framework,
      source: fw.source,
      url: location.href,
      styles,
    }
  }
  const show = (el) => {
    const r = el.getBoundingClientRect()
    Object.assign(box.style, { display: 'block', left: r.left + 'px', top: r.top + 'px', width: r.width + 'px', height: r.height + 'px' })
    tag.textContent = short(el) + '  ' + Math.round(r.width) + '×' + Math.round(r.height)
    Object.assign(tag.style, { display: 'block', left: Math.max(2, r.left) + 'px', top: (r.top > 22 ? r.top - 20 : r.bottom + 4) + 'px' })
  }
  const move = (e) => {
    const el = document.elementFromPoint(e.clientX, e.clientY)
    if (el && el !== current && el !== box && el !== tag) { current = el; show(el) }
  }
  const block = (e) => { e.preventDefault(); e.stopPropagation() }
  const done = (value) => {
    removeEventListener('mousemove', move, true)
    for (const t of ['pointerdown', 'mousedown', 'pointerup', 'mouseup']) removeEventListener(t, block, true)
    removeEventListener('click', click, true)
    removeEventListener('keydown', key, true)
    box.remove()
    tag.remove()
    document.documentElement.style.cursor = cursor
    delete window.__harnessPickCancel
    resolve(value)
  }
  const click = (e) => { block(e); const el = current || e.target; done(el && el.nodeType === 1 ? describe(el) : null) }
  const key = (e) => { if (e.key === 'Escape') { block(e); done(null) } }
  window.__harnessPickCancel = () => done(null)
  addEventListener('mousemove', move, true)
  for (const t of ['pointerdown', 'mousedown', 'pointerup', 'mouseup']) addEventListener(t, block, true)
  addEventListener('click', click, true)
  addEventListener('keydown', key, true)
})`

const originOf = (url: string) => {
  try {
    return new URL(url).origin
  } catch {
    return null
  }
}

/** The preview's frame: the subframe showing the previewed origin. */
function previewFrame(wc: WebContents, url: string): WebFrameMain | undefined {
  const origin = originOf(url)
  return wc.mainFrame.framesInSubtree.find((f) => f !== wc.mainFrame && originOf(f.url) === origin)
}

export interface Rect {
  x: number
  y: number
  width: number
  height: number
}

/**
 * Lets you click an element in the preview and returns its description plus a screenshot of it
 * (with a little margin), or null when you cancel.
 */
export async function pickElement(wc: WebContents, url: string, frame: Rect): Promise<{ element: PickedElement; image?: ImageAttachment } | null> {
  const f = previewFrame(wc, url)
  if (!f) throw new Error('The preview isn’t loaded yet.')
  const element = (await f.executeJavaScript(PICK_SCRIPT, true)) as PickedElement | null
  if (!element) return null
  // Let the outline disappear from the screen before the screenshot.
  await new Promise((r) => setTimeout(r, 120))
  const pad = 10
  const left = Math.max(frame.x, frame.x + element.rect.x - pad)
  const top = Math.max(frame.y, frame.y + element.rect.y - pad)
  const right = Math.min(frame.x + frame.width, frame.x + element.rect.x + element.rect.width + pad)
  const bottom = Math.min(frame.y + frame.height, frame.y + element.rect.y + element.rect.height + pad)
  if (right - left < 4 || bottom - top < 4) return { element }
  let img = await wc.capturePage({ x: Math.round(left), y: Math.round(top), width: Math.round(right - left), height: Math.round(bottom - top) })
  if (img.getSize().width > 1200) img = img.resize({ width: 1200 })
  return { element, image: { mediaType: 'image/jpeg', data: img.toJPEG(85).toString('base64') } }
}

export async function cancelPick(wc: WebContents, url: string) {
  await previewFrame(wc, url)
    ?.executeJavaScript('window.__harnessPickCancel && window.__harnessPickCancel()')
    .catch(() => {})
}
