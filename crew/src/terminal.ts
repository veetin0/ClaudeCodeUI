import type { CrewWorkerEvent } from '../../src/main/crew/CrewWorker'
import type { MissionProgress } from '@shared/crew'

/** Colours only on a real terminal (and never with NO_COLOR). */
const tty = process.stdout.isTTY && !process.env.NO_COLOR
const paint = (code: string) => (s: string) => (tty ? `\x1b[${code}m${s}\x1b[0m` : s)
export const c = {
  dim: paint('2'),
  bold: paint('1'),
  green: paint('32'),
  yellow: paint('33'),
  red: paint('31'),
  cyan: paint('36'),
  magenta: paint('35'),
}

const clock = () => new Date().toTimeString().slice(0, 5)
const dur = (ms: number) => {
  const s = Math.round(ms / 1000)
  return s < 60 ? `${s}s` : `${Math.floor(s / 60)}m ${String(s % 60).padStart(2, '0')}s`
}

export function say(line = '') {
  process.stdout.write(`${line}\n`)
}

export const ok = (s: string) => say(`${c.green('✓')} ${s}`)
export const warn = (s: string) => say(`${c.yellow('!')} ${s}`)
export const fail = (s: string) => say(`${c.red('✗')} ${s}`)
export const info = (s: string) => say(`${c.dim('…')} ${s}`)

const indent = (text: string, max = 4) =>
  text
    .trim()
    .split('\n')
    .filter((l) => l.trim())
    .slice(0, max)
    .map((l) => `    ${c.dim(l.length > 160 ? `${l.slice(0, 159)}…` : l)}`)
    .join('\n')

function finished(p: MissionProgress): string {
  const took = p.startedAt && p.endedAt ? ` in ${dur(p.endedAt - p.startedAt)}` : ''
  const pushed = p.sendError
    ? c.red(` · not sent: ${p.sendError}`)
    : p.commits
      ? ` · sent ${p.branch} to the lead (${p.commits} commit${p.commits === 1 ? '' : 's'}, ${p.files?.length ?? 0} file${p.files?.length === 1 ? '' : 's'})`
      : ' · no changes'
  const word: Record<string, string> = {
    done: c.green('✓ done'),
    blocked: c.yellow('! blocked'),
    failed: c.red('✗ failed'),
    limited: c.yellow('! out of plan usage'),
    stopped: c.yellow('■ stopped'),
  }
  return `${word[p.state] ?? p.state} ${c.bold(p.id)}${took}${pushed}`
}

/** One line (or a few) per crew event. */
export function printEvent(e: CrewWorkerEvent, lead: () => string) {
  switch (e.kind) {
    case 'driver':
      return ok(`Connected. ${c.bold(e.name)}'s Claude leads the project and hands out the missions.`)
    case 'repo':
      if (e.state === 'downloading') return info(e.text)
      if (e.state === 'ready') return ok(`Project ready in ${e.text}`)
      if (e.state === 'updated') return say(c.dim('  Got the lead’s latest commits.'))
      return warn(e.text)
    case 'mission':
      if (e.state === 'queued') return say(`${c.cyan('•')} Mission for you: ${e.mission.title} ${c.dim(`(${e.mission.id})`)}`)
      if (e.state === 'starting') {
        say()
        return say(
          `${c.cyan('▶')} ${c.bold(e.mission.id)} ${e.mission.title} ${c.dim(`· from ${lead()}${e.mission.model ? ` · ${e.mission.model}` : ''} · branch ${e.mission.branch}`)}`,
        )
      }
      if (e.progress) {
        say(finished(e.progress))
        if (e.progress.summary) say(indent(e.progress.summary))
        say(c.dim('  Waiting for the next mission…'))
      }
      return
    case 'activity':
      return say(`  ${c.dim(clock())}  ${e.text}`)
    case 'message':
      return e.direction === 'in'
        ? say(`  ${c.magenta('✉')} ${c.bold(e.message.fromName)}: ${e.message.text.split('\n')[0].slice(0, 200)}`)
        : say(`  ${c.magenta('✉')} ${c.dim(`→ ${e.toName ?? 'team'}:`)} ${e.message.text.split('\n')[0].slice(0, 200)}`)
    case 'ask':
      return say(
        `  ${c.yellow('?')} Claude wants to run ${c.bold(e.ask.summary)}\n    ${c.dim(`${lead()} decides in Harness, or press`)} y ${c.dim('to allow,')} n ${c.dim('to deny here')}`,
      )
    case 'answer':
      return say(`  ${e.allow ? c.green('✓ allowed') : c.red('✗ denied')} ${c.dim(`by ${e.by}`)}`)
    case 'note':
      return e.tone === 'warn' ? warn(e.text) : info(e.text)
  }
}
