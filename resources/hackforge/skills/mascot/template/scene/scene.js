// The character film's Three.js world. Everything is a pure function of time read from
// build/timeline.json, so any frame renders the same every time (window.renderFrame(t)). The hero
// comes from hero.js; the screens are the app's real screenshots on floating slabs.
import * as THREE from 'three'
import { RoundedBoxGeometry } from 'three/addons/geometries/RoundedBoxGeometry.js'
import { MarchingCubes } from 'three/addons/objects/MarchingCubes.js'
import { RoomEnvironment } from 'three/addons/environments/RoomEnvironment.js'
import { RectAreaLightUniformsLib } from 'three/addons/lights/RectAreaLightUniformsLib.js'
import { EffectComposer } from 'three/addons/postprocessing/EffectComposer.js'
import { RenderPass } from 'three/addons/postprocessing/RenderPass.js'
import { BokehPass } from 'three/addons/postprocessing/BokehPass.js'
import { UnrealBloomPass } from 'three/addons/postprocessing/UnrealBloomPass.js'
import { OutputPass } from 'three/addons/postprocessing/OutputPass.js'
import * as HERO from './hero.js'

const Q = new URLSearchParams(location.search)
const W = Number(Q.get('w') ?? 1920)
const H = Number(Q.get('h') ?? 1080)
const SUB = Number(Q.get('sub') ?? 5) // motion-blur subframes
// Tone mapping: Khronos PBR Neutral keeps the body and the logo tile their true colour (AgX greys
// saturated colours out in three.js); a little contrast on top. ?tm=agx&look=0.6 for the AgX look.
const TM = Q.get('tm') ?? 'neutral'
const LOOK = Number(Q.get('look') ?? 0.2)
const GLOW = Number(Q.get('glow') ?? 1.25) // how bright the screens are
document.documentElement.style.setProperty('--h', `${H}px`)

const TL = await (await fetch('/build/timeline.json')).json()
const FPS = TL.fps
const [PX, PY] = TL.ui.px // UI pixels of the captured window
const S = 0.01 // world units per UI pixel
const FLOOR = -1.2 // the studio floor (pedestal top)
const tint = new THREE.Color(TL.hero.color)
document.documentElement.style.setProperty('--tag', `#${tint.clone().lerp(new THREE.Color(0xffffff), 0.45).getHexString()}`)

// ---------- small maths ----------
const clamp = (x, a = 0, b = 1) => Math.min(b, Math.max(a, x))
const lerp = (a, b, u) => a + (b - a) * u
const sstep = (a, b, x) => {
  const u = clamp((x - a) / (b - a))
  return u * u * (3 - 2 * u)
}
const easeInOut = (u) => (u < 0.5 ? 4 * u * u * u : 1 - Math.pow(-2 * u + 2, 3) / 2)
const easeOutBack = (u, k = 1.7) => 1 + (k + 1) * Math.pow(u - 1, 3) + k * Math.pow(u - 1, 2)
const spring = (dt, f = 24, d = 9) => (dt < 0 ? 0 : Math.exp(-dt * d) * Math.cos(dt * f))
function rng(seed) {
  return () => {
    seed |= 0
    seed = (seed + 0x6d2b79f5) | 0
    let t = Math.imul(seed ^ (seed >>> 15), 1 | seed)
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}
/** A UI pixel on the screens → a world point (the screens lie flat, y up). */
const ui = (px, py, y = 0) => new THREE.Vector3((px - PX / 2) * S, y, (py - PY / 2) * S)
const centreOf = (r) => [r.x + r.w / 2, r.y + r.h / 2]

// ---------- renderer ----------
const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true, preserveDrawingBuffer: true, powerPreference: 'high-performance' })
renderer.setPixelRatio(1)
renderer.setSize(W, H)
renderer.toneMapping = { agx: THREE.AgXToneMapping, neutral: THREE.NeutralToneMapping, aces: THREE.ACESFilmicToneMapping }[TM]
renderer.toneMappingExposure = 1.0
renderer.outputColorSpace = THREE.SRGBColorSpace
renderer.shadowMap.enabled = true
renderer.shadowMap.type = THREE.PCFSoftShadowMap
document.body.prepend(renderer.domElement)
RectAreaLightUniformsLib.init()

const scene = new THREE.Scene()
const studio = new THREE.Color(TL.set.studio)
scene.background = studio
scene.fog = new THREE.FogExp2(studio, TL.set.haze ?? 0.011)
// Soft reflections for the toy, dim so nothing blows out on the screens.
const pmrem = new THREE.PMREMGenerator(renderer)
scene.environment = pmrem.fromScene(new RoomEnvironment(), 0.04).texture
scene.environmentIntensity = 0.45

const camera = new THREE.PerspectiveCamera(34, W / H, 0.05, 200)

// Key light follows the hero (tight shadows), a rim from behind, a cool glow up from the screens.
const key = new THREE.DirectionalLight(0xfff1e4, 2.1)
key.castShadow = true
key.shadow.mapSize.set(1536, 1536)
key.shadow.camera.left = key.shadow.camera.bottom = -3.2
key.shadow.camera.right = key.shadow.camera.top = 3.2
key.shadow.camera.near = 0.5
key.shadow.camera.far = 30
key.shadow.bias = -0.0004
key.shadow.normalBias = 0.02
scene.add(key, key.target)
const rim = new THREE.DirectionalLight(0xffc9a8, 1.3)
scene.add(rim, rim.target)
scene.add(new THREE.HemisphereLight(0x6b5a52, 0x0b0705, 0.45))
const logoLight = new THREE.SpotLight(0xfff4ec, 0, 40, 0.45, 0.7, 2)
scene.add(logoLight, logoLight.target)
const screenLight = new THREE.RectAreaLight(0xcfd8ff, 0.9, PX * S * 0.9, PY * S * 0.9)
screenLight.position.set(0, 0.02, 0)
screenLight.lookAt(0, 5, 0)
scene.add(screenLight)

// ---------- the screens ----------
const loader = new THREE.TextureLoader()
const loadTex = (file) =>
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
const tex = Object.fromEntries(await Promise.all(Object.entries(TL.ui.screens).map(async ([name, file]) => [name, await loadTex(file)])))

