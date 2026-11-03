# Design skills and dev tools

The skills and MCP tools Harness loads into every session, and how to switch them.

← [Back to the README](../README.md)

## Design skills

Harness ships two design skills and loads them into every session, so UI work comes out looking designed instead of generic. There's nothing to install. Claude uses them by itself when a task is frontend work; on other work only their short descriptions sit in context.

- **[ui-ux-pro-max](https://github.com/nextlevelbuilder/ui-ux-pro-max-skill)** (MIT) picks the design system once, at the start of a new product or a redesign: style, palette, fonts and spacing, from a searchable database. Claude records the choice in `DESIGN.md` at the project root. Harness bundles only its core UI skill; the slide, logo and banner parts are left out because HackForge's pitch tools cover them.
- **[impeccable](https://github.com/pbakaus/impeccable)** (Apache-2.0) builds, polishes, critiques and audits UI against `DESIGN.md`. Its detector checks every UI edit and does a deeper pass when Claude finishes, so things like low contrast, gradient text, glow shadows, nested cards and overused fonts come back as findings Claude fixes. Where the two disagree, `DESIGN.md` and impeccable's rules win.
- **Click to change** requests are treated as polish work under impeccable's rules.

**Settings › Tools** switches each one off. **Quiet detector** (on by default) reports only problems, not "this file is clean", to save tokens. If you've installed either plugin yourself and your copy is newer, Harness uses yours.

**First run:** impeccable's detector downloads a small engine once per computer (to `~/.impeccable`). Harness fetches it in the background at startup. Check that Settings shows **Detector engine: ready**; if it doesn't, press **Get it now** (or **Retry**) while you're on a good connection. ui-ux-pro-max's search needs Python 3, the same as HackForge.

Their licences are kept next to them in `resources/design/` (see [THIRD_PARTY_NOTICES.md](../THIRD_PARTY_NOTICES.md)). Maintainers update the bundled copies with `npm run design:sync` ([CONTRIBUTING.md](../CONTRIBUTING.md#maintainer-notes)).

## Dev tools

Sessions get five kinds of tools Claude reaches for by itself. Claude Code loads a tool's definition only when it's needed, so tools you don't use cost little context. **Settings › Tools** has one switch for each. Turning one on sets it up by itself: it downloads Chromium if there's no Chrome, installs REA, or sets up the Blender add-on.

- **Browser** (Playwright, built in). Claude opens the running app, clicks through the demo, reads console errors and saves screenshots. HackForge's verifier walks the demo path this way and keeps the screenshots as evidence. It uses your Google Chrome or Microsoft Edge; on a computer with neither, **Get Chromium** downloads one (about 150 MB, once). It runs in the background unless you tick **Show the browser window**, with a fresh profile every session.
- **Library docs** (Context7, hosted). Current, version-specific docs for any library or SDK, so Claude looks up a partner's SDK instead of guessing its API. It works without a key; a free key from context7.com raises the limits.
- **Partner servers.** A service's own MCP server, in sessions in the event project once you add its key under Hackathon › Challenges → API keys: Exa's hosted server, and Cloudinary's and Hostinger's servers, bundled with Harness so nothing downloads at the event.

- **Reverse engineering** ([REA](https://github.com/morluto/rea), off until you switch it on). Claude works out how existing software works and cites the evidence:
  - a partner's website, or a HAR capture of it, becomes its real API (endpoints and payloads);
  - an SDK shipped only as a minified bundle, a DLL or an APK shows how it's called;
  - a reference app shows how a feature is built;
  - binaries, firmware and packet captures can be analysed.

  REA runs on your own Node (22.23.4+ or 24.22.1+), because the Node inside Harness is older than it needs. **Install REA** fetches the pinned release (about 280 MB with its analysis engines) into Harness's data folder. If you've already added REA to Claude Code (`npx rea-agents setup`), Harness uses that copy instead. Use it only on software you own or are allowed to analyse.

- **Blender** (the community [MCP for Blender](https://github.com/ahujasid/blender-mcp), off until you switch it on). Claude builds and adjusts 3D objects and scenes in your open Blender, looks at the result, and exports a `.glb` for the product, the pitch or a 3D clip.
  - **What you need:** Blender, and [uv](https://docs.astral.sh/uv/) to run the connection.
  - **Setup:** **Set up Blender add-on** installs and enables the add-on, without touching other apps' settings. Then **Open Blender**: the add-on connects by itself, and Settings shows "connected".
  - **Telemetry:** Harness runs the pinned release with its telemetry off.
  - **Permissions:** looking at the scene doesn't ask. Running code in Blender, importing assets and AI model generation (some need your API keys) ask first.
  - **Your own copy:** if you've already added it to Claude Code, Harness uses that copy.
  - **Linux:** a distribution's own Blender package may lack Python modules the add-on needs. The official build from blender.org brings its own Python.

The browser and the docs run without permission prompts, so the improvement loop doesn't stall on them. REA's read-only analysis doesn't prompt either. Anything that runs the target program, attaches a debugger, touches a phone or writes files asks first. Partner servers can change real accounts (deploys, DNS, uploads), so their tools still ask first. A project with private files keeps them away from REA too.
