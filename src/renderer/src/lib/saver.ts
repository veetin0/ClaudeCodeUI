import { tierOf } from '@shared/usageSaver'
import type { SaverView } from '@/stores/reducer'

export type SaverTone = 'saving' | 'power' | 'idle' | 'off'

export interface SaverStatus {
  tone: SaverTone
  /** Short, for the chip: "Saving · Sonnet". */
  label: string
  /** One or two sentences: what's happening and why. */
  detail: string
}

/** Whether this session is saving usage right now, in words. Null for sessions without the saver. */
export function saverStatus(s: { saver?: SaverView; model?: string }): SaverStatus | null {
  const v = s.saver
  if (!v) return null
  if (!v.enabled) return { tone: 'off', label: 'Saver off', detail: 'The Usage saver is off for this session. Turn it on in Settings (it applies to new sessions).' }
  if (v.auto) {
    if (!v.tier) return { tone: 'idle', label: 'Auto', detail: 'Picks Opus or Sonnet for each message once you send one.' }
    if (v.tier === 'sonnet') return { tone: 'saving', label: 'Saving · Sonnet', detail: v.text ?? 'Sonnet is on this turn.' }
    return { tone: 'power', label: 'Not saving · Opus', detail: v.text ?? 'Opus is on this turn.' }
  }
  const model = s.model?.toLowerCase() ?? ''
  const extras = [v.compact && 'compaction between tasks', v.skipGenerated && 'skipping generated files'].filter(Boolean).join(' and ')
  const tail = `${extras ? ` ${extras[0].toUpperCase()}${extras.slice(1)} still ${v.compact && v.skipGenerated ? 'apply' : 'applies'}.` : ''} Pick Auto in the model menu to let the saver choose.`
  if (tierOf(model) === 'sonnet' || model.includes('haiku')) {
    return { tone: 'saving', label: `Saving · ${model.includes('haiku') ? 'Haiku' : 'Sonnet'}`, detail: `You picked a lighter model for this session, so the saver doesn’t switch models.${tail}` }
  }
  return { tone: 'power', label: 'Not saving · your model', detail: `You picked the model for this session, so the saver doesn’t switch it.${tail}` }
}
