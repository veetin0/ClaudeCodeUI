import { createCipheriv, createDecipheriv, hkdfSync, randomBytes } from 'node:crypto'

/**
 * Partner API keys shared with the team travel through the relay inside each member's status.
 * They're sealed with a key derived from the team token, which only teammates have (the relay
 * stores a hash of it), so whoever runs the relay sees ciphertext only.
 */
const keyFor = (token: string) => Buffer.from(hkdfSync('sha256', token, 'harness-team-secrets', 'v1', 32))

export function sealSecrets(token: string, data: Record<string, string>): string {
  const iv = randomBytes(12)
  const c = createCipheriv('aes-256-gcm', keyFor(token), iv)
  const body = Buffer.concat([c.update(JSON.stringify(data), 'utf8'), c.final()])
  return `v1.${Buffer.concat([iv, c.getAuthTag(), body]).toString('base64url')}`
}

export function openSecrets(token: string, sealed: string): Record<string, string> | null {
  try {
    if (!sealed.startsWith('v1.')) return null
    const raw = Buffer.from(sealed.slice(3), 'base64url')
    const d = createDecipheriv('aes-256-gcm', keyFor(token), raw.subarray(0, 12))
    d.setAuthTag(raw.subarray(12, 28))
    const parsed = JSON.parse(Buffer.concat([d.update(raw.subarray(28)), d.final()]).toString('utf8')) as unknown
    if (!parsed || typeof parsed !== 'object') return null
    const out: Record<string, string> = {}
    for (const [k, v] of Object.entries(parsed as Record<string, unknown>)) if (/^[A-Z][A-Z0-9_]{1,63}$/.test(k) && typeof v === 'string' && v.length < 4000) out[k] = v
    return out
  } catch {
    return null
  }
}
