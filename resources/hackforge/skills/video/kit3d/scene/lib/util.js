// Small shared helpers: easing, a seeded random, texture loading, canvas text cards.
import * as THREE from 'three'

export const clamp = (x, a = 0, b = 1) => Math.min(b, Math.max(a, x))
export const lerp = (a, b, u) => a + (b - a) * u
export const sstep = (a, b, x) => {
  const u = clamp((x - a) / (b - a))
  return u * u * (3 - 2 * u)
}
export const easeInOut = (u) => (u < 0.5 ? 4 * u * u * u : 1 - Math.pow(-2 * u + 2, 3) / 2)
export const easeOutBack = (u, k = 1.7) => 1 + (k + 1) * Math.pow(u - 1, 3) + k * Math.pow(u - 1, 2)
export const spring = (dt, f = 24, d = 9) => (dt < 0 ? 0 : Math.exp(-dt * d) * Math.cos(dt * f))
export const pulse = (t, at, w) => Math.exp(-Math.pow((t - at) / w, 2))
export const centreOf = (r) => [r.x + r.w / 2, r.y + r.h / 2]

/** A seeded random in [0, 1): the same scene every render. */
export function rng(seed) {
  return () => {
    seed |= 0
    seed = (seed + 0x6d2b79f5) | 0
    let t = Math.imul(seed ^ (seed >>> 15), 1 | seed)
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}

const loader = new THREE.TextureLoader()
/** A colour texture from the film folder (sRGB, mipmapped, sharp at an angle). */
export const loadTex = (file) =>
  new Promise((res, rej) =>
    loader.load(
      `/${file}`,
      (t) => {
        t.colorSpace = THREE.SRGBColorSpace
        t.anisotropy = 8
        t.minFilter = THREE.LinearMipmapLinearFilter
        res(t)
      },
      undefined,
      rej,
    ),
  )

/** An app-style card (dark, rounded, a coloured dot, one line of text) as a texture. */
export function cardTexture(text, { dot = '#ff6b5a', w = 720, h = 200, bg = '#1f1a17', edge = '#4a3d36', ink = '#f4ece6', size = 54 } = {}) {
  const c = document.createElement('canvas')
  c.width = w
  c.height = h
  const x = c.getContext('2d')
  x.fillStyle = bg
  x.strokeStyle = edge
  x.lineWidth = 4
  x.beginPath()
  x.roundRect(6, 6, w - 12, h - 12, 36)
  x.fill()
  x.stroke()
  let tx = 48
  if (dot) {
    x.fillStyle = dot
    x.beginPath()
    x.arc(64, h / 2, 18, 0, Math.PI * 2)
    x.fill()
    tx = 104
  }
  x.fillStyle = ink
  x.font = `600 ${size}px Inter, "Helvetica Neue", Arial, sans-serif`
  x.textBaseline = 'middle'
  x.fillText(text, tx, h / 2 + 2, w - tx - 40)
  const t = new THREE.CanvasTexture(c)
  t.colorSpace = THREE.SRGBColorSpace
  t.anisotropy = 8
  return t
}
