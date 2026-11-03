# Releasing Harness

## Publish a release (GitHub Actions)

Releases are built on GitHub by [`.github/workflows/release.yml`](../.github/workflows/release.yml): an Apple silicon `.dmg` and `.zip` on a macOS runner, and an x64 installer on a Windows runner. Each build is launched once to check it starts.

1. Bump `version` in `package.json` (and `package-lock.json`, e.g. `npm version 0.2.0 --no-git-tag-version`), then commit and push to `main`.
2. Start the release, either way:
   - **On GitHub:** Actions › Release › **Run workflow**, tick **Publish**, and run it on `main`. It tags the commit `v<version>` once both builds pass.
   - **From a terminal:** tag the commit and push the tag: `git tag v0.2.0 && git push origin v0.2.0`.
3. The workflow builds both apps and publishes the GitHub Release with the files attached and notes generated from the merged pull requests. Edit the notes on GitHub afterwards if you like.

To try a build without publishing, run the workflow without ticking **Publish**. The apps are then attached to the run as artifacts.

**Signing:**
- **macOS:** without secrets the app is ad-hoc signed, and people confirm it once on first open (see the README). To sign with your Developer ID and notarize, add these repository secrets: `CSC_LINK` (your Developer ID Application certificate as a base64 `.p12`), `CSC_KEY_PASSWORD`, `APPLE_ID`, `APPLE_APP_SPECIFIC_PASSWORD` and `APPLE_TEAM_ID`.
- **Windows:** the installer is unsigned, so SmartScreen asks once ("More info → Run anyway").

## Build for yourself or your team (macOS)

```bash
npm run build:mac        # → dist/Harness-<version>-arm64.dmg, unsigned
```

This never signs, even if your keychain has an Apple certificate. Signing needs Apple's timestamp
server, and with only an "Apple Development" certificate it fails ("A timestamp was expected but was
not found") without producing a .dmg. An unsigned build runs on the Mac that built it. On another Mac,
right-click → Open the first time.

## Build a signed, notarized .dmg (macOS)

```bash
npm ci
npm run release:mac      # → dist/Harness-<version>-arm64.dmg and .zip
```

- **Signing:** electron-builder uses the "Developer ID Application" certificate from your keychain (an "Apple Development" certificate isn't meant for distribution). On CI, set `CSC_LINK` (a base64 .p12) and `CSC_KEY_PASSWORD`.
- **Notarization:** runs automatically when these are set: `APPLE_ID`, `APPLE_APP_SPECIFIC_PASSWORD` and `APPLE_TEAM_ID`, or an API key via `APPLE_API_KEY`, `APPLE_API_KEY_ID` and `APPLE_API_ISSUER`.
- **Entitlements:** `build/entitlements.mac.plist` grants what the hardened runtime needs. JIT is for V8 and the bundled Claude Code binary; library validation is relaxed for node-pty's native addon. They are applied to helpers too (`entitlementsInherit`).

## Intel Macs

The Claude Code binary comes from a per-platform npm package (`@anthropic-ai/claude-agent-sdk-darwin-arm64` / `-darwin-x64`), and npm installs only the one for the machine you're on. The default target is therefore Apple silicon. For an Intel build, either build on an Intel Mac, or install the x64 packages and add `x64` to `mac.target[].arch` in `electron-builder.yml`:

```bash
npm install --cpu=x64 --os=darwin
```

## What's in the bundle

- Runtime dependencies (`package.json` → `dependencies`) are only what the main process needs at runtime: the Agent SDK, node-pty, diff, zod, yaml, three, qrcode-generator and the bundled MCP servers (Playwright, Cloudinary, Hostinger). Everything the renderer uses is bundled by Vite and lives in `devDependencies`.
- `app.asar.unpacked` holds the Claude Code binary and node-pty, which must be real files on disk. `resources/` holds the tray and window icons.
- node-pty's macOS `spawn-helper` must be executable or no terminal can start ("posix_spawnp failed"). npm installs it without the execute bit, so `postinstall` runs `scripts/fix-node-pty.mjs`. electron-builder keeps the mode in the bundle. If you copy `node_modules` some other way, run that script before packaging.

## Smoke test the packaged app

```bash
npm run build:dir        # unpacked app for the current platform, in dist/
```

Launch it, start a session in a project (this checks the bundled Claude binary resolves from `app.asar.unpacked`), and open a terminal with ⌘J (this checks node-pty loads).
