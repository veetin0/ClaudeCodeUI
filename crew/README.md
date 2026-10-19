# harness-crew

Lend your Claude to your team's project, from a terminal. No app to install.

Your team lead runs [Harness](https://github.com/veetin0/ClaudeCodeUI) and starts the project. Their Claude splits the work into missions and hands them to the crew: each teammate's Claude, running on their own laptop and their own Claude plan. Missions go to whoever has the most usage left. You run one command and leave the window open. That's all.

```bash
npx harness-crew HT1.xxxxxxxx      # the join code from the lead's Team board
```

```
harness-crew 0.1.0  lend your Claude to the team
✓ Claude: signed in
✓ Joined the team as Anna
✓ Connected. Veeti's Claude leads the project and hands out the missions.
✓ Project ready in ~/harness-crew/mini-junction

▶ m-3fa2c M1 frontend: request form · from Veeti · sonnet · branch crew/anna/m-3fa2c
  12:04  Read src/App.tsx
  12:04  Edit src/pages/Request.tsx
  12:05  Bash: npm test
  ✉ → Ben: RequestForm is exported from src/components/RequestForm.tsx
✓ done m-3fa2c in 4m 12s · pushed crew/anna/m-3fa2c (2 commits, 4 files)
    Built the request form with validation; npm test passes (12 tests).
  Waiting for the next mission…
```

## What you need (once)

- **Node 20 or newer** ([nodejs.org](https://nodejs.org)).
- **git with access to the team's repository.** Accept the lead's GitHub invite, then sign git in: `gh auth login`, or GitHub Desktop. harness-crew checks it can push before it takes missions and tells the lead if it can't.
- **A Claude account** (Pro or Max). The first run asks you to sign in; a browser window opens. Missions use your plan's usage, not the lead's.

The first `npx` run downloads about 80 MB (it includes Claude Code, so you don't have to install it separately).

## What happens

1. harness-crew joins the team through the team's relay. Everything it sends (missions, reports, messages) is encrypted with the team key, so the relay can't read it.
2. It clones the lead's project into `~/harness-crew/<project>`.
3. For each mission it starts a fresh Claude Code session on a new branch (`crew/<your name>/<mission>`), with HackForge's builder rules and the design skills loaded. Claude edits files, runs the project's commands and tests, and commits.
4. When Claude reports done (or blocked), harness-crew pushes the branch and the lead's Claude merges it.
5. If your plan's usage runs out mid-mission, it pushes what's done and the mission moves to a teammate who has usage left.

The Claudes can message each other ("I changed the API shape", "which port does the backend use?") and see who is working on which files, so parallel work doesn't collide.

## Safety

- Claude works only in the project folder, on its own branch. It never pushes to `main`.
- File edits and normal dev commands (npm, node, python, pytest, git add/commit/diff, …) run without asking. Anything else, like deleting folders or installing something system-wide, goes to the lead as an approval card in Harness. You can also press `y` or `n` in the terminal. Unanswered questions are denied after 10 minutes.
- Ctrl+C stops it. A running mission is stopped, its work is pushed, and the lead is told.

## Keys

| Key | |
|---|---|
| `s` | status: lead, project folder, current mission |
| `p` | pause/resume taking new missions (the current one carries on) |
| `y` / `n` | answer a pending approval yourself |
| Ctrl+C | stop (press twice to quit immediately) |

## Options

```
npx harness-crew <join code> [--name Anna] [--dir ~/harness-crew] [--home ~/.harness-crew]
npx harness-crew           # rejoin the last team
npx harness-crew leave     # leave the team
```
