import { describe, expect, it } from 'vitest'
import { buildTree, relPath } from '../src/renderer/src/features/files/tree'
import { layoutTree, packRows, tickStep } from '../src/renderer/src/features/mission/layout'
import type { ToolCall } from '../src/renderer/src/stores/reducer'
import { reduceAll } from './replay'

describe('file tree', () => {
  it('nests files, lists folders first and adds touched files outside git', () => {
    const t = buildTree(['src/b.ts', 'src/a/x.ts', 'README.md'], ['/p/src/new.ts', '/p/README.md', '/etc/hosts'], '/p')
    expect(t.children.map((c) => c.name)).toEqual(['(outside project)', 'src', 'README.md'])
    const src = t.children.find((c) => c.name === 'src')!
    expect(src.children.map((c) => c.name)).toEqual(['a', 'b.ts', 'new.ts'])
    expect(relPath('/p/src/b.ts', '/p')).toBe('src/b.ts')
  })
})

describe('graph and timeline layout', () => {
  it('centres parents over their children', () => {
    const pos = layoutTree([
      { key: 'main', parent: null },
      { key: 'a', parent: 'main' },
      { key: 'b', parent: 'main' },
      { key: 'c', parent: 'b' },
    ])
    const at = (k: string) => pos.find((p) => p.key === k)!
    expect(at('main').x).toBe((at('a').x + at('b').x) / 2)
    expect(at('c').y).toBeGreaterThan(at('b').y)
  })

  it('stacks overlapping tool calls into separate rows', () => {
    const t = (id: string, startedAt: number, endedAt?: number) => ({ id, startedAt, endedAt }) as ToolCall
    const rows = packRows([t('1', 0, 10), t('2', 5, 15), t('3', 12, 20)], 100)
    expect([rows.get('1'), rows.get('2'), rows.get('3')]).toEqual([0, 1, 0])
  })

  it('picks readable tick steps', () => {
    expect(tickStep(10_000)).toBe(2000)
    expect(tickStep(10 * 60_000)).toBe(120_000)
  })
})

describe('reducer: file activity', () => {
  const base = { sessionId: 's1' } as const
  it('counts reads and writes per file and ignores the watcher echo of an edit', () => {
    const s = reduceAll([
      { ...base, ts: 1000, type: 'tool.start', toolUseId: 'r', agentId: null, name: 'Read', input: { file_path: '/p/a.ts' } },
      { ...base, ts: 2000, type: 'tool.start', toolUseId: 'w', agentId: 'sub', name: 'Edit', input: { file_path: '/p/a.ts' } },
      { ...base, ts: 2500, type: 'file.change', path: '/p/a.ts', change: 'modified' },
      { ...base, ts: 9000, type: 'file.change', path: '/p/b.ts', change: 'created' },
      { ...base, ts: 9500, type: 'changes.updated', files: [{ path: '/p/a.ts', status: 'modified', additions: 1, deletions: 0 }] },
    ])
    expect(s.files['/p/a.ts']).toMatchObject({ reads: 1, writes: 1, diskChanges: 0, lastKind: 'write', agents: ['main', 'sub'] })
    expect(s.files['/p/b.ts']).toMatchObject({ diskChanges: 1, lastKind: 'disk' })
    expect(s.changes).toHaveLength(1)
  })
})
