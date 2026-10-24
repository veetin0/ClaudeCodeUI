// Effects on the app's surface and around the navigator: an outline flash on what was pressed,
// sparks on a stamp, confetti on a cheer, files flying into a drop zone.
import * as THREE from 'three'
import { RoundedBoxGeometry } from 'three/addons/geometries/RoundedBoxGeometry.js'
import { centreOf, clamp, rng } from './util.js'

export default function fx(ctx) {
  const { TL, scene, tint } = ctx
  const S = ctx.screen?.S ?? 0.01
  const actions = TL.actions ?? []
  const surface = ctx.surface
  const tintLight = tint.clone().lerp(new THREE.Color(0xffffff), 0.15)

  // Outline flashes (not fills: a filled flash turns a big element into a bright block).
  const flashes = !surface
    ? []
    : actions
        .filter((a) => a.rect && ['press', 'stamp', 'cheer'].includes(a.does))
        .map((a) => {
          const w = a.rect.w * S + 0.1
          const h = a.rect.h * S + 0.1
          const m = new THREE.Mesh(
            new THREE.PlaneGeometry(w, h),
            new THREE.ShaderMaterial({
              transparent: true,
              depthWrite: false,
              blending: THREE.AdditiveBlending,
              uniforms: { uA: { value: 0 }, uSize: { value: new THREE.Vector2(w, h) }, uTint: { value: tintLight } },
              vertexShader: `varying vec2 vUv; void main(){ vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position,1.0); }`,
              fragmentShader: `
                uniform float uA; uniform vec2 uSize; uniform vec3 uTint; varying vec2 vUv;
                float rr(vec2 p, vec2 b, float r){ vec2 q = abs(p) - b + r; return length(max(q,0.0)) + min(max(q.x,q.y),0.0) - r; }
                void main(){
                  vec2 p = (vUv - 0.5) * uSize;
                  float ring = smoothstep(0.04, 0.0, abs(rr(p, uSize * 0.5 - 0.05, 0.07)));
                  gl_FragColor = vec4(uTint * ring * uA * 1.6, 1.0);
                }`,
            }),
          )
          m.position.copy(surface.local(...centreOf(a.rect), 0.012))
          m.visible = false
          surface.group.add(m)
          return { m, t: a.t }
        })

  const sparkGeo = new THREE.SphereGeometry(0.022, 6, 6)
  const sparkMat = new THREE.MeshBasicMaterial({ color: tint.clone().lerp(new THREE.Color(0xffd27a), 0.5) })
  const strike = new THREE.Vector3(...(ctx.character?.STRIKE ?? [0, 0, 0])).multiplyScalar(ctx.nav?.size ?? 1)
  const bursts = []
  if (ctx.nav) for (const a of actions) if (a.does === 'stamp') bursts.push({ t: a.t, at: ctx.nav.restAt(a.t).add(strike), n: 26, speed: 3.0, life: 0.6, seed: Math.round(a.t * 100) })
  for (const b of bursts) {
    const r = rng(b.seed)
    b.parts = Array.from({ length: b.n }, () => {
      const m = new THREE.Mesh(sparkGeo, sparkMat)
      m.visible = false
      scene.add(m)
      const ang = r() * Math.PI * 2
      return { m, v: new THREE.Vector3(Math.cos(ang), 0.5 + r() * 1.2, 0.4 + r()).normalize().multiplyScalar(b.speed * (0.5 + r() * 0.7)), s: 0.6 + r() * 1.2 }
    })
  }

  const confetti = []
  if (ctx.nav) {
    for (const a of actions.filter((a) => a.does === 'cheer')) {
      const r = rng(5 + Math.round(a.t))
      const colours = [tint, new THREE.Color(0xffffff), new THREE.Color(0x3fd0b0), new THREE.Color(0xffd166), new THREE.Color(TL.logo?.tile ?? '#D97757')]
      const at = ctx.nav.restAt(a.t).add(new THREE.Vector3(0, 0.7 * (ctx.nav.size ?? 0.6), 0.2))
      for (let i = 0; i < 80; i++) {
        const m = new THREE.Mesh(new THREE.PlaneGeometry(0.07, 0.11), new THREE.MeshBasicMaterial({ color: colours[i % colours.length], side: THREE.DoubleSide }))
        m.visible = false
        scene.add(m)
        const ang = r() * Math.PI * 2
        confetti.push({ m, t: a.t, at, v: new THREE.Vector3(Math.cos(ang) * (0.8 + r() * 2), 3 + r() * 3, 0.5 + r() * 1.5), w: new THREE.Vector3(r() * 12, r() * 12, r() * 12) })
      }
    }
  }

  // Files (cards with a coloured stripe) fly in from the camera into a zone as it's stamped.
  const chips = []
  if (surface) {
    for (const a of actions.filter((a) => a.chips?.length)) {
      const r = rng(3 + Math.round(a.t))
      const stripes = [new THREE.Color(TL.logo?.tile ?? '#D97757'), new THREE.Color(0x3fd0b0), new THREE.Color(0x6aa8ff), new THREE.Color(0xffd166), tint]
      a.chips.forEach((z, i) => {
        const chip = new THREE.Mesh(new RoundedBoxGeometry(0.55, 0.32, 0.04, 2, 0.015), new THREE.MeshPhysicalMaterial({ color: 0xf4ece6, roughness: 0.35, emissive: 0x302826 }))
        const stripe = new THREE.Mesh(new THREE.BoxGeometry(0.16, 0.32, 0.045), new THREE.MeshBasicMaterial({ color: stripes[i % stripes.length] }))
        stripe.position.x = -0.195
        chip.add(stripe)
        chip.castShadow = true
        chip.visible = false
        scene.add(chip)
        const to = surface.world(z.x + z.w * (0.25 + 0.5 * r()), z.y + z.h * (0.3 + 0.4 * r()), 0.05)
        const from = to.clone().add(new THREE.Vector3((r() - 0.5) * 5, 2 + r() * 2, 6 + r() * 2))
        chips.push({ chip, from, to, t0: a.t - 0.3 + i * 0.04, t1: a.t + 0.04 + i * 0.04, spin: (r() - 0.5) * 8 })
      })
    }
  }

  const until = TL.finale?.morph?.[0] ?? Infinity
  ctx.updaters.push((t) => {
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
        q.m.position.y -= 0.5 * 7 * dt * dt
        q.m.scale.setScalar(q.s * (1 - dt / b.life))
      }
    }
    for (const c of confetti) {
      const dt = t - c.t
      c.m.visible = dt > 0 && dt < 1.8 && t < until
      if (!c.m.visible) continue
      c.m.position.copy(c.at).addScaledVector(c.v, dt)
      c.m.position.y -= 0.5 * 6 * dt * dt
      c.m.rotation.set(c.w.x * dt, c.w.y * dt, c.w.z * dt)
    }
  })
}
