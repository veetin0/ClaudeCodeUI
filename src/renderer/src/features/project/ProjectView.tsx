import { Bot, Clapperboard, FolderOpen, FolderSearch, Hammer, Home, KeyRound, MessageSquare, X, XCircle } from 'lucide-react'
import { cn } from '@/lib/format'
import { shortcut } from '@/lib/keys'
import { sessionIn } from '@/lib/projects'
import { useApp } from '@/stores/app'
import { projectName, useProject, useProjectDir, type ProjectTab } from '@/stores/project'
import { Menu, menuItems } from '@/ui/Menu'
import { Segmented } from '@/ui/Segmented'
import { PartnerKits } from './PartnerKits'
import { McpCatalog } from './McpCatalog'
import { PitchStudio } from './PitchStudio'
import { BuildTab } from './BuildTab'

/** The Project place: the project you're building (Settings' `project`): its build, promo video and API keys. */
export function ProjectView() {
  const dir = useProjectDir()
  const tab = useProject((s) => s.tab)
  const error = useProject((s) => s.error)
  if (!dir) return <NoProject />
  return (
    <div className="min-h-0 flex-1 overflow-y-auto">
      <div className="mx-auto max-w-5xl space-y-4 px-6 py-5">
        {error && <div className="selectable rounded-lg border border-danger/40 bg-danger/5 px-3 py-2 text-[12px] text-danger-ink">{error}</div>}
        <Notice />
        {tab === 'build' ? <BuildTab dir={dir} /> : tab === 'promo' ? <PitchStudio dir={dir} name={projectName(dir)} /> : <KeysTab />}
      </div>
    </div>
  )
}

/** API keys for the services the project uses, and more tools for Claude from ECC's catalog. */
function KeysTab() {
  return (
    <>
      <PartnerKits />
      <McpCatalog />
    </>
  )
}

/** No project picked yet: start one from Home, or use a folder you already have. */
function NoProject() {
  const recent = useApp((s) => s.settings?.recentProjects) ?? NONE
  const { pickProject, setProject } = useProject()
  return (
    <div className="min-h-0 flex-1 overflow-y-auto">
      <div className="mx-auto max-w-xl px-6 py-16 text-center">
        <Hammer className="mx-auto size-8 text-accent-ink" />
        <h1 className="mt-3 font-display text-[22px] font-semibold">No project yet</h1>
        <p className="mt-1 text-[13px] text-muted">Describe an idea on Home and press Build it, or use a folder you already have.</p>
        <div className="mt-4 flex justify-center gap-2 text-[13px]">
          <button onClick={() => useApp.getState().goHome()} className="flex items-center gap-1.5 rounded-lg bg-accent px-3 py-1.5 font-medium text-white hover:brightness-110">
            <Home className="size-3.5" /> Start from an idea
          </button>
          <button onClick={() => void pickProject()} className="flex items-center gap-1.5 rounded-lg border border-line px-3 py-1.5 hover:bg-surface-2">
            <FolderOpen className="size-3.5" /> Use a folder…
          </button>
        </div>
        {recent.length > 0 && (
          <div className="mt-8 text-left">
            <div className="mb-1 text-[11px] font-medium uppercase tracking-wide text-muted">Recent folders</div>
            <ul className="divide-y divide-line rounded-xl border border-line">
              {recent.slice(0, 6).map((d) => (
                <li key={d}>
                  <button onClick={() => void setProject(d)} className="flex w-full items-center gap-2 px-3 py-2 text-left text-[13px] hover:bg-surface-2" title={d}>
                    <FolderSearch className="size-3.5 shrink-0 text-muted" />
                    <span className="font-medium">{projectName(d)}</span>
                    <span className="min-w-0 truncate text-[12px] text-muted">{d}</span>
                  </button>
                </li>
              ))}
            </ul>
          </div>
        )}
      </div>
    </div>
  )
}

