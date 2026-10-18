import type { HackforgeMode } from '@shared/hackforge'
import type { UsageSaverSettings } from '@shared/usageSaver'
import { newAlertTopic, subscribeUrl, type PhoneAlertSettings } from '@shared/alerts'
import { AlarmClock, Leaf, Palette, Smartphone, SquareTerminal, Wrench, X } from 'lucide-react'
import type { DesignSkillsSettings, DesignState } from '@shared/design'
import type { DevToolsSettings, DevToolsState } from '@shared/devtools'
import { useEffect, useMemo, useState } from 'react'
import qrcode from 'qrcode-generator'
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

        <Field
          label="Anthropic API key"
          hint={settings.hasApiKey ? 'A key is stored in your system keychain.' : 'Optional. Without one, Harness uses your existing Claude Code login.'}
        >
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

        <DesignSection s={settings.designSkills} onChange={(patch) => void updateSettings({ designSkills: { ...settings.designSkills, ...patch } })} />

        <DevToolsSection
          s={settings.devTools}
          hasKey={settings.hasContext7Key}
          onChange={(patch) => void updateSettings({ devTools: { ...settings.devTools, ...patch } })}
          onKey={async (key) => useApp.setState({ settings: await window.harness.setContext7Key(key) })}
        />

        <Field
          label="Default model for new sessions"
          hint={
            settings.usageSaver.enabled && settings.usageSaver.autoModel
              ? 'New sessions use Auto: the Usage saver picks the model for each message.'
              : undefined
          }
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

        <PhoneSection s={settings.phoneAlerts} onChange={(patch) => void updateSettings({ phoneAlerts: { ...settings.phoneAlerts, ...patch } })} />

        <div className="mb-4 rounded-xl border border-line p-3">
          <label className="flex items-start gap-2.5">
            <input
              type="checkbox"
              className="mt-0.5"
              checked={settings.resetQueue.enabled}
              onChange={(e) => void updateSettings({ resetQueue: { ...settings.resetQueue, enabled: e.target.checked } })}
            />
            <span>
              <span className="flex items-center gap-1.5 font-medium">
                <AlarmClock className="size-3.5" /> Run queued messages when my usage limit resets
              </span>
              <span className="mt-0.5 block text-[11px] text-muted">
                At the limit, messages you send wait and go out at the reset (also the ⏰ button by Send). Turn off to keep them waiting.
              </span>
            </span>
          </label>
          <label className="mt-2 flex items-start gap-2.5 pl-6">
            <input
              type="checkbox"
              className="mt-0.5"
              checked={settings.resetQueue.keepAwake}
              onChange={(e) => void updateSettings({ resetQueue: { ...settings.resetQueue, keepAwake: e.target.checked } })}
            />
            <span className="text-[11.5px]">
              Keep this computer awake while messages wait{' '}
              <span className="text-muted">(closing a laptop’s lid still puts it to sleep; it catches up on wake)</span>
            </span>
          </label>
        </div>

        <label className="mb-4 flex items-start gap-2.5">
          <input
            type="checkbox"
            className="mt-0.5"
            checked={settings.notifications}
            onChange={(e) => void updateSettings({ notifications: e.target.checked })}
          />
          <span>
            <span className="font-medium">Notifications</span>
            <span className="mt-0.5 block text-[11px] text-muted">
              Tell me when Claude needs approval or finishes a longer task while Harness is in the background.
            </span>
          </span>
        </label>

        <Field
          label="HackForge"
          hint={shortcut(
            'Sessions get instructions to work through the /hackforge:* skills, and the HackForge buttons and dashboard (⌘5) appear. Applies to new sessions.',
          )}
        >
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
            Spends your Claude plan where it buys quality and cuts what buys nothing. The chip next to the model picker shows whether each turn is saving, and
            the chat notes every switch.
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

