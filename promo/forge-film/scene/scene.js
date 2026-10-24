// The character film's Three.js world. Everything is a pure function of time read from
// build/timeline.json, so any frame renders the same every time (window.renderFrame(t)).
//
// The set: a dark studio with a pedestal in front of a big screen. The screen shows the app's real
// screenshots and faces the camera; the hero jumps through its glass and lives on the app, standing
// on the top edges of buttons and fields like platforms. At the end the screen shrinks into the
// app's icon and the hero dives in. The hero comes from hero.js, its face from face.js.
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
import { createFace, MOODS, mixMood } from './face.js'

const Q = new URLSearchParams(location.search)
const W = Number(Q.get('w') ?? 1920)
const H = Number(Q.get('h') ?? 1080)
const SUB = Number(Q.get('sub') ?? 5) // motion-blur subframes
// Tone mapping: Khronos PBR Neutral keeps the body and the logo tile their true colour (AgX greys
// saturated colours out in three.js); a little contrast on top.
const TM = Q.get('tm') ?? 'neutral'
const LOOK = Number(Q.get('look') ?? 0.2)
const GLOW = Number(Q.get('glow') ?? 1.15) // how bright the screen is
document.documentElement.style.setProperty('--h', `${H}px`)

const TL = await (await fetch('/build/timeline.json')).json()
const FPS = TL.fps
const [PX, PY] = TL.ui.px // UI pixels of the captured window
const S = 0.01 // world units per UI pixel
const SW = PX * S // the screen in world units
const SH = PY * S
const SIZE = TL.hero.size ?? 0.85
const HERO_Z = 0.36 * SIZE + 0.02 // standing on the app: its back just off the picture
const GLASS_Z = 0.95 // the screen's glass, in front of the hero
const FLOOR = -SH / 2 - 0.25 // the studio floor
const PEDESTAL = new THREE.Vector3(0, FLOOR + 0.55, 5.2) // where the hero stands in the studio
const LOGO_AT = new THREE.Vector3(0, -2.0, 3.2)
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
const pulse = (t, at, w) => Math.exp(-Math.pow((t - at) / w, 2))
function rng(seed) {
  return () => {
    seed |= 0
    seed = (seed + 0x6d2b79f5) | 0
    let t = Math.imul(seed ^ (seed >>> 15), 1 | seed)
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}
/** A UI pixel on the screen → a world point (the screen faces +z, y up). */
const ui = (px, py, z = 0) => new THREE.Vector3((px - PX / 2) * S, (PY / 2 - py) * S, z)
const centreOf = (r) => [r.x + r.w / 2, r.y + r.h / 2]

// ---------- renderer ----------
const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true, preserveDrawingBuffer: true, powerPreference: 'high-performance' })
renderer.setPixelRatio(1)
renderer.setSize(W, H)
renderer.toneMapping = { agx: THREE.AgXToneMapping, neutral: THREE.NeutralToneMapping, aces: THREE.ACESFilmicToneMapping }[TM]
renderer.outputColorSpace = THREE.SRGBColorSpace
renderer.shadowMap.enabled = true
renderer.shadowMap.type = THREE.PCFSoftShadowMap
document.body.prepend(renderer.domElement)
RectAreaLightUniformsLib.init()

const scene = new THREE.Scene()
const studio = new THREE.Color(TL.set.studio)
scene.background = studio
scene.fog = new THREE.FogExp2(studio, TL.set.haze ?? 0.008)
const pmrem = new THREE.PMREMGenerator(renderer)
scene.environment = pmrem.fromScene(new RoomEnvironment(), 0.04).texture
scene.environmentIntensity = 0.45

const camera = new THREE.PerspectiveCamera(34, W / H, 0.05, 200)
const TAN = Math.tan(THREE.MathUtils.degToRad(17))

// Key light follows the hero (tight shadows), a rim from behind, a studio spot on the pedestal, a
// glow from the screen, a light on the logo at the end.
const key = new THREE.DirectionalLight(0xfff1e4, 2.1)
key.castShadow = true
key.shadow.mapSize.set(1536, 1536)
key.shadow.camera.left = key.shadow.camera.bottom = -2.6
key.shadow.camera.right = key.shadow.camera.top = 2.6
key.shadow.camera.near = 0.5
key.shadow.camera.far = 30
key.shadow.bias = -0.0004
key.shadow.normalBias = 0.02
scene.add(key, key.target)
const rim = new THREE.DirectionalLight(0xffc9a8, 1.3)
scene.add(rim, rim.target)
const hemi = new THREE.HemisphereLight(0x6b5a52, 0x0b0705, 0.45)
scene.add(hemi)
const spot = new THREE.SpotLight(0xfff1e4, 0, 30, 0.42, 0.65, 1.2)
spot.position.copy(PEDESTAL).add(new THREE.Vector3(-0.5, 7.5, 3.5))
spot.target.position.copy(PEDESTAL)
scene.add(spot, spot.target)
const logoLight = new THREE.SpotLight(0xfff4ec, 0, 40, 0.45, 0.7, 2)
scene.add(logoLight, logoLight.target)
const screenLight = new THREE.RectAreaLight(0xcfd8ff, 0, SW * 0.9, SH * 0.9)
screenLight.position.set(0, 0, 0.05)
screenLight.lookAt(0, 0, 5)
scene.add(screenLight)

// ---------- textures ----------
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
const typing = TL.actions.filter((a) => a.does === 'type')
for (const a of typing) a.tex = await Promise.all(a.steps.map(loadTex))
const iconTex = TL.logo.icon ? await loadTex(TL.logo.icon) : null

// ---------- the studio ----------
const floor = new THREE.Mesh(new THREE.PlaneGeometry(120, 120), new THREE.MeshStandardMaterial({ color: studio.clone().multiplyScalar(1.1), roughness: 0.7, envMapIntensity: 0.12 }))
floor.rotation.x = -Math.PI / 2
floor.position.y = FLOOR
floor.receiveShadow = true
scene.add(floor)
const pedestal = new THREE.Mesh(new THREE.CylinderGeometry(1.15, 1.25, 0.55, 64), new THREE.MeshPhysicalMaterial({ color: 0x1b1310, roughness: 0.22, clearcoat: 0.7, clearcoatRoughness: 0.1 }))
pedestal.position.copy(PEDESTAL).add(new THREE.Vector3(0, -0.275, 0))
pedestal.receiveShadow = pedestal.castShadow = true
scene.add(pedestal)

