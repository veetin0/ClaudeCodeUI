import { readdirSync, readFileSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import manifest from '../src/renderer/src/assets/world/manifest.json'

const DIR = join(__dirname, '..', 'src', 'renderer', 'src', 'assets', 'world')
const size = (file: string) => {
  const b = readFileSync(join(DIR, file))
  return { w: b.readUInt32BE(16), h: b.readUInt32BE(20) }
}

describe('the world art', () => {
  it('has the room and the strip for day, dusk and night at their sizes', () => {
    for (const t of ['day', 'dusk', 'night']) {
      expect(size(`room-${t}.png`)).toEqual({ w: manifest.room.w, h: manifest.room.h })
      expect(size(`strip-${t}.png`)).toEqual({ w: manifest.strip.w, h: manifest.strip.h })
    }
    expect(size('props.png')).toEqual(manifest.propsSheet)
    expect(readdirSync(DIR).filter((f) => f.endsWith('.png'))).toHaveLength(7)
  })

  it('places every prop and station spot inside the room', () => {
    for (const p of manifest.props) {
      expect(p.y + p.h, p.name).toBeLessThanOrEqual(manifest.propsSheet.h)
      for (const [x, y] of p.at) expect(x >= 0 && y >= 0 && x + p.w <= manifest.room.w && y + p.h <= manifest.room.h, p.name).toBe(true)
    }
    for (const [name, st] of Object.entries(manifest.stations)) {
      expect(st.spots.length, name).toBeGreaterThan(0)
      for (const [x, y] of st.spots) expect(x >= 16 && x <= manifest.room.w - 16 && y > manifest.room.wall && y <= manifest.room.h, `${name} ${x},${y}`).toBe(true)
    }
  })
})
