import { useEffect } from 'react'
import { create } from 'zustand'
import { LEAD_SETUPS } from '@shared/advisor'
import type { PermissionMode } from '@shared/events'
import { autopilotPrompt, type ProjectState } from '@shared/project'
import { ipcErrorMessage } from '@/lib/time'
import { basename } from '@/lib/format'
import { sessionIn } from '@/lib/projects'
import { useApp } from './app'

export type ProjectTab = 'build' | 'promo' | 'keys'

export interface BuildOptions {
  idea: string
  name: string
  parent: string
  /** LEAD_SETUPS id. */
  setup: string
  /** How much Claude asks while it builds. */
  mode: PermissionMode
}

interface ProjectStore {
  tab: ProjectTab
  error: string | null
  /** "Presentation deck: sent to Claude", with a link to the session that got it. */
  notice: { text: string; sessionId: string } | null
  /** Where the current project's build is (from main). */
  state: ProjectState | null
  setTab(tab: ProjectTab): void
  dismissNotice(): void
  load(): Promise<void>
  /** Makes a folder the current project (null: none). */
  setProject(dir: string | null): Promise<void>
  /** Picks a folder and makes it the current project. */
  pickProject(): Promise<void>
  /**
   * Build it: creates the project from the idea, starts its session with the chosen setup and sends
   * the autopilot prompt. Leaves you in the session's chat. False (with `error` set) if it failed.
   */
  build(o: BuildOptions): Promise<boolean>
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

let listening = false

export const useProject = create<ProjectStore>((set) => ({
  tab: 'build',
  error: null,
  notice: null,
  state: null,
  setTab: (tab) => set({ tab }),
  dismissNotice: () => set({ notice: null }),
  async load() {
    if (!listening) {
      listening = true
      window.harness.onProjectState((state) => set({ state }))
    }
    set({ state: await window.harness.projectState() })
  },
  async setProject(dir) {
    try {
      const settings = await window.harness.projectSet(dir)
      useApp.setState({ settings })
      set({ error: null, notice: null })
    } catch (err) {
      set({ error: ipcErrorMessage(err) })
    }
  },
  async pickProject() {
    const dir = await window.harness.pickDirectory()
    if (dir) await useProject.getState().setProject(dir)
  },
  async build(o) {
    try {
      const { dir, settings } = await window.harness.projectCreate({ idea: o.idea, name: o.name, parent: o.parent, setup: o.setup })
      useApp.setState({ settings })
      const lead = LEAD_SETUPS.find((x) => x.id === o.setup && x.id !== 'default')?.setup
      const id = await useApp.getState().startQuiet(dir, o.mode, lead)
      await window.harness.projectLink(id)
      const app = useApp.getState()
      app.select(id)
      app.setView('chat')
      await app.sendTo(id, autopilotPrompt({ name: o.name.trim(), idea: o.idea, advisor: !!lead?.advisor && lead.advisor !== 'off' }), undefined, 'harness')
      set({ error: null, notice: null, tab: 'build' })
      return true
    } catch (err) {
      set({ error: ipcErrorMessage(err) })
      return false
    }
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

/** The current project's build state, loading it (and listening for changes) the first time it's used. */
export function useProjectState(): ProjectState | null {
  const state = useProject((s) => s.state)
  useEffect(() => {
    void useProject.getState().load()
  }, [])
  return state
}