// ---------- the screen ----------
const screenGroup = new THREE.Group() // moves and shrinks into the icon at the end
scene.add(screenGroup)
const bezelMat = new THREE.MeshPhysicalMaterial({ color: 0x0c0a09, roughness: 0.45, metalness: 0.2, transparent: true })
const bezel = new THREE.Mesh(new RoundedBoxGeometry(1, 1, 1, 4, 0.04), bezelMat)
bezel.receiveShadow = true
scene.add(bezel)

const su = {
  texA: { value: tex[TL.states[0].screen] },
  texB: { value: tex[TL.states[0].screen] },
  uMix: { value: 0 },
  uMode: { value: 0 },
  uCenter: { value: new THREE.Vector2(0.5, 0.5) },
  uAspect: { value: PX / PY },
  uTint: { value: tint.clone().lerp(new THREE.Color(0xffffff), 0.15) },
  uGlow: { value: GLOW },
  uPower: { value: 0 },
  uPatch: { value: null },
  uPatchRect: { value: new THREE.Vector4() },
  uPatchOn: { value: 0 },
  uDentRect: { value: new THREE.Vector4() },
  uDent: { value: 0 },
  uSize: { value: new THREE.Vector2(SW, SH) },
  uCorner: { value: 0.06 },
  uTile: { value: 0 },
  uTileTop: { value: new THREE.Color(TL.logo.tile_top) },
  uTileBot: { value: new THREE.Color(TL.logo.tile).multiplyScalar(0.82) },
  uIcon: { value: iconTex },
  uIconOn: { value: iconTex ? 1 : 0 },
  uIconScale: { value: TL.logo.icon_scale ?? 0.73 },
}
const screenMat = new THREE.ShaderMaterial({
  uniforms: su,
  vertexShader: `varying vec2 vUv; void main(){ vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position,1.0); }`,
  fragmentShader: `
    uniform sampler2D texA, texB, uPatch, uIcon;
    uniform float uMix, uMode, uAspect, uGlow, uPower, uPatchOn, uDent, uCorner, uTile, uIconOn, uIconScale;
    uniform vec2 uCenter, uSize; uniform vec4 uPatchRect, uDentRect; uniform vec3 uTint, uTileTop, uTileBot;
    varying vec2 vUv;
    float box(vec2 p, vec2 b, float r){ vec2 q = abs(p) - b + r; return length(max(q,0.0)) + min(max(q.x,q.y),0.0) - r; }
    bool inside(vec2 p, vec4 r){ return p.x > r.x && p.x < r.x + r.z && p.y > r.y && p.y < r.y + r.w; }
    void main(){
      // Rounded corners (they grow as the screen becomes the icon).
      if (box((vUv - 0.5) * uSize, uSize * 0.5, uCorner) > 0.0) discard;
      vec2 px = vec2(vUv.x, 1.0 - vUv.y); // UI coords 0..1, y down
      float dark = 0.0;
      // A small dent where the hero presses.
      if (uDent > 0.001 && inside(px, uDentRect)) {
        vec2 c = uDentRect.xy + uDentRect.zw * 0.5;
        px = c + (px - c) * (1.0 + 0.035 * uDent);
        dark = 0.14 * uDent;
      }
      vec2 uv = vec2(px.x, 1.0 - px.y);
      vec3 a = texture2D(texA, uv).rgb;
      vec3 b = texture2D(texB, uv).rgb;
      float m = uMix; float edge = 0.0;
      if (uMode > 0.5) {
        // The next screen ripples out from the press. The ring is wide: a thin one moves further
        // than its width between motion-blur subframes and shows as several rings.
        float d = distance(px * vec2(uAspect, 1.0), uCenter * vec2(uAspect, 1.0));
        float R = uMix * 2.2;
        m = smoothstep(R, R - 0.05, d);
        edge = smoothstep(0.045, 0.0, abs(d - R)) * (1.0 - uMix) * 0.18;
      }
      vec3 c = mix(a, b, m);
      // Typed text: the field as captured at this step of the typing.
      if (uPatchOn > 0.5 && inside(px, uPatchRect)) {
        vec2 l = (px - uPatchRect.xy) / uPatchRect.zw;
        c = texture2D(uPatch, vec2(l.x, 1.0 - l.y)).rgb;
      }
      c = c * (1.0 - dark) + edge * uTint;
      // Power: off is black glass; switching on, a bright line opens up into the picture.
      float open = clamp(uPower * 1.25, 0.0, 1.0);
      float band = smoothstep(open * 0.5 + 0.002, open * 0.5 - 0.002, abs(vUv.y - 0.5));
      float line = (1.0 - smoothstep(0.0, 0.2, uPower)) * smoothstep(0.004, 0.0, abs(vUv.y - 0.5)) * step(0.001, uPower) * 4.0;
      vec3 col = c * uGlow * band * smoothstep(0.0, 0.6, uPower) + line;
      // Becoming the icon: the tile's gradient (and the app's icon, if there is one).
      vec3 tile = mix(uTileBot, uTileTop, vUv.y);
      if (uIconOn > 0.5) {
        vec2 iv = (vUv - 0.5) / uIconScale + 0.5;
        if (iv.x > 0.0 && iv.x < 1.0 && iv.y > 0.0 && iv.y < 1.0) { vec4 ic = texture2D(uIcon, iv); tile = mix(tile, ic.rgb, ic.a); }
      }
      gl_FragColor = vec4(mix(col, tile * 1.08, uTile), 1.0);
    }`,
})
const screen = new THREE.Mesh(new THREE.PlaneGeometry(1, 1), screenMat)
screenGroup.add(screen)
// The hero's shadow on the picture, so it reads as standing on the app.
const catcher = new THREE.Mesh(new THREE.PlaneGeometry(1, 1), new THREE.ShadowMaterial({ opacity: 0.45, depthWrite: false }))
catcher.position.z = 0.004
catcher.receiveShadow = true
screenGroup.add(catcher)

