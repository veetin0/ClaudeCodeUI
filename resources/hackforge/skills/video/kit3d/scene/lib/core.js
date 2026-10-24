// The engine every clip shares: renderer, studio light and atmosphere, post-processing (bloom,
// shallow focus, a look grade), 0.5-shutter motion blur from jittered subframes, the camera system
// (named shots, blended), captions and the end card. Modules add objects, per-frame updates and
// shots to the context this returns.
import * as THREE from 'three'
import { RoomEnvironment } from 'three/addons/environments/RoomEnvironment.js'
import { RectAreaLightUniformsLib } from 'three/addons/lights/RectAreaLightUniformsLib.js'
import { EffectComposer } from 'three/addons/postprocessing/EffectComposer.js'
import { RenderPass } from 'three/addons/postprocessing/RenderPass.js'
import { BokehPass } from 'three/addons/postprocessing/BokehPass.js'
import { UnrealBloomPass } from 'three/addons/postprocessing/UnrealBloomPass.js'
import { OutputPass } from 'three/addons/postprocessing/OutputPass.js'
import { clamp, easeInOut, lerp, sstep } from './util.js'

export function createCore(TL) {
  const Q = new URLSearchParams(location.search)
  const W = Number(Q.get('w') ?? 1920)
  const H = Number(Q.get('h') ?? 1080)
  const SUB = Number(Q.get('sub') ?? 5)
  // Khronos PBR Neutral keeps brand colours true (three's AgX greys saturated colours out).
  const TM = Q.get('tm') ?? 'neutral'
  const LOOK = Number(Q.get('look') ?? 0.2)
  document.documentElement.style.setProperty('--h', `${H}px`)

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
  const studio = new THREE.Color(TL.set?.studio ?? '#120C0A')
  scene.background = studio
  scene.fog = new THREE.FogExp2(studio, TL.set?.haze ?? 0.008)
  scene.environment = new THREE.PMREMGenerator(renderer).fromScene(new RoomEnvironment(), 0.04).texture
  scene.environmentIntensity = 0.45
  const camera = new THREE.PerspectiveCamera(34, W / H, 0.05, 200)

  // A key light that follows the subject (tight shadows), a rim from behind, a soft fill.
  const key = new THREE.DirectionalLight(0xfff1e4, 2.1)
  key.castShadow = true
  key.shadow.mapSize.set(1536, 1536)
  key.shadow.camera.left = key.shadow.camera.bottom = -2.6
  key.shadow.camera.right = key.shadow.camera.top = 2.6
  key.shadow.camera.near = 0.5
  key.shadow.camera.far = 30
  key.shadow.bias = -0.0004
  key.shadow.normalBias = 0.02
  const rim = new THREE.DirectionalLight(0xffc9a8, 1.3)
  const hemi = new THREE.HemisphereLight(0x6b5a52, 0x0b0705, 0.45)
  scene.add(key, key.target, rim, rim.target, hemi)

  const ctx = {
    TL,
    Q,
    W,
    H,
    FPS: TL.fps,
    scene,
    renderer,
    camera,
    studio,
    tint: new THREE.Color(TL.hero?.color ?? TL.brand?.accent ?? '#EE8A4A'),
    lights: { key, rim, hemi, level: 1 }, // level: 0..1, set by the stage (the light clunking on)
    updaters: [], // (t) => void, in the order modules were added
    shots: {}, // name → (t, start, end, options) => { pos, look, focus, aperture }
    subject: () => new THREE.Vector3(0, 0, 0), // what the key light follows
    anchors: {},
  }

  // ---------- the camera ----------
  function shotAt(i, t) {
    const c = TL.camera[i]
    const fn = ctx.shots[c.shot]
    if (!fn) throw new Error(`no camera shot "${c.shot}" (loaded: ${Object.keys(ctx.shots).join(', ')})`)
    return fn(t, c.t, TL.camera[i + 1]?.t ?? TL.duration, c)
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

  // ---------- captions and the end card ----------
  const caption = document.getElementById('caption')
  const wordmark = document.getElementById('wordmark')
  const fade = document.getElementById('fade')
  wordmark.querySelector('.name').textContent = TL.logo?.wordmark ?? ''
  wordmark.querySelector('.tag').textContent = TL.logo?.tagline ?? ''
  document.documentElement.style.setProperty('--tag', `#${ctx.tint.clone().lerp(new THREE.Color(0xffffff), 0.45).getHexString()}`)
  function overlays(t) {
    const lines = TL.lines ?? []
    const cap = TL.captions === false ? null : lines.find((l) => l.caption !== false && t >= l.at - 0.05 && t < l.at + (l.seconds ?? 0) + 0.35)
    caption.textContent = cap ? cap.text : ''
    caption.style.opacity = cap ? String(sstep(cap.at - 0.05, cap.at + 0.08, t) * (1 - sstep(cap.at + cap.seconds + 0.2, cap.at + cap.seconds + 0.35, t))) : '0'
    const at = TL.finale?.wordmark
    const wm = at == null ? 0 : sstep(at, at + 0.45, t)
    wordmark.style.opacity = String(wm)
    wordmark.style.transform = `translateY(${(1 - wm) * 18}px)`
    const f = TL.finale?.end_fade ?? TL.end_fade
    fade.style.opacity = f ? String(sstep(f[0], f[1], t)) : '0'
  }

  /** Everything at time t: the modules, then the camera and the lights that follow. */
  function setTime(t) {
    for (const u of ctx.updaters) u(t)
    const c = cameraAt(t)
    camera.position.copy(c.pos)
    camera.lookAt(c.look)
    bokeh.uniforms.focus.value = camera.position.distanceTo(c.focus)
    bokeh.uniforms.aperture.value = c.aperture ?? 0.0016
    const kf = ctx.subject(t)
    key.position.copy(kf).add(new THREE.Vector3(-3.0, 5.0, 7.0))
    key.target.position.copy(kf)
    rim.position.copy(kf).add(new THREE.Vector3(3, 4, -6))
    rim.target.position.copy(kf)
    const lv = ctx.lights.level
    key.intensity = 2.1 * lerp(0.03, 1, lv)
    rim.intensity = 1.3 * lerp(0.02, 1, lv)
    hemi.intensity = 0.45 * lerp(0.05, 1, lv)
    for (const u of ctx.after ?? []) u(t, c)
    overlays(t)
  }
  ctx.setTime = setTime

  const JITTER = [
    [0.0, 0.0],
    [0.5, 0.33],
    [-0.25, -0.33],
    [0.25, 0.11],
    [-0.5, 0.44],
    [0.375, -0.22],
  ]
  /** The frame at time t with 0.5-shutter motion blur. */
  ctx.renderFrame = (t) => {
    const shutter = 0.5 / TL.fps
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
  return ctx
}
