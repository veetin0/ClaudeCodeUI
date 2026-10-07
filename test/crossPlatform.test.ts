import { describe, expect, it } from 'vitest'
import { baseName, normPath, relTo } from '@shared/paths'
import { shortcut } from '../src/renderer/src/lib/keys'
import { quoteWin } from '../src/main/system/proc'
import { buildTree, relPath } from '../src/renderer/src/features/files/tree'

describe('paths across macOS and Windows', () => {
  it('normalises Windows spellings of one file to one key', () => {
    for (const p of ['C:\\proj\\src\\a.ts', 'c:\\proj\\src\\a.ts', 'C:/proj/src/a.ts', 'c:/proj\\src/a.ts']) expect(normPath(p)).toBe('C:/proj/src/a.ts')
    expect(normPath('/Users/me/proj/a.ts')).toBe('/Users/me/proj/a.ts')
  })

  it('relativises case-insensitively on Windows, case-sensitively on macOS', () => {
    expect(relTo('c:\\Proj\\src\\a.ts', 'C:\\proj')).toBe('src/a.ts')
    expect(relTo('C:\\proj2\\a.ts', 'C:\\proj')).toBeNull()
    expect(relTo('/Users/me/proj/src/a.ts', '/Users/me/proj/')).toBe('src/a.ts')
    expect(relTo('/Users/me/Proj/a.ts', '/Users/me/proj')).toBeNull()
    expect(baseName('C:\\proj\\src\\a.ts')).toBe('a.ts')
  })

  it('merges git-listed and agent-touched files into one tree entry on Windows', () => {
    const tree = buildTree(['src/a.ts'], ['C:/proj/src/a.ts', 'C:/proj/src/new.ts', 'D:/other/x.ts'], 'C:\\proj')
    const src = tree.children.find((c) => c.name === 'src')!
    expect(src.children.map((c) => c.name)).toEqual(['a.ts', 'new.ts'])
    expect(relPath('C:/proj/src/new.ts', 'C:\\proj')).toBe('src/new.ts')
  })
})

describe('shortcut labels', () => {
  it('stay macOS-style on a Mac and become Ctrl+… elsewhere', () => {
    expect(shortcut('Terminal (⌘J)', true)).toBe('Terminal (⌘J)')
    expect(shortcut('Terminal (⌘J)', false)).toBe('Terminal (Ctrl+J)')
    expect(shortcut('⇧⌘T', false)).toBe('Ctrl+Shift+T')
    expect(shortcut('Run ⌘⏎', false)).toBe('Run Ctrl+Enter')
    expect(shortcut('Focus mode (⌘\\)', false)).toBe('Focus mode (Ctrl+\\)')
  })
})

describe('Windows command quoting', () => {
  it('quotes only what needs it', () => {
    expect(quoteWin('render')).toBe('render')
    expect(quoteWin('C:\\Users\\me\\proj\\out\\Pitch.mp4')).toBe('C:\\Users\\me\\proj\\out\\Pitch.mp4')
    expect(quoteWin('C:\\Users\\Mia Virtanen\\out.mp4')).toBe('"C:\\Users\\Mia Virtanen\\out.mp4"')
    expect(quoteWin('say "hi"')).toBe('"say ""hi"""')
    expect(quoteWin('a&b')).toBe('"a&b"')
  })
})
