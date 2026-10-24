// A physical product: a glTF model (its top-level parts named) or, without one, a demo sensor built
// from primitives. It turns slowly, explodes along its height so every part shows, and labelled
// callouts point at the parts that matter. Shots orbit it or close in on a part.
import * as THREE from 'three'
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js'
import { RoundedBoxGeometry } from 'three/addons/geometries/RoundedBoxGeometry.js'
import { cardTexture, clamp, easeInOut, easeOutBack, lerp, sstep } from './util.js'

/** A demo product so the kit runs without a model: a smart sensor in five named parts. */
function demoProduct(tint) {
  const g = new THREE.Group()
  const part = (name, mesh, y) => {
    mesh.name = name
    mesh.position.y = y
    mesh.castShadow = mesh.receiveShadow = true
    g.add(mesh)
  }
  part('base', new THREE.Mesh(new THREE.CylinderGeometry(1.0, 1.08, 0.22, 64), new THREE.MeshPhysicalMaterial({ color: 0x24262a, roughness: 0.8 })), 0.11) // matte: the spot's highlight sweeps a glossy top
  const battery = new THREE.Group()
  for (const x of [-0.32, 0.32]) {
    const cell = new THREE.Mesh(new THREE.CylinderGeometry(0.17, 0.17, 0.9, 32), new THREE.MeshPhysicalMaterial({ color: 0xc8ccd2, metalness: 0.9, roughness: 0.25 }))
    cell.rotation.z = Math.PI / 2
    cell.position.x = x
    cell.castShadow = true
    battery.add(cell)
  }
  part('battery', battery, 0.42)
  const board = new THREE.Group()
  board.add(new THREE.Mesh(new THREE.CylinderGeometry(0.92, 0.92, 0.05, 64), new THREE.MeshPhysicalMaterial({ color: 0x1f6f4a, roughness: 0.5 })))
  for (const [x, z, w, d] of [
    [0, 0, 0.42, 0.42],
    [-0.5, 0.2, 0.2, 0.14],
    [0.45, -0.3, 0.24, 0.16],
    [0.3, 0.45, 0.14, 0.14],
  ]) {
    const chip = new THREE.Mesh(new RoundedBoxGeometry(w, 0.06, d, 2, 0.01), new THREE.MeshPhysicalMaterial({ color: 0x15171a, roughness: 0.4 }))
    chip.position.set(x, 0.05, z)
    board.add(chip)
  }
  part('board', board, 0.72)
  const ring = new THREE.Mesh(new THREE.TorusGeometry(0.86, 0.045, 16, 96), new THREE.MeshPhysicalMaterial({ color: tint, emissive: tint, emissiveIntensity: 0.7, roughness: 0.3 }))
  ring.rotation.x = Math.PI / 2
  part('ring', ring, 0.82)
  const shell = new THREE.Mesh(new THREE.SphereGeometry(1.0, 64, 32, 0, Math.PI * 2, 0, Math.PI / 2), new THREE.MeshPhysicalMaterial({ color: 0xa8a29a, roughness: 0.6, clearcoat: 0.2, clearcoatRoughness: 0.4, envMapIntensity: 0.5 }))
  shell.scale.y = 0.55
  part('shell', shell, 0.84)
  return g
}

