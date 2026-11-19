import type { BundledPluginInfo } from './plugins'

/**
 * ECC (github.com/affaan-m/ECC, MIT): agents, skills, commands, hooks and rules for building software
 * with Claude Code. Harness ships a copy (resources/ecc) and loads it into every session.
 */
export const ECC_HOOK_PROFILES = ['minimal', 'standard', 'strict'] as const
export type EccHookProfile = (typeof ECC_HOOK_PROFILES)[number]

export interface EccSettings {
  enabled: boolean
  /** How much ECC's hooks check and block (ECC_HOOK_PROFILE). */
  hookProfile: EccHookProfile
}

export const DEFAULT_ECC: EccSettings = { enabled: true, hookProfile: 'standard' }

export const ECC_PROFILE_LABEL: Record<EccHookProfile, string> = {
  minimal: 'Minimal: safety checks only',
  standard: 'Standard: safety, formatting and session memory',
  strict: 'Strict: everything, with stricter gates',
}

/** What the Tools settings show about the copy in use. */
export interface EccInfo {
  plugin: BundledPluginInfo
  commit?: string
  counts: { agents: number; skills: number; commands: number; rules: string[] }
}

/** Environment for sessions: ECC's hook profile (applies to an installed copy too). */
export function eccEnv(s: EccSettings | undefined): Record<string, string> {
  if (!s?.enabled) return {}
  const profile = ECC_HOOK_PROFILES.includes(s.hookProfile) ? s.hookProfile : 'standard'
  return { ECC_HOOK_PROFILE: profile }
}

export function parseEccSettings(raw: unknown): EccSettings {
  const o = (raw && typeof raw === 'object' ? raw : {}) as Partial<EccSettings>
  return {
    enabled: typeof o.enabled === 'boolean' ? o.enabled : DEFAULT_ECC.enabled,
    hookProfile: ECC_HOOK_PROFILES.includes(o.hookProfile as EccHookProfile) ? (o.hookProfile as EccHookProfile) : DEFAULT_ECC.hookProfile,
  }
}
