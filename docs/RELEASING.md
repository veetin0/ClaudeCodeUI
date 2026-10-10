# Releasing Harness

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

- Runtime dependencies are deliberately few (`package.json` → `dependencies`): the Agent SDK, node-pty, diff and zod. Everything the renderer uses is bundled by Vite and lives in `devDependencies`.
- `app.asar.unpacked` holds the Claude Code binary and node-pty, which must be real files on disk. `resources/` holds the tray and window icons.

## Smoke test the packaged app

```bash
npm run build:dir        # unpacked app for the current platform, in dist/
```

Launch it, start a session in a project (this checks the bundled Claude binary resolves from `app.asar.unpacked`), and open a terminal with ⌘J (this checks node-pty loads).