const screenUniforms = {
  texA: { value: tex[TL.states[0].screen] },
  texB: { value: tex[TL.states[0].screen] },
  uMix: { value: 0 },
  uMode: { value: 0 },
  uCenter: { value: new THREE.Vector2(0.5, 0.5) },
  uTint: { value: tint.clone().lerp(new THREE.Color(0xffffff), 0.15) },
  uAspect: { value: PX / PY },
}
function screenMaterial(rect) {
  return new THREE.ShaderMaterial({
    uniforms: {
      ...screenUniforms,
      uRect: { value: new THREE.Vector4(rect.x / PX, rect.y / PY, rect.w / PX, rect.h / PY) },
      uPx: { value: new THREE.Vector2(PX, PY) },
      uGlow: { value: GLOW },
      uOff: { value: 0 },
    },
    vertexShader: `varying vec2 vUv; void main(){ vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position,1.0); }`,
    fragmentShader: `
      uniform sampler2D texA, texB; uniform float uMix, uMode, uGlow, uOff, uAspect; uniform vec2 uCenter, uPx; uniform vec4 uRect; uniform vec3 uTint;
      varying vec2 vUv;
      void main(){
        vec2 p = vUv;
        // Power down: the picture collapses to a line, like an old screen switching off.
        float squash = 1.0 - uOff * 0.985;
        float lv = 0.5 + (p.y - 0.5) / squash;
        if (lv < 0.0 || lv > 1.0) { gl_FragColor = vec4(0.0, 0.0, 0.0, 1.0); return; }
        vec2 px = vec2(uRect.x + p.x * uRect.z, uRect.y + (1.0 - lv) * uRect.w); // UI coords 0..1, y down
        vec2 uv = vec2(px.x, 1.0 - px.y);
        vec3 a = texture2D(texA, uv).rgb;
        vec3 b = texture2D(texB, uv).rgb;
        float m = uMix; float edge = 0.0;
        if (uMode > 0.5) {
          // The next screen ripples out from where the hero pressed. The ring is wide: a thin one
          // moves further than its width between motion-blur subframes and shows as several rings.
          float d = distance(px * vec2(uAspect, 1.0), uCenter * vec2(uAspect, 1.0));
          float R = uMix * 2.2;
          m = smoothstep(R, R - 0.05, d);
          edge = smoothstep(0.045, 0.0, abs(d - R)) * (1.0 - uMix) * 0.22;
        }
        vec3 c = mix(a, b, m) + edge * uTint;
        // A faint glowing rim: each panel reads as a floating screen.
        float ex = min(p.x, 1.0 - p.x) * uRect.z * uPx.x;
        float ey = min(p.y, 1.0 - p.y) * uRect.w * uPx.y;
        c += vec3(1.0, 0.86, 0.76) * smoothstep(3.0, 0.0, min(ex, ey)) * 0.09;
        // Black glass, faked: a faint diagonal sheen. Real glass would catch the key light as a blob.
        c += vec3(0.010, 0.009, 0.008) * smoothstep(0.35, 0.0, abs((px.x - px.y * 0.6) - 0.45));
        float line = uOff > 0.6 ? smoothstep(0.004, 0.0, abs(p.y - 0.5)) * (1.0 - uOff) * 6.0 : 0.0;
        gl_FragColor = vec4(c * uGlow + line, 1.0);
      }`,
  })
}

const panels = {}
Object.entries(TL.panels).forEach(([name, r], i) => {
  const g = new THREE.Group()
  const w = r.w * S
  const d = r.h * S
  const centre = ui(...centreOf(r))
  g.position.copy(centre)
  const body = new THREE.Mesh(new RoundedBoxGeometry(w, 0.16, d, 3, 0.03), new THREE.MeshPhysicalMaterial({ color: 0x0c0a09, roughness: 0.5, metalness: 0.2 }))
  body.position.y = -0.08
  body.receiveShadow = true
  const screen = new THREE.Mesh(new THREE.PlaneGeometry(w - 0.02, d - 0.02), screenMaterial(r))
  screen.rotation.x = -Math.PI / 2
  screen.position.y = 0.001
  // The hero's shadow on the screen, so it reads as standing on it.
  const catcher = new THREE.Mesh(new THREE.PlaneGeometry(w, d), new THREE.ShadowMaterial({ opacity: 0.5, depthWrite: false }))
  catcher.rotation.x = -Math.PI / 2
  catcher.position.y = 0.008
  catcher.receiveShadow = true
  g.add(body, screen, catcher)
  scene.add(g)
  panels[name] = { g, screen, base: centre.clone(), seed: i + name.length }
})

// ---------- the hero ----------
function heroGeometry(res = 72) {
  const { cy, half } = HERO.BOUNDS
  const mc = new MarchingCubes(res, new THREE.MeshBasicMaterial(), false, false, 200000)
  const n = mc.size
  for (let k = 0; k < n; k++)
    for (let j = 0; j < n; j++)
      for (let i = 0; i < n; i++) {
        const x = ((i - n / 2) / (n / 2)) * half
        const y = ((j - n / 2) / (n / 2)) * half + cy
        const z = ((k - n / 2) / (n / 2)) * half
        mc.field[i + j * n + k * n * n] = mc.isolation - HERO.sdf(x, y, z) * 400
      }
  mc.update()
  const g = new THREE.BufferGeometry()
  const pos = mc.positionArray.slice(0, mc.count * 3)
  for (let i = 0; i < pos.length; i += 3) {
    pos[i] *= half
    pos[i + 1] = pos[i + 1] * half + cy
    pos[i + 2] *= half
  }
  g.setAttribute('position', new THREE.BufferAttribute(pos, 3))
  g.setAttribute('normal', new THREE.BufferAttribute(mc.normalArray.slice(0, mc.count * 3), 3))
  g.computeBoundingSphere()
  g.computeBoundingBox()
  return g
}
const heroGeo = heroGeometry(Number(Q.get('mc') ?? 72))
// A vinyl toy: soft clearcoat, a little sheen. The body must read as the hero's colour.
const toyMat = new THREE.MeshPhysicalMaterial({ color: tint, roughness: 0.42, clearcoat: 0.4, clearcoatRoughness: 0.32, sheen: 0.25, sheenColor: tint.clone().lerp(new THREE.Color(0xffffff), 0.6) })
const darkMat = new THREE.MeshPhysicalMaterial({ color: TL.hero.dark, roughness: 0.18, clearcoat: 1 })

