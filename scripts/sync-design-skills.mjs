#!/usr/bin/env node
// Copies the two design plugins Harness ships into resources/design/:
//   npm run design:sync -- --impeccable ~/src/impeccable --uipro ~/src/ui-ux-pro-max-skill
// (clones of github.com/pbakaus/impeccable and github.com/nextlevelbuilder/ui-ux-pro-max-skill; either flag alone works)
// impeccable: its Claude Code plugin folder (plugin/), as published.
// ui-ux-pro-max: only the core ui-ux-pro-max skill; the repo's slides/brand/banner/logo skills overlap
// HackForge's pitch work and are left out.
import { cpSync, existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { basename, join, resolve } from 'node:path'

const home = process.env.HOME || process.env.USERPROFILE || ''
const arg = (flag) => {
  const i = process.argv.indexOf(flag)
  return i > 0 && process.argv[i + 1] ? resolve(process.argv[i + 1].replace(/^~(?=$|[\\/])/, home)) : undefined
}
const impeccable = arg('--impeccable')
const uipro = arg('--uipro')
if (!impeccable && !uipro) {
  console.error('usage: npm run design:sync -- --impeccable <impeccable repo> --uipro <ui-ux-pro-max-skill repo>')
  process.exit(2)
}
const root = resolve(import.meta.dirname, '..', 'resources', 'design')
const SKIP = new Set(['.DS_Store', '.git', 'node_modules', '__pycache__', 'tests', '.grok-plugin'])
const copy = (from, to) => cpSync(from, to, { recursive: true, filter: (p) => !SKIP.has(basename(p)) && !p.endsWith('.pyc') })
const version = (dir) => JSON.parse(readFileSync(join(dir, '.claude-plugin', 'plugin.json'), 'utf8')).version

if (impeccable) {
  const src = join(impeccable, 'plugin')
  if (!existsSync(join(src, '.claude-plugin', 'plugin.json'))) throw new Error(`${src} is not impeccable's plugin folder`)
  const dest = join(root, 'impeccable')
  rmSync(dest, { recursive: true, force: true })
  copy(src, dest)
  for (const f of ['LICENSE', 'NOTICE.md']) if (existsSync(join(impeccable, f))) cpSync(join(impeccable, f), join(dest, f))
  console.log(`impeccable ${version(dest)} → resources/design/impeccable`)
}

if (uipro) {
  const skill = join(uipro, '.claude', 'skills', 'ui-ux-pro-max')
  if (!existsSync(join(skill, 'SKILL.md'))) throw new Error(`${skill} has no SKILL.md`)
  const dest = join(root, 'ui-ux-pro-max')
  rmSync(dest, { recursive: true, force: true })
  mkdirSync(join(dest, '.claude-plugin'), { recursive: true })
  // Same layout as the original plugin, so the skill's ${CLAUDE_PLUGIN_ROOT}/.claude/skills/... paths still resolve.
  copy(skill, join(dest, '.claude', 'skills', 'ui-ux-pro-max'))
  const manifest = JSON.parse(readFileSync(join(uipro, '.claude-plugin', 'plugin.json'), 'utf8'))
  writeFileSync(join(dest, '.claude-plugin', 'plugin.json'), JSON.stringify({ ...manifest, skills: './.claude/skills/' }, null, 2) + '\n')
  cpSync(join(uipro, 'LICENSE'), join(dest, 'LICENSE'))
  console.log(`ui-ux-pro-max ${manifest.version} → resources/design/ui-ux-pro-max`)
}
