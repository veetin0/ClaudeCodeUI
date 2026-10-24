// The logo reveal: the app's icon as a 3D tile. It takes over from the monitor shrinking into it
// (finale.morph) or rises into the shot (finale.rise). With a character, the character dives in and
// its flat silhouette becomes the mark (finale.splash); without one, the app's own mark gets a
// splash of light. Also the end shot and window.renderLogo (the mark alone, transparent).
import * as THREE from 'three'
import { RoundedBoxGeometry } from 'three/addons/geometries/RoundedBoxGeometry.js'
import { createFace, MOODS } from './face.js'
import { clamp, easeInOut, easeOutBack, lerp, loadTex, rng, spring, sstep } from './util.js'

export default async function logo(ctx) {
  const { TL, scene, tint } = ctx
  const fin = TL.finale ?? {}
  const LOGO_AT = ctx.anchors.LOGO_AT ?? new THREE.Vector3(...(TL.logo_at ?? [0, 0.4, 0]))
  ctx.anchors.LOGO_AT = LOGO_AT
  const L = TL.logo ?? {}

  const group = new THREE.Group()
  group.position.copy(LOGO_AT)
  {
    const g = new RoundedBoxGeometry(2.6, 2.6, 0.42, 6, 0.46)
    const top = new THREE.Color(L.tile_top ?? '#EC9472')
    const bot = new THREE.Color(L.tile ?? '#D97757').multiplyScalar(0.82)
    const cols = []
    const p = g.attributes.position
    for (let i = 0; i < p.count; i++) {
      const c = bot.clone().lerp(top, clamp((p.getY(i) + 1.3) / 2.6))
      cols.push(c.r, c.g, c.b)
    }
    g.setAttribute('color', new THREE.Float32BufferAttribute(cols, 3))
    const tile = new THREE.Mesh(g, new THREE.MeshPhysicalMaterial({ vertexColors: true, roughness: 0.42, clearcoat: 0.5, clearcoatRoughness: 0.25, emissive: new THREE.Color(L.tile ?? '#D97757'), emissiveIntensity: 0.16 }))
    tile.castShadow = tile.receiveShadow = true
    group.add(tile)
  }
  let icon = null
  if (L.icon) {
    const s = 2.6 * (L.icon_scale ?? 0.73)
    icon = new THREE.Mesh(new THREE.PlaneGeometry(s, s), new THREE.MeshBasicMaterial({ map: await loadTex(L.icon), transparent: true, depthWrite: false }))
    icon.position.z = 0.215
    group.add(icon)
  }
  // With a character: its flat silhouette in the emblem colour, its face drawn in the tile colour.
  const ES = 1.1
  let emblem = null
  let emblemFace = null
  // The character's silhouette is the mark: from the clip's character, or built here (LOGO.mark).
  let heroGeo = ctx.heroGeo
  let character = ctx.character
  if (!heroGeo && L.mark === 'hero') {
    heroGeo = (await import('./hero.js')).heroGeometry(Number(ctx.Q.get('mc') ?? 96))
    character = await import('../character.js')
  }
  if (heroGeo) {
    emblem = new THREE.Group()
    const ec = new THREE.Color(L.emblem ?? '#FFFFFF')
    emblem.add(new THREE.Mesh(heroGeo, new THREE.MeshPhysicalMaterial({ color: ec, roughness: 0.35, emissive: ec, emissiveIntensity: 0.12 })))
    emblemFace = createFace(character, { ink: L.tile ?? '#D97757' })
    emblem.add(emblemFace.mesh)
    const c = new THREE.Vector3()
    heroGeo.boundingBox.getCenter(c)
    emblem.userData.offset = new THREE.Vector3(-c.x * ES, -c.y * ES, 0.2)
    emblem.visible = false
    group.add(emblem)
  }
  // A sheen that sweeps across the tile on the reveal (when there's no character to dive in).
  const sheen = new THREE.Mesh(
    new THREE.PlaneGeometry(2.6, 2.6),
    new THREE.ShaderMaterial({
      transparent: true,
      depthWrite: false,
      blending: THREE.AdditiveBlending,
      uniforms: { uU: { value: -1 } },
      vertexShader: `varying vec2 vUv; void main(){ vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position,1.0); }`,
      fragmentShader: `uniform float uU; varying vec2 vUv;
        float box(vec2 p, vec2 b, float r){ vec2 q = abs(p) - b + r; return length(max(q,0.0)) + min(max(q.x,q.y),0.0) - r; }
        void main(){
          if (box((vUv - 0.5) * 2.6, vec2(1.3), 0.46) > 0.0) discard;
          float d = abs((vUv.x + vUv.y) * 0.5 - uU);
          gl_FragColor = vec4(vec3(1.0, 0.95, 0.9) * smoothstep(0.08, 0.0, d) * 0.35, 1.0);
        }`,
    }),
  )
  sheen.position.z = 0.222
  group.add(sheen)
  const ripple = new THREE.Mesh(new THREE.RingGeometry(0.9, 1.0, 64), new THREE.MeshBasicMaterial({ color: 0xffffff, transparent: true, opacity: 0, depthWrite: false, blending: THREE.AdditiveBlending }))
  ripple.position.z = 0.23
  group.add(ripple)
  group.visible = false
  scene.add(group)

  // A splash of sparks on the reveal.
  const sparkGeo = new THREE.SphereGeometry(0.022, 6, 6)
  const r = rng(99)
  const sparks = Array.from({ length: 60 }, () => {
    const m = new THREE.Mesh(sparkGeo, new THREE.MeshBasicMaterial({ color: r() < 0.5 ? 0xffffff : tint.clone().lerp(new THREE.Color(0xffffff), 0.5) }))
    m.visible = false
    scene.add(m)
    const a = r() * Math.PI * 2
    return { m, v: new THREE.Vector3(Math.cos(a), (r() - 0.5) * 2, Math.sin(a)).normalize().multiplyScalar(4.5 * (0.5 + r() * 0.7)), s: 0.6 + r() * 1.2 }
  })

  const light = new THREE.SpotLight(0xfff4ec, 0, 40, 0.45, 0.7, 2)
  scene.add(light, light.target)
  const start = fin.morph ? fin.morph[1] : (fin.rise?.[0] ?? 0)
  ctx.shots.logo = (t, t0, t1) => {
    const u = easeInOut(clamp((t - t0) / (t1 - t0)))
    const pos = LOGO_AT.clone().add(new THREE.Vector3(0, 0.5, 10.6)).lerp(LOGO_AT.clone().add(new THREE.Vector3(0, 0.1, 6.8)), u)
    const look = LOGO_AT.clone().add(new THREE.Vector3(0, -0.5, 0.8)).lerp(LOGO_AT.clone().add(new THREE.Vector3(0, -0.35, 0)), u)
    return { pos, look, focus: LOGO_AT.clone().add(new THREE.Vector3(0, 0, 0.25)), aperture: 0.0005 }
  }
  ;(ctx.after ??= []).push((t, cam) => {
    const lit = fin.morph ? sstep(fin.morph[0] + 0.4, fin.morph[1], t) : sstep(fin.rise?.[0] ?? 0, fin.rise?.[1] ?? 0.5, t)
    light.intensity = 30 * lit
    light.position.copy(cam.pos).add(new THREE.Vector3(1.5, 2.5, 0))
    light.target.position.copy(LOGO_AT)
  })
  ctx.updaters.push((t) => {
    group.visible = t >= start
    group.position.copy(LOGO_AT)
    if (fin.rise) {
      const ru = clamp((t - fin.rise[0]) / (fin.rise[1] - fin.rise[0]))
      group.position.y = lerp(LOGO_AT.y - 5.8, LOGO_AT.y, easeOutBack(ru, 1.1))
      group.rotation.y = (1 - easeOutBack(ru, 1.2)) * 0.6
    }
    const ds = t - (fin.splash ?? Infinity)
    const swap = fin.morph ? t - fin.morph[1] : -1
    group.scale.setScalar(1 + (swap > 0 ? 0.06 * spring(swap, 20, 8) : 0) + (ds > 0 ? 0.1 * Math.exp(-ds * 6) * Math.sin(ds * 24) : 0))
    if (icon && emblem) icon.scale.setScalar(Math.max(0.001, 1 - sstep(fin.splash, fin.splash + 0.2, t)))
    if (emblem) {
      const [e0, e1] = fin.emblem ?? [fin.splash, fin.splash + 0.6]
      emblem.visible = t > e0
      const eu = easeOutBack(clamp((t - e0) / (e1 - e0)), 1.6)
      emblem.scale.set(ES * eu, ES * eu, 0.12 * Math.max(eu, 0.01))
      emblem.position.copy(emblem.userData.offset).multiply(new THREE.Vector3(eu, eu, 1))
      emblemFace.set(MOODS.happy, { blink: (t + 0.3) % 2.7 < 0.1 ? 0.15 : 1 })
    }
    sheen.material.uniforms.uU.value = !emblem && ds > 0 ? -0.2 + ds * 1.6 : -1
    ripple.material.opacity = ds > 0 ? 0.9 * (1 - clamp(ds / 0.6)) : 0
    ripple.scale.setScalar(0.2 + clamp(ds / 0.6) * 1.6)
    for (const q of sparks) {
      q.m.visible = ds > 0 && ds < 1.1
      if (!q.m.visible) continue
      q.m.position.copy(LOGO_AT).add(new THREE.Vector3(0, 0, 0.3)).addScaledVector(q.v, ds)
      q.m.position.z += ds * 0.6
      q.m.scale.setScalar(q.s * (1 - ds / 1.1))
    }
  })

  /** The finished mark alone on a transparent background, as a PNG data URL. */
  window.renderLogo = () => {
    ctx.setTime((fin.end_fade?.[0] ?? TL.duration) - 0.1)
    for (const o of ctx.hideForLogo ?? []) if (o) o.visible = false
    const a = ctx.W / ctx.H
    const cam = new THREE.OrthographicCamera(-1.55 * a, 1.55 * a, 1.55, -1.55, 0.1, 50)
    cam.position.copy(LOGO_AT).add(new THREE.Vector3(0, 0, 8))
    cam.lookAt(LOGO_AT)
    const [bg, fog] = [scene.background, scene.fog]
    scene.background = null
    scene.fog = null
    ctx.renderer.setRenderTarget(null)
    ctx.renderer.setClearColor(0x000000, 0)
    ctx.renderer.clear()
    ctx.renderer.render(scene, cam)
    ;[scene.background, scene.fog] = [bg, fog]
    return ctx.renderer.domElement.toDataURL('image/png')
  }
}
