import { create } from 'zustand'
import { clipTitle, type Kit3dQuality, type Kit3dState } from '@shared/kit3d'
import { newSceneId } from '@shared/pitch'
import { ipcErrorMessage } from '@/lib/time'
import { usePitch } from './pitch'

interface Kit3dStore {
  state: Kit3dState | null
  error: string | null
  load(): Promise<void>
  setup(): Promise<void>
  capture(): Promise<void>
  stills(clip: string): Promise<void>
  render(clip: string, quality: Kit3dQuality): Promise<void>
  cancel(): Promise<void>
  /** Copies the clip into the pitch and puts it in a screen scene (a new one, or the one already using it). */
  addToPitch(clip: string): Promise<void>
}

let listening = false

export const useKit3d = create<Kit3dStore>((set) => {
  const run = async (fn: () => Promise<Kit3dState>) => {
    try {
      set({ state: await fn(), error: null })
    } catch (err) {
      set({ error: ipcErrorMessage(err) })
    }
  }
  return {
    state: null,
    error: null,
    async load() {
      if (!listening) {
        listening = true
        window.harness.onKit3d((state) => set({ state }))
      }
      await run(() => window.harness.kit3dState())
    },
    setup: () => run(() => window.harness.kit3dSetup()),
    capture: () => run(() => window.harness.kit3dCapture()),
    stills: (clip) => run(() => window.harness.kit3dStills(clip)),
    render: (clip, quality) => run(() => window.harness.kit3dRender(clip, quality)),
    cancel: () => run(() => window.harness.kit3dCancel()),
    async addToPitch(clip) {
      try {
        const { media, seconds } = await window.harness.kit3dAddToPitch(clip)
        const secs = seconds ? Math.ceil(seconds * 10) / 10 : undefined
        usePitch.getState().edit((s) => {
          if (s.scenes.some((sc) => sc.media === media)) return { ...s, scenes: s.scenes.map((sc) => (sc.media === media ? { ...sc, seconds: secs ?? sc.seconds } : sc)) }
          const scene = { id: newSceneId(), visual: 'screen' as const, title: clipTitle(clip), narration: '', media, seconds: secs }
          // Before the end card, if there is one.
          const end = s.scenes.findIndex((sc) => sc.visual === 'end')
          const at = end === -1 ? s.scenes.length : end
          return { ...s, scenes: [...s.scenes.slice(0, at), scene, ...s.scenes.slice(at)] }
        })
        set({ error: null })
      } catch (err) {
        set({ error: ipcErrorMessage(err) })
      }
    },
  }
})
