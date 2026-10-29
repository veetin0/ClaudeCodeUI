import { Bell, KeyRound, Smartphone } from 'lucide-react'
import { useMemo, useState } from 'react'
import qrcode from 'qrcode-generator'
import { newAlertTopic, subscribeUrl, type PhoneAlertSettings } from '@shared/alerts'
import type { PermissionMode } from '@shared/events'
import { ipcErrorMessage } from '@/lib/time'
import { MODELS, PERMISSION_MODES } from '@/features/conversation/PromptBox'
import { useApp } from '@/stores/app'
import { Field, Row } from './parts'

/** Settings › General: how Harness signs in, what new sessions start with, and how it tells you things. */
export function GeneralTab() {
  const { settings, saveApiKey, updateSettings } = useApp()
  const [key, setKey] = useState('')
  const [error, setError] = useState<string | null>(null)
  if (!settings) return null
  return (
    <div className="space-y-4">
      <Field
        label="Anthropic API key"
        hint={settings.hasApiKey ? 'A key is stored in your system keychain.' : 'Optional. Without one, Harness uses your existing Claude Code login.'}
      >
        <div className="flex gap-2">
          <div className="relative min-w-0 flex-1">
            <KeyRound className="pointer-events-none absolute left-2.5 top-1/2 size-3.5 -translate-y-1/2 text-muted" />
            <input
              type="password"
              value={key}
              onChange={(e) => setKey(e.target.value)}
              placeholder={settings.hasApiKey ? '••••••••••••' : 'sk-ant-…'}
              className="selectable w-full rounded-md border border-line bg-surface-2 py-1.5 pl-8 pr-2.5 outline-none focus:border-[var(--accent)]/60"
            />
          </div>
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

      <div className="grid gap-4 sm:grid-cols-2">
        <Field
          label="Model for new sessions"
          hint={settings.usageSaver.enabled && settings.usageSaver.autoModel ? 'Auto: the Usage saver picks the model for each message.' : undefined}
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
        <Field label="Permissions for new sessions">
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
      </div>

      <Row
        icon={<Bell className="size-3.5" />}
        title="Notifications"
        description="Tell me when Claude needs approval or finishes a longer task while Harness is in the background."
        on={settings.notifications}
        onToggle={(notifications) => void updateSettings({ notifications })}
      />

      <PhoneSection s={settings.phoneAlerts} onChange={(patch) => void updateSettings({ phoneAlerts: { ...settings.phoneAlerts, ...patch } })} />
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
    <Row
      icon={<Smartphone className="size-3.5" />}
      title="Phone alerts"
      description="A push on your phone when Claude needs you or finishes while you’re away from the laptop. Free, through the ntfy app; no account."
      on={s.enabled}
      onToggle={(enabled) => onChange({ enabled })}
    >
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
    </Row>
  )
}
