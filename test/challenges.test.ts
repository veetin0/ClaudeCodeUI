import { describe, expect, it } from 'vitest'
import { analyzePrompt, chosenBrief, importPrompt, parseChallenge, rankChallenges, scoreChallenge, serializeChallenge, slugify, type Challenge } from '@shared/challenges'

const FILE = `---
partner: OpenAI
title: "Agents for public services"
status: shortlist
link: https://junction.example/c/openai
scores: { fit: 4, wow: 9, theme: "2" }
ai:
  summary: "They want agents that do real work."
  idea: "A voice agent that files permits."
  partner_tech: "Realtime API"
  risks: ["Scope", "Latency"]
  scores: { partner_value: 5, fit: 3, feasibility: 4, wow: 5, theme: 4, competition: 2 }
---

Build an agent that **helps citizens**.

Use our APIs.

## Mentor notes

- They care about reliability
`

describe('challenge files', () => {
  it('parses front matter, body and notes', () => {
    const c = parseChallenge(FILE, 'openai-agents')
    expect(c).toMatchObject({
      id: 'openai-agents',
      partner: 'OpenAI',
      title: 'Agents for public services',
      status: 'shortlist',
      link: 'https://junction.example/c/openai',
      scores: { fit: 4, wow: 5, theme: 2 }, // clamped to 1–5, strings accepted
      ai: { summary: 'They want agents that do real work.', partnerTech: 'Realtime API', risks: ['Scope', 'Latency'] },
      description: 'Build an agent that **helps citizens**.\n\nUse our APIs.',
      notes: '- They care about reliability',
    })
  })

  it('round-trips through serialize', () => {
    const c = parseChallenge(FILE, 'x')
    const again = parseChallenge(serializeChallenge(c), 'x')
    expect(again).toEqual(c)
  })

  it('keeps everything when the front matter is missing or broken', () => {
    const plain = parseChallenge('# Smart grids\n\nBalance the grid.', 'aalto')
    expect(plain).toMatchObject({ partner: 'Unknown partner', title: 'Smart grids', status: 'candidate', description: '# Smart grids\n\nBalance the grid.', notes: '' })
    const broken = parseChallenge('---\npartner: [oops\n---\nBody', 'b')
    expect(broken.description).toContain('Body')
    expect(broken.description).toContain('partner: [oops')
    expect(parseChallenge('---\nstatus: weird\n---\nx', 'c').status).toBe('candidate')
  })

  it('scores with team scores first, Claude second, unknown as average', () => {
    const c = parseChallenge(FILE, 'x')
    const s = scoreChallenge(c)
    expect(s.coverage).toBe(1)
    expect(s.per.find((p) => p.key === 'fit')).toEqual({ key: 'fit', score: 4, source: 'team' })
    expect(s.per.find((p) => p.key === 'partner_value')).toEqual({ key: 'partner_value', score: 5, source: 'ai' })
    // 25*1 + 20*.75 + 20*.75 + 15*1 + 10*.25 + 10*.25 = 75
    expect(s.total).toBe(75)
    const blank: Challenge = { ...c, scores: {}, ai: undefined }
    expect(scoreChallenge(blank)).toMatchObject({ total: 50, coverage: 0 })
  })

  it('ranks chosen first, dropped last, then by score', () => {
    const base = parseChallenge(FILE, 'a')
    const mk = (id: string, status: Challenge['status'], wow: number): Challenge => ({ ...base, id, title: id, status, scores: { wow }, ai: undefined })
    expect(rankChallenges([mk('low', 'candidate', 1), mk('drop', 'dropped', 5), mk('high', 'candidate', 5), mk('pick', 'chosen', 1)]).map((c) => c.id)).toEqual([
      'pick',
      'high',
      'low',
      'drop',
    ])
  })

  it('makes safe file names and useful prompts', () => {
    expect(slugify('Café Ünïcode / Tëst!!')).toBe('cafe-unicode-test')
    expect(slugify('***')).toBe('challenge')
    expect(importPrompt('A\nB')).toContain('<<<\nA\nB\n>>>')
    expect(analyzePrompt('openai-agents')).toContain('challenges/openai-agents.md')
    const brief = chosenBrief(parseChallenge(FILE, 'x'))
    expect(brief).toMatch(/^# Our challenge: Agents for public services \(OpenAI\)/)
    expect(brief).toContain("What the partner's mentors told us")
    expect(brief).toContain('A voice agent that files permits.')
  })
})
