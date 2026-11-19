import { useApp } from '@/stores/app'

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