const hero = new THREE.Group() // feet at the origin
const body = new THREE.Group() // squash and stretch
hero.add(body)
const bodyMesh = new THREE.Mesh(heroGeo, toyMat)
bodyMesh.castShadow = bodyMesh.receiveShadow = true
body.add(bodyMesh)
const F = HERO.FACE
const eyeGeo = new RoundedBoxGeometry(F.eye[0], F.eye[1], F.eye[2], 3, Math.min(F.eye[0], F.eye[2]) * 0.45)
const eyes = F.eyes.map((at) => {
  const e = new THREE.Mesh(eyeGeo, darkMat)
  e.position.set(...at)
  body.add(e)
  return e
})
const mouth = new THREE.Mesh(new RoundedBoxGeometry(...F.mouthSize, 2, F.mouthSize[1] * 0.45), darkMat)
mouth.position.set(...F.mouth)
body.add(mouth)
const legs = HERO.LEGS.at.map(([x, z]) => {
  const l = new THREE.Mesh(new THREE.CapsuleGeometry(HERO.LEGS.radius, HERO.LEGS.length, 4, 10), toyMat)
  l.position.set(x, HERO.LEGS.y, z)
  l.castShadow = true
  hero.add(l)
  return l
})
const propGroup = HERO.prop(TL.hero)
if (propGroup) body.add(propGroup)
scene.add(hero)

// ---------- the sticker the hero starts as ----------
const stickerAt = ui(TL.sticker.at[0], TL.sticker.at[1], 0.012)
// Lying on its back the hero covers x and -y of its body: the selection box goes round that.
const bb = heroGeo.boundingBox
const box = { x0: bb.min.x - 0.18, x1: bb.max.x + 0.12, z0: -bb.max.y - 0.18, z1: -bb.min.y + 0.06 }

function crackTexture() {
  const c = document.createElement('canvas')
  c.width = c.height = 1024
  const x = c.getContext('2d')
  const r = rng(7)
  x.strokeStyle = 'rgba(235,245,255,0.95)'
  x.lineCap = 'round'
  for (let i = 0; i < 26; i++) {
    let px = 512
    let py = 512
    let a = (i / 26) * Math.PI * 2 + r() * 0.3
    x.lineWidth = 3.2
    x.beginPath()
    x.moveTo(px, py)
    for (let s = 0; s < 9; s++) {
      a += (r() - 0.5) * 0.6
      const len = 30 + r() * 45
      px += Math.cos(a) * len
      py += Math.sin(a) * len
      x.lineTo(px, py)
      x.lineWidth *= 0.86
    }
    x.stroke()
  }
  for (let ring = 1; ring <= 3; ring++) {
    x.lineWidth = 1.6
    x.beginPath()
    for (let k = 0; k <= 40; k++) {
      const a = (k / 40) * Math.PI * 2
      const rr = ring * 95 + (r() - 0.5) * 30
      x[k ? 'lineTo' : 'moveTo'](512 + Math.cos(a) * rr, 512 + Math.sin(a) * rr)
    }
    x.stroke()
  }
  const t = new THREE.CanvasTexture(c)
  t.colorSpace = THREE.SRGBColorSpace
  return t
}
// The glass cracks when the hero pops out: a decal of cracks plus flying shards.
const crackAt = stickerAt.clone().add(new THREE.Vector3((box.x0 + box.x1) / 2, 0.003, (box.z0 + box.z1) / 2))
const crack = new THREE.Mesh(new THREE.PlaneGeometry(3.4, 3.4), new THREE.MeshBasicMaterial({ map: crackTexture(), transparent: true, opacity: 0, depthWrite: false, blending: THREE.AdditiveBlending }))
crack.rotation.x = -Math.PI / 2
crack.position.copy(crackAt)
scene.add(crack)

const shardMat = new THREE.MeshPhysicalMaterial({ color: 0xdbe9ff, roughness: 0.05, metalness: 0.2, transparent: true, opacity: 0.75, side: THREE.DoubleSide, emissive: 0x334455, emissiveIntensity: 0.6 })
const shards = []
{
  const r = rng(11)
  for (let i = 0; i < 46; i++) {
    const g = new THREE.BufferGeometry()
    const s = 0.05 + r() * 0.14
    g.setAttribute('position', new THREE.Float32BufferAttribute([0, 0, 0, s, 0, s * (r() - 0.5), s * (r() - 0.3), 0, s], 3))
    g.computeVertexNormals()
    const m = new THREE.Mesh(g, shardMat)
    const a = r() * Math.PI * 2
    shards.push({ m, p0: crackAt.clone().add(new THREE.Vector3((r() - 0.5) * 1.6, 0.02, (r() - 0.5) * 1.1)), v: new THREE.Vector3(Math.cos(a) * (1 + r() * 2.4), 2.5 + r() * 3.5, Math.sin(a) * (1 + r() * 2.4)), w: new THREE.Vector3(r() * 9, r() * 9, r() * 9) })
    m.visible = false
    scene.add(m)
  }
}

// Editor-style selection handles around the flat sticker.
const selection = new THREE.Group()
{
  const mat = new THREE.MeshBasicMaterial({ color: 0x7cc0ff, transparent: true })
  const { x0, x1, z0, z1 } = box
  const bar = (w, d, x, z) => {
    const m = new THREE.Mesh(new THREE.PlaneGeometry(w, d), mat)
    m.rotation.x = -Math.PI / 2
    m.position.set(x, 0, z)
    selection.add(m)
  }
  const t = 0.012
  bar(x1 - x0, t, (x0 + x1) / 2, z0)
  bar(x1 - x0, t, (x0 + x1) / 2, z1)
  bar(t, z1 - z0, x0, (z0 + z1) / 2)
  bar(t, z1 - z0, x1, (z0 + z1) / 2)
  for (const x of [x0, (x0 + x1) / 2, x1]) for (const z of [z0, (z0 + z1) / 2, z1]) if (!(x === (x0 + x1) / 2 && z === (z0 + z1) / 2)) bar(0.07, 0.07, x, z)
  selection.position.copy(stickerAt).add(new THREE.Vector3(0, 0.002, 0))
  selection.userData.mat = mat
  scene.add(selection)
}

