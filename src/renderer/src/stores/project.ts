import { create } from 'zustand'
import { ipcErrorMessage } from '@/lib/time'
import { basename } from '@/lib/format'
import { sessionIn } from '@/lib/projects'
import { useApp } from './app'

export type ProjectTab = 'build' | 'promo' | 'keys'

interface ProjectStore {
  tab: ProjectTab
  error: string | null
  /** "Presentation deck: sent to Claude", with a link to the session that got it. */
  notice: { text: string; sessionId: string } | null
  setTab(tab: ProjectTab): void
  dismissNotice(): void
  /** Makes a folder the current project (null: none). */
  setProject(dir: string | null): Promise<void>
  /** Picks a folder and makes it the current project. */
  pickProject(): Promise<void>
  /**
   * Hands a job to Claude in the current project: its running session (or a new one with `fresh`),
   * then comes back to the Project place with a notice linking to it.
   */
  askClaude(prompt: string, what: string, opts?: { fresh?: boolean }): Promise<void>
}

/** The current project folder (Settings), or null. */
export const projectDir = () => useApp.getState().settings?.project ?? null
/** The current project folder, as a hook. */
export const useProjectDir = () => useApp((s) => s.settings?.project ?? null)
/** A project's display name: its folder's name. */
export const projectName = (dir: string) => basename(dir)

async function freshSession(dir: string): Promise<string | null> {
  await useApp.getState().startSession(dir)
  const after = useApp.getState()
  return after.startError ? null : after.activeId
}

export const useProject = create<ProjectStore>((set) => ({
  tab: 'build',
  error: null,
  notice: null,
  setTab: (tab) => set({ tab }),
  dismissNotice: () => set({ notice: null }),
  async setProject(dir) {
    try {
      const settings = await window.harness.projectSet(dir)
      useApp.setState({ settings })
      set({ error: null })
    } catch (err) {
      set({ error: ipcErrorMessage(err) })
    }
  },
  async pickProject() {
    const dir = await window.harness.pickDirectory()
    if (dir) await useProject.getState().setProject(dir)
  },
  async askClaude(prompt, what, opts) {
    const dir = projectDir()
    if (!dir) {
      set({ error: 'Pick or create a project first.' })
      return
    }
    const id = await (opts?.fresh ? freshSession(dir) : sessionIn(dir))
    const after = useApp.getState()
    if (!id) {
      set({ error: after.startError ?? 'Could not start a Claude session.' })
      return
    }
    await after.send(prompt)
    // select/startSession go to the session; come back to the Project place.
    after.openProject()
    set({ notice: { text: `${what}: sent to Claude.`, sessionId: id }, error: null })
  },
}))
