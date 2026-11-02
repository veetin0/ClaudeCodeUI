# Third-party notices

Harness is MIT licensed (see [LICENSE](LICENSE)). It bundles or downloads the following third-party work, each under its own license.

## Bundled in this repository

| Component | Where | License | Notes |
|---|---|---|---|
| [impeccable](https://github.com/pbakaus/impeccable) design skill, by Paul Bakaus | `resources/design/impeccable/` | Apache-2.0 | Shipped unmodified with its [LICENSE](resources/design/impeccable/LICENSE) and [NOTICE](resources/design/impeccable/NOTICE.md), which credits ehmo's platform-design-skills (MIT). |
| [UI/UX Pro Max](https://github.com/nextlevelbuilder/ui-ux-pro-max-skill) design skill, by Next Level Builder | `resources/design/ui-ux-pro-max/` | MIT | Core skill only, with its [LICENSE](resources/design/ui-ux-pro-max/LICENSE); the plugin manifest is rewritten for Harness. |
| HackForge plugin | `resources/hackforge/` | MIT | Part of this project ([LICENSE](resources/hackforge/LICENSE)). Its [NOTICE](resources/hackforge/NOTICE.md) credits ideas from Chachamaru127/claude-code-harness (MIT), reimplemented without copying code. |
| Barlow Semi Condensed typeface, via [@fontsource](https://fontsource.org/fonts/barlow-semi-condensed) | bundled into the app at build time | SIL Open Font License 1.1 | |

The npm packages Harness depends on (Electron, React, the Claude Agent SDK and others) are listed in `package.json`; each is distributed under its own license in `node_modules/`.

## Installed when you use a feature

These are not part of the repository. Harness installs them into your project or runs them with `npx` only when you turn the feature on, and their own terms apply:

- **Remotion** (Preview and the Pitch studio) has its own [license](https://www.remotion.dev/docs/license), which requires a company license for some commercial use.
- **Playwright MCP**, **Context7** and the partner MCP servers listed under Settings › Tools.
- **Blender** and the Blender MCP server (3D clips), and Kokoro / ElevenLabs voices (pitch narration).