/** impeccable and UI/UX Pro Max: on by default, used by Claude on its own for UI work. */
function DesignSection({ s, onChange }: { s: DesignSkillsSettings; onChange: (patch: Partial<DesignSkillsSettings>) => void }) {
  const [state, setState] = useState<DesignState | null>(null)
  useEffect(() => {
    void window.harness.designState().then(setState)
    return window.harness.onDesign(setState)
  }, [])
  const info = (key: 'impeccable' | 'uiUxProMax') => {
    const p = state?.plugins.find((x) => x.key === key)
    if (!p || p.source === 'off') return ''
    return p.source === 'missing' ? ' · not bundled' : ` · ${p.version ?? ''} ${p.source === 'installed' ? '(your install)' : 'built in'}`
  }
  const engine = state?.engine
  return (
    <div className="mb-4 rounded-xl border border-line p-3">
      <div className="flex items-center gap-1.5 font-medium">
        <Palette className="size-3.5 text-[var(--accent)]" /> Design skills
      </div>
      <p className="mt-0.5 text-[11px] text-muted">
        Claude uses them by itself for UI work: UI/UX Pro Max picks the design system once and writes DESIGN.md, and impeccable builds, polishes and audits
        against it. Applies to new sessions.
      </p>
      <div className="mt-3 space-y-2.5 border-t border-line pt-3">
        <label className="flex items-start gap-2.5">
          <input type="checkbox" className="mt-0.5" checked={s.impeccable} onChange={(e) => onChange({ impeccable: e.target.checked })} />
          <span>
            <span className="font-medium">impeccable</span>
            <span className="text-[11px] text-muted">{info('impeccable')}</span>
            <span className="mt-0.5 block text-[11px] text-muted">
              Builds, polishes, critiques and audits UI. Its detector checks every UI edit for “AI slop” (cramped spacing, gradient text, low contrast…) and
              does a deeper pass when Claude finishes.
            </span>
          </span>
        </label>
        {s.impeccable && (
          <div className="pl-6 text-[11.5px]">
            <label className="flex items-center gap-1.5">
              <input type="checkbox" checked={s.quietDetector} onChange={(e) => onChange({ quietDetector: e.target.checked })} /> Quiet detector: report only
              problems (saves tokens)
            </label>
            <div className="mt-1 flex items-center gap-2 text-[11px] text-muted">
              Detector engine:{' '}
              {engine?.status === 'ready' ? (
                <span className="text-emerald-600 dark:text-emerald-400">ready ({engine.version})</span>
              ) : engine?.status === 'checking' ? (
                'downloading / checking…'
              ) : engine?.status === 'failed' ? (
                <span className="text-amber-700 dark:text-amber-300" title={engine.error}>
                  not ready: {engine.error}
                </span>
              ) : (
                'not checked yet'
              )}
              {engine?.status !== 'ready' && engine?.status !== 'checking' && (
                <button
                  onClick={() => void window.harness.designPrepare().then(setState)}
                  className="rounded border border-line px-1.5 py-px text-fg hover:bg-surface-2"
                >
                  {engine?.status === 'failed' ? 'Retry' : 'Get it now'}
                </button>
              )}
            </div>
            <div className="text-[10.5px] text-muted">
              Downloaded once per computer from impeccable’s GitHub releases; do it before the event, not on venue wifi.
            </div>
          </div>
        )}
        <label className="flex items-start gap-2.5">
          <input type="checkbox" className="mt-0.5" checked={s.uiUxProMax} onChange={(e) => onChange({ uiUxProMax: e.target.checked })} />
          <span>
            <span className="font-medium">UI/UX Pro Max</span>
            <span className="text-[11px] text-muted">{info('uiUxProMax')}</span>
            <span className="mt-0.5 block text-[11px] text-muted">
              Picks a design system for the product (style, palette, fonts) from a searchable database, plus UX and accessibility rules. Needs Python 3
              (HackForge does too).
            </span>
          </span>
        </label>
      </div>
    </div>
  )
}

