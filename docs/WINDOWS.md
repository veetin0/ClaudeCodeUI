# Harness on Windows

Harness runs on macOS and Windows, with the same features on both. This page covers setup on Windows
and the differences to know about.

← [Back to the README](../README.md)

## 1. Install the prerequisites (once)

| Tool | Why | Get it |
|---|---|---|
| **Git for Windows** | Claude Code needs Git Bash for its shell, and new projects start as git repositories | <https://git-scm.com/download/win> (defaults are fine) |
| **Node.js LTS** (22 or newer) | ECC's hooks run with Node; the apps Claude builds, the promo video and building Harness need it too | <https://nodejs.org> |
| **Python 3** | UI/UX Pro Max's design search, the 3D kit, and Python projects | `winget install -e --id Python.Python.3.12`, or <https://python.org> and tick **"Add python.exe to PATH"** |
| **Claude Code** | Logging in once with your Claude plan (`claude` → `/login`) | <https://docs.claude.com/en/docs/claude-code/setup> |

You don't need Visual Studio or build tools: the terminal library and Claude Code ship ready-made
Windows binaries.

If Claude Code can't find Git Bash, set `CLAUDE_CODE_GIT_BASH_PATH` to
`C:\Program Files\Git\bin\bash.exe` (System Properties → Environment Variables), then restart Harness.

## 2. Install, run or build Harness

**Install:** download `Harness-Setup-….exe` from the [latest release](https://github.com/veetin0/ClaudeCodeUI/releases/latest) and run it. It isn't signed yet, so on the SmartScreen warning click **More info** → **Run anyway**.

**Or run it from source:** open **PowerShell** in the repository folder:

```powershell
npm install
npm run dev          # run from source
npm run build:win    # or build the installer → dist\Harness-Setup-<version>.exe
```

Build the installer **on Windows**. npm only downloads the Windows Claude Code binary on Windows, so
an installer built on a Mac would be missing it.

## 3. What's different on Windows

- **Shortcuts:** Ctrl instead of ⌘ (Ctrl+4 Project, Ctrl+K palette, Ctrl+J terminal…). The labels
  in the app follow your OS.
- **Window:** the standard Windows title bar and menu bar (File / Edit / View / Window).
- **Terminal tabs:** open PowerShell. Set `HARNESS_SHELL=pwsh.exe` to use PowerShell 7 instead.
  *New Claude terminal* runs `claude` in it.
- **Notifications** use Windows toasts. The taskbar button flashes when Claude needs approval.
  The tray icon sits in the notification area (you may need to click **^** to see it).
- **Keys** (Anthropic, ElevenLabs, Context7 and your projects' API keys) are encrypted with Windows'
  own protection (DPAPI) instead of the macOS Keychain.
- **Hooks** (ECC's, and observe mode's status hooks) run in Git Bash, as Claude Code runs them.
  Observe mode's hooks use `curl`, which Windows 10 and 11 include.
- **Line endings:** if Git converts scripts to Windows line endings, bash scripts fail with
  `$'\r': command not found`. For a project shared with Mac or Linux, add a `.gitattributes` with
  `*.sh text eol=lf` before anyone on Windows clones it.

## 4. Quick check on a Windows laptop

1. Harness starts, and **Ctrl+4** opens the Project place.
2. *New session* in a folder: Claude answers, and the Files panel lights up as it reads and edits files.
3. **Ctrl+J** opens a PowerShell tab, and `git --version`, `node -v` and `python --version` all work there.
4. **Settings › Tools** shows ECC built in, and its hooks don't report errors in a session.
5. On Home, describe a small idea and press **Build it**: the project folder appears with git, and Claude
   starts on the PRD.