// The glass in front of the app: invisible but for a faint sheen and the ripple when the hero
// passes through it.
const gu = { uRip: { value: [new THREE.Vector4(0, 0, -9, 0), new THREE.Vector4(0, 0, -9, 0)] }, uTime: { value: 0 }, uFade: { value: 1 } }
const glass = new THREE.Mesh(
  new THREE.PlaneGeometry(SW, SH),
  new THREE.ShaderMaterial({
    uniforms: gu,
    transparent: true,
    depthWrite: false,
    blending: THREE.AdditiveBlending,
    vertexShader: `varying vec3 vW; void main(){ vW = (modelMatrix * vec4(position, 1.0)).xyz; gl_Position = projectionMatrix * viewMatrix * vec4(vW, 1.0); }`,
    fragmentShader: `
      uniform vec4 uRip[2]; uniform float uTime, uFade; varying vec3 vW;
      void main(){
        float c = 0.0;
        for (int i = 0; i < 2; i++) {
          float dt = uTime - uRip[i].z;
          if (dt > 0.0 && dt < 0.8) {
            float d = distance(vW.xy, uRip[i].xy);
            float R = dt * 2.6;
            c += smoothstep(0.18, 0.0, abs(d - R)) * pow(1.0 - dt / 0.8, 2.0) * 0.16;
            c += smoothstep(0.45, 0.0, d) * smoothstep(0.2, 0.0, dt) * 0.4;
          }
        }
        float sheen = 0.012 * smoothstep(3.0, 0.0, abs(vW.x - vW.y * 0.6 - 2.0));
        gl_FragColor = vec4(vec3(0.85, 0.92, 1.0) * (c + sheen) * uFade, 1.0);
      }`,
  }),
)
glass.position.z = GLASS_Z
scene.add(glass)

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

const hero = new THREE.Group() // feet at the origin
hero.scale.setScalar(SIZE)
const body = new THREE.Group() // squash, stretch, lean
hero.add(body)
const bodyMesh = new THREE.Mesh(heroGeo, toyMat)
bodyMesh.castShadow = bodyMesh.receiveShadow = true
body.add(bodyMesh)
const face = createFace(HERO, { ink: TL.hero.dark })
body.add(face.mesh)
const legs = HERO.LEGS.at.map(([x, z], i) => {
  const l = new THREE.Mesh(new THREE.CapsuleGeometry(HERO.LEGS.radius, HERO.LEGS.length, 4, 10), toyMat)
  l.position.set(x, HERO.LEGS.y, z)
  l.castShadow = true
  l.userData.phase = (i === 0 || i === 3 ? 0 : Math.PI) // diagonal pairs step together
  hero.add(l)
  return l
})
const propGroup = HERO.prop(TL.hero)
if (propGroup) body.add(propGroup)
scene.add(hero)

// ---------- where the hero can stand ----------
function spotOf(to) {
  if (to === 'pedestal') return PEDESTAL.clone()
  if (to === 'logo') return LOGO_AT.clone().add(new THREE.Vector3(0, -0.45 * SIZE, 0.3))
  return ui(to.ui[0], to.ui[1], HERO_Z)
}
const moves = TL.moves.map((m, i) => ({ ...m, i, p0: spotOf(m.from), p1: spotOf(m.to) }))
// Where each glass crossing happens, for the ripple.
for (const m of moves.filter((m) => m.glass)) {
  const u = clamp((m.p0.z - GLASS_Z) / (m.p0.z - m.p1.z))
  m.cross = { u, t: m.t0 + u * (m.t1 - m.t0) }
}

/** The hero's position along a move at fraction u. */
function along(m, u) {
  const p = new THREE.Vector3().lerpVectors(m.p0, m.p1, u)
  if (m.kind === 'hop') {
    const up = m.h + Math.max(0, m.p1.y - m.p0.y) * 0.5
    p.y += 4 * up * u * (1 - u)
  }
  return p
}

// ---------- problem cards ----------
function cardTexture(text, i) {
  const c = document.createElement('canvas')
  c.width = 720
  c.height = 200
  const x = c.getContext('2d')
  const r = 36
  x.fillStyle = '#1f1a17'
  x.strokeStyle = '#4a3d36'
  x.lineWidth = 4
  x.beginPath()
  x.roundRect(6, 6, 708, 188, r)
  x.fill()
  x.stroke()
  x.fillStyle = ['#ff6b5a', '#ffb54a', '#ff6b5a', '#ffb54a'][i % 4]
  x.beginPath()
  x.arc(64, 100, 18, 0, Math.PI * 2)
  x.fill()
  x.fillStyle = '#f4ece6'
  x.font = '600 54px Inter, "Helvetica Neue", Arial, sans-serif'
  x.textBaseline = 'middle'
  x.fillText(text, 104, 102, 590)
  const t = new THREE.CanvasTexture(c)
  t.colorSpace = THREE.SRGBColorSpace
  t.anisotropy = 8
  return t
}
const CARD_AT = [
  [-1.75, 1.35, 0.4],
  [1.6, 1.75, 0.1],
  [-1.35, 2.35, -0.3],
  [1.85, 0.75, 0.5],
]
const cards = TL.cards.map((c, i) => {
  const m = new THREE.Mesh(new THREE.PlaneGeometry(1.62, 0.45), new THREE.MeshBasicMaterial({ map: cardTexture(c.text, i), transparent: true, depthWrite: false, toneMapped: true }))
  m.visible = false
  scene.add(m)
  const r = rng(40 + i)
  const at = PEDESTAL.clone().add(new THREE.Vector3(...CARD_AT[i % CARD_AT.length]))
  return { ...c, m, at, spin: new THREE.Vector3(r() * 6 - 3, r() * 6 - 3, r() * 10 - 5), away: at.clone().sub(PEDESTAL.clone().add(new THREE.Vector3(0, 0.5, 0))).normalize().multiplyScalar(7) }
})

// ---------- presses, typing, sparks, confetti, chips ----------
const flashMat = (w, h) =>
  new THREE.ShaderMaterial({
    transparent: true,
    depthWrite: false,
    blending: THREE.AdditiveBlending,
    uniforms: { uA: { value: 0 }, uSize: { value: new THREE.Vector2(w, h) }, uTint: su.uTint },
    vertexShader: `varying vec2 vUv; void main(){ vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position,1.0); }`,
    fragmentShader: `
      uniform float uA; uniform vec2 uSize; uniform vec3 uTint; varying vec2 vUv;
      float rr(vec2 p, vec2 b, float r){ vec2 q = abs(p) - b + r; return length(max(q,0.0)) + min(max(q.x,q.y),0.0) - r; }
      void main(){
        // An outline, not a fill: a filled flash turns a big element into a bright block.
        vec2 p = (vUv - 0.5) * uSize;
        float d = rr(p, uSize * 0.5 - 0.05, 0.07);
        float ring = smoothstep(0.04, 0.0, abs(d));
        gl_FragColor = vec4(uTint * ring * uA * 1.6, 1.0);
      }`,
  })
const flashes = TL.actions
  .filter((a) => a.rect && ['press', 'stamp', 'cheer'].includes(a.does))
  .map((a) => {
    const w = a.rect.w * S + 0.1
    const h = a.rect.h * S + 0.1
    const m = new THREE.Mesh(new THREE.PlaneGeometry(w, h), flashMat(w, h))
    m.position.copy(ui(...centreOf(a.rect), 0.012))
    m.visible = false
    screenGroup.add(m)
    return { m, t: a.t }
  })

