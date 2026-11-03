import { BookOpen, Check, Copy, FileText, Globe, KeyRound, Loader2, Plus, RefreshCw, Sparkles, Trash2, X } from 'lucide-react'
import { useState } from 'react'
import type { PartnerKit, PartnersState } from '@shared/partners'
import { basename, cn } from '@/lib/format'
import { usePartners, usePartnersState } from '@/stores/partners'
import { useTeamState } from '@/stores/team'
import { Menu, menuItems } from '@/ui/Menu'

const open = (url: string) => void window.harness.openExternal(url)
const remove = (kit: PartnerKit) =>
  window.confirm(`Remove the ${kit.name} key? It's taken out of .env and Harness forgets it.`) &&
  void usePartners.getState().run(() => window.harness.partnerRemove(kit.id))

/**
 * API keys: the list starts empty. Add a key and it goes into the event project's .env (gitignored),
 * into every Harness session in the project, and to teammates if shared (encrypted). A service Harness
 * knows is checked right away and comes with a usage note; for anything else Claude works out what the
 * key is for and how to use it, and writes that to challenge/partners/.
 */
export function PartnerKits() {
  const state = usePartnersState()
  const error = usePartners((s) => s.error)
  if (!state) return <div className="text-[12px] text-muted">Loading API keys…</div>
  const kits = state.kits.filter((k) => k.keys.length)
  const covered = new Set(kits.flatMap((k) => k.keys.map((x) => x.env)))
  const teamOnly = Object.entries(state.keys).filter(([env, info]) => info.source === 'team' && !covered.has(env))
  return (
    <div className="space-y-3">
      <section className="rounded-2xl border border-line p-4">
        <div className="flex flex-wrap items-center gap-2">
          <KeyRound className="size-4 text-accent-ink" />
          <h2 className="text-[13px] font-semibold">API keys</h2>
          {kits.length > 0 && <span className="text-[11px] text-muted">{kits.length} added</span>}
        </div>
        <p className="mt-1 text-[12px] text-muted">
          Add the keys you get at the event. Each goes into{' '}
          {state.project ? (
            <>
              <code>{basename(state.project)}/.env</code> (kept out of git)
            </>
          ) : (
            'the project’s .env once it’s set up'
          )}{' '}
          and every Claude session in the project. For a service Harness knows, the key is checked straight away; for anything else, Claude works out what it’s
          for and how to use it.
        </p>
        <AddKey known={state.known} />
        {state.writeError && <div className="selectable mt-2 text-[12px] text-danger-ink">{state.writeError}</div>}
        {error && <div className="selectable mt-2 text-[12px] text-danger-ink">{error}</div>}
      </section>
      {kits.length > 0 && (
        <div className="grid gap-3 lg:grid-cols-2">
          {kits.map((k) => (k.custom ? <CustomKeyCard key={k.id} kit={k} state={state} /> : <KitCard key={k.id} kit={k} state={state} />))}
        </div>
      )}
      {teamOnly.length > 0 && (
        <section className="rounded-xl border border-line p-3 text-[12px]">
          <div className="mb-1 font-medium">Shared by your team</div>
          {teamOnly.map(([env, info]) => (
            <div key={env} className="flex items-center gap-2 py-0.5">
              <code>{env}</code>
              <span className="text-muted">from {info.from}</span>
            </div>
          ))}
        </section>
      )}
    </div>
  )
}

function AddKey({ known }: { known: string[] }) {
  const add = usePartners((s) => s.add)
  const [name, setName] = useState('')
  const [key, setKey] = useState('')
  const [busy, setBusy] = useState(false)
  const submit = async () => {
    if (!key.trim() || busy) return
    setBusy(true)
    const ok = await add(key, name)
    setBusy(false)
    if (ok) {
      setName('')
      setKey('')
    }
  }
  const field = 'selectable rounded-md border border-line bg-surface-2 px-2.5 py-1.5 text-[12px] outline-none focus:border-accent-ink/60'
  return (
    <div className="mt-3 flex flex-wrap items-center gap-2">
      <input
        value={name}
        onChange={(e) => setName(e.target.value)}
        placeholder="What’s it for? (optional)"
        list="known-apis"
        aria-label="What the key is for"
        className={cn(field, 'w-60')}
      />
      <datalist id="known-apis">
        {known.map((n) => (
          <option key={n} value={n} />
        ))}
      </datalist>
      <input
        type="password"
        value={key}
        onChange={(e) => setKey(e.target.value)}
        onKeyDown={(e) => e.key === 'Enter' && void submit()}
        placeholder="Paste the API key"
        aria-label="API key"
        className={cn(field, 'min-w-48 flex-1 font-mono')}
      />
      <button
        disabled={!key.trim() || busy}
        onClick={() => void submit()}
        className="flex items-center gap-1.5 rounded-md bg-accent px-3 py-1.5 text-[12px] font-medium text-white hover:brightness-110 disabled:opacity-40"
      >
        {busy ? <Loader2 className="size-3.5 animate-spin" /> : <Plus className="size-3.5" />} Add API key
      </button>
    </div>
  )
}

