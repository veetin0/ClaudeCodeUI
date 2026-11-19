import { Plug, Search } from 'lucide-react'
import { useEffect, useState } from 'react'
import type { CatalogEntry } from '@shared/mcpCatalog'
import { cn } from '@/lib/format'
import { ipcErrorMessage } from '@/lib/time'
import { usePartnersState } from '@/stores/partners'
import { Switch } from '@/layout/settings/parts'

const field = 'selectable min-w-0 flex-1 rounded-md border border-line bg-surface-2 px-2 py-1 font-mono text-[12px] outline-none focus:border-accent-ink/60'

/**
 * More tools for Claude, from ECC's MCP catalog: GitHub, Supabase, Vercel, Firecrawl and the rest.
 * An added server joins every session in this project once its keys are set (kept with the API keys
 * above, never written into a file).
 */
export function McpCatalog() {
  const keys = usePartnersState()
  const [list, setList] = useState<CatalogEntry[] | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [query, setQuery] = useState('')
  // A key saved above can complete a server: read the list again whenever the keys change.
  useEffect(() => {
    void window.harness.projectCatalog().then(setList, (e: unknown) => setError(ipcErrorMessage(e)))
  }, [keys])
  if (!list?.length) return null
  const run = async (fn: () => Promise<CatalogEntry[] | unknown>) => {
    try {
      const r = await fn()
      if (Array.isArray(r)) setList(r as CatalogEntry[])
      else setList(await window.harness.projectCatalog())
      setError(null)
    } catch (e) {
      setError(ipcErrorMessage(e))
    }
  }
  const q = query.trim().toLowerCase()
  const shown = list.filter((s) => !q || s.id.includes(q) || s.description.toLowerCase().includes(q)).sort((a, b) => Number(b.added) - Number(a.added))
  const added = list.filter((s) => s.added).length
  return (
    <section className="rounded-2xl border border-line p-4">
      <div className="flex flex-wrap items-center gap-2">
        <Plug className="size-4 text-accent-ink" />
        <h2 className="text-[13px] font-semibold">More tools for Claude</h2>
        <span className="text-[11px] text-muted">{added ? `${added} added · ` : ''}from ECC’s catalog</span>
        <label className="ml-auto flex items-center gap-1.5 rounded-md border border-line bg-surface-2 px-2 py-1 text-[12px]">
          <Search className="size-3.5 text-muted" />
          <input value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Find a tool" aria-label="Find a tool" className="w-32 bg-transparent outline-none" />
        </label>
      </div>
      <p className="mt-1 text-[12px] text-muted">
        MCP servers that give Claude new abilities in this project: GitHub, Supabase, Vercel, web scraping, image generation and more. An added server joins the project’s
        sessions once its keys are set; its keys stay with the API keys above.
      </p>
      {error && <div className="selectable mt-2 text-[12px] text-danger-ink">{error}</div>}
      <ul className="mt-3 divide-y divide-line">
        {shown.map((s) => (
          <li key={s.id} data-mcp={s.id} className="py-2">
            <div className="flex items-start gap-3">
              <div className="min-w-0 flex-1">
                <div className="flex items-center gap-2 text-[12px]">
                  <span className="font-medium">{s.id}</span>
                  <span className="text-[11px] text-muted">{s.config.type === 'http' ? 'hosted' : s.config.command}</span>
                  {s.added && (
                    <span className={cn('rounded-sm px-1.5 text-[11px]', s.missing.length ? 'bg-warn/20 text-warn-ink' : 'bg-ok/15 text-ok-ink')}>
                      {s.missing.length ? 'needs a key' : 'in sessions'}
                    </span>
                  )}
                </div>
                <p className="mt-0.5 line-clamp-2 text-[11px] text-muted">{s.description}</p>
              </div>
              <Switch on={s.added} onChange={(on) => void run(() => window.harness.projectSetMcp(s.id, on))} label={`Add ${s.id}`} />
            </div>
            {s.added && s.missing.map((env) => <KeyInput key={env} env={env} onSave={(v) => run(() => window.harness.partnerSetKey(env, v))} />)}
          </li>
        ))}
      </ul>
    </section>
  )
}

function KeyInput({ env, onSave }: { env: string; onSave: (value: string) => Promise<void> }) {
  const [value, setValue] = useState('')
  const save = async () => {
    if (!value.trim()) return
    await onSave(value)
    setValue('')
  }
  return (
    <div className="mt-1.5 flex items-center gap-1.5">
      <code className="shrink-0 text-[11px] text-muted">{env}</code>
      <input type="password" value={value} onChange={(e) => setValue(e.target.value)} onKeyDown={(e) => e.key === 'Enter' && void save()} placeholder="Paste the value" className={field} aria-label={env} />
      {value.trim() && (
        <button onClick={() => void save()} className="rounded-md bg-accent px-2.5 py-1 text-[12px] font-medium text-white hover:brightness-110">
          Save
        </button>
      )}
    </div>
  )
}