// ---------- the stage and the logo ----------
const exitHop = TL.hops.find((h) => h.does === 'exit')
const pedestal = new THREE.Mesh(new THREE.CylinderGeometry(1.5, 1.6, 0.3, 64), new THREE.MeshPhysicalMaterial({ color: 0x1b1310, roughness: 0.22, clearcoat: 0.7, clearcoatRoughness: 0.1 }))
pedestal.position.copy(exitHop ? ui(exitHop.to[0], exitHop.to[1], FLOOR - 0.15) : new THREE.Vector3(0, FLOOR - 0.15, 6.4))
pedestal.receiveShadow = true
scene.add(pedestal)

const logo = new THREE.Group()
const LOGO_AT = new THREE.Vector3(0, 0.85, 2.6)
logo.position.copy(LOGO_AT)
{
  const g = new RoundedBoxGeometry(2.6, 2.6, 0.42, 6, 0.46)
  const top = new THREE.Color(TL.logo.tile_top)
  const bot = new THREE.Color(TL.logo.tile).multiplyScalar(0.82)
  const cols = []
  const p = g.attributes.position
  for (let i = 0; i < p.count; i++) {
    const c = bot.clone().lerp(top, clamp((p.getY(i) + 1.3) / 2.6))
    cols.push(c.r, c.g, c.b)
  }
  g.setAttribute('color', new THREE.Float32BufferAttribute(cols, 3))
  const tile = new THREE.Mesh(g, new THREE.MeshPhysicalMaterial({ vertexColors: true, roughness: 0.42, clearcoat: 0.5, clearcoatRoughness: 0.25, emissive: new THREE.Color(TL.logo.tile), emissiveIntensity: 0.16 }))
  tile.castShadow = tile.receiveShadow = true
  logo.add(tile)
}
// The app's icon before the hero dives in (optional): it shrinks away on the splash.
let icon = null
if (TL.logo.icon) {
  icon = new THREE.Mesh(new THREE.PlaneGeometry(1.9, 1.9), new THREE.MeshBasicMaterial({ map: await loadTex(TL.logo.icon), transparent: true, depthWrite: false }))
  icon.position.z = 0.215
  logo.add(icon)
}
// The hero, flat and in the emblem colour, becomes the mark; its eyes are cut in the tile colour.
const ES = 1.1 // the mark's size on the tile
const emblem = new THREE.Group()
{
  const ec = new THREE.Color(TL.logo.emblem ?? '#FFFFFF')
  emblem.add(new THREE.Mesh(heroGeo, new THREE.MeshPhysicalMaterial({ color: ec, roughness: 0.35, emissive: ec, emissiveIntensity: 0.12 })))
  for (const at of F.eyes) {
    const e = new THREE.Mesh(eyeGeo, new THREE.MeshPhysicalMaterial({ color: TL.logo.tile, roughness: 0.4 }))
    e.position.set(at[0], at[1], at[2] + 0.025)
    emblem.add(e)
  }
  // Centre the silhouette on the tile.
  const c = new THREE.Vector3()
  bb.getCenter(c)
  emblem.userData.offset = new THREE.Vector3(-c.x * ES, -c.y * ES, 0.2)
  emblem.position.copy(emblem.userData.offset)
  emblem.visible = false
  logo.add(emblem)
}
const ripple = new THREE.Mesh(new THREE.RingGeometry(0.9, 1.0, 64), new THREE.MeshBasicMaterial({ color: 0xffffff, transparent: true, opacity: 0, depthWrite: false, blending: THREE.AdditiveBlending }))
ripple.position.z = 0.23
logo.add(ripple)
scene.add(logo)

// ---------- the hero's path ----------
function hopEnd(h) {
  if (h.to === 'logo') return LOGO_AT.clone().add(new THREE.Vector3(0, -0.05, 0.22))
  return ui(h.to[0], h.to[1], h.floor ? FLOOR : 0.008)
}
const hops = TL.hops.map((h, i) => ({ ...h, i }))
const restBefore = (i) => (i === 0 ? stickerAt.clone() : hopEnd(hops[i - 1]))

// ---------- press flashes, chips, sparks, confetti ----------
const flashMat = (w, h) =>
  new THREE.ShaderMaterial({
    transparent: true,
    depthWrite: false,
    blending: THREE.AdditiveBlending,
    uniforms: { uA: { value: 0 }, uSize: { value: new THREE.Vector2(w, h) }, uTint: screenUniforms.uTint },
    vertexShader: `varying vec2 vUv; void main(){ vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position,1.0); }`,
    fragmentShader: `
      uniform float uA; uniform vec2 uSize; uniform vec3 uTint; varying vec2 vUv;
      float rr(vec2 p, vec2 b, float r){ vec2 q = abs(p) - b + r; return length(max(q,0.0)) + min(max(q.x,q.y),0.0) - r; }
      void main(){
        // An outline, not a fill: a filled flash turns a big element into a bright block.
        vec2 p = (vUv - 0.5) * uSize;
        float d = rr(p, uSize * 0.5 - 0.06, 0.08);
        float ring = smoothstep(0.05, 0.0, abs(d)) + 0.05 * smoothstep(0.0, -0.3, d);
        gl_FragColor = vec4(uTint * ring * uA * 2.0, 1.0);
      }`,
  })
const flashes = hops
  .filter((h) => h.rect && ['press', 'stamp', 'cheer'].includes(h.does))
  .map((h) => {
    const w = h.rect.w * S + 0.12
    const d = h.rect.h * S + 0.12
    const m = new THREE.Mesh(new THREE.PlaneGeometry(w, d), flashMat(w, d))
    m.rotation.x = -Math.PI / 2
    m.position.copy(ui(...centreOf(h.rect), 0.014))
    m.visible = false
    scene.add(m)
    return { m, t: h.t1 }
  })

