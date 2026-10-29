import { AlarmClock, Leaf } from 'lucide-react'
import type { UsageSaverSettings } from '@shared/usageSaver'
import { useApp } from '@/stores/app'
import { Row } from './parts'

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

/** Settings › Advanced: the Usage saver's parts and the reset queue. */
export function AdvancedTab() {
  const { settings, updateSettings } = useApp()
  if (!settings) return null
  const saver = settings.usageSaver
  const setSaver = (patch: Partial<UsageSaverSettings>) => void updateSettings({ usageSaver: { ...saver, ...patch } })
  return (
    <div className="space-y-4">
      <Row
        icon={<Leaf className="size-3.5 text-ok-ink" />}
        title="Usage saver"
        description="Spends your Claude plan where it buys quality and cuts what buys nothing. The mode chip in the prompt box shows whether each turn is saving, and the chat notes every switch."
        on={saver.enabled}
        onToggle={(enabled) => setSaver({ enabled })}
      >
        <div className="space-y-2.5">
          {SAVER_FEATURES.map((f) => (
            <label key={f.key} className="flex items-start gap-2.5">
              <input type="checkbox" className="mt-0.5" checked={saver[f.key]} onChange={(e) => setSaver({ [f.key]: e.target.checked })} />
              <span>
                <span className="font-medium">{f.label}</span>
                <span className="mt-0.5 block text-[11px] text-muted">{f.hint}</span>
              </span>
            </label>
          ))}
          <p className="text-[11px] text-muted">Applies to new sessions. Any session can switch between Auto and one model in its mode chip.</p>
        </div>
      </Row>

      <Row
        icon={<AlarmClock className="size-3.5" />}
        title="Run queued messages when my usage limit resets"
        description="At the limit, messages you send wait and go out at the reset (also the ⏰ button by Send). Off: they keep waiting."
        on={settings.resetQueue.enabled}
        onToggle={(enabled) => void updateSettings({ resetQueue: { ...settings.resetQueue, enabled } })}
      >
        <label className="flex items-start gap-2.5">
          <input
            type="checkbox"
            className="mt-0.5"
            checked={settings.resetQueue.keepAwake}
            onChange={(e) => void updateSettings({ resetQueue: { ...settings.resetQueue, keepAwake: e.target.checked } })}
          />
          <span className="text-[12px]">
            Keep this computer awake while messages wait <span className="text-muted">(closing a laptop’s lid still puts it to sleep; it catches up on wake)</span>
          </span>
        </label>
      </Row>

      <p className="text-[11px] leading-relaxed text-muted">
        Sessions load your usual <code>~/.claude</code> settings, CLAUDE.md files, MCP servers and skills.
      </p>
    </div>
  )
}
