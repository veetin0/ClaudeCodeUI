import { chmodSync, mkdirSync, mkdtempSync, rmSync, statSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
// @ts-expect-error plain .mjs build script, no types
import { fixSpawnHelpers } from '../scripts/fix-node-pty.mjs'

describe('postinstall: node-pty spawn-helper', () => {
  it.skipIf(process.platform === 'win32')('makes the macOS spawn-helper executable, so terminals can start', () => {
    const root = mkdtempSync(join(tmpdir(), 'npty-'))
    for (const arch of ['darwin-arm64', 'darwin-x64']) {
      mkdirSync(join(root, 'node_modules', 'node-pty', 'prebuilds', arch), { recursive: true })
      const helper = join(root, 'node_modules', 'node-pty', 'prebuilds', arch, 'spawn-helper')
      writeFileSync(helper, '')
      chmodSync(helper, 0o644) // as npm extracts node-pty 1.1.0
    }
    mkdirSync(join(root, 'node_modules', 'node-pty', 'prebuilds', 'win32-x64'), { recursive: true })
    expect(fixSpawnHelpers(root)).toHaveLength(2)
    for (const arch of ['darwin-arm64', 'darwin-x64']) expect(statSync(join(root, 'node_modules', 'node-pty', 'prebuilds', arch, 'spawn-helper')).mode & 0o777).toBe(0o755)
    expect(fixSpawnHelpers(root)).toHaveLength(0)
    expect(fixSpawnHelpers(join(root, 'missing'))).toEqual([])
    rmSync(root, { recursive: true, force: true })
  })
})