const sparkGeo = new THREE.SphereGeometry(0.022, 6, 6)
const sparkMat = new THREE.MeshBasicMaterial({ color: tint.clone().lerp(new THREE.Color(0xffd27a), 0.5) })
const strike = new THREE.Vector3(...(HERO.STRIKE ?? [0, 0, 0]))
const bursts = []
for (const h of hops) if (h.does === 'stamp') bursts.push({ t: h.t1, at: hopEnd(h).add(strike), n: 26, speed: 3.2, life: 0.6, seed: Math.round(h.t1 * 100) })
bursts.push({ t: TL.finale.splash, at: LOGO_AT.clone().add(new THREE.Vector3(0, 0, 0.3)), n: 60, speed: 4.5, life: 1.1, seed: 99, logo: true })
for (const b of bursts) {
  const r = rng(b.seed)
  b.parts = Array.from({ length: b.n }, () => {
    const m = new THREE.Mesh(sparkGeo, b.logo ? new THREE.MeshBasicMaterial({ color: r() < 0.5 ? 0xffffff : tint.clone().lerp(new THREE.Color(0xffffff), 0.5) }) : sparkMat)
    m.visible = false
    scene.add(m)
    const a = r() * Math.PI * 2
    const up = b.logo ? (r() - 0.5) * 2 : 0.6 + r() * 1.4
    return { m, v: new THREE.Vector3(Math.cos(a), up, Math.sin(a)).normalize().multiplyScalar(b.speed * (0.5 + r() * 0.7)), s: 0.6 + r() * 1.2 }
  })
}

const confetti = []
for (const cheer of hops.filter((h) => h.does === 'cheer')) {
  const r = rng(5 + cheer.i)
  const colours = [tint, new THREE.Color(0xffffff), new THREE.Color(0x3fd0b0), new THREE.Color(0xffd166), new THREE.Color(TL.logo.tile)]
  for (let i = 0; i < 70; i++) {
    const m = new THREE.Mesh(new THREE.PlaneGeometry(0.07, 0.11), new THREE.MeshBasicMaterial({ color: colours[i % colours.length], side: THREE.DoubleSide }))
    m.visible = false
    scene.add(m)
    const a = r() * Math.PI * 2
    confetti.push({ m, t: cheer.t1, v: new THREE.Vector3(Math.cos(a) * (0.6 + r() * 1.6), 3 + r() * 3, Math.sin(a) * (0.6 + r() * 1.6)), w: new THREE.Vector3(r() * 12, r() * 12, r() * 12), at: hopEnd(cheer) })
  }
}

// Chips (files, cards, words) fly into a zone as the hero stamps it: a hop's `chips` rectangles.
const chips = []
for (const h of hops.filter((h) => h.chips?.length)) {
  const r = rng(3 + h.i)
  const stripes = [new THREE.Color(TL.logo.tile), new THREE.Color(0x3fd0b0), new THREE.Color(0x6aa8ff), new THREE.Color(0xffd166), tint]
  h.chips.forEach((z, i) => {
    const chip = new THREE.Mesh(new RoundedBoxGeometry(0.62, 0.05, 0.36, 2, 0.02), new THREE.MeshPhysicalMaterial({ color: 0xf4ece6, roughness: 0.35, emissive: 0x302826 }))
    const stripe = new THREE.Mesh(new THREE.BoxGeometry(0.18, 0.055, 0.36), new THREE.MeshBasicMaterial({ color: stripes[i % stripes.length] }))
    stripe.position.x = -0.22
    chip.add(stripe)
    chip.castShadow = true
    chip.visible = false
    scene.add(chip)
    const to = ui(z.x + z.w * (0.3 + 0.4 * r()), z.y + z.h * 0.5, 0.04)
    const from = to.clone().add(new THREE.Vector3((r() - 0.5) * 6, 3.5 + r() * 1.5, 5 + r() * 2))
    chips.push({ chip, from, to, t0: h.t1 - 0.32 + i * 0.03, t1: h.t1 + 0.02 + i * 0.03, spin: (r() - 0.5) * 8 })
  })
}

/** Where the hero is and how it moves at time t. */
function pose(t) {
  const p = { pos: stickerAt.clone(), yaw: 0, pitch: 0, sy: 1, legs: 1, prop: 0.3, flight: false, flat: 1, lying: 0, visible: true, scale: 1 }
  const sk = TL.sticker
  // Before the first hop: a flat sticker that knocks, peels off and pops into 3D.
  if (t < sk.peel[0]) {
    p.lying = 1
    p.flat = 0.035
    for (const k of sk.knocks) p.flat += 0.32 * Math.exp(-Math.pow((t - k) / 0.055, 2))
  } else if (t < sk.pop) {
    const u = clamp((t - sk.peel[0]) / (sk.peel[1] - sk.peel[0]))
    p.lying = 1 - easeOutBack(u, 1.2)
    p.flat = lerp(0.035, 0.16, u)
  } else {
    p.flat = 1 - 0.84 * spring(t - sk.pop, 22, 10)
  }
  let last = -1
  for (const h of hops) if (t >= h.t0) last = h.i
  if (last >= 0) {
    const h = hops[last]
    const p0 = restBefore(last)
    const p1 = hopEnd(h)
    const dir = new THREE.Vector3().subVectors(p1, p0)
    const travelYaw = h.does === 'dive' ? Math.PI : clamp(Math.atan2(dir.x, dir.z), -1.0, 1.0)
    if (t < h.t1) {
      const u = (t - h.t0) / (h.t1 - h.t0)
      p.pos.lerpVectors(p0, p1, u)
      p.pos.y += 4 * h.h * u * (1 - u)
      p.flight = true
      p.sy = 1 + 0.13 * Math.pow(Math.abs(2 * u - 1), 1.5)
      p.legs = 0.45
      p.yaw = lerp(0, travelYaw, sstep(0, 0.25, u))
      if (h.does === 'dive') {
        p.pitch = sstep(0.3, 1, u) * 1.1
        p.scale = 1 - sstep(0.8, 1, u)
      }
    } else {
      p.pos.copy(p1)
      p.yaw = lerp(travelYaw, 0, sstep(h.t1, h.t1 + 0.32, t))
      p.sy = 1 - 0.3 * spring(t - h.t1, 30, 11)
      if (h.does === 'dive') p.visible = false
    }
    // Anticipation before the next take-off.
    const next = hops[last + 1]
    if (next && t > next.t0 - 0.16 && t < next.t0) p.sy *= 1 - 0.2 * sstep(next.t0 - 0.16, next.t0 - 0.03, t)
  } else if (t > hops[0].t0 - 0.16) p.sy *= 1 - 0.2 * sstep(hops[0].t0 - 0.16, hops[0].t0 - 0.03, t)
  // The prop: a wind-up in the air, a strike on landing, a wave when it cheers.
  for (const h of hops) {
    const big = h.does === 'stamp'
    if (h.does === 'press' || big) {
      const wind = sstep(h.t1 - 0.3, h.t1 - 0.08, t) * (1 - sstep(h.t1 - 0.08, h.t1, t))
      const hit = sstep(h.t1 - 0.08, h.t1, t) * (1 - sstep(h.t1 + 0.12, h.t1 + 0.45, t))
      p.prop += wind * (big ? -1.25 : -0.6) + hit * ((big ? 2.35 : 2.0) - 0.3)
    }
    if (h.does === 'cheer' && t > h.t1 - 0.1 && t < h.t1 + 0.95) {
      const e = sstep(h.t1 - 0.1, h.t1 + 0.1, t) * (1 - sstep(h.t1 + 0.75, h.t1 + 0.95, t))
      p.prop += e * (-2.75 + 0.45 * Math.sin((t - h.t1) * 16))
    }
  }
  return p
}

