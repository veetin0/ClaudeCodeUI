#!/usr/bin/env node
// Copies a HackForge plugin into resources/hackforge, the copy Harness ships and loads into sessions.
//   npm run hackforge:sync -- ~/Desktop/hackforge-marketplace     (the marketplace folder)
//   npm run hackforge:sync -- ~/Desktop/hackforge-marketplace/hackforge   (or the plugin folder itself)
import { cpSync, existsSync, readFileSync, rmSync } from 'node:fs'
import { basename, join, resolve } from 'node:path'

const arg = process.argv[2]
if (!arg) {
  console.error('usage: npm run hackforge:sync -- <path to hackforge-marketplace or its hackforge/ folder>')
  process.exit(2)
}
const home = process.env.HOME || process.env.USERPROFILE || ''
let src = resolve(arg.replace(/^~(?=$|[\\/])/, home))
if (!existsSync(join(src, '.claude-plugin', 'plugin.json')) && existsSync(join(src, 'hackforge', '.claude-plugin', 'plugin.json'))) src = join(src, 'hackforge')
const manifest = join(src, '.claude-plugin', 'plugin.json')
if (!existsSync(manifest)) {
  console.error(`No HackForge plugin at ${src} (missing .claude-plugin/plugin.json)`)
  process.exit(1)
}
const { name, version } = JSON.parse(readFileSync(manifest, 'utf8'))
if (name !== 'hackforge') {
  console.error(`${manifest} is the "${name}" plugin, not hackforge`)
  process.exit(1)
}
const dest = resolve(import.meta.dirname, '..', 'resources', 'hackforge')
rmSync(dest, { recursive: true, force: true })
// Skip editor/OS junk and plugin-dev-only folders; everything else is what Claude Code loads.
const SKIP = new Set(['.DS_Store', '.git', 'node_modules', '__pycache__', 'evals'])
cpSync(src, dest, { recursive: true, filter: (p) => !SKIP.has(basename(p)) && !p.endsWith('.pyc') })
console.log(`HackForge ${version} → resources/hackforge`)
