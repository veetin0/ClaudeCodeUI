// The app's real screens: the captured screenshots with their transitions (a ripple out from the
// press for a new step, a crossfade for an update), typed text (the field captured at each step),
// a dent where something presses, a power-on, and the shrink into the app's icon. They show on the
// big monitor (mode 'monitor': the app fills the frame, the navigator lives on it) or on a device
// (device.js). Either way `ctx.surface` maps UI pixels to the surface the app is on.
import * as THREE from 'three'
import { RoundedBoxGeometry } from 'three/addons/geometries/RoundedBoxGeometry.js'
import { centreOf, clamp, easeInOut, lerp, loadTex, pulse, sstep } from './util.js'

const S = 0.01 // world units per UI pixel on the monitor

export default async function screen(ctx) {
  const { TL, scene, tint } = ctx
  const [PX, PY] = TL.ui.px
  const SW = PX * S
  const SH = PY * S
  const mode = TL.screen?.mode ?? 'monitor'
  const GLOW = Number(ctx.Q.get('glow') ?? TL.screen?.glow ?? 1.15)
  const LOGO_AT = new THREE.Vector3(...(TL.logo_at ?? [0, -2.0, 3.2]))
  const GLASS_Z = 0.95

  const tex = Object.fromEntries(await Promise.all(Object.entries(TL.ui.screens).map(async ([n, f]) => [n, await loadTex(f)])))
  const typing = (TL.actions ?? []).filter((a) => a.does === 'type')
  for (const a of typing) a.tex = await Promise.all((a.steps ?? []).map(loadTex))
  const iconTex = TL.logo?.icon ? await loadTex(TL.logo.icon) : null

  const su = {
    texA: { value: tex[TL.states[0].screen] },
    texB: { value: tex[TL.states[0].screen] },
    uMix: { value: 0 },
    uMode: { value: 0 },
    uCenter: { value: new THREE.Vector2(0.5, 0.5) },
    uAspect: { value: PX / PY },
    uTint: { value: tint.clone().lerp(new THREE.Color(0xffffff), 0.15) },
    uGlow: { value: GLOW },
    uPower: { value: TL.power == null ? 1 : 0 },
    uPatch: { value: null },
    uPatchRect: { value: new THREE.Vector4() },
    uPatchOn: { value: 0 },
    uDentRect: { value: new THREE.Vector4() },
    uDent: { value: 0 },
    uTile: { value: 0 },
    uTileTop: { value: new THREE.Color(TL.logo?.tile_top ?? '#EC9472') },
    uTileBot: { value: new THREE.Color(TL.logo?.tile ?? '#D97757').multiplyScalar(0.82) },
    uIcon: { value: iconTex },
    uIconOn: { value: iconTex ? 1 : 0 },
    uIconScale: { value: TL.logo?.icon_scale ?? 0.73 },
  }
  /** The screen's material: shared state, its own size and corner radius (world units). */
  function makeMaterial(w, h, corner = 0.06) {
    return new THREE.ShaderMaterial({
      uniforms: { ...su, uSize: { value: new THREE.Vector2(w, h) }, uCorner: { value: corner } },
      vertexShader: `varying vec2 vUv; void main(){ vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position,1.0); }`,
      fragmentShader: `
        uniform sampler2D texA, texB, uPatch, uIcon;
        uniform float uMix, uMode, uAspect, uGlow, uPower, uPatchOn, uDent, uCorner, uTile, uIconOn, uIconScale;
        uniform vec2 uCenter, uSize; uniform vec4 uPatchRect, uDentRect; uniform vec3 uTint, uTileTop, uTileBot;
        varying vec2 vUv;
        float box(vec2 p, vec2 b, float r){ vec2 q = abs(p) - b + r; return length(max(q,0.0)) + min(max(q.x,q.y),0.0) - r; }
        bool inside(vec2 p, vec4 r){ return p.x > r.x && p.x < r.x + r.z && p.y > r.y && p.y < r.y + r.w; }
        void main(){
          if (box((vUv - 0.5) * uSize, uSize * 0.5, uCorner) > 0.0) discard;
          vec2 px = vec2(vUv.x, 1.0 - vUv.y); // UI coords 0..1, y down
          float dark = 0.0;
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
            // The next screen ripples out from the press. A wide ring: a thin one moves further than
            // its width between motion-blur subframes and shows as several rings.
            float d = distance(px * vec2(uAspect, 1.0), uCenter * vec2(uAspect, 1.0));
            float R = uMix * 2.2;
            m = smoothstep(R, R - 0.05, d);
            edge = smoothstep(0.045, 0.0, abs(d - R)) * (1.0 - uMix) * 0.18;
          }
          vec3 c = mix(a, b, m);
          if (uPatchOn > 0.5 && inside(px, uPatchRect)) {
            vec2 l = (px - uPatchRect.xy) / uPatchRect.zw;
            c = texture2D(uPatch, vec2(l.x, 1.0 - l.y)).rgb;
          }
          c = c * (1.0 - dark) + edge * uTint;
          float open = clamp(uPower * 1.25, 0.0, 1.0);
          float band = smoothstep(open * 0.5 + 0.002, open * 0.5 - 0.002, abs(vUv.y - 0.5));
          float line = (1.0 - smoothstep(0.0, 0.2, uPower)) * smoothstep(0.004, 0.0, abs(vUv.y - 0.5)) * step(0.001, uPower) * 4.0;
          vec3 col = c * uGlow * band * smoothstep(0.0, 0.6, uPower) + line;
          vec3 tile = mix(uTileBot, uTileTop, vUv.y);
          if (uIconOn > 0.5) {
            vec2 iv = (vUv - 0.5) / uIconScale + 0.5;
            if (iv.x > 0.0 && iv.x < 1.0 && iv.y > 0.0 && iv.y < 1.0) { vec4 ic = texture2D(uIcon, iv); tile = mix(tile, ic.rgb, ic.a); }
          }
          gl_FragColor = vec4(mix(col, tile * 1.08, uTile), 1.0);
        }`,
    })
  }

  // The surface: a group in which UI-local coordinates apply (x right, y up, z out of the screen).
  const surface = {
    group: new THREE.Group(),
    scale: 1, // world units per UI pixel = S * scale
    local: (px, py, z = 0) => new THREE.Vector3((px - PX / 2) * S, (PY / 2 - py) * S, z / surface.scale),
    world: (px, py, z = 0) => surface.group.localToWorld(surface.local(px, py, z)),
  }
  ctx.surface = surface
  ctx.screen = { PX, PY, SW, SH, S, su, tex, makeMaterial, LOGO_AT, GLASS_Z, ripples: [], mode }
  ctx.anchors.LOGO_AT = LOGO_AT

  let monitor = null
  if (mode === 'monitor') {
    scene.add(surface.group)
    const mat = makeMaterial(SW, SH)
    const plane = new THREE.Mesh(new THREE.PlaneGeometry(1, 1), mat)
    const catcher = new THREE.Mesh(new THREE.PlaneGeometry(1, 1), new THREE.ShadowMaterial({ opacity: 0.45, depthWrite: false }))
    catcher.position.z = 0.004
    catcher.receiveShadow = true
    surface.group.add(plane, catcher)
    const bezelMat = new THREE.MeshPhysicalMaterial({ color: 0x0c0a09, roughness: 0.45, metalness: 0.2, transparent: true })
    const bezel = new THREE.Mesh(new RoundedBoxGeometry(1, 1, 1, 4, 0.04), bezelMat)
    bezel.receiveShadow = true
    scene.add(bezel)
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
    const screenLight = new THREE.RectAreaLight(0xcfd8ff, 0, SW * 0.9, SH * 0.9)
    screenLight.position.set(0, 0, 0.05)
    screenLight.lookAt(0, 0, 5)
    scene.add(screenLight)
    monitor = { mat, plane, catcher, bezel, bezelMat, glass, gu, screenLight }
    ctx.screen.monitor = monitor
  }

  /** Frames a point of the app on the monitor at a zoom, never showing past its edges. */
  const TAN = Math.tan(THREE.MathUtils.degToRad(17))
  function frameApp(cx, cy, zoom, sway = 0) {
    const hv = SH / zoom
    const wv = hv * (ctx.W / ctx.H)
    const x = wv >= SW ? 0 : clamp(cx, -SW / 2 + wv / 2, SW / 2 - wv / 2)
    const y = hv >= SH ? 0 : clamp(cy, -SH / 2 + hv / 2, SH / 2 - hv / 2)
    const d = hv / 2 / TAN
    return { pos: new THREE.Vector3(x + sway, y + 0.08 * hv, d), look: new THREE.Vector3(x, y, 0) }
  }
  ctx.screen.frameApp = frameApp
  const focusOf = (t) => (ctx.nav ? ctx.nav.focus(t) : new THREE.Vector3(0, 0, 0))
  Object.assign(ctx.shots, {
    screen: (t) => ({ ...frameApp(0, 0, 0.94), focus: focusOf(t), aperture: 0.0003 }),
    focus: (t, t0, t1, o) => {
      const [x, y, w, h] = o.rect
      const c = surface.local(x + w / 2, y + h / 2)
      return { ...frameApp(c.x, c.y, Math.min(SW / (w * S * 1.25), SH / (h * S * 1.4))), focus: focusOf(t), aperture: 0.0005 }
    },
    out: () => ({ pos: new THREE.Vector3(0, -0.4, 26), look: new THREE.Vector3(0, -1.8, 0), focus: ctx.anchors.PEDESTAL?.clone() ?? new THREE.Vector3(), aperture: 0.0006 }),
  })

  const fin = TL.finale ?? {}
  ctx.updaters.push((t) => {
    // Which picture, the transition into it, typing, a press dent, power.
    let si = 0
    for (let k = 0; k < TL.states.length; k++) if (t >= TL.states[k].t) si = k
    const st = TL.states[si]
    const prev = TL.states[si - 1]
    const u = prev ? clamp((t - st.t) / (st.how === 'flip' ? 0.5 : 0.28)) : 1
    su.texA.value = tex[prev && u < 1 ? prev.screen : st.screen]
    su.texB.value = tex[st.screen]
    su.uMix.value = u < 1 ? easeInOut(u) : 0
    su.uMode.value = st.how === 'flip' && u < 1 ? 1 : 0 // (after it, a ripple of radius 0 would glow at the press)
    const press = (TL.actions ?? []).find((a) => a.rect && Math.abs(a.t - st.t) < 0.15)
    if (press) {
      const [cx, cy] = centreOf(press.rect)
      su.uCenter.value.set(cx / PX, cy / PY)
    }
    su.uPatchOn.value = 0
    for (const a of typing) {
      // Until the screen moves on (and through its crossfade: the next screenshot has the text).
      const still = st.t <= a.start || (prev && prev.t <= a.start && u < 1)
      if (t >= a.start && still && a.tex.length && a.clip) {
        su.uPatch.value = a.tex[Math.min(a.tex.length - 1, Math.floor((t - a.start) / a.tap))]
        su.uPatchRect.value.set(a.clip.x / PX, a.clip.y / PY, a.clip.w / PX, a.clip.h / PY)
        su.uPatchOn.value = 1
      }
    }
    su.uDent.value = 0
    for (const a of TL.actions ?? []) {
      if (!a.rect || !(a.does === 'press' || a.does === 'stamp')) continue
      const d = pulse(t, a.t + 0.03, 0.08)
      if (d > su.uDent.value) {
        su.uDent.value = d
        su.uDentRect.value.set(a.rect.x / PX, a.rect.y / PY, a.rect.w / PX, a.rect.h / PY)
      }
    }
    if (TL.power != null) su.uPower.value = clamp((t - TL.power) / 0.45)
    if (!monitor) return

    // The monitor shrinks into the icon at the end (finale.morph).
    const m = monitor
    const [m0, m1] = fin.morph ?? [Infinity, Infinity]
    const mu = fin.morph ? easeInOut(clamp((t - m0) / (m1 - m0))) : 0 // (∞ − ∞ would be NaN)
    const sw = lerp(SW, 2.6, mu)
    const sh = lerp(SH, 2.6, mu)
    surface.group.position.lerpVectors(new THREE.Vector3(0, 0, 0), LOGO_AT.clone().add(new THREE.Vector3(0, 0, 0.215)), mu)
    m.plane.scale.set(sw, sh, 1)
    m.catcher.scale.set(sw, sh, 1)
    m.mat.uniforms.uSize.value.set(sw, sh)
    m.mat.uniforms.uCorner.value = lerp(0.06, 0.46, sstep(0.3, 1, mu))
    su.uTile.value = sstep(0.05, 0.75, mu)
    surface.group.visible = t < m1
    m.bezel.scale.set(sw + 0.45, sh + 0.45, 0.45)
    m.bezel.position.copy(surface.group.position).add(new THREE.Vector3(0, 0, -0.24))
    m.bezelMat.opacity = 1 - sstep(0, 0.45, mu)
    m.bezel.visible = m.bezelMat.opacity > 0.01
    m.catcher.visible = mu < 0.05
    m.gu.uTime.value = t
    m.gu.uFade.value = 1 - sstep(m0, m0 + 0.3, t)
    m.glass.visible = m.gu.uFade.value > 0.01
    ctx.screen.ripples.slice(0, 2).forEach((r, i) => m.gu.uRip.value[i].set(r.x, r.y, r.t, 0))
    m.screenLight.intensity = 1.1 * su.uPower.value * (1 - mu)
  })
}
