# Harness on Windows

Harness runs on macOS and Windows. Teammates on either OS share the same event project, team board,
challenge board and pitch studio. This page covers setup on Windows and the differences to know about.

## 1. Install the prerequisites (once)

| Tool | Why | Get it |
|---|---|---|
| **Git for Windows** | Claude Code needs Git Bash for its shell; HackForge's hooks and `gate.sh` run in bash | <https://git-scm.com/download/win> (defaults are fine) |
| **Node.js LTS** (22 or newer) | Building Harness, the pitch video's `npm install` | <https://nodejs.org> |
| **Python 3** | HackForge's hooks and improvement-loop gate | `winget install -e --id Python.Python.3.12`, or <https://python.org> and tick **"Add python.exe to PATH"** |
| **Claude Code** | Logging in once with your Claude plan (`claude` → `/login`) | <https://docs.claude.com/en/docs/claude-code/setup> |

You don't need Visual Studio or build tools: the terminal library and Claude Code ship ready-made
Windows binaries.

If Claude Code can't find Git Bash, set `CLAUDE_CODE_GIT_BASH_PATH` to
`C:\Program Files\Git\bin\bash.exe` (System Properties → Environment Variables), then restart Harness.

## 2. Run or build Harness

Open **PowerShell** in the repository folder:

```powershell
npm install
npm run dev          # run from source
npm run build:win    # or build the installer → dist\Harness-Setup-0.1.0.exe
```

Build the installer **on Windows**. npm only downloads the Windows Claude Code binary on Windows, so
an installer built on a Mac would be missing it.

The installer isn't code-signed, so the first time you run it Windows SmartScreen says "Windows
protected your PC". Click **More info → Run anyway**.

## 3. What's different on Windows

- **Shortcuts:** Ctrl instead of ⌘ (Ctrl+6 event mode, Ctrl+K palette, Ctrl+J terminal…). The labels
  in the app follow your OS.
- **Window:** the standard Windows title bar and menu bar (File / Edit / View / Window).
- **Terminal tabs:** open PowerShell. Set `HARNESS_SHELL=pwsh.exe` to use PowerShell 7 instead.
  *New Claude terminal* runs `claude` in it.
- **Notifications** use Windows toasts. The taskbar button flashes when Claude needs approval.
  The tray icon sits in the notification area (you may need to click **^** to see it).
- **API and ElevenLabs keys** are encrypted with Windows' own protection (DPAPI) instead of the macOS
  Keychain.
- **Team relay hosted on a Windows laptop:** Windows Defender Firewall asks whether to allow Harness on
  the network the first time. Allow **Private networks**. At the venue, use a relay server instead
  (see `relay/README.md`), because laptops on public wifi usually can't reach each other.
- **Observe mode's status hooks** use `curl`, which Windows 10 and 11 include. Claude Code runs hook
  commands in Git Bash.

## 4. Mixed Mac + Windows team: line endings

Git on Windows may convert files to Windows line endings (CRLF) when it checks them out. Bash scripts
then fail with errors like `$'\r': command not found`. That would break HackForge's `.hackforge/gate.sh`
for whoever is on Windows.

Setting up the event project in Harness (event mode → *Create or pick a folder*) adds a `.gitattributes`
that keeps `*.sh`, `*.bash` and `*.py` at Unix line endings. Commit it **before** anyone on Windows
clones the repo.

## 5. HackForge on Windows

HackForge is built into Harness (2.3.0), and HackForge 1.1 and later handle Windows themselves:
- a launcher finds a working Python and skips the Microsoft Store stub
- hooks still run if Git converted scripts to CRLF
- Git Bash is used instead of WSL's bash
- the loop gate fails closed (it stops the loop and says why) instead of silently not running

You don't need to patch anything. `/hackforge:init` checks the laptop when it sets up a project. To check one any time, ask Claude in a Harness session:

```
Run the HackForge doctor check (bash scripts/hf-run.sh doctor, in the HackForge plugin folder) and tell me the result.
```

It reports bash, Python, git and line endings, and ends with `RESULT: OK` or what to fix. If Python is somewhere unusual, set `HACKFORGE_PYTHON` to its full path.

## 6. Quick check on a Windows laptop

1. Harness starts, and **Ctrl+6** opens event mode.
2. *New session* in a folder: Claude answers, and the Files panel lights up as it reads and edits files.
3. **Ctrl+J** opens a PowerShell tab, and `git --version`, `node -v` and `python --version` all work there.
4. Event mode → Pitch → *Install Remotion*, then *Preview & render* → **Start Studio** shows the video.
5. Join the team board with the join code; your card shows up on the other laptops.