function voiceAt(t) {
  for (const l of TL.lines) {
    if (t >= l.at && t < l.at + (l.seconds ?? 0)) return { line: l, open: l.envelope[Math.floor((t - l.at) * FPS)] ?? 0 }
  }
  return { line: null, open: 0 }
}

// ---------- the camera ----------
const heroFocus = (t) => pose(t).pos.add(new THREE.Vector3(0, 0.55, 0))
function followShot(t) {
  // Smoothed, slightly ahead of the hero: the camera whips to where it's going.
  const f = new THREE.Vector3()
  let wsum = 0
  for (let k = -4; k <= 7; k++) {
    const w = 1 - Math.abs(k - 1.5) / 7
    f.addScaledVector(heroFocus(t + k * 0.05), w)
    wsum += w
  }
  f.multiplyScalar(1 / wsum)
  const yaw = 0.2 * Math.sin(t * 0.33) - 0.08
  const dist = 3.5
  return { pos: f.clone().add(new THREE.Vector3(Math.sin(yaw) * dist, 2.55, Math.cos(yaw) * dist)), look: f.clone().add(new THREE.Vector3(0, 0.05, 0)), focus: f }
}
// Each shot gets the time, its start and its end.
const SHOTS = {
  wide: (t, t0, t1) => {
    const u = easeInOut(clamp((t - t0) / (t1 - t0)))
    const pos = new THREE.Vector3(0, 11.5, 10.5).lerp(stickerAt.clone().add(new THREE.Vector3(0.6, 4.2, 5.6)), u * 0.85)
    const look = new THREE.Vector3(0, 0, 0.6).lerp(stickerAt.clone().add(new THREE.Vector3(0.1, 0.2, -0.4)), u)
    return { pos, look, focus: look }
  },
  follow: followShot,
  pullback: () => ({ pos: pedestal.position.clone().add(new THREE.Vector3(0, 8.15, 10.6)), look: pedestal.position.clone().add(new THREE.Vector3(0, 0.55, -2.2)), focus: pedestal.position.clone().add(new THREE.Vector3(0, 0.55, -0.2)) }),
  logo: (t, t0, t1) => {
    const u = easeInOut(clamp((t - t0) / (t1 - t0)))
    const pos = LOGO_AT.clone().add(new THREE.Vector3(0, 0.5, 10.6)).lerp(LOGO_AT.clone().add(new THREE.Vector3(0, 0.1, 6.8)), u)
    const look = LOGO_AT.clone().add(new THREE.Vector3(0, -0.5, 0.8)).lerp(LOGO_AT.clone().add(new THREE.Vector3(0, -0.35, 0)), u)
    return { pos, look, focus: LOGO_AT.clone().add(new THREE.Vector3(0, 0, 0.25)), aperture: 0.0005 }
  },
}
function shotAt(i, t) {
  const c = TL.camera[i]
  return SHOTS[c.shot](t, c.t, TL.camera[i + 1]?.t ?? TL.duration)
}
function cameraAt(t) {
  let i = 0
  for (let k = 0; k < TL.camera.length; k++) if (t >= TL.camera[k].t) i = k
  const cur = shotAt(i, t)
  const blend = i > 0 ? easeInOut(clamp((t - TL.camera[i].t) / 0.9)) : 1
  if (blend >= 1) return cur
  const prev = shotAt(i - 1, t)
  return { pos: prev.pos.lerp(cur.pos, blend), look: prev.look.lerp(cur.look, blend), focus: prev.focus.lerp(cur.focus, blend), aperture: lerp(prev.aperture ?? 0.0016, cur.aperture ?? 0.0016, blend) }
}

// ---------- post ----------
// No MSAA (slow in software GL): each motion-blur subframe is jittered by a fraction of a pixel
// instead, so the average is antialiased too.
const composer = new EffectComposer(renderer, new THREE.WebGLRenderTarget(W, H, { type: THREE.HalfFloatType }))
composer.addPass(new RenderPass(scene, camera))
const bokeh = new BokehPass(scene, camera, { focus: 4, aperture: 0.0016, maxblur: 0.006 })
composer.addPass(bokeh)
composer.addPass(new UnrealBloomPass(new THREE.Vector2(W, H), 0.3, 0.45, 1.0))
composer.addPass(new OutputPass())
composer.renderToScreen = false

const accum = new THREE.WebGLRenderTarget(W, H, { type: THREE.HalfFloatType })
const quadCam = new THREE.OrthographicCamera(-1, 1, 1, -1, 0, 1)
const quad = new THREE.Mesh(new THREE.PlaneGeometry(2, 2))
const quadScene = new THREE.Scene()
quadScene.add(quad)
const addMat = new THREE.ShaderMaterial({
  uniforms: { tex: { value: null }, w: { value: 1 } },
  vertexShader: `varying vec2 vUv; void main(){ vUv = uv; gl_Position = vec4(position.xy, 0.0, 1.0); }`,
  fragmentShader: `uniform sampler2D tex; uniform float w; varying vec2 vUv; void main(){ gl_FragColor = vec4(texture2D(tex, vUv).rgb * w, 1.0); }`,
  blending: THREE.AdditiveBlending,
  depthTest: false,
  depthWrite: false,
  transparent: true,
})
const copyMat = new THREE.ShaderMaterial({
  vertexShader: addMat.vertexShader,
  uniforms: { tex: { value: null }, look: { value: LOOK } },
  fragmentShader: `uniform sampler2D tex; uniform float look; varying vec2 vUv;
    void main(){
      vec3 c = texture2D(tex, vUv).rgb;
      // A punchy look on top of the tone mapping: deeper blacks, a little more saturation.
      float l = dot(c, vec3(0.2126, 0.7152, 0.0722));
      c = mix(vec3(l), c, 1.0 + 0.35 * look);
      c = mix(c, c * c * (3.0 - 2.0 * c), 0.55 * look);
      c = max(c - 0.012 * look, 0.0) / (1.0 - 0.012 * look);
      gl_FragColor = vec4(clamp(c, 0.0, 1.0), 1.0);
    }`,
  depthTest: false,
  depthWrite: false,
})

