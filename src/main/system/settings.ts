import { app, safeStorage } from 'electron'
import { existsSync, readFileSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import type { AppSettings } from '@shared/ipc'

interface StoredSettings extends Omit<AppSettings, 'hasApiKey'> {
  /** API key encrypted with the macOS Keychain-backed safeStorage, base64. */
  apiKeyEnc?: string
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
}

export class SettingsStore {
  private readonly file = join(app.getPath('userData'), 'settings.json')
  private data: StoredSettings

  constructor() {
    this.data = { ...DEFAULTS }
    if (existsSync(this.file)) {
      try {
        this.data = { ...DEFAULTS, ...JSON.parse(readFileSync(this.file, 'utf8')) }
      } catch {
        // Corrupt settings: fall back to defaults rather than refusing to start.
      }
    }
  }

  get(): AppSettings {
    const { apiKeyEnc, ...rest } = this.data
    return { ...rest, hasApiKey: Boolean(apiKeyEnc) }
  }

  update(patch: Partial<Omit<AppSettings, 'hasApiKey'>>): AppSettings {
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

  private save() {
    writeFileSync(this.file, JSON.stringify(this.data, null, 2))
  }
}
