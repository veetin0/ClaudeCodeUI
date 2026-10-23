// The hero's face: eyes, brows, mouth, tongue and blush drawn by one shader on a thin plate that
// hugs the body's surface (each vertex is projected onto the hero's SDF), so it bends with any head
// shape and squashes with the body. Crisp at any zoom; every feature is a number you can animate.
import * as THREE from 'three'

/** Expression presets. Talking adds the mouth shapes on top of the mood's eyes, brows and smile. */
export const MOODS = {
  neutral: { open: 1, happy: 0, wide: 0, tilt: 0, brow: 0, browAngle: 0, smile: 0.35, mouthOpen: 0, round: 0, wideMouth: 0, tongue: 0, blush: 0 },
  happy: { open: 1, happy: 0.3, wide: 0, tilt: 0, brow: 0.25, browAngle: 0, smile: 0.85, mouthOpen: 0, round: 0, wideMouth: 0.1, tongue: 0, blush: 0.25 },
  joy: { open: 1, happy: 1, wide: 0, tilt: 0, brow: 0.6, browAngle: 0, smile: 1, mouthOpen: 0.75, round: 0, wideMouth: 0.35, tongue: 0, blush: 0.9 },
  excited: { open: 1, happy: 0, wide: 0.45, tilt: 0, brow: 0.8, browAngle: 0, smile: 0.8, mouthOpen: 0.45, round: 0.2, wideMouth: 0.2, tongue: 0, blush: 0.35 },
  worried: { open: 1, happy: 0, wide: 0.12, tilt: -0.55, brow: 0.45, browAngle: -0.85, smile: -0.55, mouthOpen: 0, round: 0, wideMouth: 0, tongue: 0, blush: 0 },
  focused: { open: 0.82, happy: 0, wide: 0, tilt: 0.45, brow: -0.15, browAngle: 0.7, smile: 0.15, mouthOpen: 0, round: 0, wideMouth: 0, tongue: 1, blush: 0 },
  surprised: { open: 1, happy: 0, wide: 0.85, tilt: 0, brow: 1, browAngle: 0, smile: 0, mouthOpen: 0.55, round: 1, wideMouth: 0, tongue: 0, blush: 0 },
  proud: { open: 1, happy: 1, wide: 0, tilt: 0, brow: 0.35, browAngle: -0.15, smile: 1, mouthOpen: 0.15, round: 0, wideMouth: 0.3, tongue: 0, blush: 0.6 },
  sleep: { open: 0, happy: 0, wide: 0, tilt: 0, brow: -0.3, browAngle: 0, smile: 0.25, mouthOpen: 0.05, round: 0.6, wideMouth: 0, tongue: 0, blush: 0 },
}
const KEYS = Object.keys(MOODS.neutral)

export function mixMood(a, b, u) {
  const out = {}
  for (const k of KEYS) out[k] = a[k] + (b[k] - a[k]) * u
  return out
}

