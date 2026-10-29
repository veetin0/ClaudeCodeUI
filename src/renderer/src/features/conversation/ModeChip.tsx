import { Check, Leaf, Zap } from 'lucide-react'
import type { PermissionMode } from '@shared/events'
import { AUTO_MODEL } from '@shared/usageSaver'
import { cn } from '@/lib/format'
import { saverStatus } from '@/lib/saver'
import { useApp } from '@/stores/app'
import type { SessionState } from '@/stores/reducer'
import { Popover } from '@/ui/Popover'
import { AUTO_OPTION, MODELS, PERMISSION_MODES } from './PromptBox'
import { SaverDetails } from './SaverChip'

const SHORT: Record<PermissionMode, string> = { default: 'Ask', acceptEdits: 'Accept edits', plan: 'Plan', auto: 'Auto mode', bypassPermissions: 'Bypass', dontAsk: 'Don’t ask' }

/** Permissions, model and the Usage saver in one chip; the choices open on click. */
export function ModeChip({ session }: { session: SessionState }) {
  const { setPermissionMode, setModel } = useApp()
  const saverOn = useApp((s) => session.saver?.enabled ?? s.settings?.usageSaver?.enabled ?? false)
  const status = saverStatus(session)
  const model = session.saver?.auto ? AUTO_MODEL : MODELS.some((m) => m.value === session.model) ? session.model! : ''
  const models = [...(saverOn ? [AUTO_OPTION] : []), ...MODELS.map((m) => (m.value === '' && session.model && !session.saver?.auto ? { ...m, label: session.model } : m))]
  const modelLabel = session.saver?.auto ? 'Auto' : session.model ? session.model.replace(/^claude-/, '') : 'Default'
  const Icon = status?.tone === 'power' ? Zap : Leaf
  return (
    <Popover
      side="top"
      align="start"
      className="w-[340px] p-2"
      trigger={({ open, toggle }) => (
        <button
          onClick={toggle}
          title="Permissions, model and Usage saver"
          className={cn('flex items-center gap-1.5 rounded-md px-1.5 py-1 text-[12px] text-muted hover:bg-hover hover:text-fg', open && 'bg-hover text-fg')}
        >
          {status && status.tone !== 'off' && <Icon className={cn('size-3', status.tone === 'saving' ? 'text-ok-ink' : status.tone === 'power' ? 'text-warn-ink' : '')} />}
          {SHORT[session.permissionMode]} · {modelLabel}
        </button>
      )}
    >
      <Group label="Permissions">
        {PERMISSION_MODES.map((m) => (
          <Choice key={m.value} on={session.permissionMode === m.value} onClick={() => void setPermissionMode(m.value)}>
            {m.label}
          </Choice>
        ))}
      </Group>
      <Group label="Model">
        {models.map((m) => (
          <Choice key={m.value} on={model === m.value} onClick={() => m.value && void setModel(m.value)}>
            {m.label}
          </Choice>
        ))}
      </Group>
      {status && session.saver && (
        <div className="mt-1 border-t border-line px-1.5 pt-2">
          <SaverDetails session={session} />
        </div>
      )}
    </Popover>
  )
}

function Group({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="mb-1">
      <div className="px-2 pb-0.5 pt-1 text-[11px] font-semibold uppercase tracking-wide text-muted">{label}</div>
      <div className="grid grid-cols-2 gap-0.5">{children}</div>
    </div>
  )
}

function Choice({ on, onClick, children }: { on: boolean; onClick: () => void; children: React.ReactNode }) {
  return (
    <button onClick={onClick} className={cn('flex items-center gap-1.5 rounded-md px-2 py-1 text-left text-[12px] hover:bg-hover', on && 'font-medium')}>
      <Check className={cn('size-3.5 shrink-0 text-accent-ink', !on && 'opacity-0')} />
      {children}
    </button>
  )
}
