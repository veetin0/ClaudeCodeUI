// Where a navigator (the character or the cursor) is: the spots it moves between (a UI point on the
// app's surface, the pedestal, the logo), the shape of each move (a hop's arc, a walk, a glide),
// where it rests, and where a camera that leads the action should look.
import * as THREE from 'three'
import { clamp, easeInOut } from './util.js'

export function makePath(ctx, { standZ, logoDrop = 0.45 }) {
  const { TL } = ctx
  const spot = (to) => {
    if (to === 'pedestal') return ctx.anchors.PEDESTAL.clone()
    if (to === 'logo') return ctx.anchors.LOGO_AT.clone().add(new THREE.Vector3(0, -logoDrop, 0.3))
    return ctx.surface.world(to.ui[0], to.ui[1], standZ)
  }
  const moves = (TL.moves ?? []).map((m, i) => ({ ...m, i }))
  const ends = (m) => [spot(m.from), spot(m.to)]

  /** The position along move m at fraction u (a hop arcs; a glide bulges a little sideways). */
  function along(m, u) {
    const [p0, p1] = ends(m)
    const p = new THREE.Vector3().lerpVectors(p0, p1, m.kind === 'glide' ? easeInOut(u) : u)
    if (m.kind === 'hop') p.y += 4 * (m.h + Math.max(0, p1.y - p0.y) * 0.5) * u * (1 - u)
    if (m.kind === 'glide') {
      const d = new THREE.Vector3().subVectors(p1, p0)
      p.add(new THREE.Vector3(-d.y, d.x, 0).multiplyScalar(0.08 * Math.sin(Math.PI * u)))
    }
    return p
  }
  /** Where it stands at time t when not moving (the end of the last move). */
  function restAt(t) {
    let p = moves.length ? spot(moves[0].from) : spot('pedestal')
    for (const m of moves) if (t >= m.t1) p = spot(m.to)
    return p
  }
  /** Where a camera that leads should look: the next spot, reached a moment before landing. */
  function track(t) {
    let p = moves.length ? spot(moves[0].from) : spot('pedestal')
    for (const m of moves) {
      if (t >= m.t1 - 0.1) {
        p = spot(m.to)
        continue
      }
      if (t >= m.t0 - 0.25) p = spot(m.from).lerp(spot(m.to), easeInOut(clamp((t - (m.t0 - 0.25)) / (m.t1 - m.t0 + 0.15))))
      break
    }
    return p
  }
  // The ripple on the monitor's glass where a move passes through it.
  if (ctx.screen?.monitor) {
    for (const m of moves.filter((m) => m.glass)) {
      const [p0, p1] = ends(m)
      const u = clamp((p0.z - ctx.screen.GLASS_Z) / (p0.z - p1.z))
      const p = along(m, u)
      ctx.screen.ripples.push({ x: p.x, y: p.y, t: m.t0 + u * (m.t1 - m.t0) })
    }
  }
  return { moves, spot, ends, along, restAt, track }
}
