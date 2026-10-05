import {
  Bot,
  FilePen,
  FilePlus,
  FileText,
  FolderSearch,
  Globe,
  ListTodo,
  type LucideIcon,
  Plug,
  Search,
  SquareTerminal,
  Wrench,
} from 'lucide-react'
import { basename } from './format'

/** Tool families get a colour so the chips and (later) the timeline read at a glance. */
export type ToolKind = 'read' | 'write' | 'search' | 'exec' | 'web' | 'agent' | 'plan' | 'mcp' | 'other'

const KIND: Record<string, ToolKind> = {
  Read: 'read',
  NotebookRead: 'read',
  Edit: 'write',
  MultiEdit: 'write',
  Write: 'write',
  NotebookEdit: 'write',
  Grep: 'search',
  Glob: 'search',
  LS: 'search',
  Bash: 'exec',
  BashOutput: 'exec',
  KillShell: 'exec',
  WebFetch: 'web',
  WebSearch: 'web',
  Task: 'agent',
  Agent: 'agent',
  TodoWrite: 'plan',
  TaskCreate: 'plan',
  TaskUpdate: 'plan',
  TaskList: 'plan',
  TaskGet: 'plan',
  ExitPlanMode: 'plan',
  EnterPlanMode: 'plan',
  ToolSearch: 'search',
  Skill: 'other',
}

export function toolKind(name: string): ToolKind {
  if (name.startsWith('mcp__')) return 'mcp'
  return KIND[name] ?? 'other'
}

const ICONS: Record<ToolKind, LucideIcon> = {
  read: FileText,
  write: FilePen,
  search: Search,
  exec: SquareTerminal,
  web: Globe,
  agent: Bot,
  plan: ListTodo,
  mcp: Plug,
  other: Wrench,
}

export function toolIcon(name: string): LucideIcon {
  if (name === 'Write') return FilePlus
  if (name === 'Glob' || name === 'LS') return FolderSearch
  return ICONS[toolKind(name)]
}

/**
 * Kind colours come from the validated categorical palette (styles.css --series-*), in fixed
 * order, so chips, activity ticks and timeline bars all agree. Rare kinds share neutral grey.
 */
export const KIND_COLOR: Record<ToolKind, string> = {
  read: 'var(--series-1)',
  write: 'var(--series-2)',
  exec: 'var(--series-3)',
  plan: 'var(--series-4)',
  agent: 'var(--series-5)',
  search: 'var(--series-6)',
  web: 'var(--series-7)',
  mcp: 'var(--muted)',
  other: 'var(--muted)',
}

export const KIND_LABEL: Record<ToolKind, string> = {
  read: 'Read',
  write: 'Write',
  exec: 'Run',
  plan: 'Plan',
  agent: 'Subagent',
  search: 'Search',
  web: 'Web',
  mcp: 'Other',
  other: 'Other',
}

/** Sets --kind for a tool so `.kind-tint` / `.kind-icon` (styles.css) can use it. */
export function kindVars(name: string): React.CSSProperties {
  return { ['--kind' as string]: KIND_COLOR[toolKind(name)] }
}

function short(s: string, n = 48): string {
  const one = s.replace(/\s+/g, ' ').trim()
  return one.length > n ? `${one.slice(0, n - 1)}…` : one
}

/** One-line summary of what a tool call is doing, e.g. "Read App.tsx" or "Bash npm test". */
export function toolSummary(name: string, input: Record<string, unknown>): string {
  const str = (k: string) => (typeof input[k] === 'string' ? (input[k] as string) : '')
  switch (name) {
    case 'Read':
    case 'Edit':
    case 'MultiEdit':
    case 'Write':
      return basename(str('file_path'))
    case 'NotebookEdit':
      return basename(str('notebook_path'))
    case 'Bash':
      return short(str('description') || str('command'))
    case 'Grep':
      return short(str('pattern'), 32)
    case 'Glob':
      return short(str('pattern'), 32)
    case 'WebFetch':
      try {
        return new URL(str('url')).host
      } catch {
        return short(str('url'))
      }
    case 'WebSearch':
      return short(str('query'))
    case 'Task':
    case 'Agent':
      return short(str('description'))
    case 'TodoWrite':
      return `${Array.isArray(input.todos) ? input.todos.length : 0} todos`
    case 'TaskCreate':
      return short(str('subject'), 40)
    case 'TaskUpdate':
      return `#${str('taskId')}${str('status') ? ` → ${str('status').replace('_', ' ')}` : ''}`
    case 'ToolSearch':
      return short(str('query').replace(/^select:/, ''), 32)
    case 'Skill':
      return str('skill') || str('command')
    default:
      return ''
  }
}

export function toolDisplayName(name: string): string {
  if (name.startsWith('mcp__')) {
    const [, server, tool] = name.split('__')
    return `${server}·${tool}`
  }
  return name
}
