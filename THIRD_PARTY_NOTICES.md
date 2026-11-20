# Third-party notices

Harness is MIT licensed (see [LICENSE](LICENSE)). It bundles or downloads the following third-party work, each under its own license.

## Bundled in this repository

| Component | Where | License | Notes |
|---|---|---|---|
| [impeccable](https://github.com/pbakaus/impeccable) design skill, by Paul Bakaus | `resources/design/impeccable/` | Apache-2.0 | Shipped unmodified with its [LICENSE](resources/design/impeccable/LICENSE) and [NOTICE](resources/design/impeccable/NOTICE.md), which credits ehmo's platform-design-skills (MIT). |
| [UI/UX Pro Max](https://github.com/nextlevelbuilder/ui-ux-pro-max-skill) design skill, by Next Level Builder | `resources/design/ui-ux-pro-max/` | MIT | Core skill only, with its [LICENSE](resources/design/ui-ux-pro-max/LICENSE); the plugin manifest is rewritten for Harness. |
| [ECC](https://github.com/affaan-m/ECC) (agents, skills, commands, hooks, rules), by Affaan Mustafa | `resources/ecc/` | MIT | Copied unmodified from the commit in [HARNESS_SOURCE.json](resources/ecc/HARNESS_SOURCE.json), with its [LICENSE](resources/ecc/LICENSE); docs and images left out. Its hook scripts' packages ([js-yaml](https://github.com/nodeca/js-yaml), [ajv](https://github.com/ajv-validator/ajv), [@iarna/toml](https://github.com/iarna/iarna-toml)) are in `resources/ecc/node_modules/`, and their dependencies, each with its own license file there (MIT, ISC, BSD-3-Clause, PSF-2.0). |
| 3D kit for promo videos | `resources/kit3d/` | MIT | Part of this project (it came with HackForge, an earlier part of Harness). |
| Barlow Semi Condensed typeface, via [@fontsource](https://fontsource.org/fonts/barlow-semi-condensed) | bundled into the app at build time | SIL Open Font License 1.1 | |
| Pixelify Sans typeface, via [@fontsource](https://fontsource.org/fonts/pixelify-sans) | bundled into the app at build time (the 8-bit theme) | SIL Open Font License 1.1 | |
| VT323 typeface, via [@fontsource](https://fontsource.org/fonts/vt323) | bundled into the app at build time (the 8-bit theme's readouts) | SIL Open Font License 1.1 | |

The npm packages Harness depends on (Electron, React, the Claude Agent SDK and others) are listed in `package.json`; each is distributed under its own license in `node_modules/`.

## Installed when you use a feature

These are not part of the repository. Harness installs them into your project or runs them with `npx` only when you turn the feature on, and their own terms apply:

- **Remotion** (Preview and the Promo studio) has its own [license](https://www.remotion.dev/docs/license), which requires a company license for some commercial use.
- **Playwright MCP**, **Context7**, the service MCP servers listed under Settings › Tools, and the servers from ECC's catalog you add under Project › Keys.
- **Blender** and the Blender MCP server (3D clips), and ElevenLabs voices (promo narration).
- The **cartoon short skill** ([mromidev/claude-animated-shorts](https://github.com/mromidev/claude-animated-shorts), MIT): downloaded at a pinned commit when you pick *Cartoon short* in Project › Promo, without its folder of reference contact sheets. Its reference frames are for style study only; Harness never uploads or publishes them.
