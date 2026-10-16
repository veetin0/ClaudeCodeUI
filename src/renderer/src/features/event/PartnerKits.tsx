import { Check, Copy, ExternalLink, KeyRound, Plus, Trash2, X } from 'lucide-react'
import { useState } from 'react'
import type { PartnerKit, PartnersState } from '@shared/partners'
import { basename, cn } from '@/lib/format'
import { usePartners, usePartnersState } from '@/stores/partners'
import { useTeamState } from '@/stores/team'

const open = (url: string) => void window.harness.openExternal(url)

/**
 * Partner APIs: paste a key and it works. It goes into the event project's .env (gitignored), into
 * every Harness session in the project, to teammates if shared (encrypted), and Claude gets a kit
 * note in challenge/partners/ with the env names, install command and a working example.
 */
export function PartnerKits() {
  const state = usePartnersState()
  const error = usePartners((s) => s.error)
  if (!state) return <div className="text-[12px] text-muted">Loading partner kits…</div>
  const apiKits = state.kits.filter((k) => k.keys.length)
  const infoKits = state.kits.filter((k) => !k.keys.length)
  const ready = apiKits.filter((k) => k.keys.some((x) => state.keys[x.env])).length
  return (
    <div className="space-y-4">
      <section className="rounded-2xl border border-line p-4">
        <div className="flex flex-wrap items-center gap-2">
          <KeyRound className="size-4 text-[var(--accent)]" />
          <h2 className="text-[13px] font-semibold">Partner APIs</h2>
          <span className="text-[11px] text-muted">
            {ready} / {apiKits.length} have keys
          </span>
        </div>
        <p className="mt-1 text-[12px] text-muted">
          Paste a key and it works: it goes into{' '}
          {state.project ? (
            <>
              <code>{basename(state.project)}/.env</code> (kept out of git)
            </>
          ) : (
            'the event project’s .env once you link one'
          )}{' '}
          and every Claude session in the project, and Claude gets a kit note per partner in <code>challenge/partners/</code> with the variable names, install command and a working
          example. Share a key and teammates get it too, encrypted with your team code.
        </p>
        {state.writeError && <div className="selectable mt-2 text-[12px] text-red-500">{state.writeError}</div>}
        {error && <div className="selectable mt-2 text-[12px] text-red-500">{error}</div>}
      </section>
      <div className="grid gap-3 lg:grid-cols-2">
        {apiKits.map((k) => (
          <KitCard key={k.id} kit={k} state={state} />
        ))}
      </div>
      <AddCustom />
      {infoKits.length > 0 && (
        <section className="rounded-2xl border border-line p-4 text-[12px]">
          <div className="mb-1.5 text-[12.5px] font-semibold">Other partners (no API)</div>
          {infoKits.map((k) => (
            <div key={k.id} className="py-0.5">
              <button onClick={() => open(k.site)} className="font-medium hover:underline">
                {k.name}
              </button>{' '}
              <span className="text-muted">{k.what}</span>
            </div>
          ))}
        </section>
      )}
    </div>
  )
}

function KitCard({ kit, state }: { kit: PartnerKit; state: PartnersState }) {
  const { run, test, checking } = usePartners()
  const inTeam = !!useTeamState()?.config
  const check = state.checks[kit.id]
  const hasAny = kit.keys.some((k) => state.keys[k.env])
  return (
    <div data-kit={kit.id} className={cn('rounded-xl border p-3', hasAny ? 'border-emerald-500/40' : 'border-line')}>
      <div className="flex flex-wrap items-center gap-2">
        <button onClick={() => open(kit.site)} className="text-[13px] font-semibold hover:underline" title={kit.site}>
          {kit.name}
        </button>
        {kit.unverified && (
          <span className="rounded-full bg-amber-500/10 px-1.5 text-[10.5px] text-amber-700 dark:text-amber-300" title="Some details weren’t publicly confirmed before the event">
            check at the event
          </span>
        )}
        {kit.custom && (
          <button onClick={() => void run(() => window.harness.partnerRemoveCustom(kit.id))} title="Remove this API" className="ml-auto text-muted hover:text-red-500">
            <Trash2 className="size-3.5" />
          </button>
        )}
      </div>
      <div className="mt-0.5 text-[11.5px] text-muted">{kit.what}</div>
      <div className="mt-2 space-y-1.5">
        {kit.keys.map((k) => (
          <KeyField key={k.env} env={k.env} label={k.label} secret={k.secret} placeholder={k.placeholder} state={state} inTeam={inTeam} />
        ))}
      </div>
      {(kit.unverified || kit.custom) && <DocsField kitId={kit.id} value={state.docs[kit.id] ?? kit.docs ?? ''} />}
      <div className="mt-2 flex flex-wrap items-center gap-2 text-[11.5px]">
        {kit.checkable && (
          <button
            disabled={!hasAny || checking.includes(kit.id)}
            onClick={() => void test(kit.id)}
            className="rounded-md border border-line px-2 py-0.5 hover:bg-surface-2 disabled:opacity-40"
          >
            {checking.includes(kit.id) ? 'Checking…' : 'Check key'}
          </button>
        )}
        {check && (
          <span className={cn('flex items-center gap-1', check.ok ? 'text-emerald-600 dark:text-emerald-400' : 'text-red-500')} title={new Date(check.at).toLocaleString()}>
            {check.ok ? <Check className="size-3" /> : <X className="size-3" />} {check.message}
          </span>
        )}
        <span className="ml-auto flex items-center gap-2 text-muted">
          {kit.signup && (
            <button onClick={() => open(kit.signup!)} className="flex items-center gap-0.5 hover:text-fg">
              Get a key <ExternalLink className="size-3" />
            </button>
          )}
          {kit.docs && (
            <button onClick={() => open(kit.docs!)} className="flex items-center gap-0.5 hover:text-fg">
              Docs <ExternalLink className="size-3" />
            </button>
          )}
        </span>
      </div>
      {(kit.install?.node || kit.install?.python) && (
        <div className="mt-1.5 flex flex-wrap gap-1.5">
          {[kit.install.node, kit.install.python].filter(Boolean).map((cmd) => (
            <CopyChip key={cmd} text={cmd!} />
          ))}
        </div>
      )}
    </div>
  )
}