// ---------- one moment ----------
const caption = document.getElementById('caption')
const wordmark = document.getElementById('wordmark')
const fade = document.getElementById('fade')
wordmark.querySelector('.name').textContent = TL.logo.wordmark
wordmark.querySelector('.tag').textContent = TL.logo.tagline ?? ''
const falls = TL.finale.panels_fall

function setTime(t) {
  // Screens: which picture, and the transition into it.
  let si = 0
  for (let k = 0; k < TL.states.length; k++) if (t >= TL.states[k].t) si = k
  const st = TL.states[si]
  const prev = TL.states[si - 1]
  const dur = st.how === 'flip' ? 0.5 : 0.28
  const u = prev ? clamp((t - st.t) / dur) : 1
  screenUniforms.texA.value = tex[prev && u < 1 ? prev.screen : st.screen]
  screenUniforms.texB.value = tex[st.screen]
  screenUniforms.uMix.value = u < 1 ? easeInOut(u) : 0
  screenUniforms.uMode.value = st.how === 'flip' ? 1 : 0
  const press = hops.find((h) => h.rect && Math.abs(h.t1 - st.t) < 0.15)
  if (press) {
    const [cx, cy] = centreOf(press.rect)
    screenUniforms.uCenter.value.set(cx / PX, cy / PY)
  }

  // Panels power down and fall away in the finale.
  for (const f of falls) {
    const P = panels[f.panel]
    const off = sstep(f.t, f.t + 0.3, t)
    const flicker = t > f.t - 0.18 && t < f.t ? 0.7 + 0.3 * Math.sin(t * 95) : 1
    P.screen.material.uniforms.uOff.value = off
    P.screen.material.uniforms.uGlow.value = GLOW * flicker * (1 - sstep(f.t + 0.22, f.t + 0.32, t))
    const dt = Math.max(0, t - (f.t + 0.3))
    P.g.position.copy(P.base)
    P.g.position.y -= 0.5 * 9 * dt * dt
    P.g.position.z -= dt * 1.2
    P.g.rotation.x = -0.5 * dt * dt * (P.seed % 2 ? 1 : -1)
    P.g.rotation.z = 0.25 * dt * dt * (P.seed % 3 ? 1 : -1)
    P.g.visible = P.g.position.y > -9
  }
  screenLight.intensity = 0.9 * (1 - sstep(falls[0].t, falls[falls.length - 1].t + 0.4, t))

  // The hero.
  const p = pose(t)
  hero.visible = p.visible
  hero.position.copy(p.pos)
  hero.rotation.set((-Math.PI / 2) * p.lying, p.yaw, 0, 'YXZ')
  if (p.pitch) hero.rotateX(p.pitch)
  const breathe = p.flight ? 0 : 0.012 * Math.sin(t * 3.1)
  const v = voiceAt(t)
  const sy = (p.sy + breathe + v.open * 0.025) * p.scale
  const sxz = (1 / Math.sqrt(Math.max(0.3, p.sy))) * p.scale
  body.scale.set(sxz, sy, sxz * p.flat)
  for (const l of legs) {
    l.scale.set(p.scale, p.legs * p.scale, p.scale * p.flat)
    l.visible = p.lying < 0.5
  }
  const blink = (t + 0.7) % 2.9 < 0.11 ? 0.12 : 1
  for (const e of eyes) e.scale.y = blink
  mouth.scale.y = 1 + v.open * 4.2
  mouth.scale.x = 1 - v.open * 0.25
  if (propGroup) {
    propGroup.rotation.z = p.prop
    propGroup.visible = p.lying < 0.6
  }

  // The sticker's selection handles, the cracked glass and its shards.
  const sk = TL.sticker
  selection.userData.mat.opacity = 1 - sstep(sk.peel[0], sk.peel[0] + 0.15, t)
  selection.visible = selection.userData.mat.opacity > 0.01
  crack.material.opacity = t >= sk.pop ? 0.9 * (1 - sstep(sk.pop + 1.3, sk.pop + 1.8, t)) : 0
  for (const s of shards) {
    const dt = t - sk.pop
    s.m.visible = dt > 0 && dt < 1.5
    if (!s.m.visible) continue
    s.m.position.copy(s.p0).addScaledVector(s.v, dt)
    s.m.position.y -= 0.5 * 9.8 * dt * dt
    s.m.rotation.set(s.w.x * dt, s.w.y * dt, s.w.z * dt)
    s.m.material.opacity = 0.75 * (1 - sstep(1.1, 1.5, dt))
  }

  for (const f of flashes) {
    const dt = t - f.t
    f.m.visible = dt > 0 && dt < 0.5
    if (f.m.visible) {
      const u = dt / 0.5
      f.m.scale.setScalar(1 + 0.25 * u)
      f.m.material.uniforms.uA.value = Math.pow(1 - u, 2)
    }
  }
  for (const c of chips) {
    c.chip.visible = t > c.t0 && t < c.t1 + 0.12
    if (!c.chip.visible) continue
    const u = clamp((t - c.t0) / (c.t1 - c.t0))
    const e = 1 - Math.pow(1 - u, 2)
    c.chip.position.lerpVectors(c.from, c.to, e)
    c.chip.position.y += Math.sin(u * Math.PI) * 0.8
    c.chip.rotation.set(0, c.spin * (1 - e), 0.6 * (1 - e))
    c.chip.scale.setScalar(t > c.t1 ? 1 - clamp((t - c.t1) / 0.12) : 1)
  }
  for (const b of bursts) {
    for (const q of b.parts) {
      const dt = t - b.t
      q.m.visible = dt > 0 && dt < b.life
      if (!q.m.visible) continue
      q.m.position.copy(b.at).addScaledVector(q.v, dt)
      if (b.logo) q.m.position.z += dt * 0.6
      else q.m.position.y -= 0.5 * 7 * dt * dt
      q.m.scale.setScalar(q.s * (1 - dt / b.life))
    }
  }
  for (const c of confetti) {
    const dt = t - c.t
    c.m.visible = dt > 0 && dt < 1.8 && t < falls[0].t + 0.4
    if (!c.m.visible) continue
    c.m.position.copy(c.at).add(new THREE.Vector3(0, 0.6, 0)).addScaledVector(c.v, dt)
    c.m.position.y -= 0.5 * 6 * dt * dt
    c.m.rotation.set(c.w.x * dt, c.w.y * dt, c.w.z * dt)
  }

  // The logo rises, the hero dives in and becomes the mark.
  const [r0, r1] = TL.finale.logo_rise
  const ru = clamp((t - r0) / (r1 - r0))
  logo.visible = t > r0
  logo.position.copy(LOGO_AT)
  logo.position.y = lerp(-5, LOGO_AT.y, easeOutBack(ru, 1.1))
  logo.rotation.y = (1 - easeOutBack(ru, 1.2)) * 0.6
  const ds = t - TL.finale.splash
  logo.scale.setScalar(1 + (ds > 0 ? 0.1 * Math.exp(-ds * 6) * Math.sin(ds * 24) : 0))
  if (icon) icon.scale.setScalar(Math.max(0.001, 1 - sstep(TL.finale.splash, TL.finale.splash + 0.2, t)))
  const [e0, e1] = TL.finale.emblem
  emblem.visible = t > e0
  const eu = easeOutBack(clamp((t - e0) / (e1 - e0)), 1.6)
  emblem.scale.set(ES * eu, ES * eu, 0.12 * Math.max(eu, 0.01))
  emblem.position.copy(emblem.userData.offset).multiply(new THREE.Vector3(eu, eu, 1))
  ripple.material.opacity = ds > 0 ? 0.9 * (1 - clamp(ds / 0.6)) : 0
  ripple.scale.setScalar(0.2 + clamp(ds / 0.6) * 1.6)

  // Camera, focus, lights that follow.
  const c = cameraAt(t)
  camera.position.copy(c.pos)
  camera.lookAt(c.look)
  bokeh.uniforms.focus.value = camera.position.distanceTo(c.focus)
  bokeh.uniforms.aperture.value = c.aperture ?? 0.0016
  const kf = p.visible ? p.pos : LOGO_AT
  key.position.copy(kf).add(new THREE.Vector3(-3.5, 7, 5))
  key.target.position.copy(kf)
  rim.position.copy(kf).add(new THREE.Vector3(3, 4, -6))
  rim.target.position.copy(kf)
  logoLight.intensity = 30 * sstep(r0, r1, t)
  logoLight.position.copy(camera.position).add(new THREE.Vector3(1.5, 2.5, 0))
  logoLight.target.position.copy(LOGO_AT)

  // Captions and the end card.
  const cap = TL.lines.find((l) => l.caption !== false && t >= l.at - 0.05 && t < l.at + (l.seconds ?? 0) + 0.35)
  caption.textContent = cap ? cap.text : ''
  caption.style.opacity = cap ? String(sstep(cap.at - 0.05, cap.at + 0.08, t) * (1 - sstep(cap.at + cap.seconds + 0.2, cap.at + cap.seconds + 0.35, t))) : '0'
  const wm = sstep(TL.finale.wordmark, TL.finale.wordmark + 0.45, t)
  wordmark.style.opacity = String(wm)
  wordmark.style.transform = `translateY(${(1 - wm) * 18}px)`
  fade.style.opacity = String(sstep(TL.finale.end_fade[0], TL.finale.end_fade[1], t))
}

