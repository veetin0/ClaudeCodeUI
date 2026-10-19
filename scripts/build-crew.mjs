#!/usr/bin/env node
// Builds the harness-crew npm package in crew/: one bundled file (dist/cli.mjs) plus the HackForge and
// design plugins it loads into mission sessions. The Agent SDK stays a dependency: it brings the
// Claude Code binary for the teammate's platform.
//   npm run crew:build              build
//   npm run crew:publish            build and publish (needs `npm login` once)
import { build } from 'esbuild'
import { chmodSync, cpSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { dirname, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..')
const crew = join(root, 'crew')
const dist = join(crew, 'dist')

rmSync(dist, { recursive: true, force: true })
await build({
  entryPoints: [join(crew, 'src', 'cli.ts')],
  outfile: join(dist, 'cli.mjs'),
  bundle: true,
  platform: 'node',
  format: 'esm',
  target: 'node18',
  alias: { '@shared': join(root, 'src', 'shared') },
  external: ['@anthropic-ai/claude-agent-sdk', 'zod', 'electron'],
  // Bundled CommonJS dependencies call require().
  banner: { js: "import { createRequire as __harnessCrewRequire } from 'node:module'; const require = __harnessCrewRequire(import.meta.url);" },
  legalComments: 'none',
  logLevel: 'warning',
})
chmodSync(join(dist, 'cli.mjs'), 0o755)

// Mission sessions load these like Harness does (an installed newer HackForge still wins).
cpSync(join(root, 'resources', 'hackforge'), join(dist, 'resources', 'hackforge'), { recursive: true })
cpSync(join(root, 'resources', 'design'), join(dist, 'resources', 'design'), { recursive: true })

// Keep the package's Agent SDK and browser tools in step with the app's.
const pkgPath = join(crew, 'package.json')
const pkg = JSON.parse(readFileSync(pkgPath, 'utf8'))
const app = JSON.parse(readFileSync(join(root, 'package.json'), 'utf8'))
pkg.dependencies['@anthropic-ai/claude-agent-sdk'] = app.dependencies['@anthropic-ai/claude-agent-sdk']
pkg.dependencies.zod = app.dependencies.zod
pkg.dependencies['@playwright/mcp'] = app.dependencies['@playwright/mcp']
writeFileSync(pkgPath, `${JSON.stringify(pkg, null, 2)}\n`)
console.log(`harness-crew ${pkg.version} built in crew/dist`)