const sparkGeo = new THREE.SphereGeometry(0.022, 6, 6)
const sparkMat = new THREE.MeshBasicMaterial({ color: tint.clone().lerp(new THREE.Color(0xffd27a), 0.5) })
const strike = new THREE.Vector3(...(HERO.STRIKE ?? [0, 0, 0])).multiplyScalar(SIZE)
const bursts = []
const restAt = (t) => {
  let p = PEDESTAL.clone()
  for (const m of moves) if (t >= m.t1) p = m.p1.clone()
  return p
}
for (const a of TL.actions) if (a.does === 'stamp') bursts.push({ t: a.t, at: restAt(a.t).add(strike), n: 26, speed: 3.0, life: 0.6, seed: Math.round(a.t * 100) })
bursts.push({ t: TL.finale.splash, at: LOGO_AT.clone().add(new THREE.Vector3(0, 0, 0.3)), n: 60, speed: 4.5, life: 1.1, seed: 99, logo: true })
for (const b of bursts) {
  const r = rng(b.seed)
  b.parts = Array.from({ length: b.n }, () => {
    const m = new THREE.Mesh(sparkGeo, b.logo ? new THREE.MeshBasicMaterial({ color: r() < 0.5 ? 0xffffff : tint.clone().lerp(new THREE.Color(0xffffff), 0.5) }) : sparkMat)
    m.visible = false
    scene.add(m)
    const a = r() * Math.PI * 2
    const up = b.logo ? (r() - 0.5) * 2 : 0.5 + r() * 1.2
    return { m, v: new THREE.Vector3(Math.cos(a), up, b.logo ? Math.sin(a) : 0.4 + r()).normalize().multiplyScalar(b.speed * (0.5 + r() * 0.7)), s: 0.6 + r() * 1.2 }
  })
}

const confetti = []
for (const a of TL.actions.filter((a) => a.does === 'cheer')) {
  const r = rng(5 + Math.round(a.t))
  const colours = [tint, new THREE.Color(0xffffff), new THREE.Color(0x3fd0b0), new THREE.Color(0xffd166), new THREE.Color(TL.logo.tile)]
  const at = restAt(a.t).add(new THREE.Vector3(0, 0.7 * SIZE, 0.2))
  for (let i = 0; i < 80; i++) {
    const m = new THREE.Mesh(new THREE.PlaneGeometry(0.07, 0.11), new THREE.MeshBasicMaterial({ color: colours[i % colours.length], side: THREE.DoubleSide }))
    m.visible = false
    scene.add(m)
    const ang = r() * Math.PI * 2
    confetti.push({ m, t: a.t, at, v: new THREE.Vector3(Math.cos(ang) * (0.8 + r() * 2), 3 + r() * 3, 0.5 + r() * 1.5), w: new THREE.Vector3(r() * 12, r() * 12, r() * 12) })
  }
}

// Chips (files, cards) fly in from the camera into a zone as the hero stamps it.
const chips = []
for (const a of TL.actions.filter((a) => a.chips?.length)) {
  const r = rng(3 + Math.round(a.t))
  const stripes = [new THREE.Color(TL.logo.tile), new THREE.Color(0x3fd0b0), new THREE.Color(0x6aa8ff), new THREE.Color(0xffd166), tint]
  a.chips.forEach((z, i) => {
    const chip = new THREE.Mesh(new RoundedBoxGeometry(0.55, 0.32, 0.04, 2, 0.015), new THREE.MeshPhysicalMaterial({ color: 0xf4ece6, roughness: 0.35, emissive: 0x302826 }))
    const stripe = new THREE.Mesh(new THREE.BoxGeometry(0.16, 0.32, 0.045), new THREE.MeshBasicMaterial({ color: stripes[i % stripes.length] }))
    stripe.position.x = -0.195
    chip.add(stripe)
    chip.castShadow = true
    chip.visible = false
    scene.add(chip)
    const to = ui(z.x + z.w * (0.25 + 0.5 * r()), z.y + z.h * (0.3 + 0.4 * r()), 0.05)
    const from = to.clone().add(new THREE.Vector3((r() - 0.5) * 5, 2 + r() * 2, 6 + r() * 2))
    chips.push({ chip, from, to, t0: a.t - 0.3 + i * 0.04, t1: a.t + 0.04 + i * 0.04, spin: (r() - 0.5) * 8 })
  })
}

// ---------- the logo ----------
const logo = new THREE.Group()
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
let icon = null
if (iconTex) {
  const s = 2.6 * (TL.logo.icon_scale ?? 0.73)
  icon = new THREE.Mesh(new THREE.PlaneGeometry(s, s), new THREE.MeshBasicMaterial({ map: iconTex, transparent: true, depthWrite: false }))
  icon.position.z = 0.215
  logo.add(icon)
}
// The hero, flat and in the emblem colour, becomes the mark; its face is drawn in the tile colour.
const ES = 1.1 // the mark's size on the tile
const emblem = new THREE.Group()
const emblemFace = createFace(HERO, { ink: TL.logo.tile })
{
  const ec = new THREE.Color(TL.logo.emblem ?? '#FFFFFF')
  emblem.add(new THREE.Mesh(heroGeo, new THREE.MeshPhysicalMaterial({ color: ec, roughness: 0.35, emissive: ec, emissiveIntensity: 0.12 })))
  emblem.add(emblemFace.mesh)
  emblemFace.set(MOODS.happy, { look: [0, 0] })
  const c = new THREE.Vector3()
  heroGeo.boundingBox.getCenter(c)
  emblem.userData.offset = new THREE.Vector3(-c.x * ES, -c.y * ES, 0.2)
  emblem.visible = false
  logo.add(emblem)
}
const ripple = new THREE.Mesh(new THREE.RingGeometry(0.9, 1.0, 64), new THREE.MeshBasicMaterial({ color: 0xffffff, transparent: true, opacity: 0, depthWrite: false, blending: THREE.AdditiveBlending }))
ripple.position.z = 0.23
logo.add(ripple)
logo.visible = false
scene.add(logo)

