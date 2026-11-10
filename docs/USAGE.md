# Usage saver and usage history

How Harness keeps Claude plan limits from running out, and shows where usage went.

← [Back to the README](../README.md)

## Usage saver

Claude plan limits are mostly spent on Claude re-reading the conversation at every step, not on what it writes. The Usage saver is on by default and cuts that waste without taking the strong model away from the work that needs it. **Settings › Advanced → Usage saver** switches the whole thing or any part off.

- **Auto model.** New sessions start on **Auto** (the model menu by the prompt box). Each message gets a model before it reaches Claude:
  - **Opus** for planning, design questions, debugging, reviews, refactors, long or detailed requests, and plan mode.
  - **Sonnet** for carrying out what was agreed ("yes, do it") and routine steps (run, commit, rename, small edits).
  - **Switching back to Opus is automatic** when you say something didn't work, or when Sonnet fails 3 steps in a row mid-task.
  - **When you approve a plan in plan mode**, Sonnet carries it out, as Claude Code's `opusplan` does.
  - **Effort stays at each model's default**, so reasoning depth isn't cut.
  - **HackForge commands** run on Sonnet on its Pro profile, because HackForge picks the model for each of its own agents.
  - **Your choice wins.** Picking a model in the menu turns Auto off for that session, and picking Auto turns it back on.
- **Compact between tasks.** Once a conversation passes ~100k tokens (half the context window at most), it's compacted before your next message. The summary keeps the goal, decisions, changed files, build/test commands, exact errors and next steps. It never happens mid-task or when your message says something isn't working. Compacting first also makes an Opus → Sonnet switch cheap. Without it, the saver stays on Opus rather than re-read a long conversation on a new model.
- **Skip generated files.** Whole-file reads of lockfiles, minified bundles, source maps and build output over 64 KB are refused, with a hint to search the file or read a range. Small files and your own source are never blocked.
- **Lean output.** Session instructions to run tests and builds quietly, read large files by range, and lead replies with the answer. Code, errors and warnings stay complete.

**Is it saving right now?** The mode chip in the prompt box shows a leaf (green when saving, amber when not). Open it to see **Saving · Sonnet** (green) or **Not saving · Opus** (amber), with the reason. Click it for this session's numbers: turns per model, Opus takeovers, compactions and skipped files. The chat also notes every switch, compaction and skipped file as it happens.

## Advisor

Claude Code's **advisor** (experimental) lets one model do the work while a more capable one gives short advice at key moments: when planning, when stuck, and before calling a task done. Opus can do the work with **Fable** as its advisor, for example: almost every token is Opus's, and Fable only writes the advice.

- **Turning it on:** **Settings › General → Advisor** (Off, Opus or Fable) applies to every session Harness starts. *Claude Code's setting* leaves whatever you chose with `/advisor` in the terminal. In the team run, **Your Claude** on the Setup step picks the lead's model and advisor, e.g. *Opus, with Fable as advisor*; it stays with the lead's session when it reconnects.
- **Once per laptop:** Fable needs a one-time consent in a terminal: run `claude`, then `/model fable`, and follow it. Harness can't show that screen.
- **Plan limits:** Fable uses your plan limits faster than Opus. On some plans, or past a share of the limit, it bills to usage credits instead; Claude Code says so when it does. **Usage history** shows Fable on its own line, wherever Claude Code reports it.
- **Pairing:** the advisor must be at least as capable as the main model (Fable can advise Opus or Sonnet; Opus can't advise Fable). Subagents can ask it too, so many parallel agents mean more advice.
- **In the chat:** each consultation shows as an **Advisor** card. Advice from current models is encrypted, so only Claude reads it; the card says when it arrived, or why it failed.
- **The crew:** teammates' missions use no advisor unless they turn it on in their own Claude Code.

## Usage history

**⌘5**, the usage meter at the bottom of the sidebar, or **Usage history** in the status chip opens usage history for this laptop:
- **Per day:** new tokens by model (Sonnet, Opus, Haiku, Fable, other) for the last 7, 14 or 30 days, with hover details and a table view.
- **Plan usage:** the 5-hour window over the last 48 hours, so you see how fast it's going, plus the weekly figure.
- **The Usage saver:** turns on Sonnet vs Opus, mid-task Opus takeovers, compactions and skipped files.
- **Where it went:** the heaviest sessions (click to open), cache re-reads, and Claude Code's API-equivalent cost estimate.
- **The team:** with a team, each teammate's tokens today and current 5-hour figure.
