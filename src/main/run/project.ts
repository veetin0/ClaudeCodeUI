import { cpSync, existsSync, mkdirSync, readdirSync, readFileSync, realpathSync, statSync, writeFileSync } from 'node:fs'
import { readdir, readFile } from 'node:fs/promises'
import { basename, join } from 'node:path'
import { pickContract, type ClaudePlan, type Contract, type FileKind } from '@shared/run'
import { git } from '../crew/git'
import { spawnTool } from '../system/proc'

export const CHALLENGE_FILE = join('challenge', 'brief', 'CHALLENGE.md')
const BRIEF_DIR = join('challenge', 'brief')
const ASSETS_DIR = join('challenge', 'assets')
export const PRIVATE_DIR = 'private'

/** "My App!" → "my-app" (a folder and repository name). */
export const projectSlug = (name: string) =>
  name
    .normalize('NFKD')
    .replace(/[^\w\s-]/g, '')
    .trim()
    .toLowerCase()
    .replace(/[\s_]+/g, '-')
    .slice(0, 60) || 'hackathon-project'

const CHALLENGE_TEMPLATE = `# The challenge

<!-- Paste everything about the challenge here: the brief, the rules, how it's judged, the deadline,
     links. Or drop the organisers' files (PDFs, docs, screenshots) next to this file. -->
`

function hackforgeYaml(o: { name: string; deadline?: string; plan: ClaudePlan; team: number }, now: number): string {
  const hours = o.deadline ? Math.max(1, Math.round((Date.parse(o.deadline) - now) / 3_600_000)) : 24
  return `# HackForge configuration, written by Harness's team run. Every field is optional.

challenge: ${JSON.stringify(o.name)}
deadline: ${JSON.stringify(o.deadline ?? '')}
hours: ${hours}
team: ${o.team}

# pro → lean profile: Sonnet for most work, never Fable.
plan: ${o.plan}
fable_ok: false
profile: auto

loop:
  enabled: true
  reserve_minutes: 90
  plateau: 3

# Harness asks the lead once, when the plan is ready (the Plan step).
checkpoints: [plan]

modalities: suggest
allow: []
forbid: []
stack_preferences: []
`
}

const GITIGNORE = `# Secrets
.env
.env.*
!.env.example
# Files Claude must not read (Harness → Setup → Private files)
${PRIVATE_DIR}/
# Tooling
node_modules/
.venv/
__pycache__/
*.blend1
renders/cache/
# HackForge per-machine files
.hackforge/LOOP.json
.hackforge/STOP_LOOP
.hackforge/.gate-*
.hackforge/.guard-errors.log
.hackforge/RESUME.md
.hackforge/evidence/
evals/results/
.DS_Store
`

/** Commits everything (nothing to commit: no commit). */
async function commitAll(dir: string, message: string, author = 'Harness'): Promise<void> {
  await git(['add', '-A'], { cwd: dir, timeout: 120_000 })
  const head = (await git(['rev-parse', '--verify', '--quiet', 'HEAD'], { cwd: dir })).out
  if (head && !(await git(['status', '--porcelain'], { cwd: dir })).out) return
  const env: Record<string, string> = {}
  if (!(await git(['config', 'user.name'], { cwd: dir })).out) Object.assign(env, { GIT_AUTHOR_NAME: author, GIT_COMMITTER_NAME: author })
  if (!(await git(['config', 'user.email'], { cwd: dir })).out)
    Object.assign(env, { GIT_AUTHOR_EMAIL: 'harness@localhost', GIT_COMMITTER_EMAIL: 'harness@localhost' })
  await git(['commit', '-q', '-m', message, '--allow-empty'], { cwd: dir, env })
}
export { commitAll }

/**
 * A new hackathon project: the folder, a git repository on main, HackForge's challenge/ input
 * (one file for the challenge, one folder for everything else) and its settings.
 */
