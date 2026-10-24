// The character as a navigator: its body (a marching-cubes mesh of character.js's SDF in a vinyl
// toy material), face (face.js), legs and prop; how it hops, walks, presses, types, waves, swats
// and cheers; its face over time (moods, looks, blinks, lip sync); the camera shots that follow it.
import * as THREE from 'three'
import { MarchingCubes } from 'three/addons/objects/MarchingCubes.js'
import * as CHAR from '../character.js'
import { createFace, MOODS, mixMood } from './face.js'
import { makePath } from './path.js'
import { clamp, lerp, pulse, spring, sstep } from './util.js'

export function heroGeometry(res = 72) {
  const { cy, half } = CHAR.BOUNDS
  const mc = new MarchingCubes(res, new THREE.MeshBasicMaterial(), false, false, 200000)
  const n = mc.size
  for (let k = 0; k < n; k++)
    for (let j = 0; j < n; j++)
      for (let i = 0; i < n; i++) {
        const x = ((i - n / 2) / (n / 2)) * half
        const y = ((j - n / 2) / (n / 2)) * half + cy
        const z = ((k - n / 2) / (n / 2)) * half
        mc.field[i + j * n + k * n * n] = mc.isolation - CHAR.sdf(x, y, z) * 400
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

export default function hero(ctx) {
  const { TL, scene, tint } = ctx
  const SIZE = TL.hero.size ?? 0.85
  const path = makePath(ctx, { standZ: 0.36 * SIZE + 0.02, logoDrop: 0.45 * SIZE })
  const moves = path.moves

  const geo = heroGeometry(Number(ctx.Q.get('mc') ?? 72))
  ctx.heroGeo = geo
  ctx.character = CHAR
  // A vinyl toy: soft clearcoat, a little sheen. The body must read as the hero's colour.
  const toyMat = new THREE.MeshPhysicalMaterial({ color: tint, roughness: 0.42, clearcoat: 0.4, clearcoatRoughness: 0.32, sheen: 0.25, sheenColor: tint.clone().lerp(new THREE.Color(0xffffff), 0.6) })
  const root = new THREE.Group() // feet at the origin
  root.scale.setScalar(SIZE)
  const body = new THREE.Group() // squash, stretch, lean
  root.add(body)
  const mesh = new THREE.Mesh(geo, toyMat)
  mesh.castShadow = mesh.receiveShadow = true
  body.add(mesh)
  const face = createFace(CHAR, { ink: TL.hero.dark })
  body.add(face.mesh)
  const legs = CHAR.LEGS.at.map(([x, z], i) => {
    const l = new THREE.Mesh(new THREE.CapsuleGeometry(CHAR.LEGS.radius, CHAR.LEGS.length, 4, 10), toyMat)
    l.position.set(x, CHAR.LEGS.y, z)
    l.castShadow = true
    l.userData.phase = i === 0 || i === 3 ? 0 : Math.PI // diagonal pairs step together
    root.add(l)
    return l
  })
  const prop = CHAR.prop ? CHAR.prop(TL.hero) : null
  if (prop) body.add(prop)
  scene.add(root)

  // The prop's poses: angles that keep it outside the body (character.js PROP).
  const PP = CHAR.PROP?.poses ?? { rest: 0.3, wind: -0.3, strike: 1.7, bigWind: -0.6, bigStrike: 2.0, wave: [-0.4, 0.2], tap: [0.6, 1.5], swat: [-0.6, 2.0] }
  const PMIN = CHAR.PROP?.min ?? -Math.PI
  const PMAX = CHAR.PROP?.max ?? Math.PI
  const actions = TL.actions ?? []
  const wake = actions.find((a) => a.does === 'wake')

  /** Where the hero is and how it moves at time t. */
  function pose(t) {
    const p = { pos: path.spot(moves[0]?.from ?? 'pedestal'), yaw: 0, pitch: 0, roll: 0, sy: 1, legs: 1, lift: [0, 0, 0, 0], prop: PP.rest, flight: false, visible: true, scale: 1 }
    let last = -1
    for (const m of moves) if (t >= m.t0) last = m.i
    if (last >= 0) {
      const m = moves[last]
      const [p0, p1] = path.ends(m)
      const dir = new THREE.Vector3().subVectors(p1, p0)
      // Turn towards where it's going, but never so far that the face is lost.
      const travelYaw = m.to === 'logo' ? 0 : dir.z < -0.5 ? Math.sign(dir.x || 1) * 1.2 : clamp(Math.atan2(dir.x, Math.max(dir.z, 0.6)), -1.05, 1.05)
      if (t < m.t1) {
        const u = (t - m.t0) / (m.t1 - m.t0)
        p.pos.copy(path.along(m, u))
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
          const ph = (t - m.t0) * Math.PI * 2 * 3.2
          p.pos.y += Math.abs(Math.sin(ph)) * 0.035
          p.roll = 0.07 * Math.sin(ph)
          p.lift = legs.map((l) => Math.max(0, Math.sin(ph + l.userData.phase)) * 0.06)
        }
      } else {
        p.pos.copy(p1)
        p.yaw = lerp(travelYaw, 0, sstep(m.t1, m.t1 + 0.3, t))
        if (m.kind === 'hop') p.sy = 1 - 0.3 * spring(t - m.t1, 30, 11)
        if (m.to === 'logo') p.visible = false
      }
      const next = moves[last + 1]
      if (next && next.kind === 'hop' && t > next.t0 - 0.16 && t < next.t0) p.sy *= 1 - 0.2 * sstep(next.t0 - 0.16, next.t0 - 0.03, t)
    } else if (moves[0] && t > moves[0].t0 - 0.16) p.sy *= 1 - 0.2 * sstep(moves[0].t0 - 0.16, moves[0].t0 - 0.03, t)
    if (wake && t > wake.t && t < wake.t + 0.45) {
      const u = (t - wake.t) / 0.45
      p.pos.y += 4 * 0.22 * u * (1 - u) // a startled little hop
    }
    if (wake && t < wake.t) p.sy *= 1 + 0.015 * Math.sin(t * 2.1) // slow sleepy breathing

    // The prop, as offsets from rest that stay in the safe sector.
    const R = PP.rest
    let dp = 0
    for (const a of actions) {
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
    p.prop = clamp(R + dp, PMIN, PMAX)
    return p
  }

  // ---------- the face over time ----------
  const keys = TL.face ?? []
  function moodAt(t) {
    let base = MOODS.happy
    let burst = null
    for (const k of keys) {
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
  function lookAt(t, yaw) {
    let k = 'camera'
    for (const key of keys) {
      if (key.t > t) break
      if (key.look) k = key.look
    }
    if (Array.isArray(k)) return k
    if (k === 'move') {
      const m = moves.find((m) => m.t1 > t)
      if (m) {
        const [p0, p1] = path.ends(m)
        const d = p1.sub(p0)
        return [clamp(d.x * 0.6, -1, 1), clamp(d.y * 0.3, -0.6, 0.8)]
      }
    }
    // At the camera, compensating for the body's turn, with a little idle wander.
    return [clamp(-yaw * 0.7 + 0.12 * Math.sin(t * 0.9), -1, 1), 0.08 * Math.sin(t * 0.6 + 1)]
  }
  function voiceAt(t) {
    for (const l of TL.lines ?? []) {
      if (l.mouth && t >= l.at && t < l.at + (l.seconds ?? 0)) {
        const f = (t - l.at) * (l.rate ?? 60)
        const i = Math.floor(f)
        const g = (arr) => lerp(arr[i] ?? 0, arr[i + 1] ?? 0, f - i)
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
    const ph = (t + 0.7) % 3.1
    const blink = ph < 0.12 ? 0.1 + (0.9 * Math.abs(ph - 0.06)) / 0.06 : 1
    const v = voiceAt(t)
    return { mood: m, look: [lx, ly], blink, talk: v.line ? v : null, voice: v }
  }

  const focus = (t) => pose(t).pos.add(new THREE.Vector3(0, 0.5 * SIZE, 0))
  function smoothed(t) {
    const f = new THREE.Vector3()
    let wsum = 0
    for (let k = -4; k <= 7; k++) {
      const w = 1 - Math.abs(k - 1.5) / 7
      f.addScaledVector(focus(t + k * 0.05), w)
      wsum += w
    }
    return f.multiplyScalar(1 / wsum)
  }
  ctx.nav = { kind: 'hero', pose, focus, restAt: path.restAt, path, size: SIZE }
  ctx.subject = (t) => {
    const p = pose(t)
    return p.visible ? p.pos : ctx.anchors.LOGO_AT ?? p.pos
  }
  Object.assign(ctx.shots, {
    follow: (t, t0, t1, o) => {
      const f = path.track(t).add(new THREE.Vector3(0, 0.5 * SIZE, 0))
      return { ...ctx.screen.frameApp(f.x, f.y + 0.35 * SIZE, o.zoom ?? 2.3, 0.25 * Math.sin(t * 0.37)), focus: focus(t), aperture: 0.0007 }
    },
    talk: (t) => {
      const f = smoothed(t)
      return { pos: f.clone().add(new THREE.Vector3(0.35, 0.3, 2.9)), look: f.clone(), focus: focus(t), aperture: 0.0016 }
    },
  })

  ctx.updaters.push((t) => {
    const p = pose(t)
    root.visible = p.visible
    root.position.copy(p.pos)
    const fa = faceAt(t, p.yaw)
    const talking = fa.voice.open
    root.rotation.set(p.pitch + 0.05 * talking, p.yaw, p.roll, 'YXZ')
    const breathe = p.flight ? 0 : 0.012 * Math.sin(t * 3.1)
    const sy = (p.sy + breathe + talking * 0.02) * p.scale
    const sxz = (1 / Math.sqrt(Math.max(0.3, p.sy))) * p.scale
    body.scale.set(sxz, sy, sxz)
    legs.forEach((l, i) => {
      l.scale.set(p.scale, p.legs * p.scale, p.scale)
      l.position.y = CHAR.LEGS.y + (p.lift[i] ?? 0)
    })
    face.set(fa.mood, { look: fa.look, blink: fa.blink, talk: fa.talk })
    if (prop) prop.rotation.z = p.prop
  })
  ctx.hero = { root, hide: () => (root.visible = false) }
}