export default async function product(ctx) {
  const { TL, scene, tint } = ctx
  const P = TL.product ?? {}
  const base = new THREE.Vector3(...(P.at ?? (ctx.anchors.PEDESTAL ? ctx.anchors.PEDESTAL.toArray() : [0, ctx.anchors.FLOOR ?? -1.2, 0])))
  let model
  if (P.model) {
    const gltf = await new GLTFLoader().loadAsync(`/${P.model}`)
    model = gltf.scene
    model.traverse((o) => o.isMesh && (o.castShadow = o.receiveShadow = true))
  } else model = demoProduct(tint)
  // Size it: about P.height tall, standing on the base point, centred.
  const box = new THREE.Box3().setFromObject(model)
  const size = box.getSize(new THREE.Vector3())
  const k = (P.height ?? 1.6) / Math.max(size.y, size.x * 0.6, 1e-3)
  model.scale.multiplyScalar(k)
  const box2 = new THREE.Box3().setFromObject(model)
  const centre = box2.getCenter(new THREE.Vector3())
  model.position.sub(new THREE.Vector3(centre.x, box2.min.y, centre.z))
  const spin = new THREE.Group()
  spin.add(model)
  spin.position.copy(base)
  scene.add(spin)
  const height = box2.max.y - box2.min.y

  // The parts that explode, bottom to top: the named ones in P.parts, or every top-level child.
  const parts = (P.parts ?? model.children.map((c) => c.name))
    .map((n) => model.getObjectByName(n))
    .filter(Boolean)
    .filter((o, i, a) => a.indexOf(o) === i)
    .sort((a, b) => a.position.y - b.position.y)
  for (const p of parts) p.userData.home = p.position.clone()
  const gap = (P.gap ?? 0.55) / k // world gap between parts, in the model's own units

  // Callouts: a card beside the part with a thin line to it, always facing the camera.
  const callouts = (P.callouts ?? []).map((c, i) => {
    const card = new THREE.Mesh(new THREE.PlaneGeometry(1.5, 0.42), new THREE.MeshBasicMaterial({ map: cardTexture(c.text, { dot: c.dot ?? `#${tint.getHexString()}`, size: 50 }), transparent: true, depthWrite: false }))
    card.visible = false
    scene.add(card)
    const line = new THREE.Line(new THREE.BufferGeometry().setFromPoints([new THREE.Vector3(), new THREE.Vector3()]), new THREE.LineBasicMaterial({ color: 0xf4ece6, transparent: true }))
    line.visible = false
    scene.add(line)
    return { ...c, i, card, line, side: c.side ?? (i % 2 ? 1 : -1), part: model.getObjectByName(c.part) }
  })

  const explodeAt = (t) => {
    if (!P.explode) return 0
    const [a, b] = P.explode
    let e = easeInOut(clamp((t - a) / (b - a)))
    if (P.collapse) e *= 1 - easeInOut(clamp((t - P.collapse[0]) / (P.collapse[1] - P.collapse[0])))
    return e
  }
  const partWorld = (p) => p.getWorldPosition(new THREE.Vector3())
  ctx.subject = () => base.clone().add(new THREE.Vector3(0, height * 0.5, 0))
  ctx.productRoot = spin
  Object.assign(ctx.shots, {
    product_orbit: (t, t0, t1, o) => {
      const u = easeInOut(clamp((t - t0) / (t1 - t0)))
      const a = lerp(o.from ?? -0.7, o.to ?? 0.5, u)
      const c = base.clone().add(new THREE.Vector3(0, height * (0.5 + 0.35 * explodeAt(t)), 0))
      const d = (o.dist ?? 6.2) * (1 + 0.35 * explodeAt(t))
      return { pos: c.clone().add(new THREE.Vector3(Math.sin(a) * d, (o.lift ?? 0.32) * d, Math.cos(a) * d)), look: c, focus: c, aperture: 0.0012 }
    },
    product_close: (t, t0, t1, o) => {
      const p = model.getObjectByName(o.part)
      const c = p ? partWorld(p) : ctx.subject()
      return { pos: c.clone().add(new THREE.Vector3(1.1, 0.8, 2.6)), look: c, focus: c, aperture: 0.002 }
    },
  })

  ctx.updaters.push((t) => {
    spin.rotation.y = (P.spin ?? 0.25) * t + (P.start_angle ?? -0.4)
    const e = explodeAt(t)
    const mid = (parts.length - 1) / 2
    parts.forEach((p, i) => p.position.copy(p.userData.home).add(new THREE.Vector3(0, (i - mid * 0.6) * gap * e, 0)))
  })
  ;(ctx.after ??= []).push((t) => {
    for (const c of callouts) {
      const on = sstep(c.t, c.t + 0.25, t) * (c.out == null ? 1 : 1 - sstep(c.out, c.out + 0.25, t))
      c.card.visible = c.line.visible = on > 0.01 && !!c.part
      if (!c.card.visible) continue
      const p = partWorld(c.part)
      const right = new THREE.Vector3(1, 0, 0).applyQuaternion(ctx.camera.quaternion)
      const pos = p.clone().addScaledVector(right, c.side * (1.7 + 0.1 * c.i)).add(new THREE.Vector3(0, 0.25, 0))
      c.card.position.copy(pos)
      c.card.quaternion.copy(ctx.camera.quaternion)
      c.card.scale.setScalar(Math.max(0.001, easeOutBack(on, 1.8)))
      const end = pos.clone().addScaledVector(right, -c.side * 0.75)
      c.line.geometry.setFromPoints([p, end])
      c.line.material.opacity = on
    }
  })
  ctx.product = { root: spin, hide: () => (spin.visible = false) }
}