export async function createProject(o: {
  name: string
  parent: string
  deadline?: string
  plan: ClaudePlan
  team: number
  author?: string
  now?: number
}): Promise<string> {
  const dir = join(o.parent, projectSlug(o.name))
  if (existsSync(dir) && readdirSync(dir).length) throw new Error(`${dir} already exists and isn't empty. Pick another name or folder.`)
  mkdirSync(join(dir, BRIEF_DIR), { recursive: true })
  mkdirSync(join(dir, ASSETS_DIR), { recursive: true })
  const r = await git(['init', '-q', '-b', 'main'], { cwd: dir })
  if (r.code !== 0) throw new Error(`git isn't working on this computer: ${r.err || r.out}`)
  writeFileSync(join(dir, CHALLENGE_FILE), CHALLENGE_TEMPLATE)
  writeFileSync(join(dir, ASSETS_DIR, 'README.md'), '# Files\n\nData, assets, brand kits, anything to build with. Claude reads everything here.\n')
  writeFileSync(join(dir, 'challenge', 'hackforge.yaml'), hackforgeYaml(o, o.now ?? Date.now()))
  writeFileSync(join(dir, '.gitignore'), GITIGNORE)
  writeFileSync(join(dir, '.gitattributes'), '* text=auto\n*.sh text eol=lf\n*.py text eol=lf\n')
  writeFileSync(join(dir, 'README.md'), `# ${o.name}\n`)
  await commitAll(dir, `Start ${o.name}`, o.author)
  return dir
}

/**
 * An existing folder made ready for a team run: a git repository with at least one commit, the
 * challenge/ input folders, HackForge settings (kept if there are some) and private/ kept out of git.
 */
export async function prepareProject(
  dir: string,
  o: { name: string; deadline?: string; plan: ClaudePlan; team: number; author?: string; now?: number },
): Promise<void> {
  if (!existsSync(dir)) throw new Error(`${dir} doesn't exist.`)
  // Its own repository, even inside another one (a folder in a home directory kept in git).
  const top = (await git(['rev-parse', '--show-toplevel'], { cwd: dir })).out
  if (!top || realpathSync(top) !== realpathSync(dir)) {
    const r = await git(['init', '-q', '-b', 'main'], { cwd: dir })
    if (r.code !== 0) throw new Error(`git isn't working on this computer: ${r.err || r.out}`)
  }
  mkdirSync(join(dir, BRIEF_DIR), { recursive: true })
  mkdirSync(join(dir, ASSETS_DIR), { recursive: true })
  if (!existsSync(join(dir, CHALLENGE_FILE)) && !listFiles(dir).challenge.length) writeFileSync(join(dir, CHALLENGE_FILE), CHALLENGE_TEMPLATE)
  if (!existsSync(join(dir, 'challenge', 'hackforge.yaml'))) writeFileSync(join(dir, 'challenge', 'hackforge.yaml'), hackforgeYaml(o, o.now ?? Date.now()))
  const gi = join(dir, '.gitignore')
  const ignore = existsSync(gi) ? readFileSync(gi, 'utf8') : ''
  if (!ignore.split('\n').some((l) => l.trim() === `${PRIVATE_DIR}/`))
    writeFileSync(
      gi,
      `${ignore}${ignore && !ignore.endsWith('\n') ? '\n' : ''}# Files Claude must not read (Harness → Setup → Private files)\n${PRIVATE_DIR}/\n`,
    )
  const head = (await git(['rev-parse', '--verify', '--quiet', 'HEAD'], { cwd: dir })).out
  const dirty = (await git(['status', '--porcelain'], { cwd: dir })).out
  if (!head || dirty) await commitAll(dir, head ? 'Prepare for a Harness team run' : `Start ${o.name}`, o.author)
}