function DevToolsSection({
  s,
  hasKey,
  onChange,
  onKey,
}: {
  s: DevToolsSettings
  hasKey: boolean
  onChange: (patch: Partial<DevToolsSettings>) => void
  onKey: (key: string | null) => Promise<void>
}) {
  const [state, setState] = useState<DevToolsState | null>(null)
  const [key, setKey] = useState('')
  const [error, setError] = useState<string | null>(null)
  useEffect(() => {
    void window.harness.devToolsState().then(setState)
    return window.harness.onDevTools(setState)
  }, [])
  const b = state?.browser
  const saveKey = async (k: string | null) => {
    try {
      await onKey(k)
      setKey('')
      setError(null)
    } catch (e) {
      setError(ipcErrorMessage(e))
    }
  }
  return (
    <div className="mb-4 rounded-xl border border-line p-3">
      <div className="flex items-center gap-1.5 font-medium">
        <Wrench className="size-3.5 text-[var(--accent)]" /> Dev tools
      </div>
      <p className="mt-0.5 text-[11px] text-muted">
        Tools Claude uses by itself when they help. Their definitions load only when needed, so unused tools cost little. Applies to new sessions.
      </p>
      <div className="mt-3 space-y-2.5 border-t border-line pt-3">
        <label className="flex items-start gap-2.5">
          <input type="checkbox" className="mt-0.5" checked={s.browser} onChange={(e) => onChange({ browser: e.target.checked })} />
          <span>
            <span className="font-medium">Browser</span>
            <span className="text-[11px] text-muted"> · Playwright, built in</span>
            <span className="mt-0.5 block text-[11px] text-muted">
              Claude opens the running app, clicks through the demo, reads console errors and saves screenshots. HackForge's verifier keeps them as evidence.
            </span>
          </span>
        </label>
        {s.browser && (
          <div className="pl-6 text-[11.5px]">
            <label className="flex items-center gap-1.5">
              <input type="checkbox" checked={s.showBrowser} onChange={(e) => onChange({ showBrowser: e.target.checked })} /> Show the browser window (off: it
              runs in the background)
            </label>
            <div className="mt-1 flex flex-wrap items-center gap-2 text-[11px] text-muted">
              Browser:{' '}
              {b?.status === 'ready' ? (
                <span className="text-emerald-600 dark:text-emerald-400">{b.via}</span>
              ) : b?.status === 'installing' ? (
                'downloading Chromium…'
              ) : b?.status === 'failed' ? (
                <span className="text-amber-700 dark:text-amber-300" title={b.error}>
                  download failed: {b.error}
                </span>
              ) : (
                <span className="text-amber-700 dark:text-amber-300">no Chrome or Edge found</span>
              )}
              {(b?.status === 'missing' || b?.status === 'failed') && (
                <button
                  onClick={() => void window.harness.devToolsInstallBrowser().then(setState)}
                  className="rounded border border-line px-1.5 py-px text-fg hover:bg-surface-2"
                >
                  Get Chromium (about 150 MB)
                </button>
              )}
            </div>
          </div>
        )}
        <label className="flex items-start gap-2.5">
          <input type="checkbox" className="mt-0.5" checked={s.docs} onChange={(e) => onChange({ docs: e.target.checked })} />
          <span>
            <span className="font-medium">Library docs</span>
            <span className="text-[11px] text-muted"> · Context7, hosted</span>
            <span className="mt-0.5 block text-[11px] text-muted">
              Current docs for any library or SDK, so Claude looks up a partner's SDK instead of guessing its API. Works without a key; a free key raises the
              limits.
            </span>
          </span>
        </label>
        {s.docs && (
          <div className="flex gap-1.5 pl-6">
            <input
              type="password"
              value={key}
              onChange={(e) => setKey(e.target.value)}
              onKeyDown={(e) => e.key === 'Enter' && key.trim() && void saveKey(key)}
              placeholder={hasKey ? 'Context7 key saved (paste to replace)' : 'Context7 API key (optional, from context7.com)'}
              className="selectable min-w-0 flex-1 rounded-md border border-line bg-surface-2 px-2 py-1 font-mono text-[11.5px] outline-none focus:border-[var(--accent)]/60"
            />
            {key.trim() ? (
              <button
                onClick={() => void saveKey(key)}
                className="rounded-md bg-[var(--accent)] px-2.5 text-[11.5px] font-medium text-white hover:brightness-110"
              >
                Save
              </button>
            ) : (
              hasKey && (
                <button onClick={() => void saveKey(null)} className="rounded-md border border-line px-2 text-[11.5px]">
                  Remove
                </button>
              )
            )}
          </div>
        )}
        {error && <div className="pl-6 text-[11px] text-red-500">{error}</div>}
        <label className="flex items-start gap-2.5">
          <input type="checkbox" className="mt-0.5" checked={s.partnerServers} onChange={(e) => onChange({ partnerServers: e.target.checked })} />
          <span>
            <span className="font-medium">Partner servers</span>
            <span className="mt-0.5 block text-[11px] text-muted">
              A partner's own MCP server, in sessions in the event project once its key is set on the Partners tab. Anything that changes a partner account
              still asks first.
            </span>
          </span>
        </label>
        {s.partnerServers && !!state?.partners.length && (
          <div className="flex flex-wrap gap-1.5 pl-6 text-[11px]">
            {state.partners.map((p) => (
              <span
                key={p.id}
                className={
                  p.status === 'ready'
                    ? 'rounded-full bg-emerald-500/10 px-2 text-emerald-700 dark:text-emerald-300'
                    : 'rounded-full bg-surface-2 px-2 text-muted'
                }
                title={p.status === 'ready' ? `Sessions in the event project get mcp__${p.id}__*` : 'Set its key on the Partners tab'}
              >
                {p.name} {p.status === 'ready' ? '· ready' : '· needs key'}
              </span>
            ))}
          </div>
        )}
      </div>
    </div>
  )
}

const PHONE_KINDS: { key: 'approvals' | 'finished' | 'limits' | 'team'; label: string }[] = [
  { key: 'approvals', label: 'Claude needs approval' },
  { key: 'finished', label: 'Long tasks and HackForge loops finish' },
  { key: 'limits', label: 'Usage limit hit, queued messages ran' },
  { key: 'team', label: 'Teammate handoffs and file conflicts' },
]

