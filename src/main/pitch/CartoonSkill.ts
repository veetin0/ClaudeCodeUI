import { existsSync, readFileSync } from 'node:fs'
import { mkdir, rename, rm, writeFile } from 'node:fs/promises'
import { join } from 'node:path'
import type { CartoonSkillState } from '@shared/pitch'
import { spawnTool } from '../system/proc'

/**
 * The cartoon short skill (github.com/mromidev/claude-animated-shorts, MIT): 2D characters in a 3D
 * world, rendered with three.js inside Remotion. Not bundled with Harness: it's fetched at a pinned
 * commit when a team picks "Cartoon short" on the Pitch tab, wrapped as a plugin, and given to new
 * sessions. Its folder of reference contact sheets (1,200 frames from someone else's channel, for
 * style study only) is left out; the few reference frames it ships stay on this computer.
 */
export const CARTOON_SKILL = {
  name: 'cartoon-3d-short',
  repo: 'https://github.com/mromidev/claude-animated-shorts',
  commit: 'e3b817b6afc6cd413466d43f11ba31209e034bbf',
} as const

export type Run = (cmd: string, args: string[], cwd: string) => Promise<{ code: number; output: string }>

export interface CartoonSkillDeps {
  /** Where downloaded skills live (userData/skills). */
  dir: string
  onChange(): void
  run?: Run
}

const defaultRun: Run = (cmd, args, cwd) =>
  new Promise((resolve) => {
    let output = ''
    const child = spawnTool(cmd, args, { cwd, env: { ...process.env, GIT_TERMINAL_PROMPT: '0' } })
    child.stdout?.on('data', (d) => (output = (output + String(d)).slice(-4000)))
    child.stderr?.on('data', (d) => (output = (output + String(d)).slice(-4000)))
    child.on('error', (err) => resolve({ code: -1, output: err.message }))
    child.on('close', (code) => resolve({ code: code ?? -1, output }))
  })

export class CartoonSkill {
  private installing?: Promise<void>
  private error?: string

  constructor(private readonly deps: CartoonSkillDeps) {}

  /** The plugin folder (its .claude-plugin/plugin.json names the skill). */
  get root(): string {
    return join(this.deps.dir, `${CARTOON_SKILL.name}@${CARTOON_SKILL.commit.slice(0, 7)}`)
  }

  private ready(): boolean {
    try {
      return (
        readFileSync(join(this.root, '.harness-ready'), 'utf8').trim() === CARTOON_SKILL.commit &&
        existsSync(join(this.root, 'skills', CARTOON_SKILL.name, 'SKILL.md'))
      )
    } catch {
      return false
    }
  }

  state(): CartoonSkillState {
    if (this.installing) return { status: 'installing' }
    if (this.ready()) return { status: 'ready' }
    return this.error ? { status: 'error', error: this.error } : { status: 'missing' }
  }

  /** The plugin for new sessions, once it's downloaded. */
  plugin(): { type: 'local'; path: string } | undefined {
    return this.ready() ? { type: 'local', path: this.root } : undefined
  }

  /** Downloads the skill (once; later calls wait for the same download). */
  install(): Promise<CartoonSkillState> {
    if (this.ready()) return Promise.resolve(this.state())
    this.installing ??= this.fetch()
      .then(() => {
        this.error = undefined
      })
      .catch((err: unknown) => {
        this.error = err instanceof Error ? err.message : String(err)
      })
      .finally(() => {
        this.installing = undefined
        this.deps.onChange()
      })
    this.deps.onChange()
    return this.installing.then(() => this.state())
  }

  private async fetch() {
    const run = this.deps.run ?? defaultRun
    const partial = `${this.root}.partial`
    const skill = join(partial, 'skills', CARTOON_SKILL.name)
    await rm(partial, { recursive: true, force: true })
    await mkdir(skill, { recursive: true })
    const git = async (...args: string[]) => {
      const r = await run('git', args, skill)
      if (r.code !== 0) {
        const why = r.code === -1 ? 'git isn’t installed' : r.output.trim().split('\n').slice(-2).join(' ')
        throw new Error(`Couldn’t download the cartoon short skill from GitHub: ${why}`)
      }
    }
    await git('init', '-q')
    await git('remote', 'add', 'origin', CARTOON_SKILL.repo)
    // Everything but the 1,200-frame reference contact sheets.
    await git('sparse-checkout', 'set', '--no-cone', '/*', '!/references/sheets/')
    await git('fetch', '-q', '--depth', '1', 'origin', CARTOON_SKILL.commit)
    await git('checkout', '-q', 'FETCH_HEAD')
    if (!existsSync(join(skill, 'SKILL.md'))) throw new Error('The cartoon short skill downloaded without its SKILL.md.')
    await mkdir(join(partial, '.claude-plugin'), { recursive: true })
    await writeFile(
      join(partial, '.claude-plugin', 'plugin.json'),
      JSON.stringify(
        {
          name: CARTOON_SKILL.name,
          version: CARTOON_SKILL.commit.slice(0, 7),
          description: 'Cartoon 3D story shorts with three.js inside Remotion (by mromidev, MIT). Downloaded by Harness when a team picks a cartoon pitch video.',
          author: { name: 'mromidev' },
          homepage: CARTOON_SKILL.repo,
          license: 'MIT',
          skills: './skills/',
        },
        null,
        2,
      ) + '\n',
    )
    await writeFile(join(partial, '.harness-ready'), CARTOON_SKILL.commit + '\n')
    await rm(this.root, { recursive: true, force: true })
    await rename(partial, this.root)
  }
}
