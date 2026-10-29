import { useApp } from '@/stores/app'

/** Pick or create a folder, then open HackForge's Init form there. */
export async function newHackforgeProject() {
  const app = useApp.getState()
  const before = app.activeId
  await app.openProject()
  const after = useApp.getState()
  if (after.activeId && after.activeId !== before) {
    after.setView('chat')
    after.setActionForm('hf-init')
  }
}

/** A Claude session in a project folder: an open live one, or a new one. Leaves you in it. */
export async function sessionIn(dir: string): Promise<string | null> {
  const app = useApp.getState()
  const existing = app.order.find((id) => {
    const s = app.sessions[id]
    return s && s.cwd === dir && s.live && !s.observed && s.status !== 'closed'
  })
  if (existing) app.select(existing)
  else await app.startSession(dir)
  const after = useApp.getState()
  return after.startError ? null : after.activeId
}

/** Opens an action's form (e.g. HackForge's Run) in a session in that project. */
export async function openActionIn(dir: string, actionId: string) {
  if (!(await sessionIn(dir))) return
  const app = useApp.getState()
  app.setView('chat')
  app.setActionForm(actionId)
}