/** "Presentation deck: sent to Claude", with the session's state and a way to watch it. */
function Notice() {
  const { notice, dismissNotice } = useProject()
  const status = useApp((s) => (notice ? s.sessions[notice.sessionId]?.status : undefined))
  if (!notice) return null
  const waiting = status === 'waiting'
  return (
    <div className={cn('flex items-center gap-2 rounded-lg border px-3 py-2 text-[13px]', waiting ? 'border-warn/60 bg-warn/[0.1]' : 'border-line bg-surface-2')}>
      <Bot className={cn('size-4', waiting ? 'text-warn-ink' : 'text-accent-ink')} />
      <span>
        {waiting
          ? 'Claude is waiting for your answer to continue.'
          : status === 'running'
            ? `${notice.text} Claude is working; results appear here as it writes the files.`
            : `${notice.text} Results appear here as Claude writes the files.`}
      </span>
      <button
        onClick={() => {
          useApp.getState().select(notice.sessionId)
          useApp.getState().setView('chat')
        }}
        className="ml-auto rounded-md border border-line bg-surface px-2 py-0.5 text-[12px] hover:bg-surface-2"
      >
        Watch in chat
      </button>
      <button onClick={dismissNotice} className="rounded p-1 text-muted hover:text-fg" title="Dismiss">
        <X className="size-3.5" />
      </button>
    </div>
  )
}

const NONE: string[] = []

const TABS: { id: ProjectTab; label: string; icon: typeof Hammer; title: string }[] = [
  { id: 'build', label: 'Build', icon: Hammer, title: 'Where the build is, the evaluator’s scores, and ways to make it better' },
  { id: 'promo', label: 'Promo', icon: Clapperboard, title: 'A promo video and a presentation deck for the project' },
  { id: 'keys', label: 'Keys', icon: KeyRound, title: 'API keys for the services the project uses' },
]

/** The Project place's header (in the top bar): the project, its three tabs, and ⋯ (switch, open, close). */
export function ProjectBar() {
  const dir = useProjectDir()
  const tab = useProject((s) => s.tab)
  const { setTab, setProject, pickProject } = useProject()
  // Select the stored list and derive from it: a new array from the selector would re-render forever.
  const recent = (useApp((s) => s.settings?.recentProjects) ?? NONE).filter((d) => d !== dir).slice(0, 6)
  return (
    <>
      <div className="min-w-0 max-w-[300px]">
        <div className="flex items-center gap-1.5 truncate text-[13px] font-semibold">
          <Hammer className="size-3.5 shrink-0 text-accent-ink" aria-hidden />
          <span className="truncate">{dir ? projectName(dir) : 'Project'}</span>
        </div>
        <div className="truncate text-[12px] text-muted" title={dir ?? undefined}>
          {dir ?? 'No project yet'}
        </div>
      </div>
      {dir && (
        <Segmented
          className="ml-2"
          label="Project"
          value={tab}
          onChange={setTab}
          options={TABS.map((t) => ({ ...t, title: t.id === 'build' ? shortcut(`${t.title} (⌘4)`) : t.title }))}
        />
      )}
      <div className="ml-auto flex min-w-0 items-center gap-2">
        <Menu
          items={menuItems(
            dir && { label: 'Open the project in a session', icon: MessageSquare, hint: dir, onSelect: () => void sessionIn(dir) },
            dir && { label: 'Show in folder', icon: FolderOpen, onSelect: () => void window.harness.revealFile(dir) },
            recent.length > 0 && 'separator',
            recent.length > 0 && { heading: 'Switch project' },
            ...recent.map((d) => ({ label: projectName(d), icon: FolderSearch, hint: d, onSelect: () => void setProject(d) })),
            'separator',
            { label: 'Use a different folder…', icon: FolderOpen, onSelect: () => void pickProject() },
            dir && { label: 'Close the project', icon: XCircle, hint: 'Nothing is deleted', onSelect: () => void setProject(null) },
          )}
        />
      </div>
    </>
  )
}
