// A device showing the app's real screens: a laptop whose lid opens, or a phone that floats and
// turns. Its screen uses the same material as the monitor (transitions, typing, dents, power), and
// the app's surface (ctx.surface) rides on it, so the cursor and the effects land on its screen.
import * as THREE from 'three'
import { RoundedBoxGeometry } from 'three/addons/geometries/RoundedBoxGeometry.js'
import { clamp, easeInOut, easeOutBack, lerp } from './util.js'

export default function device(ctx) {
  const { TL, scene } = ctx
  const D = TL.device ?? {}
  const kind = D.kind ?? 'laptop'
  const { PX, PY, S, makeMaterial } = ctx.screen
  const aspect = PX / PY
  const at = new THREE.Vector3(...(D.at ?? [0, ctx.anchors.FLOOR ?? -1.2, 0]))
  // Satin metal, its reflections turned down: a rounded edge mirrors the studio's ceiling light as a
  // blown-out blob.
  const metal = new THREE.MeshPhysicalMaterial({ color: D.color ?? (kind === 'phone' ? '#2b2d31' : '#8d9198'), metalness: 0.75, roughness: 0.55, envMapIntensity: 0.35 })
  const black = new THREE.MeshPhysicalMaterial({ color: 0x08090a, roughness: 0.35, clearcoat: 0.5, clearcoatRoughness: 0.3, envMapIntensity: 0.2 }) // a glossy bezel mirrors the ceiling light
  const root = new THREE.Group()
  root.position.copy(at)
  scene.add(root)

  let screenW
  let screenH
  let lid = null // the hinged part (laptop) or the whole phone
  const screenHolder = new THREE.Group() // where the screen plane sits (moves with the lid)
  if (kind === 'phone') {
    screenH = D.height ?? 2.2
    screenW = screenH * aspect
    const body = new THREE.Mesh(new RoundedBoxGeometry(screenW + 0.1, screenH + 0.1, 0.1, 6, Math.min(screenW, screenH) * 0.14), metal)
    body.castShadow = true
    lid = new THREE.Group()
    lid.add(body)
    const glass = new THREE.Mesh(new RoundedBoxGeometry(screenW + 0.06, screenH + 0.06, 0.01, 4, Math.min(screenW, screenH) * 0.12), black)
    glass.position.z = 0.05
    lid.add(glass)
    const island = new THREE.Mesh(new RoundedBoxGeometry(screenW * 0.28, 0.07, 0.01, 3, 0.034), black)
    island.position.set(0, screenH / 2 - 0.08, 0.058)
    lid.add(island)
    screenHolder.position.z = 0.0565
    lid.add(screenHolder)
    lid.position.y = screenH / 2 + 0.6
    root.add(lid)
  } else {
    screenW = D.width ?? 3.0
    screenH = screenW / aspect
    const baseD = screenH + 0.45
    const base = new THREE.Mesh(new RoundedBoxGeometry(screenW + 0.3, 0.08, baseD, 4, 0.03), metal)
    base.position.set(0, 0.04, 0)
    base.castShadow = base.receiveShadow = true
    root.add(base)
    const keys = new THREE.Mesh(new THREE.PlaneGeometry(screenW * 0.88, baseD * 0.42), new THREE.MeshPhysicalMaterial({ color: 0x1a1b1e, roughness: 0.6 }))
    keys.rotation.x = -Math.PI / 2
    keys.position.set(0, 0.081, -baseD * 0.16)
    root.add(keys)
    const pad = new THREE.Mesh(new RoundedBoxGeometry(screenW * 0.32, 0.002, baseD * 0.26, 2, 0.02), new THREE.MeshPhysicalMaterial({ color: '#8e9298', metalness: 0.7, roughness: 0.4 }))
    pad.position.set(0, 0.081, baseD * 0.26)
    root.add(pad)
    // The lid hinges on the back edge of the base.
    lid = new THREE.Group()
    lid.position.set(0, 0.08, -baseD / 2)
    const shell = new THREE.Mesh(new RoundedBoxGeometry(screenW + 0.22, screenH + 0.26, 0.05, 4, 0.03), metal)
    shell.position.set(0, (screenH + 0.26) / 2, -0.025)
    shell.castShadow = true
    lid.add(shell)
    const bezel = new THREE.Mesh(new THREE.PlaneGeometry(screenW + 0.16, screenH + 0.2), black)
    bezel.position.set(0, (screenH + 0.26) / 2, 0.0015)
    lid.add(bezel)
    screenHolder.position.set(0, (screenH + 0.26) / 2 + 0.01, 0.003)
    lid.add(screenHolder)
    root.add(lid)
  }
  const mat = makeMaterial(screenW, screenH, kind === 'phone' ? Math.min(screenW, screenH) * 0.11 : 0.02)
  const plane = new THREE.Mesh(new THREE.PlaneGeometry(screenW, screenH), mat)
  screenHolder.add(plane)
  // The app's surface on the device: UI pixels scaled onto its screen.
  const scale = screenW / (PX * S)
  ctx.surface.scale = scale
  ctx.surface.group.scale.setScalar(scale)
  ctx.surface.group.position.z = 0.001
  screenHolder.add(ctx.surface.group)
  const glow = new THREE.RectAreaLight(0xcfd8ff, 0, screenW, screenH)
  glow.position.z = 0.02
  glow.lookAt(0, 0, 1)
  screenHolder.add(glow)

  const screenCentre = () => screenHolder.localToWorld(new THREE.Vector3())
  const screenNormal = () => new THREE.Vector3(0, 0, 1).transformDirection(screenHolder.matrixWorld)
  const fitDist = (k) => ((Math.max(screenH, screenW / (ctx.W / ctx.H)) / 2) * k) / Math.tan(THREE.MathUtils.degToRad(17))
  ctx.subject = () => screenCentre()
  ctx.device = { root, hide: () => (root.visible = false) }

  Object.assign(ctx.shots, {
    // A slow three-quarter orbit around the device.
    device_hero: (t, t0, t1, o) => {
      const u = easeInOut(clamp((t - t0) / (t1 - t0)))
      const a = lerp(o.from ?? -0.55, o.to ?? -0.15, u)
      const c = screenCentre()
      const d = fitDist(o.size ?? 1.9)
      return { pos: c.clone().add(new THREE.Vector3(Math.sin(a) * d, d * 0.28, Math.cos(a) * d)), look: c.clone().add(new THREE.Vector3(0, -screenH * 0.12, 0)), focus: c, aperture: 0.0012 }
    },
    // Straight onto the screen, pushing in until the app reads.
    device_front: (t, t0, t1, o) => {
      const u = easeInOut(clamp((t - t0) / (t1 - t0)))
      const c = screenCentre()
      const n = screenNormal()
      return { pos: c.clone().addScaledVector(n, fitDist(lerp(o.from ?? 1.5, o.to ?? 1.08, u))), look: c, focus: c, aperture: 0.0006 }
    },
    // Close on one element of the app on the device's screen.
    device_close: (t, t0, t1, o) => {
      const [x, y, w, h] = o.rect
      const c = ctx.surface.world(x + w / 2, y + h / 2)
      const n = screenNormal()
      const span = Math.max(w * S * scale * 1.6, h * S * scale * 2.2 * (ctx.W / ctx.H))
      const d = span / (ctx.W / ctx.H) / 2 / Math.tan(THREE.MathUtils.degToRad(17))
      return { pos: c.clone().addScaledVector(n, d).add(new THREE.Vector3(0, d * 0.08, 0)), look: c, focus: c, aperture: 0.0006 }
    },
  })

  const [o0, o1] = D.open ?? [-1, -0.5]
  ctx.updaters.push((t) => {
    if (kind === 'phone') {
      // Floats, rises in, turns gently.
      const e = easeOutBack(clamp((t - o0) / (o1 - o0)), 1.2)
      lid.position.y = screenH / 2 + 0.6 + (1 - e) * -2.5 + 0.04 * Math.sin(t * 1.3)
      lid.rotation.set(-0.12 + 0.03 * Math.sin(t * 0.8), (D.turn ?? 0.35) * Math.sin(t * 0.35), 0.03 * Math.sin(t * 0.6))
    } else {
      // The lid opens from closed to about 105°, with a little settle.
      const u = clamp((t - o0) / (o1 - o0))
      // At rotation 0 the lid stands upright facing the camera; closed it lies forward over the base.
      const open = lerp(0, THREE.MathUtils.degToRad(D.angle ?? 105), easeOutBack(u, 0.9))
      lid.rotation.x = Math.PI / 2 - open
    }
    glow.intensity = 0.35 * ctx.screen.su.uPower.value
  })
}