/** A key for a service Harness doesn't know: Claude researches it and fills in the card. */
function CustomKeyCard({ kit, state }: { kit: PartnerKit; state: PartnersState }) {
  const research = usePartners((s) => s.research)
  const inTeam = !!useTeamState()?.config
  const check = state.checks[kit.id]
  const env = kit.keys[0]
  const pending = kit.research === 'pending'
  const note = state.project ? `${state.project}/challenge/partners/${kit.id}.md` : undefined
  return (
    <div data-kit={kit.id} className={cn('rounded-xl border p-3', check?.ok ? 'border-ok/40' : 'border-line')}>
      <div className="flex flex-wrap items-center gap-2">
        <span className="text-[13px] font-semibold">{kit.name}</span>
        {pending ? (
          state.project ? (
            <span className="flex items-center gap-1 text-[11px] text-info-ink">
              <Loader2 className="size-3 animate-spin" /> Claude is looking into it
            </span>
          ) : (
            <span className="text-[11px] text-muted">Claude looks into it once the project is set up</span>
          )
        ) : check ? (
          <Verdict check={check} />
        ) : (
          <span className="text-[11px] text-muted">not checked</span>
        )}
        <div className="ml-auto">
          <Menu
            items={menuItems(
              !!state.project && { label: pending ? 'Ask Claude' : 'Ask Claude again', icon: Sparkles, onSelect: () => void research(kit.id) },
              !!note && !pending && { label: 'Show Claude’s notes', icon: FileText, onSelect: () => void window.harness.revealFile(note) },
              !!kit.docs && { label: 'Docs', icon: BookOpen, hint: kit.docs, onSelect: () => open(kit.docs!) },
              'separator',
              { label: 'Remove', icon: Trash2, danger: true, onSelect: () => remove(kit) },
            )}
          />
        </div>
      </div>
      <div className="mt-0.5 text-[12px] text-muted">{kit.what}</div>
      {env && <KeyField env={env.env} label="Key" secret state={state} inTeam={inTeam} />}
    </div>
  )
}

function Verdict({ check }: { check: { ok: boolean; message: string; at: number } }) {
  return (
    <span className={cn('flex items-center gap-1 text-[11px]', check.ok ? 'text-ok-ink' : 'text-danger-ink')} title={new Date(check.at).toLocaleString()}>
      {check.ok ? <Check className="size-3" /> : <X className="size-3" />} {check.message}
    </span>
  )
}

/** A key for a service Harness knows: its fields, the key check, its MCP server. */
function KitCard({ kit, state }: { kit: PartnerKit; state: PartnersState }) {
  const { test, checking } = usePartners()
  const inTeam = !!useTeamState()?.config
  const check = state.checks[kit.id]
  const hasAny = kit.keys.some((k) => state.keys[k.env])
  return (
    <div data-kit={kit.id} className={cn('rounded-xl border p-3', hasAny ? 'border-ok/40' : 'border-line')}>
      <div className="flex flex-wrap items-center gap-2">
        <span className="text-[13px] font-semibold">{kit.name}</span>
        {kit.unverified && (
          <span className="rounded-sm bg-warn/10 px-1.5 text-[11px] text-warn-ink" title="Some details weren’t publicly confirmed">
            check the docs
          </span>
        )}
        {check && <Verdict check={check} />}
        {checking.includes(kit.id) && <span className="text-[11px] text-muted">checking…</span>}
        <div className="ml-auto">
          <Menu
            items={menuItems(
              !!kit.signup && { label: 'Get a key', icon: KeyRound, onSelect: () => open(kit.signup!) },
              !!kit.docs && { label: 'Docs', icon: BookOpen, onSelect: () => open(kit.docs!) },
              { label: 'Website', icon: Globe, hint: kit.site, onSelect: () => open(kit.site) },
              kit.checkable && { label: 'Check the key again', icon: RefreshCw, disabled: !hasAny || checking.includes(kit.id), onSelect: () => void test(kit.id) },
              ...[kit.install?.node, kit.install?.python]
                .filter((c): c is string => !!c)
                .map((cmd) => ({ label: `Copy: ${cmd}`, icon: Copy, onSelect: () => void navigator.clipboard.writeText(cmd) })),
              'separator',
              { label: 'Remove', icon: Trash2, danger: true, onSelect: () => remove(kit) },
            )}
          />
        </div>
      </div>
      <div className="mt-0.5 text-[12px] text-muted">{kit.what}</div>
      <div className="mt-2 space-y-1.5">
        {kit.keys.map((k) => (
          <KeyField
            key={k.env}
            env={k.env}
            label={k.label}
            secret={k.secret}
            placeholder={k.placeholder}
            state={state}
            inTeam={inTeam}
            // A saved key is checked right away, so there's no Check button to remember.
            onSaved={kit.checkable ? () => void test(kit.id) : undefined}
          />
        ))}
      </div>
      {kit.unverified && <DocsField kitId={kit.id} value={state.docs[kit.id] ?? kit.docs ?? ''} />}
      {kit.unverified && <McpField kitId={kit.id} value={state.mcp[kit.id] ?? ''} />}
      {kit.mcp && !state.mcp[kit.id] && (
        <div className="mt-1.5 text-[11px] text-muted">
          <span className="font-medium text-fg">MCP server</span> {kit.mcp.kind === 'http' ? `hosted by ${kit.name}` : 'bundled with Harness'}: sessions in this
          project get its <code>mcp__{kit.id}__*</code> tools
          {kit.keys.every((k) => state.keys[k.env]) ? '.' : ' once the keys are set.'}
        </div>
      )}
    </div>
  )
}