/** Phone alerts through ntfy: scan, subscribe, done. */
function PhoneSection({ s, onChange }: { s: PhoneAlertSettings; onChange: (patch: Partial<PhoneAlertSettings>) => void }) {
  const [test, setTest] = useState<string | null>(null)
  const url = subscribeUrl(s)
  const qr = useMemo(() => {
    const q = qrcode(0, 'M')
    q.addData(url)
    q.make()
    return q.createSvgTag({ cellSize: 3, margin: 2, scalable: true })
  }, [url])
  return (
    <div className="mb-4 rounded-xl border border-line p-3">
      <label className="flex items-start gap-2.5">
        <input type="checkbox" className="mt-0.5" checked={s.enabled} onChange={(e) => onChange({ enabled: e.target.checked })} />
        <span>
          <span className="flex items-center gap-1.5 font-medium">
            <Smartphone className="size-3.5" /> Phone alerts
          </span>
          <span className="mt-0.5 block text-[11px] text-muted">
            A push on your phone when Claude needs you or finishes while you’re away from the laptop. Free, through the ntfy app; no account.
          </span>
        </span>
      </label>
      {s.enabled && (
        <div className="mt-3 border-t border-line pt-3">
          <div className="flex gap-3">
            <div className="size-[116px] shrink-0 rounded-lg bg-white p-1" dangerouslySetInnerHTML={{ __html: qr }} title={url} />
            <ol className="list-decimal space-y-1 pl-4 text-[11.5px] text-muted">
              <li>
                Install <b className="text-fg">ntfy</b> on your phone (App Store or Google Play).
              </li>
              <li>Scan the code (or open the link below on the phone) and subscribe.</li>
              <li>
                <button
                  onClick={() => {
                    setTest('Sending…')
                    window.harness.phoneTest().then(
                      () => setTest('Sent. Check your phone.'),
                      (e: unknown) => setTest(ipcErrorMessage(e)),
                    )
                  }}
                  className="rounded-md border border-line px-2 py-0.5 text-[11.5px] text-fg hover:bg-surface-2"
                >
                  Send a test
                </button>
                {test && <span className="ml-2">{test}</span>}
              </li>
            </ol>
          </div>
          <div className="mt-2 flex items-center gap-2 text-[11px]">
            <code className="selectable min-w-0 flex-1 truncate rounded bg-surface-2 px-1.5 py-0.5">{url}</code>
            <button
              onClick={() =>
                window.confirm('Make a new private topic? Your phone needs to subscribe to the new one.') &&
                onChange({ topic: newAlertTopic((n) => crypto.getRandomValues(new Uint8Array(n))) })
              }
              className="shrink-0 text-muted hover:text-fg"
            >
              New topic
            </button>
          </div>
          <p className="mt-1 text-[10.5px] text-muted">
            Anyone who knows the topic can read the alerts, so it’s long and random, and alerts never contain code or keys.
          </p>
          <div className="mt-2.5 grid grid-cols-2 gap-x-3 gap-y-1 text-[11.5px]">
            {PHONE_KINDS.map((k) => (
              <label key={k.key} className="flex items-center gap-1.5">
                <input type="checkbox" checked={s[k.key]} onChange={(e) => onChange({ [k.key]: e.target.checked })} /> {k.label}
              </label>
            ))}
          </div>
          <label className="mt-2 flex items-center gap-1.5 text-[11.5px]">
            <input type="checkbox" checked={s.onlyWhenAway} onChange={(e) => onChange({ onlyWhenAway: e.target.checked })} /> Only when I’m away (screen locked
            or idle 90 s)
          </label>
          <label className="mt-2 block text-[11px] text-muted">
            Server
            <input
              defaultValue={s.server}
              onBlur={(e) => /^https?:\/\//.test(e.target.value.trim()) && e.target.value.trim() !== s.server && onChange({ server: e.target.value.trim() })}
              className="selectable mt-0.5 w-full rounded-md border border-line bg-surface-2 px-2 py-1 text-[11.5px] text-fg outline-none"
            />
          </label>
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
        <input
          type="checkbox"
          className="mt-0.5"
          checked={status.enabled}
          onChange={(e) => void run(() => window.harness.setObserveEnabled(e.target.checked))}
        />
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
            Adds a small hook to <code>{status.settingsPath}</code> so watched sessions show “needs approval”, “done” and “ended” instantly. A backup of the
            file is saved first; removing takes out only Harness’s entries.
          </p>
          {status.hookPort === null && <p className="mb-2 text-amber-600">Port 47821 is busy, so hooks can’t reach Harness right now.</p>}
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