// ---------- the hero over time ----------
const actionsOf = (kind) => TL.actions.filter((a) => a.does === kind)
// The prop's poses (hero.js PROP): angles that keep it outside the body.
const PP = HERO.PROP?.poses ?? { rest: 0.3, wind: -0.3, strike: 1.7, bigWind: -0.6, bigStrike: 2.0, wave: [-0.4, 0.2], tap: [0.6, 1.5], swat: [-0.6, 2.0] }
const PROP_MIN = HERO.PROP?.min ?? -Math.PI
const PROP_MAX = HERO.PROP?.max ?? Math.PI
const wake = actionsOf('wake')[0]

/** Where the hero is and how it moves at time t. */
function pose(t) {
  const p = { pos: PEDESTAL.clone(), yaw: 0, pitch: 0, roll: 0, sy: 1, legs: 1, lift: [0, 0, 0, 0], prop: PP.rest, flight: false, visible: true, scale: 1, walking: false }
  let last = -1
  for (const m of moves) if (t >= m.t0) last = m.i
  if (last >= 0) {
    const m = moves[last]
    const dir = new THREE.Vector3().subVectors(m.p1, m.p0)
    // Turn towards where it's going, but never so far that the face is lost.
    const travelYaw = m.to === 'logo' ? 0 : dir.z < -0.5 ? Math.sign(dir.x || 1) * 1.2 : clamp(Math.atan2(dir.x, Math.max(dir.z, 0.6)), -1.05, 1.05)
    if (t < m.t1) {
      const u = (t - m.t0) / (m.t1 - m.t0)
      p.pos.copy(along(m, u))
      p.yaw = lerp(0, travelYaw, sstep(0, 0.22, u))
      if (m.kind === 'hop') {
        p.flight = true
        p.sy = 1 + 0.13 * Math.pow(Math.abs(2 * u - 1), 1.5)
        p.legs = 0.45
        if (m.to === 'logo') {
          p.pitch = -sstep(0.3, 1, u) * 0.6
          p.scale = 1 - sstep(0.8, 1, u)
        }
      } else {
        // Walking: a waddle, diagonal leg pairs stepping, a little bob.
        p.walking = true
        const ph = (t - m.t0) * Math.PI * 2 * 3.2
        p.pos.y += Math.abs(Math.sin(ph)) * 0.035
        p.roll = 0.07 * Math.sin(ph)
        p.lift = legs.map((l) => Math.max(0, Math.sin(ph + l.userData.phase)) * 0.06)
      }
    } else {
      p.pos.copy(m.p1)
      p.yaw = lerp(travelYaw, 0, sstep(m.t1, m.t1 + 0.3, t))
      if (m.kind === 'hop') p.sy = 1 - 0.3 * spring(t - m.t1, 30, 11)
      if (m.to === 'logo') p.visible = false
    }
    const next = moves[last + 1]
    if (next && next.kind === 'hop' && t > next.t0 - 0.16 && t < next.t0) p.sy *= 1 - 0.2 * sstep(next.t0 - 0.16, next.t0 - 0.03, t)
  } else if (moves[0] && t > moves[0].t0 - 0.16) p.sy *= 1 - 0.2 * sstep(moves[0].t0 - 0.16, moves[0].t0 - 0.03, t)

  // Waking up: a little startled hop.
  if (wake && t > wake.t && t < wake.t + 0.45) {
    const u = (t - wake.t) / 0.45
    p.pos.y += 4 * 0.22 * u * (1 - u)
  }
  if (wake && t < wake.t) p.sy *= 1 + 0.015 * Math.sin(t * 2.1) // slow sleepy breathing

  // The prop: wind-up and strike for a press, taps while typing, waves, a big swat. Every pose is
  // an angle from hero.js (PROP), as an offset from rest, and the sum stays in the safe sector.
  const R = PP.rest
  let dp = 0
  for (const a of TL.actions) {
    if (a.does === 'press' || a.does === 'stamp') {
      const big = a.does === 'stamp'
      const wind = sstep(a.t - 0.3, a.t - 0.08, t) * (1 - sstep(a.t - 0.08, a.t, t))
      const hit = sstep(a.t - 0.08, a.t, t) * (1 - sstep(a.t + 0.12, a.t + 0.45, t))
      dp += wind * ((big ? PP.bigWind : PP.wind) - R) + hit * ((big ? PP.bigStrike : PP.strike) - R)
      p.sy *= 1 - 0.12 * pulse(t, a.t + 0.02, 0.06)
    }
    if (a.does === 'type' && t > a.start - 0.25 && t < a.end + 0.3) {
      const on = sstep(a.start - 0.25, a.start - 0.05, t) * (1 - sstep(a.end, a.end + 0.3, t))
      let tap = 0
      for (let k = 0; k < a.steps.length; k++) tap = Math.max(tap, pulse(t, a.start + k * a.tap, 0.04))
      dp += on * (PP.tap[0] - R + tap * (PP.tap[1] - PP.tap[0]))
      p.pitch += 0.12 * on // leans in to the field
    }
    if ((a.does === 'cheer' || a.does === 'wave') && t > a.t - 0.1 && t < a.end) {
      const e = sstep(a.t - 0.1, a.t + 0.1, t) * (1 - sstep(a.end - 0.2, a.end, t))
      const [lo, hi] = PP.wave
      dp += e * (lo + (hi - lo) * (0.5 + 0.5 * Math.sin((t - a.t) * 16)) - R)
    }
    if (a.does === 'swat') {
      const wind = sstep(a.t - 0.25, a.t - 0.05, t) * (1 - sstep(a.t - 0.05, a.t + 0.02, t))
      const hit = sstep(a.t - 0.05, a.t + 0.06, t) * (1 - sstep(a.t + 0.25, a.t + 0.55, t))
      dp += wind * (PP.swat[0] - R) + hit * (PP.swat[1] - R)
      p.yaw += wind * 0.5 - hit * 0.6
    }
  }
  p.prop = clamp(R + dp, PROP_MIN, PROP_MAX)
  return p
}

