import { useEffect } from 'react'
import { useApp } from '@/stores/app'
import type { SessionState } from '@/stores/reducer'

/**
 * Chiptune blips for the team (Settings › General › Sounds, off by default): square and triangle
 * waves made on the spot with Web Audio, no sound files. Quiet, short, at most one at a time.
 */
export type SoundName = 'join' | 'done' | 'fail' | 'alert' | 'fanfare'

/** Which matters most when several things happen at once. */
const PRIORITY: SoundName[] = ['alert', 'fail', 'join', 'done', 'fanfare']

interface Note {
  f: number
  d: number
  wave?: OscillatorType
}
const C5 = 523.25, E5 = 659.25, G5 = 783.99, A5 = 880, B5 = 987.77, C6 = 1046.5, E6 = 1318.5, G4 = 392, E4 = 329.63, C4 = 261.63
const TUNES: Record<SoundName, Note[]> = {
  // Someone joins: a quick rising arpeggio.
  join: [{ f: C5, d: 0.06 }, { f: E5, d: 0.06 }, { f: G5, d: 0.1 }],
  // A teammate finished: two coin-like notes.
  done: [{ f: B5, d: 0.07 }, { f: E6, d: 0.18 }],
  // Something failed: falling, buzzy.
  fail: [{ f: G4, d: 0.09 }, { f: E4, d: 0.09 }, { f: C4, d: 0.22 }],
  // Claude needs you: a two-tone call.
  alert: [{ f: A5, d: 0.09 }, { f: E5, d: 0.09 }, { f: A5, d: 0.14 }],
  // The turn is done: a short fanfare.
  fanfare: [
    { f: C5, d: 0.07, wave: 'triangle' },
    { f: E5, d: 0.07, wave: 'triangle' },
    { f: G5, d: 0.07, wave: 'triangle' },
    { f: C6, d: 0.24, wave: 'triangle' },
  ],
}

let ctx: AudioContext | null = null

export function playSound(name: SoundName): void {
  try {
    ctx ??= new AudioContext()
    if (ctx.state === 'suspended') void ctx.resume()
    let t = ctx.currentTime + 0.01
    for (const n of TUNES[name]) {
      const wave = n.wave ?? 'square'
      const vol = wave === 'square' ? 0.05 : 0.12
      const osc = ctx.createOscillator()
      const gain = ctx.createGain()
      osc.type = wave
      osc.frequency.value = n.f
      gain.gain.setValueAtTime(0, t)
      gain.gain.linearRampToValueAtTime(vol, t + 0.005)
      gain.gain.setValueAtTime(vol, Math.max(t + 0.006, t + n.d - 0.02))
      gain.gain.linearRampToValueAtTime(0, t + n.d)
      osc.connect(gain).connect(ctx.destination)
      osc.start(t)
      osc.stop(t + n.d + 0.01)
      t += n.d
    }
  } catch {
    // No audio device: stay quiet.
  }
}

/** What changed between two moments of a session, as sounds (most important first). */
export function soundsFor(prev: SessionState | undefined, next: SessionState): SoundName[] {
  if (!prev || prev === next) return []
  const found = new Set<SoundName>()
  for (const [id, sub] of Object.entries(next.subagents)) {
    const before = prev.subagents[id]
    if (!before) found.add('join')
    else if (before.status === 'running' && sub.status === 'completed') found.add('done')
    else if (before.status === 'running' && sub.status === 'failed') found.add('fail')
  }
  const asked = new Set(prev.permissions.map((p) => p.requestId))
  if (next.permissions.some((p) => !asked.has(p.requestId))) found.add('alert')
  if (next.lastTurn && next.lastTurn.endedAt !== prev.lastTurn?.endedAt) found.add(next.lastTurn.isError ? 'fail' : 'fanfare')
  return PRIORITY.filter((n) => found.has(n))
}

/** Plays the team's sounds while the setting is on: live Harness sessions only, never replays or loading. */
export function useWorldSounds(): void {
  useEffect(() => {
    let last = 0
    return useApp.subscribe((st, prev) => {
      if (!st.settings?.sounds || st.sessions === prev.sessions) return
      let best: SoundName | undefined
      for (const [id, s] of Object.entries(st.sessions)) {
        const before = prev.sessions[id]
        if (!before || before === s || !s.live || !before.live || s.observed || st.replay?.sessionId === id) continue
        const top = soundsFor(before, s)[0]
        if (top && (!best || PRIORITY.indexOf(top) < PRIORITY.indexOf(best))) best = top
      }
      const now = Date.now()
      if (best && now - last > 250) {
        last = now
        playSound(best)
      }
    })
  }, [])
}
