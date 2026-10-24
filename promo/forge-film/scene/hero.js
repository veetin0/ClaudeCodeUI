// The hero: one smooth toy. Swap this file (and HERO in timeline.py) for another character.
//
// The body is a signed-distance function: rounded boxes, capsules, cones and spheres blended with
// smin, meshed once with marching cubes, so it has no seams and no voxel look. The face, legs and
// prop are separate pieces on top. Units are world units: the hero is about 1 tall, y is up, it
// faces +z and its feet are at y = 0. The example is Forge, a soft anvil with a tiny hammer.
import * as THREE from 'three'
import { RoundedBoxGeometry } from 'three/addons/geometries/RoundedBoxGeometry.js'

const clamp = (x, a = 0, b = 1) => Math.min(b, Math.max(a, x))

// ---------- shape helpers ----------
export const sdSphere = (px, py, pz, cx, cy, cz, r) => Math.hypot(px - cx, py - cy, pz - cz) - r
export const sdRoundBox = (px, py, pz, cx, cy, cz, bx, by, bz, r) => {
  const qx = Math.abs(px - cx) - (bx - r)
  const qy = Math.abs(py - cy) - (by - r)
  const qz = Math.abs(pz - cz) - (bz - r)
  return Math.hypot(Math.max(qx, 0), Math.max(qy, 0), Math.max(qz, 0)) + Math.min(Math.max(qx, Math.max(qy, qz)), 0) - r
}
/** A capsule or cone from a to b, radius r1 at a and r2 at b. */
export const sdCone = (px, py, pz, ax, ay, az, bx, by, bz, r1, r2 = r1) => {
  const pax = px - ax
  const pay = py - ay
  const paz = pz - az
  const bax = bx - ax
  const bay = by - ay
  const baz = bz - az
  const h = clamp((pax * bax + pay * bay + paz * baz) / (bax * bax + bay * bay + baz * baz))
  return Math.hypot(pax - bax * h, pay - bay * h, paz - baz * h) - (r1 + (r2 - r1) * h)
}
/** Smooth union: k is how wide the blend between two parts is. */
export const smin = (a, b, k) => {
  const h = Math.max(k - Math.abs(a - b), 0) / k
  return Math.min(a, b) - h * h * k * 0.25
}

// ---------- Forge ----------
/** The cube the body is meshed in: centre height and half size. Keep the whole body inside. */
export const BOUNDS = { cy: 0.4, half: 1.15 } // the arm reaches x = -0.83

export function sdf(x, y, z) {
  let d = sdRoundBox(x, y, z, 0, 0.21, 0, 0.46, 0.11, 0.31, 0.1) // base
  d = smin(d, sdRoundBox(x, y, z, 0, 0.4, 0, 0.26, 0.12, 0.22, 0.1), 0.11) // waist
  d = smin(d, sdRoundBox(x, y, z, -0.06, 0.63, 0, 0.58, 0.165, 0.33, 0.15), 0.11) // face block
  d = smin(d, sdCone(x, y, z, 0.42, 0.66, 0, 0.99, 0.73, 0, 0.15, 0.045), 0.08) // horn
  d = smin(d, sdCone(x, y, z, -0.22, 0.4, 0.06, -0.7, 0.37, 0.13, 0.068, 0.058), 0.06) // arm, out under the face block
  d = smin(d, sdSphere(x, y, z, -0.76, 0.37, 0.13, 0.072), 0.04) // the fist that holds the hammer
  return d
}

/**
 * The face (face.js draws it on a plate that hugs the body): where the plate sits on the front of
 * the body and how big it is, the eyes (centres and size of one eye: a tall slit here), whether it
 * has brows, and the mouth (centre and width). All in body units, seen from the front.
 */
export const FACE = {
  plate: { center: [-0.06, 0.635], size: [0.9, 0.46] },
  eyes: [
    [-0.19, 0.64],
    [0.07, 0.64],
  ],
  eye: [0.075, 0.165],
  brows: true,
  mouth: [-0.06, 0.528],
  mouthWidth: 0.17,
}

/** Stubby legs: where they sit under the body and how long they are. */
export const LEGS = {
  at: [
    [-0.27, -0.16],
    [0.27, -0.16],
    [-0.27, 0.16],
    [0.27, 0.16],
  ],
  y: 0.1,
  radius: 0.068,
  length: 0.07,
}

/**
 * The prop: where the hand holds it, its parts, and its poses as one angle (radians, around the
 * hand, seen from the front: 0 = straight up, positive = out to the hero's side and down). Every
 * pose stays in the sector outside the body; the scene clamps the angle to [min, max], and
 * `node scene/check_prop.mjs` proves no pose touches the body.
 */
export const PROP = {
  pivot: [-0.78, 0.37, 0.13],
  handle: { from: -0.07, to: 0.4, radius: 0.031 },
  head: { y: 0.43, size: [0.28, 0.135, 0.135] },
  min: 0.18,
  max: 2.45,
  poses: { rest: 0.6, wind: 0.22, strike: 2.15, bigWind: 0.18, bigStrike: 2.4, wave: [0.2, 0.62], tap: [1.0, 1.95], swat: [0.2, 2.3] },
}

/** Where the prop hits the ground on a strike, from the hero's feet (sparks fly from here). */
export const STRIKE = [-1.18, 0.05, 0.13]

/**
 * The prop the hero presses buttons with: a group pivoting in the hand (PROP.pivot); the scene sets
 * its rotation.z to the pose angle. Return null for a hero without one.
 */
export function prop(hero) {
  const P = PROP
  const hammer = new THREE.Group()
  hammer.position.set(...P.pivot)
  const len = P.handle.to - P.handle.from
  const handle = new THREE.Mesh(new THREE.CylinderGeometry(P.handle.radius * 0.88, P.handle.radius, len, 12), new THREE.MeshPhysicalMaterial({ color: hero.prop?.handle ?? '#8A5A3C', roughness: 0.55 }))
  handle.position.y = (P.handle.from + P.handle.to) / 2
  const head = new THREE.Mesh(new RoundedBoxGeometry(...P.head.size, 3, 0.035), new THREE.MeshPhysicalMaterial({ color: hero.prop?.head ?? '#4A403B', roughness: 0.3, metalness: 0.65 }))
  head.position.y = P.head.y
  handle.castShadow = head.castShadow = true
  hammer.add(handle, head)
  return hammer
}
