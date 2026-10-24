// Proves the prop never touches the body: samples the handle's surface and the head's surface at
// every angle from PROP.min to PROP.max and checks each point is outside the body's SDF.
//   node scene/check_prop.mjs        (exits 1 if any pose touches)
import { sdf, PROP } from './character.js'

const MARGIN = 0.012
const GRIP = 0.13 // the handle inside and right at the fist (fist radius + handle radius)
const P = PROP
const rot = (x, y, a) => [x * Math.cos(a) - y * Math.sin(a), x * Math.sin(a) + y * Math.cos(a)]
function clearance(a) {
  let worst = Infinity
  let at = null
  const test = (lx, ly, lz, r) => {
    const [x, y] = rot(lx, ly, a)
    const d = sdf(x + P.pivot[0], y + P.pivot[1], lz + P.pivot[2]) - r
    if (d < worst) {
      worst = d
      at = [lx, ly, lz]
    }
  }
  // The handle: its axis, inflated by its radius (not inside the fist: that's the grip).
  for (let k = 0; k <= 40; k++) {
    const y = P.handle.from + ((P.handle.to - P.handle.from) * k) / 40
    if (Math.abs(y) > GRIP) test(0, y, 0, P.handle.radius)
  }
  // The head: points over its whole box.
  const [hx, hy, hz] = P.head.size.map((v) => v / 2)
  for (let i = 0; i <= 8; i++) for (let j = 0; j <= 4; j++) for (let k = 0; k <= 4; k++) test(-hx + (2 * hx * i) / 8, P.head.y - hy + (2 * hy * j) / 4, -hz + (2 * hz * k) / 4, 0)
  return { worst, at }
}
let bad = 0
let min = Infinity
for (let a = P.min; a <= P.max + 1e-9; a += 0.02) {
  const { worst, at } = clearance(a)
  min = Math.min(min, worst)
  if (worst < MARGIN) {
    bad++
    if (bad < 6) console.log(`✗ angle ${a.toFixed(2)}: ${worst.toFixed(3)} from the body at ${at.map((v) => v.toFixed(2))}`)
  }
}
console.log(`${bad ? '✗' : '✓'} prop clearance from ${P.min} to ${P.max} rad: closest ${min.toFixed(3)} (needs ${MARGIN})`)
process.exit(bad ? 1 : 0)
