import { describe, expect, it } from 'vitest'
import { classifyPrompt, compactThreshold, generatedKind, routeTurn, routeText, skipReason, type RouteInput } from '@shared/usageSaver'

const later = { firstTurn: false, permissionMode: 'default' as const, hackforgeLean: true }
const first = { ...later, firstTurn: true }
const kind = (p: string, o = later) => classifyPrompt(p, o).kind

describe('Usage saver: what a message asks for', () => {
  it('sends judgement work to Opus', () => {
    expect(kind('Plan how we add offline support')).toBe('think')
    expect(kind('Which approach is better for sync, websockets or polling?')).toBe('think')
    expect(kind('Debug why login fails on Safari')).toBe('think')
    expect(kind('Why does the build take 4 minutes?')).toBe('think')
    expect(kind('Review the payment code for problems')).toBe('think')
    expect(kind('Refactor the store into slices')).toBe('think')
    expect(kind('Make the search faster, performance is bad')).toBe('think')
    expect(kind('Suunnittele tietokannan rakenne')).toBe('think')
  })

  it('sends agreed and routine work to Sonnet', () => {
    expect(kind('yes')).toBe('build')
    expect(kind('ok go ahead')).toBe('build')
    expect(kind('Yes, go with the plan')).toBe('build')
    expect(kind('Looks good, the plan is approved')).toBe('build')
    expect(kind('kyllä, jatka')).toBe('build')
    expect(kind('run the tests')).toBe('build')
    expect(kind('Now commit and push')).toBe('build')
    expect(kind('rename getUser to fetchUser')).toBe('build')
    expect(kind('add a test for the empty cart')).toBe('build')
    expect(kind('make the header blue')).toBe('build')
  })

  it('still sends a design question to Opus when it starts with "ok"', () => {
    expect(kind('ok now design the database schema')).toBe('think')
  })

  it('reads "yes, and now <a big new thing>" as a new request, not agreement', () => {
    expect(kind('yes, and then implement team workspaces with invitations, roles and per-project permissions')).toBe('keep')
    expect(kind('next, implement the payment flow with Stripe checkout and webhooks')).toBe('keep')
    expect(kind('start a new feature: user accounts with OAuth and email verification')).toBe('keep')
  })

  it('escalates when something did not work, and keeps the details', () => {
    for (const p of ['It still doesn’t work', 'still failing with the same error', 'the page doesn’t load', 'TypeError: cannot read properties of undefined', 'ei toimi vieläkään']) {
      expect(classifyPrompt(p, later), p).toMatchObject({ kind: 'think', escalation: true })
    }
    // On the first message it's simply debugging: nothing to keep yet.
    expect(classifyPrompt('My app crashes on start', first)).toMatchObject({ kind: 'think' })
    expect(classifyPrompt('My app crashes on start', first).escalation).toBeUndefined()
  })

  it('treats big requests as needing Opus to set the approach', () => {
    expect(kind('x'.repeat(320), first)).toBe('think')
    expect(kind('Add a settings page with a theme toggle', first)).toBe('build')
    expect(kind('one\ntwo\nthree\nfour\nfive')).toBe('think')
  })

  it('keeps the current model for an unclear follow-up', () => {
    expect(kind('Use the same colors as the landing page for the cards and the footer')).toBe('keep')
  })

  it('handles plan mode, commands and HackForge', () => {
    expect(classifyPrompt('add a button', { ...later, permissionMode: 'plan' }).kind).toBe('think')
    expect(classifyPrompt('/compact', later)).toMatchObject({ passthrough: true })
    expect(classifyPrompt('/hackforge:run --auto', later).kind).toBe('build')
    expect(classifyPrompt('/hackforge:run --auto', { ...later, hackforgeLean: false }).kind).toBe('think')
    expect(classifyPrompt('/hackforge:status', { ...later, hackforgeLean: false }).kind).toBe('build')
  })
})

describe('Usage saver: the model for the next turn', () => {
  const base: RouteInput = { prompt: '', current: 'sonnet', firstTurn: false, permissionMode: 'default', contextTokens: 20_000, contextWindow: 200_000, opusAvailable: true, hackforgeLean: true }

  it('moves up to Opus at any size, but down to Sonnet only while the conversation is short', () => {
    expect(routeTurn({ ...base, prompt: 'debug the crash', contextTokens: 180_000 })).toMatchObject({ model: 'opus' })
    expect(routeTurn({ ...base, current: 'opus', prompt: 'yes' })).toMatchObject({ model: 'sonnet', kind: 'build' })
    const held = routeTurn({ ...base, current: 'opus', prompt: 'yes', contextTokens: 120_000 })
    expect(held).toMatchObject({ model: 'opus', held: true })
    expect(routeText(held, 120_000)).toMatch(/re-read the whole 120k-token conversation/)
  })

  it('keeps the model it is on for an unclear follow-up', () => {
    const p = 'Use the same colors as the landing page for the cards and the footer'
    expect(routeTurn({ ...base, current: 'opus', prompt: p }).model).toBe('opus')
    expect(routeTurn({ ...base, current: 'sonnet', prompt: p }).model).toBe('sonnet')
  })

  it('stays on Sonnet when Opus is not available', () => {
    expect(routeTurn({ ...base, prompt: 'plan the release', opusAvailable: false })).toMatchObject({ model: 'sonnet' })
  })

  it('compacts at half the window, at most 100k tokens', () => {
    expect(compactThreshold(200_000)).toBe(100_000)
    expect(compactThreshold(1_000_000)).toBe(100_000)
    expect(compactThreshold(120_000)).toBe(60_000)
  })
})

describe('Usage saver: generated files', () => {
  it('recognises lockfiles, bundles, maps and build output', () => {
    expect(generatedKind('package-lock.json')).toBe('lockfile')
    expect(generatedKind('apps/web/pnpm-lock.yaml')).toBe('lockfile')
    expect(generatedKind('public/vendor/chart.min.js')).toBe('minified file')
    expect(generatedKind('assets/app.js.map')).toBe('source map')
    expect(generatedKind('dist/index.js')).toBe('build output')
    expect(generatedKind('apps\\web\\.next\\server\\page.js')).toBe('build output')
  })

  it('leaves source alone', () => {
    expect(generatedKind('src/build.ts')).toBeNull()
    expect(generatedKind('node_modules/react/index.js')).toBeNull()
    expect(generatedKind('README.md')).toBeNull()
  })

  it('tells Claude how to get what it needs', () => {
    expect(skipReason('package-lock.json', 'lockfile', 210_000)).toMatch(/205 KB.*Grep.*offset and limit/)
  })
})
