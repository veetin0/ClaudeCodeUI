import type { HackforgeMode } from '@shared/hackforge'
import type { UsageSaverSettings } from '@shared/usageSaver'
import { Leaf, SquareTerminal, X } from 'lucide-react'
import { useEffect, useState } from 'react'
import type { ObserveStatus } from '@shared/ipc'
import { ipcErrorMessage } from '@/lib/time'
import type { PermissionMode } from '@shared/events'
import { MODELS, PERMISSION_MODES } from '@/features/conversation/PromptBox'
import { useApp } from '@/stores/app'
import { shortcut } from '@/lib/keys'

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

        <Field label="Anthropic API key" hint={settings.hasApiKey ? 'A key is stored in your system keychain.' : 'Optional. Without one, Harness uses your existing Claude Code login.'}>
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

        <SaverSection saver={settings.usageSaver} onChange={(patch) => void updateSettings({ usageSaver: { ...settings.usageSaver, ...patch } })} />

        <Field
          label="Default model for new sessions"
          hint={settings.usageSaver.enabled && settings.usageSaver.autoModel ? 'New sessions use Auto: the Usage saver picks the model for each message.' : undefined}
        >
          <select
            value={settings.defaultModel}
            disabled={settings.usageSaver.enabled && settings.usageSaver.autoModel}
            onChange={(e) => void updateSettings({ defaultModel: e.target.value })}
            className="w-full rounded-md border border-line bg-surface-2 px-2 py-1.5 disabled:opacity-50"
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

        <Field label="HackForge" hint={shortcut('Sessions get instructions to work through the /hackforge:* skills, and the HackForge buttons and dashboard (⌘5) appear. Applies to new sessions.')}>
          <select
            value={settings.hackforgeMode}
            onChange={(e) => void updateSettings({ hackforgeMode: e.target.value as HackforgeMode })}
            className="w-full rounded-md border border-line bg-surface-2 px-2 py-1.5"
          >
            <option value="projects">In projects that use it (challenge/ or .hackforge/)</option>
            <option value="always">Always: suggest HackForge in every session</option>
            <option value="off">Off</option>
          </select>
        </Field>

        <ObserveSection />

        <p className="mt-4 text-[11px] leading-relaxed text-muted">
          Sessions load your usual <code>~/.claude</code> settings, CLAUDE.md files, MCP servers and skills.
        </p>
      </div>
    </div>
  )
}

const SAVER_FEATURES: { key: Exclude<keyof UsageSaverSettings, 'enabled'>; label: string; hint: string }[] = [
  {
    key: 'autoModel',
    label: 'Pick the model for each message (Auto)',
    hint: 'Opus plans, designs, debugs, reviews and takes big requests; Sonnet carries out agreed work and routine steps. Opus takes over by itself when Sonnet fails 3 steps in a row or you say something doesn’t work.',
  },
  {
    key: 'compact',
    label: 'Compact between tasks',
    hint: 'Every step re-reads the whole conversation. Once it passes ~100k tokens, it’s compacted before your next message: never mid-task, and not while you’re debugging.',
  },
  {
    key: 'skipGenerated',
    label: 'Skip generated files',
    hint: 'Lockfiles, minified bundles, source maps and build output over 64 KB aren’t read whole. Claude searches them or reads just the part it needs.',
  },
  {
    key: 'leanOutput',
    label: 'Lean output',
    hint: 'Quiet test and build output, and replies that lead with the answer. Code, errors and warnings stay complete.',
  },
]

/** Usage saver: on by default; each part can be switched off. */
function SaverSection({ saver, onChange }: { saver: UsageSaverSettings; onChange: (patch: Partial<UsageSaverSettings>) => void }) {
  return (
    <div className="mb-4 rounded-xl border border-line p-3">
      <label className="flex items-start gap-2.5">
        <input type="checkbox" className="mt-0.5" checked={saver.enabled} onChange={(e) => onChange({ enabled: e.target.checked })} />
        <span>
          <span className="flex items-center gap-1.5 font-medium">
            <Leaf className="size-3.5 text-emerald-500" /> Usage saver
          </span>
          <span className="mt-0.5 block text-[11px] text-muted">
            Spends your Claude plan where it buys quality and cuts what buys nothing. The chip next to the model picker shows whether each turn is saving, and the
            chat notes every switch.
          </span>
        </span>
      </label>
      {saver.enabled && (
        <div className="mt-3 space-y-2.5 border-t border-line pt-3">
          {SAVER_FEATURES.map((f) => (
            <label key={f.key} className="flex items-start gap-2.5">
              <input type="checkbox" className="mt-0.5" checked={saver[f.key]} onChange={(e) => onChange({ [f.key]: e.target.checked })} />
              <span>
                <span className="font-medium">{f.label}</span>
                <span className="mt-0.5 block text-[11px] text-muted">{f.hint}</span>
              </span>
            </label>
          ))}
          <p className="text-[11px] text-muted">Applies to new sessions. Any session can switch between Auto and one model in its model menu.</p>
        </div>
      )}
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
