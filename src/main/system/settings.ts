import { app, safeStorage } from 'electron'
import { existsSync, readFileSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import type { AppSettings } from '@shared/ipc'
import { DEFAULT_USAGE_SAVER } from '@shared/usageSaver'
import { DEFAULT_PHONE_ALERTS, newAlertTopic } from '@shared/alerts'
import { DEFAULT_DESIGN_SKILLS } from '@shared/design'
import { randomBytes } from 'node:crypto'

interface StoredSettings extends Omit<AppSettings, 'hasApiKey' | 'hasElevenLabsKey'> {
  /** API key encrypted with the macOS Keychain-backed safeStorage, base64. */
  apiKeyEnc?: string
  /** ElevenLabs key for pitch narration, encrypted the same way. */
  elevenLabsKeyEnc?: string
}

const DEFAULTS: StoredSettings = {
  defaultModel: '',
  defaultPermissionMode: 'default',
  recentProjects: [],
  observeTerminalSessions: true,
  notifications: true,
  hackforgeMode: 'projects',
  eventProject: null,
  team: null,
  teamMemberId: '',
  usageSaver: DEFAULT_USAGE_SAVER,
  phoneAlerts: DEFAULT_PHONE_ALERTS,
  resetQueue: { enabled: true, keepAwake: true },
  handoffDirs: [],
  designSkills: DEFAULT_DESIGN_SKILLS,
}

export class SettingsStore {
  private readonly file = join(app.getPath('userData'), 'settings.json')
  private data: StoredSettings

  constructor() {
    this.data = { ...DEFAULTS }
    if (existsSync(this.file)) {
      try {
        const stored = JSON.parse(readFileSync(this.file, 'utf8')) as Partial<StoredSettings>
        // Settings added in later versions get their defaults (the Usage saver starts on).
        this.data = {
          ...DEFAULTS,
          ...stored,
          usageSaver: { ...DEFAULT_USAGE_SAVER, ...stored.usageSaver },
          phoneAlerts: { ...DEFAULT_PHONE_ALERTS, ...stored.phoneAlerts },
          resetQueue: { ...DEFAULTS.resetQueue, ...stored.resetQueue },
          designSkills: { ...DEFAULT_DESIGN_SKILLS, ...stored.designSkills },
        }
      } catch {
        // Corrupt settings: fall back to defaults rather than refusing to start.
      }
    }
  }

  private ensureTopic() {
    // Each install gets its own unguessable ntfy topic up front, so the QR code is ready to scan.
    if (!this.data.phoneAlerts.topic) this.data.phoneAlerts = { ...this.data.phoneAlerts, topic: newAlertTopic((n) => randomBytes(n)) }
  }

  get(): AppSettings {
    this.ensureTopic()
    const { apiKeyEnc, elevenLabsKeyEnc, ...rest } = this.data
    return { ...rest, hasApiKey: Boolean(apiKeyEnc), hasElevenLabsKey: Boolean(elevenLabsKeyEnc) }
  }

  update(patch: Partial<Omit<AppSettings, 'hasApiKey' | 'hasElevenLabsKey'>>): AppSettings {
    this.data = { ...this.data, ...patch }
    this.save()
    return this.get()
  }

  addRecentProject(dir: string) {
    const recent = [dir, ...this.data.recentProjects.filter((d) => d !== dir)].slice(0, 12)
    this.update({ recentProjects: recent })
  }

  setApiKey(key: string | null) {
    if (!key) delete this.data.apiKeyEnc
    else if (safeStorage.isEncryptionAvailable()) this.data.apiKeyEnc = safeStorage.encryptString(key).toString('base64')
    else throw new Error('Secure storage is unavailable; set ANTHROPIC_API_KEY in your shell instead.')
    this.save()
  }

  getApiKey(): string | undefined {
    if (!this.data.apiKeyEnc) return undefined
    try {
      return safeStorage.decryptString(Buffer.from(this.data.apiKeyEnc, 'base64'))
    } catch {
      return undefined
    }
  }

  setElevenLabsKey(key: string | null) {
    if (!key) delete this.data.elevenLabsKeyEnc
    else if (safeStorage.isEncryptionAvailable()) this.data.elevenLabsKeyEnc = safeStorage.encryptString(key.trim()).toString('base64')
    else throw new Error('Secure storage is unavailable; set ELEVENLABS_API_KEY in your shell instead.')
    this.save()
  }

  getElevenLabsKey(): string | undefined {
    if (this.data.elevenLabsKeyEnc) {
      try {
        return safeStorage.decryptString(Buffer.from(this.data.elevenLabsKeyEnc, 'base64'))
      } catch {
        // Fall through to the environment.
      }
    }
    return process.env.ELEVENLABS_API_KEY || undefined
  }

  private save() {
    writeFileSync(this.file, JSON.stringify(this.data, null, 2))
  }
}
