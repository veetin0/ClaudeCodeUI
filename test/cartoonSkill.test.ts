import { existsSync, mkdirSync, mkdtempSync, readFileSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import { CARTOON_SKILL, CartoonSkill, type Run } from '../src/main/pitch/CartoonSkill'
import { bundledPlugin } from '../src/main/hackforge/plugin'

describe('cartoon short skill', () => {
  it('fetches the pinned commit without the reference sheets and wraps it as a plugin', async () => {
    const calls: string[] = []
    let changes = 0
    // Pretend git: the checkout writes the skill's files.
    const run: Run = async (cmd, args, cwd) => {
      calls.push(`${cmd} ${args.join(' ')}`)
      if (args[0] === 'checkout') {
        writeFileSync(join(cwd, 'SKILL.md'), '---\nname: cartoon-3d-short\n---\n')
        mkdirSync(join(cwd, 'templates', 'bridge'), { recursive: true })
      }
      return { code: 0, output: '' }
    }
    const skill = new CartoonSkill({ dir: mkdtempSync(join(tmpdir(), 'skills-')), onChange: () => changes++, run })
    expect(skill.state()).toEqual({ status: 'missing' })
    expect(skill.plugin()).toBeUndefined()
    const pending = skill.install()
    expect(skill.state()).toEqual({ status: 'installing' })
    expect(await pending).toEqual({ status: 'ready' })
    expect(calls).toEqual([
      'git init -q',
      `git remote add origin ${CARTOON_SKILL.repo}`,
      'git sparse-checkout set --no-cone /* !/references/sheets/',
      `git fetch -q --depth 1 origin ${CARTOON_SKILL.commit}`,
      'git checkout -q FETCH_HEAD',
    ])
    expect(changes).toBeGreaterThanOrEqual(2)
    const plugin = skill.plugin()!
    expect(bundledPlugin(plugin.path, 'cartoon-3d-short')).toMatchObject({ path: plugin.path })
    expect(JSON.parse(readFileSync(join(plugin.path, '.claude-plugin', 'plugin.json'), 'utf8'))).toMatchObject({ skills: './skills/', license: 'MIT' })
    expect(existsSync(join(plugin.path, 'skills', 'cartoon-3d-short', 'SKILL.md'))).toBe(true)
    // Already there: no second download.
    await skill.install()
    expect(calls).toHaveLength(5)
  })

  it('says why when GitHub can’t be reached, and can try again', async () => {
    let fail = true
    const run: Run = async (_cmd, args, cwd) => {
      if (args[0] === 'fetch' && fail) return { code: 128, output: 'fatal: unable to access github.com: Could not resolve host' }
      if (args[0] === 'checkout') writeFileSync(join(cwd, 'SKILL.md'), 'x')
      return { code: 0, output: '' }
    }
    const skill = new CartoonSkill({ dir: mkdtempSync(join(tmpdir(), 'skills-')), onChange: () => {}, run })
    const s = await skill.install()
    expect(s.status).toBe('error')
    expect(s.error).toMatch(/Couldn’t download the cartoon short skill from GitHub: .*Could not resolve host/)
    fail = false
    expect(await skill.install()).toEqual({ status: 'ready' })
  })
})
