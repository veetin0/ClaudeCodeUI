// node-pty 1.x ships its macOS `spawn-helper` prebuild without the execute bit, so every terminal
// fails with "posix_spawnp failed". Restore it after install; electron-builder copies the mode
// into app.asar.unpacked, so packaged apps get it too. No-op on Windows (no spawn-helper there).
import { chmodSync, existsSync, readdirSync, statSync } from 'node:fs'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'

export function fixSpawnHelpers(root) {
  const prebuilds = join(root, 'node_modules', 'node-pty', 'prebuilds')
  const fixed = []
  if (!existsSync(prebuilds)) return fixed
  for (const dir of readdirSync(prebuilds)) {
    const helper = join(prebuilds, dir, 'spawn-helper')
    if (!existsSync(helper)) continue
    const mode = statSync(helper).mode
    if ((mode & 0o111) !== 0o111) {
      chmodSync(helper, mode | 0o755)
      fixed.push(helper)
    }
  }
  return fixed
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  for (const f of fixSpawnHelpers(process.cwd())) console.log(`made executable: ${f}`)
}