// ---------- the face over time ----------
const faceKeys = TL.face
function moodAt(t) {
  let base = MOODS.happy
  let burst = null
  for (const k of faceKeys) {
    if (k.t > t) break
    if (!k.mood) continue
    if (k.burst) {
      if (t < k.t + k.burst) burst = MOODS[k.mood]
    } else {
      base = MOODS[k.mood] ?? base
      burst = null
    }
  }
  return burst ?? base
}
function lookKeyAt(t) {
  let look = 'camera'
  for (const k of faceKeys) {
    if (k.t > t) break
    if (k.look) look = k.look
  }
  return look
}
/** The look as eye offsets (-1..1): at the camera, at the next move's destination, or given. */
function lookAt(t, yaw) {
  const k = lookKeyAt(t)
  if (Array.isArray(k)) return k
  if (k === 'move') {
    const m = moves.find((m) => m.t1 > t)
    if (m) {
      const d = new THREE.Vector3().subVectors(m.p1, m.p0)
      return [clamp(d.x * 0.6, -1, 1), clamp(d.y * 0.3, -0.6, 0.8)]
    }
  }
  // At the camera, compensating for the body's turn, with a little idle wander.
  return [clamp(-yaw * 0.7 + 0.12 * Math.sin(t * 0.9), -1, 1), 0.08 * Math.sin(t * 0.6 + 1)]
}
function voiceAt(t) {
  for (const l of TL.lines) {
    if (l.mouth && t >= l.at && t < l.at + (l.seconds ?? 0)) {
      const f = (t - l.at) * (l.rate ?? 60)
      const i = Math.floor(f)
      const u = f - i
      const g = (arr) => lerp(arr[i] ?? 0, arr[i + 1] ?? 0, u)
      return { line: l, open: g(l.mouth.open), round: g(l.mouth.round), wide: g(l.mouth.wide) }
    }
  }
  return { line: null, open: 0, round: 0, wide: 0 }
}
function faceAt(t, yaw) {
  // Moods blend over ~0.2 s: the average of the mood over the last moments.
  let m = null
  let wsum = 0
  for (let k = 0; k < 6; k++) {
    const w = 6 - k
    const mk = moodAt(t - k * 0.035)
    m = m ? mixMood(m, mk, w / (wsum + w)) : mk
    wsum += w
  }
  let lx = 0
  let ly = 0
  for (let k = 0; k < 5; k++) {
    const [a, b] = lookAt(t - k * 0.03, yaw)
    lx += a / 5
    ly += b / 5
  }
  // Blinks every few seconds (not while asleep or squinting with joy).
  const ph = (t + 0.7) % 3.1
  const blink = ph < 0.12 ? 0.1 + 0.9 * Math.abs(ph - 0.06) / 0.06 : 1
  const v = voiceAt(t)
  return { mood: m, look: [lx, ly], blink, talk: v.line ? v : null, voice: v }
}

// ---------- the camera ----------
const heroFocus = (t) => pose(t).pos.add(new THREE.Vector3(0, 0.5 * SIZE, 0))
function smoothedHero(t) {
  const f = new THREE.Vector3()
  let wsum = 0
  for (let k = -4; k <= 7; k++) {
    const w = 1 - Math.abs(k - 1.5) / 7
    f.addScaledVector(heroFocus(t + k * 0.05), w)
    wsum += w
  }
  return f.multiplyScalar(1 / wsum)
}
/**
 * Where the follow camera looks: the spot the hero is heading for, reached a moment before it
 * lands (a camera operator leads the action), so the camera has settled when the press lands.
 */
function restTrack(t) {
  let p = PEDESTAL.clone()
  for (const m of moves) {
    if (t >= m.t1 - 0.1) {
      p = m.p1.clone()
      continue
    }
    if (t >= m.t0 - 0.25) p = m.p0.clone().lerp(m.p1, easeInOut(clamp((t - (m.t0 - 0.25)) / (m.t1 - m.t0 + 0.15))))
    break
  }
  return p.add(new THREE.Vector3(0, 0.5 * SIZE, 0))
}
/** Frames a point of the app at a zoom, never showing past the screen's edges. */
function frameApp(cx, cy, zoom, sway = 0) {
  const hv = SH / zoom
  const wv = hv * (W / H)
  const x = wv >= SW ? 0 : clamp(cx, -SW / 2 + wv / 2, SW / 2 - wv / 2)
  const y = hv >= SH ? 0 : clamp(cy, -SH / 2 + hv / 2, SH / 2 - hv / 2)
  const d = hv / 2 / TAN
  return { pos: new THREE.Vector3(x + sway, y + 0.08 * hv, d), look: new THREE.Vector3(x, y, 0) }
}
// Each shot gets the time, its start, its end and its options.
const SHOTS = {
  studio_wide: () => ({ pos: new THREE.Vector3(0, 0.6, 27), look: new THREE.Vector3(0, -1.6, 0), focus: PEDESTAL.clone(), aperture: 0.0008 }),
  studio_talk: (t) => {
    const f = PEDESTAL.clone().add(new THREE.Vector3(0, 0.48 * SIZE, 0))
    return { pos: f.clone().add(new THREE.Vector3(0.45 + 0.08 * Math.sin(t * 0.4), 0.42, 3.1)), look: f.clone().add(new THREE.Vector3(0, 0.02, 0)), focus: f, aperture: 0.0026 }
  },
  studio_mid: (t) => {
    const f = PEDESTAL.clone().add(new THREE.Vector3(0, 1.05, 0))
    return { pos: f.clone().add(new THREE.Vector3(0.1 * Math.sin(t * 0.5), 0.55, 6.8)), look: f, focus: PEDESTAL.clone().add(new THREE.Vector3(0, 0.5, 0.3)), aperture: 0.0016 }
  },
  screen: (t) => {
    const f = frameApp(0, 0, 0.94)
    return { ...f, focus: heroFocus(t), aperture: 0.0003 }
  },
  follow: (t, t0, t1, o) => {
    const f = restTrack(t)
    const fr = frameApp(f.x, f.y + 0.35 * SIZE, o.zoom ?? 2.3, 0.25 * Math.sin(t * 0.37))
    return { ...fr, focus: heroFocus(t), aperture: 0.0007 }
  },
  focus: (t, t0, t1, o) => {
    const [x, y, w, h] = o.rect
    const c = ui(x + w / 2, y + h / 2)
    const fr = frameApp(c.x, c.y, Math.min(SW / (w * S * 1.25), SH / (h * S * 1.4)))
    return { ...fr, focus: heroFocus(t), aperture: 0.0005 }
  },
  talk: (t) => {
    const f = smoothedHero(t)
    return { pos: f.clone().add(new THREE.Vector3(0.35, 0.3, 2.9)), look: f.clone(), focus: heroFocus(t), aperture: 0.0016 }
  },
  out: () => ({ pos: new THREE.Vector3(0, -0.4, 26), look: new THREE.Vector3(0, -1.8, 0), focus: PEDESTAL.clone(), aperture: 0.0006 }),
  logo: (t, t0, t1) => {
    const u = easeInOut(clamp((t - t0) / (t1 - t0)))
    const pos = LOGO_AT.clone().add(new THREE.Vector3(0, 0.5, 10.6)).lerp(LOGO_AT.clone().add(new THREE.Vector3(0, 0.1, 6.8)), u)
    const look = LOGO_AT.clone().add(new THREE.Vector3(0, -0.5, 0.8)).lerp(LOGO_AT.clone().add(new THREE.Vector3(0, -0.35, 0)), u)
    return { pos, look, focus: LOGO_AT.clone().add(new THREE.Vector3(0, 0, 0.25)), aperture: 0.0005 }
  },
}
function shotAt(i, t) {
  const c = TL.camera[i]
  return SHOTS[c.shot](t, c.t, TL.camera[i + 1]?.t ?? TL.duration, c)
}
function cameraAt(t) {
  let i = 0
  for (let k = 0; k < TL.camera.length; k++) if (t >= TL.camera[k].t) i = k
  const cur = shotAt(i, t)
  const blend = i > 0 ? easeInOut(clamp((t - TL.camera[i].t) / (TL.camera[i].blend ?? 0.9))) : 1
  if (blend >= 1) return cur
  const prev = shotAt(i - 1, t)
  return { pos: prev.pos.lerp(cur.pos, blend), look: prev.look.lerp(cur.look, blend), focus: prev.focus.lerp(cur.focus, blend), aperture: lerp(prev.aperture ?? 0.0016, cur.aperture ?? 0.0016, blend) }
}

