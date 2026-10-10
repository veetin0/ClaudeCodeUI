/**
 * Challenge board: the partner challenges a hackathon announces, one markdown file each in
 * `challenges/` at the event project's root (outside challenge/, so HackForge only ever reads the
 * one we pick). Front matter holds partner, status and scores; the body is the pasted description
 * plus a "## Mentor notes" section.
 */
import YAML from 'yaml'

export const CRITERIA = [
  { key: 'partner_value', label: 'Partner value', weight: 25, hint: 'Would the partner actually use or showcase it?' },
  { key: 'fit', label: 'Team fit', weight: 20, hint: 'Our skills, tools and starter kits apply' },
  { key: 'feasibility', label: 'Feasible in ~40 h', weight: 20, hint: 'A solid end-to-end demo is realistic' },
  { key: 'wow', label: 'Demo wow', weight: 15, hint: 'A moment the judges remember' },
  { key: 'theme', label: 'Theme', weight: 10, hint: 'Moves the center of gravity (European Tech Renaissance)' },
  { key: 'competition', label: 'Less competition', weight: 10, hint: 'Fewer strong teams likely to pick it' },
] as const
export type CriterionKey = (typeof CRITERIA)[number]['key']
export type Scores = Partial<Record<CriterionKey, number>>

export const CHALLENGE_STATUSES = ['candidate', 'shortlist', 'chosen', 'dropped'] as const
export type ChallengeStatus = (typeof CHALLENGE_STATUSES)[number]

export interface ChallengeAnalysis {
  summary?: string
  idea?: string
  partnerTech?: string
  risks: string[]
  scores: Scores
  /** Other keys under `ai:` (kept as they are when the file is rewritten). */
  extra?: Record<string, unknown>
}

export interface Challenge {
  /** File name without .md; stable id. */
  id: string
  partner: string
  title: string
  status: ChallengeStatus
  link?: string
  prize?: string
  scores: Scores
  ai?: ChallengeAnalysis
  description: string
  notes: string
  /** Front-matter keys Harness doesn't use (added by Claude or a teammate), kept on rewrite. */
  extra?: Record<string, unknown>
}

export const CHALLENGES_DIR = 'challenges'

/** UI edits are patches applied to the file on disk, so they never clobber what Claude just wrote. */
export interface ChallengePatch {
  partner?: string
  title?: string
  status?: ChallengeStatus
  link?: string
  prize?: string
  description?: string
  notes?: string
  /** null clears a team score. */
  scores?: Partial<Record<CriterionKey, number | null>>
}

export function applyPatch(c: Challenge, p: ChallengePatch): Challenge {
  const next: Challenge = { ...c, scores: { ...c.scores } }
  for (const k of ['partner', 'title', 'link', 'prize', 'description', 'notes'] as const) {
    const v = p[k]
    if (v !== undefined) (next as unknown as Record<string, unknown>)[k] = k === 'link' || k === 'prize' ? v.trim() || undefined : v
  }
  if (p.status) next.status = p.status
  for (const [k, v] of Object.entries(p.scores ?? {}) as [CriterionKey, number | null][]) {
    if (v === null) delete next.scores[k]
    else next.scores[k] = Math.max(1, Math.min(5, Math.round(v)))
  }
  return next
}
const NOTES_HEADING = '## Mentor notes'

export function slugify(s: string): string {
  return (
    s
      .toLowerCase()
      .normalize('NFKD')
      .replace(/[̀-ͯ]/g, '')
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-+|-+$/g, '')
      .slice(0, 60) || 'challenge'
  )
}

const clampScore = (v: unknown): number | undefined => {
  const n = typeof v === 'number' ? v : typeof v === 'string' ? Number(v) : NaN
  return Number.isFinite(n) ? Math.max(1, Math.min(5, Math.round(n))) : undefined
}

function pickScores(v: unknown): Scores {
  const o = (v && typeof v === 'object' ? v : {}) as Record<string, unknown>
  const out: Scores = {}
  for (const c of CRITERIA) {
    const s = clampScore(o[c.key])
    if (s !== undefined) out[c.key] = s
  }
  return out
}

