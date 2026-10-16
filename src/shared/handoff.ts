import { MAX_NOTE } from './team'

/** What handing off from a folder will do, for the confirmation dialog. */
export interface HandoffPlan {
  git: boolean
  /** The remote the snapshot is pushed to (origin), if there is one. */
  remote?: string
  repo?: string
  branch: string
  /** Changed files that go into the snapshot (uncommitted and untracked). */
  dirty: number
  /** Why the work can't be pushed, if it can't. */
  problem?: string
}

/** What a handoff note is written from: the session as Harness saw it (no Claude call needed). */
export interface HandoffSource {
  title: string
  from: string
  project: string
  /** Your messages, oldest first. */
  prompts: string[]
  todos: { content: string; status: 'pending' | 'in_progress' | 'completed' }[]
  /** Paths relative to the project. */
  changedFiles: string[]
  lastReply?: string
  lastError?: string
  /** Why: the usage limit (with when it resets) or by hand. */
  reason: 'limit' | 'manual'
  resetsAt?: string
  branch?: string
}

const clip = (s: string, n: number) => {
  const t = s.trim()
  return t.length > n ? `${t.slice(0, n - 1)}…` : t
}

/**
 * The note a teammate (and their Claude) starts from: what was asked, the task list, what changed
 * and where the work stopped. Written from the session's own record, so it works even after the
 * usage limit is hit.
 */
export function buildHandoffNote(s: HandoffSource): string {
  const why = s.reason === 'limit' ? `their Claude usage limit ran out${s.resetsAt ? ` (resets ${s.resetsAt})` : ''}` : 'handed off by hand'
  const out: string[] = [`# Handoff: ${clip(s.title || 'Untitled session', 120)}`, '', `From **${s.from}**, ${why}. Project \`${s.project}\`${s.branch ? `, work on branch \`${s.branch}\`` : ''}.`, '']

  const prompts = s.prompts.filter((p) => p.trim())
  if (prompts.length) {
    out.push('## What was asked')
    // The first message sets the goal; the latest ones say where it was heading.
    const picked = prompts.length <= 6 ? prompts : [prompts[0], ...prompts.slice(-5)]
    picked.forEach((p, i) => {
      if (prompts.length > 6 && i === 1) out.push(`- … ${prompts.length - 6} more …`)
      out.push(`- ${clip(p.replace(/\s+/g, ' '), i === 0 ? 700 : 400)}`)
    })
    out.push('')
  }

  if (s.todos.length) {
    out.push('## Task list')
    for (const t of s.todos.slice(0, 30)) out.push(`- [${t.status === 'completed' ? 'x' : ' '}] ${clip(t.content, 200)}${t.status === 'in_progress' ? ' (in progress)' : ''}`)
    out.push('')
  }

  if (s.changedFiles.length) {
    out.push('## Changed files')
    for (const f of s.changedFiles.slice(0, 40)) out.push(`- ${f}`)
    if (s.changedFiles.length > 40) out.push(`- … and ${s.changedFiles.length - 40} more`)
    out.push('')
  }

  if (s.lastReply || s.lastError) {
    out.push('## Where it stopped')
    if (s.lastReply) out.push(clip(s.lastReply, 1600))
    if (s.lastError) out.push('', `Last error: ${clip(s.lastError, 500)}`)
    out.push('')
  }

  out.push(
    '## Taking over',
    s.branch
      ? `- This folder holds a snapshot of ${s.from}'s work (uncommitted changes included) as the latest commit. \`git show --stat HEAD\` shows what changed.`
      : '- The work is in the shared project folder; check `git status` and `git log -5` first.',
    s.todos.some((t) => t.status !== 'completed') ? '- Continue with the unchecked tasks above.' : '- Check the request above against what was done, and finish what is missing.',
    '- Run the tests/build before changing anything, so you know the starting point.',
    '- When done, merge the branch back the usual way (or ask Claude to).',
  )
  const note = out.join('\n')
  return note.length > MAX_NOTE ? `${note.slice(0, MAX_NOTE - 2)}\n…` : note
}

/** The first message for the teammate taking over (they review it, then press Enter). */
export function takeOverPrompt(note: string): string {
  return `You're taking over a teammate's work in this folder. Their handoff note:\n\n${note}\n\nStart by reviewing the latest commit and the task list, run the tests/build to see where things stand, then continue.`
}