function KeyField({
  env,
  label,
  secret,
  placeholder,
  state,
  inTeam,
  onSaved,
}: {
  env: string
  label: string
  secret: boolean
  placeholder?: string
  state: PartnersState
  inTeam: boolean
  onSaved?: () => void
}) {
  const run = usePartners((s) => s.run)
  const info = state.keys[env]
  const [value, setValue] = useState('')
  const save = async () => {
    if (value.trim() && (await run(() => window.harness.partnerSetKey(env, value, true)))) {
      setValue('')
      onSaved?.()
    }
  }
  return (
    <div className="mt-2">
      <div className="mb-0.5 flex items-center gap-2 text-[11px]">
        <span className="font-medium">{label}</span>
        <code className="text-muted">{env}</code>
        {info?.source === 'team' && <span className="text-ok-ink">from {info.from}</span>}
        {info?.source === 'me' && inTeam && (
          <label className="ml-auto flex items-center gap-1 text-muted" title="Teammates get this key too (encrypted with your team code)">
            <input type="checkbox" checked={info.share} onChange={(e) => void run(() => window.harness.partnerSetShare(env, e.target.checked))} /> share with
            team
          </label>
        )}
      </div>
      <div className="flex gap-1.5">
        <input
          type={secret ? 'password' : 'text'}
          value={value}
          onChange={(e) => setValue(e.target.value)}
          onKeyDown={(e) => e.key === 'Enter' && void save()}
          placeholder={info ? `${info.preview}  (saved${info.source === 'team' ? ` by ${info.from}` : ''}; paste to replace)` : (placeholder ?? 'Paste here')}
          className="selectable min-w-0 flex-1 rounded-md border border-line bg-surface-2 px-2 py-1 font-mono text-[12px] outline-none focus:border-accent-ink/60"
        />
        {value.trim() && (
          <button onClick={() => void save()} className="rounded-md bg-accent px-2.5 text-[12px] font-medium text-white hover:brightness-110">
            Save
          </button>
        )}
      </div>
    </div>
  )
}

function DocsField({ kitId, value }: { kitId: string; value: string }) {
  const run = usePartners((s) => s.run)
  const [v, setV] = useState(value)
  return (
    <label className="mt-1.5 block text-[11px]">
      <span className="font-medium">Docs link</span> <span className="text-muted">(Claude reads it from the note)</span>
      <input
        value={v}
        onChange={(e) => setV(e.target.value)}
        onBlur={() => v.trim() !== value && void run(() => window.harness.partnerSetDocs(kitId, v))}
        placeholder="https://… (from their booth or Discord)"
        className="selectable mt-0.5 w-full rounded-md border border-line bg-surface-2 px-2 py-1 text-[12px] outline-none focus:border-accent-ink/60"
      />
    </label>
  )
}

function McpField({ kitId, value }: { kitId: string; value: string }) {
  const run = usePartners((s) => s.run)
  const [v, setV] = useState(value)
  return (
    <label className="mt-1.5 block text-[11px]">
      <span className="font-medium">MCP server URL</span>{' '}
      <span className="text-muted">
        (sessions get its <code>mcp__{kitId}__*</code> tools; the key above is sent as a Bearer token)
      </span>
      <input
        value={v}
        onChange={(e) => setV(e.target.value)}
        onBlur={() => v.trim() !== value && void run(() => window.harness.partnerSetMcp(kitId, v))}
        placeholder="https://… (if they announce one)"
        className="selectable mt-0.5 w-full rounded-md border border-line bg-surface-2 px-2 py-1 text-[12px] outline-none focus:border-accent-ink/60"
      />
    </label>
  )
}