/** Whether the challenge has anything in it yet (text beyond the template, or files). */
export function hasChallenge(dir: string): boolean {
  const text = readChallenge(dir)
    .replace(/<!--[\s\S]*?-->/g, '')
    .replace(/^# The challenge\s*/m, '')
    .trim()
  return !!text || listFiles(dir).challenge.length > 0
}

export function readChallenge(dir: string): string {
  try {
    return readFileSync(join(dir, CHALLENGE_FILE), 'utf8')
  } catch {
    return ''
  }
}

export function writeChallenge(dir: string, text: string) {
  mkdirSync(join(dir, BRIEF_DIR), { recursive: true })
  writeFileSync(join(dir, CHALLENGE_FILE), text)
}

export type { FileKind }

const target = (kind: FileKind) => (kind === 'challenge' ? BRIEF_DIR : kind === 'files' ? ASSETS_DIR : PRIVATE_DIR)

/** Copies dropped files or folders into the project. Private files also get Claude's guard. */
export function addFiles(dir: string, kind: FileKind, paths: string[]): string[] {
  const to = join(dir, target(kind))
  mkdirSync(to, { recursive: true })
  const added: string[] = []
  for (const p of paths) {
    if (!existsSync(p)) continue
    const name = basename(p)
    cpSync(p, join(to, name), { recursive: statSync(p).isDirectory(), force: true })
    added.push(name)
  }
  if (kind === 'private') privateGuard(dir)
  return added
}

/** What's in each drop zone (names only, for the Setup screen). */
export function listFiles(dir: string): Record<FileKind, string[]> {
  const ls = (rel: string, skip: string[] = []) => {
    try {
      return readdirSync(join(dir, rel)).filter((f) => !f.startsWith('.') && !skip.includes(f))
    } catch {
      return []
    }
  }
  return { challenge: ls(BRIEF_DIR, ['CHALLENGE.md']), files: ls(ASSETS_DIR, ['README.md']), private: ls(PRIVATE_DIR) }
}

// ---------- private files: Claude never reads them ----------

const GUARD = String.raw`#!/usr/bin/env python3
"""Keeps private/ away from Claude (a cloud LLM): set up by Harness for files a challenge's terms
say must not be shown to an AI. Blocks reading, searching, printing, copying or uploading them.
Scripts Claude writes may read them, but must print only aggregates (see CLAUDE.md)."""
import json, re, sys

PRIVATE = re.compile(r"(^|[\\/\s'\"=])private([\\/\s'\"]|$)", re.I | re.M)
SHOW = re.compile(
    r"(^|[\s|;&(\`$'\"])(cat|bat|head|tail|less|more|sed|awk|grep|egrep|rg|ag|xxd|od|hexdump|strings|cut|paste|column|jq|"
    r"base64|sort|uniq|nl|tac|ffmpeg|ffplay|open|xdg-open|curl|wget|scp|rsync|nc|cp|mv|ln|zip|tar|gzip|git\s+add|"
    r"python3?\s+-c|python3?\s+-\s|node\s+-e|perl\s+-e|ruby\s+-e)\b", re.I | re.M)
WHY = ("Blocked: files in private/ must not be shown to Claude (the challenge's terms). Work on them through "
       "a script that reads them itself and prints only scores and aggregate counts.")

def deny(reason):
    print(json.dumps({"hookSpecificOutput": {"hookEventName": "PreToolUse", "permissionDecision": "deny", "permissionDecisionReason": reason}}))
    sys.exit(0)

try:
    event = json.load(sys.stdin)
except Exception:
    sys.exit(0)
tool, ti = event.get("tool_name", ""), event.get("tool_input") or {}
if tool == "Bash":
    cmd = str(ti.get("command", ""))
    if PRIVATE.search(cmd) and SHOW.search(cmd):
        deny(WHY)
elif tool in ("Read", "NotebookRead", "NotebookEdit", "Edit", "Write"):
    if PRIVATE.search(str(ti.get("file_path") or ti.get("notebook_path") or "")):
        deny(WHY)
elif tool in ("Grep", "Glob"):
    if PRIVATE.search(" ".join(str(ti.get(k, "")) for k in ("path", "pattern", "glob"))):
        deny(WHY)
`

const GUARD_NOTE = `
## Private files (set up by Harness)

Files in \`private/\` must never be shown to you: the challenge's terms forbid giving them to an AI.
Don't read, search, print, copy or upload them, and don't look at images made from them. Work on
them only through scripts that read them and print scores and aggregate counts. A hook enforces it.
`

/** Permission rules, a hook and a CLAUDE.md note that keep private/ away from Claude. Idempotent. */
export function privateGuard(dir: string) {
  mkdirSync(join(dir, '.claude', 'hooks'), { recursive: true })
  writeFileSync(join(dir, '.claude', 'hooks', 'protect_private.py'), GUARD)
  const settingsPath = join(dir, '.claude', 'settings.json')
  let settings: { permissions?: { deny?: string[] }; hooks?: { PreToolUse?: unknown[] } } = {}
  try {
    settings = JSON.parse(readFileSync(settingsPath, 'utf8'))
  } catch {
    // new
  }
  const deny = new Set(settings.permissions?.deny ?? [])
  for (const r of [`Read(./${PRIVATE_DIR}/**)`, `Edit(./${PRIVATE_DIR}/**)`, `Write(./${PRIVATE_DIR}/**)`]) deny.add(r)
  settings.permissions = { ...settings.permissions, deny: [...deny] }
  const hook = {
    matcher: 'Bash|Read|Grep|Glob|NotebookRead|NotebookEdit|Edit|Write',
    hooks: [{ type: 'command', command: 'python3 "$CLAUDE_PROJECT_DIR/.claude/hooks/protect_private.py"', timeout: 10 }],
  }
  const pre = (settings.hooks?.PreToolUse ?? []).filter((h) => !JSON.stringify(h).includes('protect_private.py'))
  settings.hooks = { ...settings.hooks, PreToolUse: [...pre, hook] }
  writeFileSync(settingsPath, `${JSON.stringify(settings, null, 2)}\n`)
  const claudeMd = join(dir, 'CLAUDE.md')
  const current = existsSync(claudeMd) ? readFileSync(claudeMd, 'utf8') : ''
  if (!current.includes('## Private files (set up by Harness)')) writeFileSync(claudeMd, current + GUARD_NOTE)
}

// ---------- GitHub (only the lead's laptop talks to it) ----------

export type Gh = (args: string[], cwd?: string) => Promise<{ code: number; out: string; err: string }>

/** The GitHub CLI; code -1 when it isn't installed. */
export const ghCli: Gh = (args, cwd) =>
  new Promise((resolve) => {
    const child = spawnTool('gh', args, { cwd, stdio: ['ignore', 'pipe', 'pipe'], env: { ...process.env, GH_PROMPT_DISABLED: '1' } })
    let out = ''
    let err = ''
    child.stdout?.on('data', (d) => (out += d))
    child.stderr?.on('data', (d) => (err += d))
    const timer = setTimeout(() => child.kill(), 180_000)
    child.on('error', (e) => {
      clearTimeout(timer)
      resolve({ code: -1, out, err: e.message })
    })
    child.on('close', (code) => {
      clearTimeout(timer)
      resolve({ code: code ?? -1, out: out.trim(), err: err.trim() })
    })
  })

/** Makes the project's public GitHub repository with the GitHub CLI and pushes it. */
export async function createGithub(dir: string, name: string, gh: Gh): Promise<{ url?: string; problem?: string }> {
  const auth = await gh(['auth', 'status'])
  if (auth.code === -1)
    return {
      problem: 'The GitHub CLI isn’t installed. Install it (brew install gh, or winget install GitHub.cli), sign in with gh auth login, then try again.',
    }
  if (auth.code !== 0) return { problem: 'Sign in to GitHub once in a terminal: gh auth login (GitHub.com, HTTPS, log in with a web browser). Then try again.' }
  const existing = (await git(['remote', 'get-url', 'origin'], { cwd: dir })).out
  if (existing) {
    const push = await git(['push', '-u', 'origin', 'HEAD'], { cwd: dir, timeout: 180_000 })
    return push.code === 0 ? { url: existing.replace(/\.git$/, '') } : { problem: `Couldn't push to ${existing}: ${push.err.split('\n').pop()}` }
  }
  const r = await gh(['repo', 'create', projectSlug(name), '--public', '--source', dir, '--remote', 'origin', '--push'], dir)
  if (r.code !== 0) return { problem: `GitHub said: ${(r.err || r.out).split('\n').filter(Boolean).pop() ?? 'it didn’t work'}` }
  const url =
    /(https:\/\/github\.com\/[^\s]+)/.exec(`${r.out}\n${r.err}`)?.[1] ?? (await git(['remote', 'get-url', 'origin'], { cwd: dir })).out.replace(/\.git$/, '')
  return { url }
}

// ---------- HackForge's milestone contracts ----------

export async function readContracts(dir: string): Promise<Contract[]> {
  const folder = join(dir, '.hackforge', 'contracts')
  const files = (await readdir(folder).catch(() => [] as string[])).filter((f) => /^M\d+\.json$/i.test(f))
  const out: Contract[] = []
  for (const f of files) {
    try {
      const c = pickContract(JSON.parse(await readFile(join(folder, f), 'utf8')))
      if (c) out.push(c)
    } catch {
      // half-written: skip until it parses
    }
  }
  return out.sort((a, b) => Number(a.milestone.slice(1)) - Number(b.milestone.slice(1)))
}
