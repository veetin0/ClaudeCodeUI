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

/** Tailwind classes per kind; kept as literal strings so Tailwind picks them up. */
export const KIND_STYLES: Record<ToolKind, string> = {
  read: 'text-sky-600 dark:text-sky-400 bg-sky-500/10 border-sky-500/20',
  write: 'text-orange-600 dark:text-orange-400 bg-orange-500/10 border-orange-500/20',
  search: 'text-violet-600 dark:text-violet-400 bg-violet-500/10 border-violet-500/20',
  exec: 'text-emerald-600 dark:text-emerald-400 bg-emerald-500/10 border-emerald-500/20',
  web: 'text-cyan-600 dark:text-cyan-400 bg-cyan-500/10 border-cyan-500/20',
  agent: 'text-pink-600 dark:text-pink-400 bg-pink-500/10 border-pink-500/20',
  plan: 'text-amber-600 dark:text-amber-400 bg-amber-500/10 border-amber-500/20',
  mcp: 'text-indigo-600 dark:text-indigo-400 bg-indigo-500/10 border-indigo-500/20',
  other: 'text-zinc-600 dark:text-zinc-400 bg-zinc-500/10 border-zinc-500/20',
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
