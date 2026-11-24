import { describe, expect, it } from 'vitest'
import { MAX_OPEN_PROMPT, parseOpenUrl } from '@shared/openRequest'

const roots = ['/Users/me/Projects']
const link = (dir: string, prompt = 'build it') => `harness://open?dir=${encodeURIComponent(dir)}&prompt=${encodeURIComponent(prompt)}`

describe('parseOpenUrl', () => {
  it('accepts a folder inside a root and keeps the prompt as written', () => {
    expect(parseOpenUrl(link('/Users/me/Projects/habit-tracker', 'Make a habit tracker\nwith streaks'), roots)).toEqual({
      dir: '/Users/me/Projects/habit-tracker',
      prompt: 'Make a habit tracker\nwith streaks',
    })
  })
  it('refuses folders outside the roots, the root itself and .. escapes', () => {
    expect(parseOpenUrl(link('/Users/me'), roots)).toBeNull()
    expect(parseOpenUrl(link('/Users/me/Projects'), roots)).toBeNull()
    expect(parseOpenUrl(link('/Users/me/Projects/../Documents'), roots)).toBeNull()
    expect(parseOpenUrl(link('/Users/me/ProjectsEvil/x'), roots)).toBeNull()
    expect(parseOpenUrl(link('relative/dir'), roots)).toBeNull()
  })
  it('refuses other schemes, other actions, a missing dir and a huge prompt', () => {
    expect(parseOpenUrl('https://open?dir=/Users/me/Projects/x', roots)).toBeNull()
    expect(parseOpenUrl('harness://delete?dir=/Users/me/Projects/x', roots)).toBeNull()
    expect(parseOpenUrl('harness://open?prompt=hi', roots)).toBeNull()
    expect(parseOpenUrl(link('/Users/me/Projects/x', 'a'.repeat(MAX_OPEN_PROMPT + 1)), roots)).toBeNull()
    expect(parseOpenUrl('not a url', roots)).toBeNull()
  })
})