// ---------- post ----------
// No MSAA (slow in software GL): each motion-blur subframe is jittered by a fraction of a pixel
// instead, so the average is antialiased too.
const composer = new EffectComposer(renderer, new THREE.WebGLRenderTarget(W, H, { type: THREE.HalfFloatType }))
composer.addPass(new RenderPass(scene, camera))
const bokeh = new BokehPass(scene, camera, { focus: 4, aperture: 0.0016, maxblur: 0.008 })
composer.addPass(bokeh)
composer.addPass(new UnrealBloomPass(new THREE.Vector2(W, H), 0.28, 0.45, 1.0))
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
const fin = TL.finale

function setTime(t) {
  // ----- the screen: which picture, the transition, typing, a press dent, power -----
  let si = 0
  for (let k = 0; k < TL.states.length; k++) if (t >= TL.states[k].t) si = k
  const st = TL.states[si]
  const prev = TL.states[si - 1]
  const dur = st.how === 'flip' ? 0.5 : 0.28
  const u = prev ? clamp((t - st.t) / dur) : 1
  su.texA.value = tex[prev && u < 1 ? prev.screen : st.screen]
  su.texB.value = tex[st.screen]
  su.uMix.value = u < 1 ? easeInOut(u) : 0
  su.uMode.value = st.how === 'flip' && u < 1 ? 1 : 0 // (after it, a ripple of radius 0 would glow at the press)
  const press = TL.actions.find((a) => a.rect && Math.abs(a.t - st.t) < 0.15)
  if (press) {
    const [cx, cy] = centreOf(press.rect)
    su.uCenter.value.set(cx / PX, cy / PY)
  }
  su.uPatchOn.value = 0
  for (const a of typing) {
    // Until the screen moves on (and through its crossfade: the next screenshot has the text).
    const still = st.t <= a.start || (prev && prev.t <= a.start && u < 1)
    if (t >= a.start && still && a.tex.length && a.clip) {
      const k = Math.min(a.tex.length - 1, Math.floor((t - a.start) / a.tap))
      su.uPatch.value = a.tex[k]
      su.uPatchRect.value.set(a.clip.x / PX, a.clip.y / PY, a.clip.w / PX, a.clip.h / PY)
      su.uPatchOn.value = 1
    }
  }
  su.uDent.value = 0
  for (const a of TL.actions) {
    if (!a.rect || !(a.does === 'press' || a.does === 'stamp')) continue
    const d = pulse(t, a.t + 0.03, 0.08)
    if (d > su.uDent.value) {
      su.uDent.value = d
      su.uDentRect.value.set(a.rect.x / PX, a.rect.y / PY, a.rect.w / PX, a.rect.h / PY)
    }
  }
  su.uPower.value = clamp((t - TL.power) / 0.45)

  // ----- the screen becomes the icon -----
  const [m0, m1] = fin.morph
  const mu = easeInOut(clamp((t - m0) / (m1 - m0)))
  const sw = lerp(SW, 2.6, mu)
  const sh = lerp(SH, 2.6, mu)
  screenGroup.position.lerpVectors(new THREE.Vector3(0, 0, 0), LOGO_AT.clone().add(new THREE.Vector3(0, 0, 0.215)), mu)
  screen.scale.set(sw, sh, 1)
  catcher.scale.set(sw, sh, 1)
  su.uSize.value.set(sw, sh)
  su.uCorner.value = lerp(0.06, 0.46, sstep(0.3, 1, mu))
  su.uTile.value = sstep(0.05, 0.75, mu)
  screenGroup.visible = t < m1
  bezel.scale.set(sw + 0.45, sh + 0.45, 0.45)
  bezel.position.copy(screenGroup.position).add(new THREE.Vector3(0, 0, -0.24))
  bezelMat.opacity = 1 - sstep(0, 0.45, mu)
  bezel.visible = bezelMat.opacity > 0.01
  catcher.visible = mu < 0.05
  gu.uTime.value = t
  gu.uFade.value = 1 - sstep(m0, m0 + 0.3, t)
  glass.visible = gu.uFade.value > 0.01
  let ri = 0
  for (const m of moves) {
    if (m.cross && ri < 2) {
      const p = along(m, m.cross.u)
      gu.uRip.value[ri++].set(p.x, p.y, m.cross.t, 0)
    }
  }

  // ----- lights -----
  const on = sstep(TL.light, TL.light + 0.06, t) * (t < TL.light + 0.2 ? 0.85 + 0.15 * Math.sin(t * 90) : 1)
  const inApp = sstep(TL.music.drop - 0.6, TL.music.drop + 0.4, t) * (1 - sstep(fin.morph[0] - 0.8, fin.morph[0], t))
  spot.intensity = 14 * on * (1 - 0.85 * inApp)
  key.intensity = 2.1 * lerp(0.03, 1, on)
  rim.intensity = 1.3 * lerp(0.02, 1, on)
  hemi.intensity = 0.45 * lerp(0.05, 1, on)
  screenLight.intensity = 1.1 * su.uPower.value * (1 - mu)

  // ----- the hero -----
  const p = pose(t)
  hero.visible = p.visible
  hero.position.copy(p.pos)
  const fa = faceAt(t, p.yaw)
  const talking = fa.voice.open
  hero.rotation.set(p.pitch + 0.05 * talking, p.yaw, p.roll, 'YXZ')
  const breathe = p.flight ? 0 : 0.012 * Math.sin(t * 3.1)
  const sy = (p.sy + breathe + talking * 0.02) * p.scale
  const sxz = (1 / Math.sqrt(Math.max(0.3, p.sy))) * p.scale
  body.scale.set(sxz, sy, sxz)
  legs.forEach((l, i) => {
    l.scale.set(p.scale, p.legs * p.scale, p.scale)
    l.position.y = HERO.LEGS.y + (p.lift[i] ?? 0)
  })
  face.set(fa.mood, { look: fa.look, blink: fa.blink, talk: fa.talk })
  if (propGroup) propGroup.rotation.z = p.prop

  // ----- cards, flashes, chips, sparks, confetti -----
  for (const c of cards) {
    const dt = t - c.t
    const out = t - c.out
    c.m.visible = dt > 0 && out < 0.8
    if (!c.m.visible) continue
    const s = easeOutBack(clamp(dt / 0.3), 2.2)
    c.m.scale.setScalar(Math.max(0.001, s))
    c.m.position.copy(c.at).add(new THREE.Vector3(0.03 * Math.sin(t * 7 + c.i), 0.05 * Math.sin(t * 2.3 + c.i * 1.7), 0))
    c.m.rotation.set(0, 0, 0.06 * Math.sin(t * 2 + c.i))
    if (out > 0) {
      c.m.position.addScaledVector(c.away, out)
      c.m.position.y -= 3 * out * out
      c.m.rotation.set(c.spin.x * out, c.spin.y * out, c.spin.z * out)
      c.m.material.opacity = 1 - sstep(0.4, 0.8, out)
    }
  }
  for (const f of flashes) {
    const dt = t - f.t
    f.m.visible = dt > 0 && dt < 0.5
    if (f.m.visible) {
      const k = dt / 0.5
      f.m.scale.setScalar(1 + 0.2 * k)
      f.m.material.uniforms.uA.value = Math.pow(1 - k, 2)
    }
  }
  for (const c of chips) {
    c.chip.visible = t > c.t0 && t < c.t1 + 0.12
    if (!c.chip.visible) continue
    const k = clamp((t - c.t0) / (c.t1 - c.t0))
    const e = 1 - Math.pow(1 - k, 2)
    c.chip.position.lerpVectors(c.from, c.to, e)
    c.chip.position.y += Math.sin(k * Math.PI) * 0.6
    c.chip.rotation.set(0.5 * (1 - e), c.spin * (1 - e), 0.6 * (1 - e))
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
    c.m.visible = dt > 0 && dt < 1.8 && t < fin.morph[0]
    if (!c.m.visible) continue
    c.m.position.copy(c.at).addScaledVector(c.v, dt)
    c.m.position.y -= 0.5 * 6 * dt * dt
    c.m.rotation.set(c.w.x * dt, c.w.y * dt, c.w.z * dt)
  }

  // ----- the logo: the 3D tile takes over from the shrunken screen, the hero dives in -----
  logo.visible = t >= m1
  logo.position.copy(LOGO_AT)
  const ds = t - fin.splash
  const swap = t - m1
  logo.scale.setScalar(1 + (swap > 0 ? 0.06 * spring(swap, 20, 8) : 0) + (ds > 0 ? 0.1 * Math.exp(-ds * 6) * Math.sin(ds * 24) : 0))
  if (icon) icon.scale.setScalar(Math.max(0.001, 1 - sstep(fin.splash, fin.splash + 0.2, t)))
  const [e0, e1] = fin.emblem
  emblem.visible = t > e0
  const eu = easeOutBack(clamp((t - e0) / (e1 - e0)), 1.6)
  emblem.scale.set(ES * eu, ES * eu, 0.12 * Math.max(eu, 0.01))
  emblem.position.copy(emblem.userData.offset).multiply(new THREE.Vector3(eu, eu, 1))
  emblemFace.set(MOODS.happy, { blink: (t + 0.3) % 2.7 < 0.1 ? 0.15 : 1 })
  ripple.material.opacity = ds > 0 ? 0.9 * (1 - clamp(ds / 0.6)) : 0
  ripple.scale.setScalar(0.2 + clamp(ds / 0.6) * 1.6)

  // ----- camera, focus, lights that follow -----
  const c = cameraAt(t)
  camera.position.copy(c.pos)
  camera.lookAt(c.look)
  bokeh.uniforms.focus.value = camera.position.distanceTo(c.focus)
  bokeh.uniforms.aperture.value = c.aperture ?? 0.0016
  const kf = p.visible ? p.pos : LOGO_AT
  key.position.copy(kf).add(new THREE.Vector3(-3.0, 5.0, 7.0))
  key.target.position.copy(kf)
  rim.position.copy(kf).add(new THREE.Vector3(3, 4, -6))
  rim.target.position.copy(kf)
  logoLight.intensity = 30 * sstep(m0 + 0.4, m1, t)
  logoLight.position.copy(camera.position).add(new THREE.Vector3(1.5, 2.5, 0))
  logoLight.target.position.copy(LOGO_AT)

  // ----- captions and the end card -----
  const cap = TL.lines.find((l) => l.caption !== false && t >= l.at - 0.05 && t < l.at + (l.seconds ?? 0) + 0.35)
  caption.textContent = cap ? cap.text : ''
  caption.style.opacity = cap ? String(sstep(cap.at - 0.05, cap.at + 0.08, t) * (1 - sstep(cap.at + cap.seconds + 0.2, cap.at + cap.seconds + 0.35, t))) : '0'
  const wm = sstep(fin.wordmark, fin.wordmark + 0.45, t)
  wordmark.style.opacity = String(wm)
  wordmark.style.transform = `translateY(${(1 - wm) * 18}px)`
  fade.style.opacity = String(sstep(fin.end_fade[0], fin.end_fade[1], t))
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
  setTime(fin.end_fade[0] - 0.1)
  for (const o of [hero, pedestal, floor, screenGroup, bezel, glass]) o.visible = false
  const a = W / H
  const cam = new THREE.OrthographicCamera(-1.55 * a, 1.55 * a, 1.55, -1.55, 0.1, 50)
  cam.position.copy(LOGO_AT).add(new THREE.Vector3(0, 0, 8))
  cam.lookAt(LOGO_AT)
  const fog = scene.fog
  scene.background = null
  scene.fog = null
  renderer.setRenderTarget(null)
  renderer.setClearColor(0x000000, 0)
  renderer.clear()
  renderer.render(scene, cam)
  scene.background = studio
  scene.fog = fog
  return renderer.domElement.toDataURL('image/png')
}

window.ready = true