function KeyField({ env, label, secret, placeholder, state, inTeam }: { env: string; label: string; secret: boolean; placeholder?: string; state: PartnersState; inTeam: boolean }) {
  const run = usePartners((s) => s.run)
  const info = state.keys[env]
  const [value, setValue] = useState('')
  const save = async () => {
    if (value.trim() && (await run(() => window.harness.partnerSetKey(env, value, true)))) setValue('')
  }
  return (
    <div>
      <div className="mb-0.5 flex items-center gap-2 text-[11px]">
        <span className="font-medium">{label}</span>
        <code className="text-muted">{env}</code>
        {info?.source === 'team' && <span className="text-emerald-600 dark:text-emerald-400">from {info.from}</span>}
        {info?.source === 'me' && inTeam && (
          <label className="ml-auto flex items-center gap-1 text-muted" title="Teammates get this key too (encrypted with your team code)">
            <input type="checkbox" checked={info.share} onChange={(e) => void run(() => window.harness.partnerSetShare(env, e.target.checked))} /> share with team
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
          className="selectable min-w-0 flex-1 rounded-md border border-line bg-surface-2 px-2 py-1 font-mono text-[11.5px] outline-none focus:border-[var(--accent)]/60"
        />
        {value.trim() ? (
          <button onClick={() => void save()} className="rounded-md bg-[var(--accent)] px-2.5 text-[11.5px] font-medium text-white hover:brightness-110">
            Save
          </button>
        ) : (
          info?.source === 'me' && (
            <button onClick={() => void run(() => window.harness.partnerSetKey(env, null))} title="Remove this key" className="rounded-md px-1.5 text-muted hover:bg-black/5 hover:text-red-500 dark:hover:bg-white/10">
              <X className="size-3.5" />
            </button>
          )
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
      <span className="font-medium">Docs link</span> <span className="text-muted">(Claude reads it from the kit note)</span>
      <input
        value={v}
        onChange={(e) => setV(e.target.value)}
        onBlur={() => v.trim() !== value && void run(() => window.harness.partnerSetDocs(kitId, v))}
        placeholder="https://… (from their booth or Discord)"
        className="selectable mt-0.5 w-full rounded-md border border-line bg-surface-2 px-2 py-1 text-[11.5px] outline-none focus:border-[var(--accent)]/60"
      />
    </label>
  )
}

function CopyChip({ text }: { text: string }) {
  const [copied, setCopied] = useState(false)
  return (
    <button
      onClick={() => {
        void navigator.clipboard.writeText(text)
        setCopied(true)
        setTimeout(() => setCopied(false), 1200)
      }}
      className="flex items-center gap-1 rounded bg-surface-2 px-1.5 py-0.5 font-mono text-[10.5px] text-muted hover:text-fg"
    >
      {copied ? <Check className="size-3" /> : <Copy className="size-3" />} {text}
    </button>
  )
}

/** An API that turned up at the event: name, variable and docs link. */
function AddCustom() {
  const run = usePartners((s) => s.run)
  const [openForm, setOpenForm] = useState(false)
  const [name, setName] = useState('')
  const [env, setEnv] = useState('')
  const [docs, setDocs] = useState('')
  const field = 'selectable rounded-md border border-line bg-surface-2 px-2 py-1 text-[12px] outline-none focus:border-[var(--accent)]/60'
  if (!openForm)
    return (
      <button onClick={() => setOpenForm(true)} className="flex items-center gap-1.5 rounded-lg border border-dashed border-line px-3 py-2 text-[12px] text-muted hover:text-fg">
        <Plus className="size-3.5" /> Add another API (one that turned up at the event)
      </button>
    )
  return (
    <div className="flex flex-wrap items-end gap-2 rounded-xl border border-line p-3">
      <input value={name} onChange={(e) => setName(e.target.value)} placeholder="Name, e.g. Acme Maps" className={cn(field, 'w-40')} />
      <input
        value={env}
        onChange={(e) => setEnv(e.target.value.toUpperCase().replace(/[^A-Z0-9_]/g, '_'))}
        placeholder={name ? `${name.toUpperCase().replace(/[^A-Z0-9]+/g, '_')}_API_KEY` : 'ACME_API_KEY'}
        className={cn(field, 'w-48 font-mono')}
      />
      <input value={docs} onChange={(e) => setDocs(e.target.value)} placeholder="Docs link" className={cn(field, 'min-w-40 flex-1')} />
      <button
        disabled={!name.trim()}
        onClick={() =>
          void run(() => window.harness.partnerAddCustom({ name, env: env || `${name.toUpperCase().replace(/[^A-Z0-9]+/g, '_')}_API_KEY`, docs })).then((ok) => {
            if (ok) {
              setOpenForm(false)
              setName('')
              setEnv('')
              setDocs('')
            }
          })
        }
        className="rounded-md bg-[var(--accent)] px-3 py-1 text-[12px] font-medium text-white hover:brightness-110 disabled:opacity-40"
      >
        Add
      </button>
      <button onClick={() => setOpenForm(false)} className="rounded-md border border-line px-3 py-1 text-[12px]">
        Cancel
      </button>
    </div>
  )
}