/** Builds the face plate for a hero (hero.js exports sdf and FACE). */
export function createFace(HERO, { ink, tongue = '#E8607A', blush = '#FF8FA3', eyes = null } = {}) {
  const F = HERO.FACE
  const [cx, cy] = F.plate.center
  const [w, h] = F.plate.size
  const geo = new THREE.PlaneGeometry(w, h, 40, 28)
  const pos = geo.attributes.position
  // Hug the surface: march each vertex from in front of the face back along -z to the SDF's zero.
  for (let i = 0; i < pos.count; i++) {
    const x = pos.getX(i) + cx
    const y = pos.getY(i) + cy
    let z = 1.5
    for (let s = 0; s < 64; s++) {
      const d = HERO.sdf(x, y, z)
      if (d < 0.0005) break
      z -= Math.max(d, 0.002)
      if (z < -1.5) break
    }
    pos.setXYZ(i, x, y, Math.max(z, -1.5) + (F.plate.lift ?? 0.007))
  }
  geo.computeVertexNormals()

  const s = (v) => new THREE.Vector2(v[0] - cx, v[1] - cy)
  const u = {
    uHalf: { value: new THREE.Vector2(w / 2, h / 2) },
    uInk: { value: new THREE.Color(ink) },
    uEyeInk: { value: new THREE.Color(eyes ?? ink) },
    uTongue: { value: new THREE.Color(tongue) },
    uBlushCol: { value: new THREE.Color(blush) },
    uEyeL: { value: s(F.eyes[0]) },
    uEyeR: { value: s(F.eyes[1]) },
    uEyeSize: { value: new THREE.Vector2(F.eye[0] / 2, F.eye[1] / 2) },
    uMouthAt: { value: s(F.mouth) },
    uMouthW: { value: F.mouthWidth / 2 },
    uBrows: { value: F.brows ? 1 : 0 },
    // x open, y happy, z wide, w tilt (+ angry, - sad)
    uEye: { value: new THREE.Vector4(1, 0, 0, 0) },
    uLook: { value: new THREE.Vector2(0, 0) },
    // x raise, y angle (+ inner ends down: cross; - inner ends up: worried)
    uBrow: { value: new THREE.Vector2(0, 0) },
    // x open, y wide, z round, w smile (-1 frown .. 1 smile)
    uMouth: { value: new THREE.Vector4(0, 0, 0, 0.35) },
    uTongueOut: { value: 0 },
    uBlush: { value: 0 },
    uGlint: { value: F.glint ?? 1 },
    uAlpha: { value: 1 },
  }
  const mat = new THREE.ShaderMaterial({
    uniforms: u,
    transparent: true,
    depthWrite: false,
    polygonOffset: true,
    polygonOffsetFactor: -4,
    polygonOffsetUnits: -4,
    vertexShader: `varying vec2 vP; uniform vec2 uHalf;
      void main(){ vP = (uv - 0.5) * 2.0 * uHalf; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }`,
    fragmentShader: `
      varying vec2 vP;
      uniform vec3 uInk, uEyeInk, uTongue, uBlushCol;
      uniform vec2 uEyeL, uEyeR, uEyeSize, uMouthAt, uLook, uBrow;
      uniform float uMouthW, uBrows, uTongueOut, uBlush, uGlint, uAlpha;
      uniform vec4 uEye, uMouth;

      float box(vec2 p, vec2 b, float r){ vec2 q = abs(p) - b + r; return length(max(q, 0.0)) + min(max(q.x, q.y), 0.0) - r; }
      float seg(vec2 p, vec2 a, vec2 b){ vec2 pa = p - a, ba = b - a; float h = clamp(dot(pa, ba) / dot(ba, ba), 0.0, 1.0); return length(pa - ba * h); }
      float cov(float d){ float w = fwidth(d) * 0.75; return 1.0 - smoothstep(-w, w, d); }
      vec4 over(vec4 dst, vec3 c, float a){ return vec4(mix(dst.rgb, c, a), dst.a + a * (1.0 - dst.a)); }

      // One eye: a tall rounded slit that closes into a dash, squints into a ^ arc, widens,
      // and gets a lid cut when angry (inner corner down) or sad (outer corner down).
      float eye(vec2 p, vec2 at, float inner){
        vec2 q = p - at - uLook * uEyeSize * vec2(0.9, 0.5);
        vec2 e = uEyeSize * (1.0 + 0.32 * uEye.z);
        float open = clamp(uEye.x, 0.0, 1.0);
        vec2 b = vec2(e.x, e.y * max(open, 0.12));
        float d = box(q, b, min(b.x, b.y));
        // Closed: a downward arc, like a sleeping smile.
        float R = e.x * 2.1;
        vec2 cc = q - vec2(0.0, R * 0.45);
        float closed = max(abs(length(cc) - R) - e.x * 0.45, cc.y + R * 0.2);
        d = mix(closed, d, smoothstep(0.05, 0.45, open));
        // A little happy: the cheeks push the bottom of the eye up into a curve.
        float squint = clamp(uEye.y * 2.0, 0.0, 1.0);
        float bottom = -b.y + squint * b.y * (0.55 + 0.45 * (1.0 - q.x * q.x / (b.x * b.x)));
        d = max(d, mix(-1.0, bottom - q.y, step(0.01, squint)));
        // Very happy: an upside-down U (^).
        vec2 c = q - vec2(0.0, -R * 0.55);
        float arc = max(abs(length(c) - R) - e.x * 0.55, -c.y + R * 0.05);
        d = mix(d, arc, smoothstep(0.5, 1.0, uEye.y));
        // Lid cut along a sloped line across the top.
        float t = uEye.w;
        float slope = t * 0.9 * inner;
        float top = e.y * (1.0 - 0.5 * abs(t)) * open;
        float lid = (q.y - top + slope * q.x) / sqrt(1.0 + slope * slope);
        return max(d, mix(-1.0, lid, step(0.02, abs(t))));
      }
      float glint(vec2 p, vec2 at){
        vec2 e = uEyeSize * (1.0 + 0.32 * uEye.z);
        vec2 q = p - at - uLook * uEyeSize * vec2(0.9, 0.5) - vec2(e.x * 0.25, e.y * 0.45 * uEye.x);
        return length(q) - e.x * 0.36;
      }
      float brow(vec2 p, vec2 at, float inner){
        vec2 e = uEyeSize;
        vec2 c = at + vec2(0.0, e.y * (1.22 + 0.3 * uBrow.x) * (1.0 + 0.12 * uEye.z));
        float a = uBrow.y * 0.45;
        vec2 dir = vec2(cos(a), -sin(a) * inner);
        return seg(p, c - dir * e.x * 1.25, c + dir * e.x * 1.25) - e.x * 0.32;
      }

      void main(){
        vec4 col = vec4(0.0);
        vec2 p = vP;
        // Which side is the nose: the inner side of each eye.
        float innerL = sign(uEyeR.x - uEyeL.x), innerR = -innerL;
        // Blush under the outer corners.
        if (uBlush > 0.001) {
          for (int i = 0; i < 2; i++) {
            vec2 at = i == 0 ? uEyeL : uEyeR;
            float side = i == 0 ? -innerL : -innerR;
            vec2 q = (p - at - vec2(side * uEyeSize.x * 2.1, -uEyeSize.y * 1.05)) / (uEyeSize.x * vec2(2.0, 1.1));
            col = over(col, uBlushCol, uBlush * 0.55 * smoothstep(1.0, 0.25, length(q)));
          }
        }
        if (uBrows > 0.5) {
          col = over(col, uInk, cov(brow(p, uEyeL, innerL)));
          col = over(col, uInk, cov(brow(p, uEyeR, innerR)));
        }
        float eyes = min(eye(p, uEyeL, innerL), eye(p, uEyeR, innerR));
        col = over(col, uEyeInk, cov(eyes));
        float g = uGlint * step(0.55, uEye.x) * (1.0 - smoothstep(0.3, 0.6, uEye.y));
        if (g > 0.0) col = over(col, vec3(1.0), 0.9 * g * cov(max(min(glint(p, uEyeL), glint(p, uEyeR)), eyes)));

        // The mouth: a bent line that opens into a D, an O (round) or a wide grin.
        vec2 q = p - uMouthAt;
        float o = clamp(uMouth.x, 0.0, 1.0), wd = uMouth.y, rd = uMouth.z, sm = uMouth.w;
        float W = uMouthW * (1.0 + 0.4 * wd - 0.42 * rd) * (1.0 + 0.15 * o);
        float thick = uMouthW * 0.16;
        float Hh = max(thick, uMouthW * (0.08 + 0.95 * o) * (1.0 + 0.55 * rd - 0.25 * wd));
        vec2 m = q;
        m.y -= sm * 0.55 * W * (m.x * m.x) / (W * W) - sm * 0.12 * W; // corners up for a smile
        if (m.y > 0.0) m.y *= mix(1.0, 1.7, o * (1.0 - rd)); // a flatter top lip: a D
        float mouth = box(m, vec2(W, Hh), min(W, Hh) * mix(1.0, 0.98, rd));
        col = over(col, uInk, cov(mouth));
        // Inside the open mouth: a tongue at the bottom.
        if (o > 0.12) {
          float tg = length((m - vec2(0.0, -Hh * 0.95)) / vec2(W * 0.62, Hh * 0.75)) - 1.0;
          col = over(col, uTongue, cov(max(tg * min(W, Hh), mouth + thick * 0.35)) * smoothstep(0.12, 0.3, o));
        }
        // Tongue poking out of one corner while it concentrates.
        if (uTongueOut > 0.01) {
          vec2 tq = q - vec2(W * 0.45, -thick * 0.6 - uMouthW * 0.2 * uTongueOut);
          float t = length(tq / vec2(uMouthW * 0.32, uMouthW * 0.28)) - 1.0;
          t *= uMouthW * 0.3;
          t = max(t, q.y + thick * 0.2); // only the part below the lips
          col = over(col, uTongue, cov(t) * uTongueOut);
          col = over(col, uInk, cov(abs(t) - thick * 0.22) * uTongueOut * 0.8);
        }
        gl_FragColor = vec4(col.rgb, col.a * uAlpha);
      }`,
  })
  const mesh = new THREE.Mesh(geo, mat)
  mesh.renderOrder = 2

  /** Applies a mood (a MOODS entry, possibly mixed) plus look, blink and talking. */
  function set(m, { look = [0, 0], blink = 1, talk = null } = {}) {
    // Talking with cross brows reads as shouting: soften a frown while it speaks (worry stays).
    const soft = talk ? 0.3 : 1
    u.uEye.value.set(m.open * blink, m.happy, m.wide, m.tilt > 0 ? m.tilt * soft : m.tilt)
    u.uLook.value.set(look[0], look[1])
    u.uBrow.value.set(m.brow, m.browAngle > 0 ? m.browAngle * soft : m.browAngle)
    let open = m.mouthOpen
    let wide = m.wideMouth
    let round = m.round
    if (talk) {
      // Talking: the voice's shapes over the mood (a smile stays a smile while it talks).
      open = Math.max(open * 0.5, talk.open)
      wide = wide * 0.5 + talk.wide
      round = round * 0.5 + talk.round
    }
    u.uMouth.value.set(open, wide, round, m.smile)
    u.uTongueOut.value = talk && talk.open > 0.15 ? 0 : m.tongue
    u.uBlush.value = m.blush
  }
  return { mesh, uniforms: u, set }
}