const JITTER = [
  [0.0, 0.0],
  [0.5, 0.33],
  [-0.25, -0.33],
  [0.25, 0.11],
  [-0.5, 0.44],
  [0.375, -0.22],
]
/** Renders the frame at time t with 0.5-shutter motion blur. */
window.renderFrame = (t) => {
  const shutter = 0.5 / FPS
  renderer.setRenderTarget(accum)
  renderer.setClearColor(0x000000, 1)
  renderer.clear()
  for (let k = 0; k < SUB; k++) {
    const tk = SUB > 1 ? t + (k / (SUB - 1) - 0.5) * shutter : t
    setTime(tk)
    const [jx, jy] = JITTER[k % JITTER.length]
    camera.setViewOffset(W, H, jx, jy, W, H)
    composer.render()
    camera.clearViewOffset()
    addMat.uniforms.tex.value = composer.readBuffer.texture
    addMat.uniforms.w.value = 1 / SUB
    quad.material = addMat
    renderer.setRenderTarget(accum)
    // Add, don't clear: the subframes sum into one frame. With auto-clear only the last one
    // survives, at 1/SUB brightness.
    renderer.autoClear = false
    renderer.render(quadScene, quadCam)
    renderer.autoClear = true
  }
  setTime(t) // DOM overlays at the frame's own time
  copyMat.uniforms.tex.value = accum.texture
  quad.material = copyMat
  renderer.setRenderTarget(null)
  renderer.render(quadScene, quadCam)
  return true
}

/** The finished mark alone on a transparent background, as a PNG data URL. */
window.renderLogo = () => {
  setTime(TL.finale.end_fade[0] - 0.1)
  for (const P of Object.values(panels)) P.g.visible = false
  for (const o of [hero, pedestal, crack, selection]) o.visible = false
  const a = W / H
  const cam = new THREE.OrthographicCamera(-1.55 * a, 1.55 * a, 1.55, -1.55, 0.1, 50)
  cam.position.copy(LOGO_AT).add(new THREE.Vector3(0, 0, 8))
  cam.lookAt(LOGO_AT)
  const [bg, fog] = [scene.background, scene.fog]
  scene.background = null
  scene.fog = null
  renderer.setRenderTarget(null)
  renderer.setClearColor(0x000000, 0)
  renderer.clear()
  renderer.render(scene, cam)
  ;[scene.background, scene.fog] = [bg, fog]
  return renderer.domElement.toDataURL('image/png')
}

window.ready = true