const META_KEYS = ['partner', 'title', 'status', 'link', 'prize', 'scores', 'ai']
const AI_KEYS = ['summary', 'idea', 'partner_tech', 'partnerTech', 'risks', 'scores']
function rest(o: Record<string, unknown>, known: string[]): Record<string, unknown> | undefined {
  const out = Object.fromEntries(Object.entries(o).filter(([k]) => !known.includes(k)))
  return Object.keys(out).length ? out : undefined
}

const text = (v: unknown) => (typeof v === 'string' ? v.trim() : typeof v === 'number' ? String(v) : '')

/** Parses a challenge file; tolerant of missing or broken front matter (the whole file is then the description). */
export function parseChallenge(source: string, id: string): Challenge {
  let meta: Record<string, unknown> = {}
  let body = source
  const m = /^﻿?---\r?\n([\s\S]*?)\r?\n---[ \t]*(?:\r?\n|$)/.exec(source)
  if (m) {
    try {
      const parsed = YAML.parse(m[1])
      if (parsed && typeof parsed === 'object') meta = parsed as Record<string, unknown>
      body = source.slice(m[0].length)
    } catch {
      // Keep the raw text as the description so nothing is lost.
    }
  }
  const at = body.indexOf(NOTES_HEADING)
  const description = (at >= 0 ? body.slice(0, at) : body).trim()
  const notes = at >= 0 ? body.slice(at + NOTES_HEADING.length).trim() : ''
  const ai = meta.ai && typeof meta.ai === 'object' ? (meta.ai as Record<string, unknown>) : undefined
  const status = text(meta.status).toLowerCase() as ChallengeStatus
  const firstLine = description.split('\n').find((l) => l.trim())?.replace(/^#+\s*/, '').trim()
  return {
    id,
    partner: text(meta.partner) || 'Unknown partner',
    title: text(meta.title) || firstLine?.slice(0, 80) || id,
    status: CHALLENGE_STATUSES.includes(status) ? status : 'candidate',
    link: text(meta.link) || undefined,
    prize: text(meta.prize) || undefined,
    scores: pickScores(meta.scores),
    ai: ai
      ? {
          summary: text(ai.summary) || undefined,
          idea: text(ai.idea) || undefined,
          partnerTech: text(ai.partner_tech ?? ai.partnerTech) || undefined,
          risks: Array.isArray(ai.risks) ? ai.risks.map(text).filter(Boolean).slice(0, 8) : [],
          scores: pickScores(ai.scores),
          extra: rest(ai, AI_KEYS),
        }
      : undefined,
    description,
    notes,
    extra: rest(meta, META_KEYS),
  }
}

export function serializeChallenge(c: Challenge): string {
  const meta: Record<string, unknown> = { partner: c.partner, title: c.title, status: c.status }
  if (c.link) meta.link = c.link
  if (c.prize) meta.prize = c.prize
  if (Object.keys(c.scores).length) meta.scores = c.scores
  for (const [k, v] of Object.entries(c.extra ?? {})) if (!META_KEYS.includes(k)) meta[k] = v
  if (c.ai) {
    const ai: Record<string, unknown> = {}
    if (c.ai.summary) ai.summary = c.ai.summary
    if (c.ai.idea) ai.idea = c.ai.idea
    if (c.ai.partnerTech) ai.partner_tech = c.ai.partnerTech
    if (c.ai.risks.length) ai.risks = c.ai.risks
    if (Object.keys(c.ai.scores).length) ai.scores = c.ai.scores
    for (const [k, v] of Object.entries(c.ai.extra ?? {})) if (!AI_KEYS.includes(k)) ai[k] = v
    if (Object.keys(ai).length) meta.ai = ai
  }
  const fm = YAML.stringify(meta, { lineWidth: 0 }).trimEnd()
  return `---\n${fm}\n---\n\n${c.description.trim()}\n\n${NOTES_HEADING}\n\n${c.notes.trim()}\n`.replace(/\n{3,}/g, '\n\n')
}

export interface ChallengeScore {
  /** 0–100 weighted, from team scores where set and Claude's otherwise. */
  total: number
  /** Share of the weight that has any score. */
  coverage: number
  per: { key: CriterionKey; score?: number; source?: 'team' | 'ai' }[]
}

export function scoreChallenge(c: Challenge): ChallengeScore {
  let total = 0
  let covered = 0
  const per = CRITERIA.map((cr) => {
    const team = c.scores[cr.key]
    const ai = c.ai?.scores[cr.key]
    const score = team ?? ai
    if (score !== undefined) {
      total += (cr.weight * (score - 1)) / 4
      covered += cr.weight
    }
    return { key: cr.key, score, source: team !== undefined ? ('team' as const) : ai !== undefined ? ('ai' as const) : undefined }
  })
  // Rank on what's known: an unscored criterion counts as average (3/5) rather than zero.
  const missing = 100 - covered
  return { total: Math.round(total + missing * 0.5), coverage: covered / 100, per }
}

const STATUS_RANK: Record<ChallengeStatus, number> = { chosen: 0, shortlist: 1, candidate: 2, dropped: 3 }

export function rankChallenges(list: Challenge[]): Challenge[] {
  return [...list].sort((a, b) => STATUS_RANK[a.status] - STATUS_RANK[b.status] || scoreChallenge(b).total - scoreChallenge(a).total || a.title.localeCompare(b.title))
}

// ---------- prompts (sent to a Claude session in the event project) ----------

const FORMAT = `Each challenge is one file: ${CHALLENGES_DIR}/<partner>-<short-title>.md (lowercase, dashes), like this:

\`\`\`markdown
---
partner: OpenAI
title: "Short challenge title"
status: candidate
link: https://… (if known)
prize: "…" (if known)
---

<the challenge description, verbatim>

${NOTES_HEADING}
\`\`\``

const SCORING = CRITERIA.map((c) => `- ${c.key} (${c.weight} %): ${c.label}: ${c.hint}`).join('\n')

export function importPrompt(pasted: string): string {
  return `Split the hackathon challenges pasted below into separate files in ${CHALLENGES_DIR}/ (create the folder if needed). Keep each description verbatim; don't summarise it. Skip anything that already has a file. Don't change any other files.

${FORMAT}

Pasted challenges:

<<<
${pasted.trim()}
>>>`
}

export function analyzePrompt(onlyId?: string): string {
  return `Analyze the hackathon challenge${onlyId ? '' : 's'} in ${onlyId ? `${CHALLENGES_DIR}/${onlyId}.md` : `${CHALLENGES_DIR}/*.md`} for our team (4 people, similar strengths, ~40 h of build time, Claude Code + HackForge, theme "European Tech Renaissance: who moves the center of gravity?"). Read challenge/event.yaml, challenge/prompts/ and challenge/brief/ for context. Research the partner company and what it would value (use web search if available).

For each challenge, add an \`ai:\` block to the file's front matter and leave everything else exactly as it is (description, notes, team scores, status):

\`\`\`yaml
ai:
  summary: "One sentence: what the partner really wants."
  idea: "Our strongest idea for it in one or two sentences, with the single demo moment."
  partner_tech: "Which partner technology the product would run on."
  risks: ["…", "…"]
  scores: { partner_value: 1-5, fit: 1-5, feasibility: 1-5, wow: 1-5, theme: 1-5, competition: 1-5 }
\`\`\`

Scoring criteria (integers 1–5, be critical, 3 is average):
${SCORING}

Finish with a short ranking and your recommendation in chat.`
}

export function researchPrompt(c: Challenge): string {
  return `Research the partner behind the challenge in ${CHALLENGES_DIR}/${c.id}.md (${c.partner}: "${c.title}") for our hackathon team: what the company does, its APIs and SDKs relevant to this challenge, what a winning project would mean to them, and questions we should ask their mentors. Use web search if available. Append your findings as bullets under "${NOTES_HEADING}" in that file (keep everything else unchanged) and give a short summary in chat.`
}

/** The brief HackForge reads once we've picked a challenge. */
export function chosenBrief(c: Challenge): string {
  return `# Our challenge: ${c.title} (${c.partner})

${c.link ? `Source: ${c.link}\n\n` : ''}${c.prize ? `Prize: ${c.prize}\n\n` : ''}${c.description.trim()}
${c.notes.trim() ? `\n## What the partner's mentors told us\n\n${c.notes.trim()}\n` : ''}${c.ai?.idea ? `\n## Starting idea (from the challenge board)\n\n${c.ai.idea}\n` : ''}`
}
