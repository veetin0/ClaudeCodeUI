// A 3D cursor as the navigator, for products without a mascot: a glossy pointer that glides to each
// target, dips and clicks (a ring spreads on the screen), and hovers at the start of a field while
// the text goes in. It rides the app's surface (the monitor or a device's screen), sized in UI
// pixels, and casts a soft shadow on the screen.
import * as THREE from 'three'
import { makePath } from './path.js'
import { clamp, pulse, sstep } from './util.js'

const SIZE = 46 // the cursor's height in UI pixels
const HOVER = 16 // how far above the screen it floats, in UI pixels

export default function cursor(ctx) {
  const { TL, surface } = ctx
  const S = ctx.screen.S
  // Local space of the surface: positions in UI pixels × S.
  const local = { ...ctx, surface: { ...surface, world: (px, py) => surface.local(px, py, 0) } }
  const path = makePath(local, { standZ: 0 })
  const moves = path.moves

  // The classic pointer: tip at the origin, pointing up and left.
  const shape = new THREE.Shape()
  const pts = [
    [0, 0],
    [0, -1.0],
    [0.25, -0.77],
    [0.43, -1.16],
    [0.58, -1.09],
    [0.4, -0.72],
    [0.73, -0.72],
  ]
  pts.forEach(([x, y], i) => (i ? shape.lineTo(x, y) : shape.moveTo(x, y)))
  shape.closePath()
  const geo = new THREE.ExtrudeGeometry(shape, { depth: 0.07, bevelEnabled: true, bevelThickness: 0.035, bevelSize: 0.035, bevelSegments: 4, curveSegments: 4 })
  geo.translate(0, 0, -0.035)
  const k = SIZE * S
  const pointer = new THREE.Group()
  const white = new THREE.Mesh(geo, new THREE.MeshPhysicalMaterial({ color: 0xfdfbf8, roughness: 0.25, clearcoat: 1, clearcoatRoughness: 0.1 }))
  const rim = new THREE.Mesh(geo, new THREE.MeshBasicMaterial({ color: 0x14100d }))
  rim.scale.setScalar(1.16)
  rim.position.set(-0.05, 0.08, -0.03)
  white.castShadow = rim.castShadow = true
  pointer.add(rim, white)
  pointer.scale.setScalar(k)
  const holder = new THREE.Group()
  holder.add(pointer)
  surface.group.add(holder)

  // A ring that spreads where it clicks.
  const ring = new THREE.Mesh(new THREE.RingGeometry(0.82, 1, 48), new THREE.MeshBasicMaterial({ color: ctx.tint, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending }))
  ring.visible = false
  surface.group.add(ring)

  const clicks = (TL.actions ?? []).filter((a) => a.does === 'press' || a.does === 'stamp')
  const typing = (TL.actions ?? []).filter((a) => a.does === 'type')

  function at(t) {
    let p = path.restAt(t)
    let dir = 0
    for (const m of moves) {
      if (t >= m.t0 && t < m.t1) {
        p = path.along(m, (t - m.t0) / (m.t1 - m.t0))
        const [a, b] = path.ends(m)
        dir = clamp((b.x - a.x) * 0.15, -0.25, 0.25)
      }
    }
    return { p, dir }
  }
  const world = (t) => surface.group.localToWorld(at(t).p.clone().add(new THREE.Vector3(0, 0, HOVER * S)))
  ctx.nav = { kind: 'cursor', focus: world, restAt: (t) => surface.group.localToWorld(path.restAt(t)), path }
  ctx.subject = world
  ctx.shots.follow = (t, t0, t1, o) => {
    const f = path.track(t)
    return { ...ctx.screen.frameApp(f.x, f.y, o.zoom ?? 2.0, 0.2 * Math.sin(t * 0.37)), focus: world(t), aperture: 0.0005 }
  }

  ctx.updaters.push((t) => {
    const { p, dir } = at(t)
    let dip = 0
    let squeeze = 0
    for (const a of clicks) {
      dip = Math.max(dip, pulse(t, a.t, 0.07))
      squeeze = Math.max(squeeze, pulse(t, a.t + 0.02, 0.06))
    }
    let bob = 0
    for (const a of typing) {
      if (t > a.start - 0.2 && t < a.end + 0.2) for (let i = 0; i < a.steps.length; i++) bob = Math.max(bob, pulse(t, a.start + i * a.tap, 0.04))
    }
    holder.visible = ctx.screen.su.uPower.value > 0.5 // not on a screen that's still off
    holder.position.set(p.x, p.y, (HOVER * (1 - 0.85 * dip) - 4 * bob) * S + 0.004 * Math.sin(t * 2.4))
    holder.rotation.set(0.28, -0.12, dir)
    holder.scale.setScalar(1 - 0.12 * squeeze)
    // The click ring: from the last press within 0.4 s.
    const c = clicks.filter((a) => t >= a.t && t < a.t + 0.4).pop()
    ring.visible = !!c
    if (c) {
      const u = (t - c.t) / 0.4
      ring.position.set(p.x, p.y, 0.006)
      ring.scale.setScalar((10 + 34 * u) * S)
      ring.material.opacity = 0.8 * (1 - sstep(0.2, 1, u))
    }
  })
  ctx.cursor = { holder }
}
