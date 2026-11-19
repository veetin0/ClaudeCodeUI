#!/usr/bin/env node
// Copies ECC (https://github.com/affaan-m/ECC, MIT) into resources/ecc, the copy Harness ships and
// loads into every session as a Claude Code plugin.
//   git clone --depth 1 https://github.com/affaan-m/ECC ~/src/ecc
//   npm run ecc:sync -- ~/src/ecc
// Only what Claude Code uses is copied (agents, skills, commands, hooks and the scripts they run, rules,
// contexts, the MCP catalog); docs, images and other tools' configs stay out. The packages the hook
// scripts require are installed next to them, because hooks run with the system's node from disk.
import { execFileSync } from 'node:child_process'
import { cpSync, existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { basename, join, resolve } from 'node:path'

const arg = process.argv[2]
if (!arg) {
  console.error('usage: npm run ecc:sync -- <path to an ECC checkout>')
  process.exit(2)
}
const home = process.env.HOME || process.env.USERPROFILE || ''
const src = resolve(arg.replace(/^~(?=$|[\\/])/, home))
const manifestPath = join(src, '.claude-plugin', 'plugin.json')
if (!existsSync(manifestPath)) {
  console.error(`No ECC plugin at ${src} (missing .claude-plugin/plugin.json)`)
  process.exit(1)
}
const manifest = JSON.parse(readFileSync(manifestPath, 'utf8'))
if (manifest.name !== 'ecc') {
  console.error(`${manifestPath} is the "${manifest.name}" plugin, not ecc`)
  process.exit(1)
}

const dest = resolve(import.meta.dirname, '..', 'resources', 'ecc')
const PARTS = ['.claude-plugin', 'agents', 'skills', 'commands', 'hooks', 'scripts', 'rules', 'contexts', 'mcp-configs', 'LICENSE', 'VERSION']
const SKIP = new Set(['.DS_Store', '.git', 'node_modules', '__pycache__', '.pytest_cache', '.venv'])
rmSync(dest, { recursive: true, force: true })
mkdirSync(dest, { recursive: true })
for (const part of PARTS) {
  const from = join(src, part)
  if (!existsSync(from)) continue
  cpSync(from, join(dest, part), { recursive: true, filter: (p) => !SKIP.has(basename(p)) && !p.endsWith('.pyc') })
}

// The hook scripts' own requirements (sql.js is only for ECC's CLI state store, which hooks don't load).
const pkg = JSON.parse(readFileSync(join(src, 'package.json'), 'utf8'))
const NEEDED = ['js-yaml', 'ajv', '@iarna/toml']
const dependencies = Object.fromEntries(NEEDED.map((n) => [n, pkg.dependencies?.[n] ?? 'latest']))
writeFileSync(
  join(dest, 'package.json'),
  JSON.stringify({ name: 'ecc-harness-bundle', version: manifest.version, private: true, license: 'MIT', dependencies }, null, 2) + '\n',
)
execFileSync('npm', ['install', '--omit=dev', '--ignore-scripts', '--no-audit', '--no-fund', '--no-package-lock'], {
  cwd: dest,
  stdio: 'inherit',
  shell: process.platform === 'win32',
})

let commit = ''
try {
  commit = execFileSync('git', ['-C', src, 'rev-parse', 'HEAD'], { encoding: 'utf8' }).trim()
} catch {
  // a copy without git history
}
writeFileSync(
  join(dest, 'HARNESS_SOURCE.json'),
  JSON.stringify({ repository: 'https://github.com/affaan-m/ECC', version: manifest.version, commit, license: 'MIT' }, null, 2) + '\n',
)
console.log(`ECC ${manifest.version}${commit ? ` (${commit.slice(0, 7)})` : ''} → resources/ecc`)
