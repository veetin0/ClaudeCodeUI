// Cards that pop up in 3D: the problem (or stats, or labels), arranged around an anchor (the
// pedestal by default), each wobbling a little, then swatted away together. With no character they
// work on their own: a kinetic opener for a pitch.
import * as THREE from 'three'
import { cardTexture, clamp, easeOutBack, rng, sstep } from './util.js'

const LAYOUT = [
  [-1.75, 1.35, 0.4],
  [1.6, 1.75, 0.1],
  [-1.35, 2.35, -0.3],
  [1.85, 0.75, 0.5],
  [-2.1, 0.55, 0.2],
  [0.2, 2.75, -0.4],
]
const DOTS = ['#ff6b5a', '#ffb54a', '#ff6b5a', '#ffb54a', '#6aa8ff', '#3fd0b0']

export default function cards(ctx) {
  const { TL, scene } = ctx
  const anchor = TL.cards_at ? new THREE.Vector3(...TL.cards_at) : ctx.anchors.PEDESTAL
  const list = (TL.cards ?? []).map((c, i) => {
    const m = new THREE.Mesh(new THREE.PlaneGeometry(1.62, 0.45), new THREE.MeshBasicMaterial({ map: cardTexture(c.text, { dot: c.dot ?? DOTS[i % DOTS.length] }), transparent: true, depthWrite: false }))
    m.visible = false
    scene.add(m)
    const r = rng(40 + i)
    const at = anchor.clone().add(new THREE.Vector3(...(c.at ?? LAYOUT[i % LAYOUT.length])))
    const away = at.clone().sub(anchor.clone().add(new THREE.Vector3(0, 0.5, 0))).normalize().multiplyScalar(7)
    return { ...c, i, m, at, away, spin: new THREE.Vector3(r() * 6 - 3, r() * 6 - 3, r() * 10 - 5) }
  })
  ctx.updaters.push((t) => {
    for (const c of list) {
      const dt = t - c.t
      const out = c.out == null ? -1 : t - c.out
      c.m.visible = dt > 0 && out < 0.8
      if (!c.m.visible) continue
      c.m.scale.setScalar(Math.max(0.001, easeOutBack(clamp(dt / 0.3), 2.2)))
      c.m.position.copy(c.at).add(new THREE.Vector3(0.03 * Math.sin(t * 7 + c.i), 0.05 * Math.sin(t * 2.3 + c.i * 1.7), 0))
      c.m.rotation.set(0, 0, 0.06 * Math.sin(t * 2 + c.i))
      if (out > 0) {
        c.m.position.addScaledVector(c.away, out)
        c.m.position.y -= 3 * out * out
        c.m.rotation.set(c.spin.x * out, c.spin.y * out, c.spin.z * out)
        c.m.material.opacity = 1 - sstep(0.4, 0.8, out)
      }
    }
  })
}
