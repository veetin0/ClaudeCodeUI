import { Server, SquareTerminal } from 'lucide-react'
import { useEffect, useState } from 'react'
import type { ObserveStatus } from '@shared/ipc'
import { cn } from '@/lib/format'
import { ipcErrorMessage } from '@/lib/time'
import { useApp } from '@/stores/app'
import { Row } from './parts'

/** Settings › Team: where the team meets, and sessions from your terminal. */
export function TeamTab() {
  const { settings, updateSettings } = useApp()
  if (!settings) return null
  return (
    <div className="space-y-4">
      <TeamServerSection value={settings.teamServer} onChange={(teamServer) => void updateSettings({ teamServer })} />
      <ObserveSection />
    </div>
  )
}

const RENDER_DEPLOY = 'https://render.com/deploy?repo=https://github.com/veetin0/ClaudeCodeUI'

/** Where teams start: a team server deployed once (Render's free plan), or this laptop. */
function TeamServerSection({ value, onChange }: { value: string; onChange: (url: string) => void }) {
  const [url, setUrl] = useState(value)
  const [test, setTest] = useState<{ busy?: boolean; ok?: boolean; text?: string } | null>(null)
  const save = (v: string) => {
    const clean = v.trim().replace(/\/+$/, '')
    setUrl(clean)
    if (clean !== value) onChange(clean)
  }
  return (
    <div className="rounded-xl border border-line p-3">
      <div className="flex items-center gap-1.5 font-medium">
        <Server className="size-3.5" /> Team server
      </div>
      <p className="mt-0.5 text-[11px] text-muted">
        Where your team meets: statuses, and the code passed between laptops (encrypted with the team’s key). Empty: this laptop hosts it, so teammates must be
        on the same network, which venue Wi-Fi often blocks. Deploy one once for free and paste its address.
      </p>
      <div className="mt-2 flex gap-2">
        <input
          value={url}
          onChange={(e) => setUrl(e.target.value)}
          onBlur={(e) => save(e.target.value)}
          placeholder="https://harness-relay-xxxx.onrender.com"
          className="selectable min-w-0 flex-1 rounded-md border border-line bg-surface-2 px-2.5 py-1.5 font-mono text-[12px] outline-none focus:border-accent-ink/60"
        />
        <button
          disabled={!url.trim() || test?.busy}
          onClick={async () => {
            save(url)
            setTest({ busy: true, text: 'Checking (a sleeping free server takes up to a minute)…' })
            const r = await window.harness.teamTestServer(url)
            setTest({ ok: r.ok && r.files !== false, text: r.ok ? (r.files === false ? r.error : 'Works, crew mode included.') : r.error })
          }}
          className="rounded-md border border-line px-3 text-[12px] disabled:opacity-40"
        >
          Test
        </button>
      </div>
      {test?.text && (
        <div className={cn('mt-1 text-[11px]', test.busy ? 'text-muted' : test.ok ? 'text-ok-ink' : 'text-warn-ink')}>
          {test.text}
        </div>
      )}
      <button onClick={() => void window.harness.openExternal(RENDER_DEPLOY)} className="mt-2 text-[12px] text-accent-ink hover:underline">
        Deploy a free team server on Render (one click, sign in with GitHub) →
      </button>
    </div>
  )
}

/** Watching Claude Code sessions started outside Harness, plus optional status hooks. */
function ObserveSection() {
  const [status, setStatus] = useState<ObserveStatus | null>(null)
  const [error, setError] = useState<string | null>(null)
  useEffect(() => {
    void window.harness.getObserveStatus().then(setStatus)
  }, [])
  if (!status) return null

  const run = async (fn: () => Promise<ObserveStatus>) => {
    try {
      setStatus(await fn())
      setError(null)
    } catch (e) {
      setError(ipcErrorMessage(e))
    }
  }

  return (
    <Row
      icon={<SquareTerminal className="size-3.5" />}
      title="Show sessions from your terminal"
      description={
        <>
          Claude Code sessions you start in iTerm, Terminal or an editor appear in the sidebar and are visualized live, from their transcripts.
          {status.enabled && status.watching > 0 && ` Watching ${status.watching} now.`}
        </>
      }
      on={status.enabled}
      onToggle={(on) => void run(() => window.harness.setObserveEnabled(on))}
    >
      <div className="text-[11px] text-muted">
          <div className="mb-1.5 font-medium text-fg">Live status hooks {status.hooksInstalled ? '· installed' : '(optional)'}</div>
          <p className="mb-2">
            Adds a small hook to <code>{status.settingsPath}</code> so watched sessions show “needs approval”, “done” and “ended” instantly. A backup of the
            file is saved first; removing takes out only Harness’s entries.
          </p>
          {status.hookPort === null && <p className="mb-2 text-warn-ink">Port 47821 is busy, so hooks can’t reach Harness right now.</p>}
          {status.hooksInstalled ? (
            <button
              onClick={() => void run(window.harness.removeObserveHooks)}
              className="rounded-md border border-line px-2.5 py-1 text-[12px] text-fg hover:bg-surface-2"
            >
              Remove hooks
            </button>
          ) : (
            <button
              onClick={() => {
                if (window.confirm(`Add Harness status hooks to ${status.settingsPath}? A backup is saved next to it.`))
                  void run(window.harness.installObserveHooks)
              }}
              className="rounded-md bg-accent px-2.5 py-1 text-[12px] font-medium text-white hover:brightness-110"
            >
              Install hooks
            </button>
          )}
          {error && <p className="mt-1.5 text-danger-ink">{error}</p>}
      </div>
    </Row>
  )
}
