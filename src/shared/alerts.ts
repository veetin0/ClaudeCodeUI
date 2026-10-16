/**
 * Phone alerts through ntfy (https://ntfy.sh): install the free ntfy app, subscribe to your
 * private topic (scan the QR code in Settings), and Harness pushes short alerts to it when you're
 * away from the laptop. Anyone who knows the topic can read it, so it's long and random, and
 * alerts carry no code or keys.
 */
export interface PhoneAlertSettings {
  enabled: boolean
  /** ntfy server; the public one works, or your own. */
  server: string
  topic: string
  /** Only when you're away (screen locked or no input for a minute and a half). */
  onlyWhenAway: boolean
  approvals: boolean
  finished: boolean
  limits: boolean
  team: boolean
}

export type PhoneAlertKind = 'approvals' | 'finished' | 'limits' | 'team'

export const DEFAULT_PHONE_ALERTS: PhoneAlertSettings = {
  enabled: false,
  server: 'https://ntfy.sh',
  topic: '',
  onlyWhenAway: true,
  approvals: true,
  finished: true,
  limits: true,
  team: true,
}

/** "harness-k3v9…": 26 random characters, unguessable. */
export function newAlertTopic(random: (n: number) => Uint8Array): string {
  const alphabet = 'abcdefghijkmnpqrstuvwxyz23456789'
  return `harness-${Array.from(random(26), (b) => alphabet[b % alphabet.length]).join('')}`
}

/** The link the phone opens (or the QR code holds) to subscribe. */
export function subscribeUrl(s: Pick<PhoneAlertSettings, 'server' | 'topic'>): string {
  return `${s.server.replace(/\/+$/, '')}/${s.topic}`
}
