import { describe, expect, it } from 'vitest'
import { devScripts, findLocalUrls, parseCompositions, parseRenderProgress } from '@shared/preview'

describe('preview parsers', () => {
  it('finds local dev-server URLs and normalises hosts', () => {
    const out = '\x1b[32m  ➜  Local:   http://localhost:5173/\x1b[0m\n  Network: http://192.168.1.4:5173/\nready on http://0.0.0.0:3000.'
    expect(findLocalUrls(out)).toEqual(['http://localhost:5173/', 'http://localhost:3000'])
    expect(findLocalUrls('Server ready - Local: http://localhost:3123, Network: http://192.0.2.2:3123')).toEqual(['http://localhost:3123'])
  })

  it('tracks render phases', () => {
    expect(parseRenderProgress('Bundling 6%\rBundling 65%')).toEqual({ phase: 'bundling', current: 65, total: 100 })
    expect(parseRenderProgress('Rendered 0/60\nRendered 24/60, time remaining: 1s\n')).toEqual({ phase: 'rendering', current: 24, total: 60, etaText: '1s' })
    expect(parseRenderProgress('Encoded 60/60')).toMatchObject({ phase: 'encoding', current: 60 })
    expect(parseRenderProgress('Getting composition')).toBeNull()
  })

  it('parses the compositions table', () => {
    const out = 'Bundled code ━━━ 2546ms\n\nThe following compositions are available:\n\nIntro    30      640x360        60 (2.00 sec)\nOutro    30      1920x1080        30 (1.00 sec)\n'
    expect(parseCompositions(out)).toEqual([
      { id: 'Intro', fps: 30, width: 640, height: 360, durationInFrames: 60 },
      { id: 'Outro', fps: 30, width: 1920, height: 1080, durationInFrames: 30 },
    ])
  })

  it('picks dev-server scripts', () => {
    expect(devScripts({ dev: 'vite', build: 'vite build', test: 'vitest', 'start:docs': 'x', sb: 'storybook dev -p 6006' }).map((s) => s.name)).toEqual(['dev', 'start:docs', 'sb'])
  })
})
