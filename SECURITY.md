# Security policy

## Reporting a vulnerability

Please **don't open a public issue** for a security problem. Report it privately instead:

1. Go to the repository's [Security tab](https://github.com/veetin0/ClaudeCodeUI/security) and choose **Report a vulnerability** ([direct link](https://github.com/veetin0/ClaudeCodeUI/security/advisories/new)).
2. Describe the problem, how to reproduce it, and what an attacker could do with it.

You'll get a reply as soon as possible, usually within a week. Once a fix is out, the advisory can be published with credit to you if you'd like.

## Supported versions

Security fixes go to the `main` branch and ship in the next [release](https://github.com/veetin0/ClaudeCodeUI/releases). Please check that the problem still happens in the latest release or on `main` before reporting.

## What's in scope

Things that matter most in Harness:

- **Stored secrets:** the Anthropic, ElevenLabs and Context7 keys saved in Settings (encrypted with the operating system's keychain via Electron `safeStorage`), and the API keys added to projects (also written to the project's git-ignored `.env`).
- **Permissions:** anything that lets Claude run a tool or touch a file without the permission prompt (in the mode you chose).
- **Projects:** anything that writes a key into a committed file, or lets a project file make Harness open or run something outside the project.
- **The local endpoints** Harness opens on `localhost` (script progress, the status hook bridge): anything reachable from outside the machine or from a web page.
- **The renderer:** cross-site scripting through session content, file previews or Markdown that could reach Electron APIs.

Out of scope: problems in Claude Code itself or in third-party MCP servers (please report those upstream), and issues that need an attacker who already controls your user account.
