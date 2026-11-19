// The studio: a dark floor, an optional pedestal, a spotlight that can clunk on, and the studio
// camera shots (wide, a close-up and a medium shot on whoever stands on the pedestal).
import * as THREE from 'three'
import { sstep } from './util.js'

export default function stage(ctx) {
  const { TL, scene, studio } = ctx
  const S = TL.stage ?? {}
  const FLOOR = S.floor_y ?? -1.2
  const PEDESTAL = new THREE.Vector3(...(S.anchor ?? [0, FLOOR + 0.55, 0]))
  ctx.anchors.FLOOR = FLOOR
  ctx.anchors.PEDESTAL = PEDESTAL

  const floor = new THREE.Mesh(new THREE.PlaneGeometry(120, 120), new THREE.MeshStandardMaterial({ color: studio.clone().multiplyScalar(1.1), roughness: 0.7, envMapIntensity: 0.12 }))
  floor.rotation.x = -Math.PI / 2
  floor.position.y = FLOOR
  floor.receiveShadow = true
  scene.add(floor)
  let pedestal = null
  if (S.pedestal) {
    pedestal = new THREE.Mesh(new THREE.CylinderGeometry(1.15, 1.25, 0.55, 64), new THREE.MeshPhysicalMaterial({ color: 0x1b1310, roughness: 0.22, clearcoat: 0.7, clearcoatRoughness: 0.1 }))
    pedestal.position.copy(PEDESTAL).add(new THREE.Vector3(0, -0.275, 0))
    pedestal.receiveShadow = pedestal.castShadow = true
    scene.add(pedestal)
  }
  const spot = new THREE.SpotLight(0xfff1e4, 0, 30, 0.42, 0.65, 1.2)
  spot.position.copy(PEDESTAL).add(new THREE.Vector3(-0.5, 7.5, 3.5))
  spot.target.position.copy(PEDESTAL)
  scene.add(spot, spot.target)
  ctx.stage = { floor, pedestal, spot, hide: () => [floor, pedestal].forEach((o) => o && (o.visible = false)) }

  ctx.updaters.push((t) => {
    // The light clunks on at S.light (with a flicker); without it the studio is lit from the start.
    const on = S.light == null ? 1 : sstep(S.light, S.light + 0.06, t) * (t < S.light + 0.2 ? 0.85 + 0.15 * Math.sin(t * 90) : 1)
    let dim = 0
    for (const [a, b] of S.dim ?? []) dim = Math.max(dim, sstep(a - 0.6, a + 0.4, t) * (1 - sstep(b - 0.8, b, t)))
    spot.intensity = (S.spot ?? 14) * on * (1 - 0.85 * dim)
    ctx.lights.level = on
  })

  const head = (y = 0.48) => PEDESTAL.clone().add(new THREE.Vector3(0, y * (TL.hero?.size ?? 1), 0))
  Object.assign(ctx.shots, {
    studio_wide: () => ({ pos: new THREE.Vector3(0, 0.6, 27), look: new THREE.Vector3(0, -1.6, 0), focus: PEDESTAL.clone(), aperture: 0.0008 }),
    studio_talk: (t) => {
      const f = head()
      return { pos: f.clone().add(new THREE.Vector3(0.45 + 0.08 * Math.sin(t * 0.4), 0.42, 3.1)), look: f.clone().add(new THREE.Vector3(0, 0.02, 0)), focus: f, aperture: 0.0026 }
    },
    studio_mid: (t) => {
      const f = PEDESTAL.clone().add(new THREE.Vector3(0, 1.05, 0))
      return { pos: f.clone().add(new THREE.Vector3(0.1 * Math.sin(t * 0.5), 0.55, 6.8)), look: f, focus: PEDESTAL.clone().add(new THREE.Vector3(0, 0.5, 0.3)), aperture: 0.0016 }
    },
  })
}
