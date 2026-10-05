import { SquareTerminal, X } from 'lucide-react'
import { useEffect, useState } from 'react'
import type { ObserveStatus } from '@shared/ipc'
import { ipcErrorMessage } from '@/lib/time'
import type { PermissionMode } from '@shared/events'
import { MODELS, PERMISSION_MODES } from '@/features/conversation/PromptBox'
import { useApp } from '@/stores/app'

export function SettingsDialog() {
  const { settingsOpen, setSettingsOpen, settings, saveApiKey, updateSettings } = useApp()
  const [key, setKey] = useState('')
  const [error, setError] = useState<string | null>(null)
  if (!settingsOpen || !settings) return null

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/30 backdrop-blur-[2px]" onClick={() => setSettingsOpen(false)}>
      <div className="max-h-[90vh] w-[460px] overflow-y-auto rounded-2xl border border-line bg-surface p-5 shadow-2xl" onClick={(e) => e.stopPropagation()}>
        <div className="mb-4 flex items-center">
          <h2 className="text-[15px] font-semibold">Settings</h2>
          <button onClick={() => setSettingsOpen(false)} className="ml-auto rounded p-1 text-muted hover:bg-black/5 dark:hover:bg-white/10">
            <X className="size-4" />
          </button>
        </div>

        <Field label="Anthropic API key" hint={settings.hasApiKey ? 'A key is stored in your Keychain.' : 'Optional. Without one, Harness uses your existing Claude Code login.'}>
          <div className="flex gap-2">
            <input
              type="password"
              value={key}
              onChange={(e) => setKey(e.target.value)}
              placeholder={settings.hasApiKey ? '••••••••••••' : 'sk-ant-…'}
              className="selectable min-w-0 flex-1 rounded-md border border-line bg-surface-2 px-2.5 py-1.5 outline-none focus:border-[var(--accent)]/60"
            />
            <button
              disabled={!key}
              onClick={async () => {
                try {
                  await saveApiKey(key)
                  setKey('')
                  setError(null)
                } catch (e) {
                  setError(e instanceof Error ? e.message : String(e))
                }
              }}
              className="rounded-md bg-[var(--accent)] px-3 text-[12px] font-medium text-white disabled:opacity-40"
            >
              Save
            </button>
            {settings.hasApiKey && (
              <button onClick={() => void saveApiKey(null)} className="rounded-md border border-line px-3 text-[12px]">
                Remove
              </button>
            )}
          </div>
          {error && <div className="mt-1 text-[11px] text-red-500">{error}</div>}
        </Field>

        <Field label="Default model for new sessions">
          <select
            value={settings.defaultModel}
            onChange={(e) => void updateSettings({ defaultModel: e.target.value })}
            className="w-full rounded-md border border-line bg-surface-2 px-2 py-1.5"
          >
            {MODELS.map((m) => (
              <option key={m.value} value={m.value}>
                {m.label}
              </option>
            ))}
          </select>
        </Field>

        <Field label="Default permission mode">
          <select
            value={settings.defaultPermissionMode}
            onChange={(e) => void updateSettings({ defaultPermissionMode: e.target.value as PermissionMode })}
            className="w-full rounded-md border border-line bg-surface-2 px-2 py-1.5"
          >
            {PERMISSION_MODES.map((m) => (
              <option key={m.value} value={m.value}>
                {m.label}
              </option>
            ))}
          </select>
        </Field>

        <label className="mb-4 flex items-start gap-2.5">
          <input type="checkbox" className="mt-0.5" checked={settings.notifications} onChange={(e) => void updateSettings({ notifications: e.target.checked })} />
          <span>
            <span className="font-medium">Notifications</span>
            <span className="mt-0.5 block text-[11px] text-muted">Tell me when Claude needs approval or finishes a longer task while Harness is in the background.</span>
          </span>
        </label>

        <ObserveSection />

        <p className="mt-4 text-[11px] leading-relaxed text-muted">
          Sessions load your usual <code>~/.claude</code> settings, CLAUDE.md files, MCP servers and skills.
        </p>
      </div>
    </div>
  )
}

function Field({ label, hint, children }: { label: string; hint?: string; children: React.ReactNode }) {
  return (
    <label className="mb-4 block">
      <div className="mb-1.5 font-medium">{label}</div>
      {children}
      {hint && <div className="mt-1 text-[11px] text-muted">{hint}</div>}
    </label>
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
    <div className="mb-4 rounded-xl border border-line p-3">
      <label className="flex items-start gap-2.5">
        <input type="checkbox" className="mt-0.5" checked={status.enabled} onChange={(e) => void run(() => window.harness.setObserveEnabled(e.target.checked))} />
        <span>
          <span className="flex items-center gap-1.5 font-medium">
            <SquareTerminal className="size-3.5" /> Show sessions from your terminal
          </span>
          <span className="mt-0.5 block text-[11px] text-muted">
            Claude Code sessions you start in iTerm, Terminal or an editor appear in the sidebar and are visualized live, from their transcripts.
            {status.enabled && status.watching > 0 && ` Watching ${status.watching} now.`}
          </span>
        </span>
      </label>
      {status.enabled && (
        <div className="mt-3 border-t border-line pt-3 text-[11px] text-muted">
          <div className="mb-1.5 font-medium text-fg">Live status hooks {status.hooksInstalled ? '· installed' : '(optional)'}</div>
          <p className="mb-2">
            Adds a small hook to <code>{status.settingsPath}</code> so watched sessions show “needs approval”, “done” and “ended” instantly. A backup of the file is
            saved first; removing takes out only Harness’s entries.
          </p>
          {status.hookPort === null && <p className="mb-2 text-amber-600">Port 47821 is busy, so hooks can’t reach Harness right now.</p>}
          {status.hooksInstalled ? (
            <button onClick={() => void run(window.harness.removeObserveHooks)} className="rounded-md border border-line px-2.5 py-1 text-[12px] text-fg hover:bg-surface-2">
              Remove hooks
            </button>
          ) : (
            <button
              onClick={() => {
                if (window.confirm(`Add Harness status hooks to ${status.settingsPath}? A backup is saved next to it.`)) void run(window.harness.installObserveHooks)
              }}
              className="rounded-md bg-[var(--accent)] px-2.5 py-1 text-[12px] font-medium text-white hover:brightness-110"
            >
              Install hooks
            </button>
          )}
          {error && <p className="mt-1.5 text-red-500">{error}</p>}
        </div>
      )}
    </div>
  )
}
