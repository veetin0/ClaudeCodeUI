/**
 * Junction 2026 (Espoo, 13–15 Nov 2026). Times are Helsinki wall-clock time: the event page lists
 * them as "UTC+03:00", but Finland is on winter time (UTC+2) by November, so the zone does the math.
 */

export const JUNCTION_2026_EVENT_YAML = `# Junction 2026 — event mode config for Harness.
# Times are local Helsinki time (Europe/Helsinki handles the switch to UTC+2 on Oct 25).
# Edit freely: Harness and HackForge both read this file; commit it so the whole team shares it.

id: junction-2026
name: "Junction 2026"
theme: "European Tech Renaissance"
tagline: "Who moves the center of gravity?"
location: "Hype Arena, Espoo"
address: "Vanha Jorvaksentie, 02320 Espoo (metro from central Helsinki)"
timezone: Europe/Helsinki
team_size: 4
team: ["Member 1", "Member 2", "Member 3", "Member 4"]

schedule:
  # Official
  - { id: doors-open, label: "Doors open", at: "2026-11-13 16:00", kind: official }
  - { id: opening, label: "Opening ceremony", at: "2026-11-13 18:00", kind: official, note: "Challenges are presented — paste them into challenge/brief/ right away" }
  - { id: preliminary, label: "Preliminary submission", at: "2026-11-13 23:55", kind: deadline }
  - { id: final, label: "Final submissions", at: "2026-11-15 10:00", kind: deadline }
  - { id: review, label: "Review time", at: "2026-11-15 14:00", kind: official }
  - { id: event-ends, label: "Event ends", at: "2026-11-15 17:00", kind: official }
  - { id: doors-close, label: "Doors close", at: "2026-11-15 18:00", kind: official }
  # Our plan
  - { id: shortlist, label: "Shortlist 2–3 challenges, talk to their mentors", at: "2026-11-13 18:45", kind: plan }
  - { id: decision, label: "Decision checkpoint: one challenge, one idea, one demo moment", at: "2026-11-13 21:30", kind: plan }
  - { id: prelim-target, label: "Send the preliminary submission", at: "2026-11-13 23:00", kind: plan, note: "55 min buffer" }
  - { id: mvp, label: "Thinnest end-to-end version works and is deployed", at: "2026-11-14 09:00", kind: plan }
  - { id: mentor-check, label: "Show it to a partner mentor, adjust", at: "2026-11-14 12:00", kind: plan }
  - { id: verify-loop, label: "Verify, then start the improvement loop", at: "2026-11-14 20:00", kind: plan }
  - { id: freeze, label: "Feature freeze", at: "2026-11-15 06:00", kind: plan }
  - { id: video, label: "Demo video, README, final verify", at: "2026-11-15 06:00", end: "2026-11-15 08:30", kind: plan }
  - { id: submit-target, label: "Submit", at: "2026-11-15 09:00", kind: plan, note: "1 h buffer" }
  - { id: rehearse, label: "Rehearse the live demo; backup video ready", at: "2026-11-15 10:30", kind: plan }
  # Sleep in two shifts; the loop keeps working
  - { id: sleep-a1, label: "Sleep: pair A", at: "2026-11-14 02:30", end: "2026-11-14 05:30", kind: sleep }
  - { id: sleep-b1, label: "Sleep: pair B", at: "2026-11-14 05:30", end: "2026-11-14 08:30", kind: sleep }
  - { id: sleep-a2, label: "Sleep: pair A", at: "2026-11-14 23:00", end: "2026-11-15 02:30", kind: sleep }
  - { id: sleep-b2, label: "Sleep: pair B", at: "2026-11-15 02:30", end: "2026-11-15 06:00", kind: sleep }

partners:
  - { name: "OpenAI", url: "https://openai.com", category: "AI models" }
  - { name: "Featherless.ai", url: "https://featherless.ai", category: "AI models", note: "Serverless open-source model inference" }
  - { name: "Modal", url: "https://modal.com", category: "Compute", note: "Serverless GPUs and Python jobs" }
  - { name: "Verda", url: "https://verda.com", category: "Compute", note: "European GPU cloud" }
  - { name: "Exa.ai", url: "https://exa.ai", category: "AI search", note: "Web search API for AI agents" }
  - { name: "Aiven", url: "https://aiven.io", category: "Data & infra", note: "Managed Postgres, Kafka and more (Finnish)" }
  - { name: "Hostinger", url: "https://hostinger.com", category: "Data & infra", note: "Hosting and deployment" }
  - { name: "Cloudinary", url: "https://cloudinary.com", category: "Data & infra", note: "Image and video APIs" }
  - { name: "Arduino", url: "https://arduino.cc", category: "Hardware" }
  - { name: "Aalto University", url: "https://aalto.fi", category: "Research & society" }
  - { name: "Lifeline Ventures", url: "https://lifelineventures.com", category: "Investor", note: "Finnish VC — startup-potential lens" }
  - { name: "cala.ai", url: "https://cala.ai", category: "To research" }
  - { name: "ironshard.ai", url: "https://ironshard.ai", category: "To research" }
  - { name: "atach.dev", url: "https://atach.dev", category: "To research" }
  - { name: "craci.com", url: "https://craci.com", category: "To research" }
  - { name: "Qualia Studios", url: "https://qualiastudios.dev", category: "To research" }

checklist:
  # Preparation (weeks before)
  - { id: install, group: prep, due: "2026-10-13", label: "Harness + HackForge installed and tested on all four laptops" }
  - { id: roles, group: prep, due: "2026-10-13", label: "Roles agreed: pilot, core builder, experience builder, story & partners" }
  - { id: research-unknown, group: prep, due: "2026-10-13", label: "Research cala.ai, ironshard.ai, atach.dev, craci.com and Qualia Studios" }
  - { id: past-winners, group: prep, due: "2026-10-13", label: "Past Junction winners and challenges collected in challenge/examples/" }
  - { id: accounts, group: prep, due: "2026-10-20", label: "Accounts and API keys for every partner (tick them on the Partners board)" }
  - { id: kits, group: prep, due: "2026-10-20", label: "A tested hello-world starter kit per partner technology" }
  - { id: boilerplates, group: prep, due: "2026-10-20", label: "Boilerplates: web app, API + database, LLM service, ElevenLabs voice, Remotion video, deploy script", note: "Tools only — never the solution" }
  - { id: usage-plan, group: prep, due: "2026-10-20", label: "Usage plan: models per role set; API key with a spend cap ready as backup (unused)" }
  - { id: practice-24h, group: prep, due: "2026-10-27", label: "24 h practice run on a past Junction challenge, all four laptops, real schedule" }
  - { id: retro, group: prep, due: "2026-11-03", label: "Fix everything the practice run exposed" }
  - { id: pitch-drills, group: prep, due: "2026-11-03", label: "Pitch drills: 2-minute pitches, with the story lead getting the most practice" }
  - { id: tools-freeze, group: prep, due: "2026-11-05", label: "Freeze the Harness/HackForge setup (bug fixes only)" }
  - { id: practice-short, group: prep, due: "2026-11-10", label: "Short practice run (8–12 h)" }
  - { id: onepagers, group: prep, due: "2026-11-10", label: "One-pager per likely partner challenge as tracks are announced" }
  - { id: fresh-limits, group: prep, due: "2026-11-12", label: "Go light on Claude usage Nov 10–12 so weekly limits are fresh" }
  - { id: rules, group: prep, due: "2026-11-12", label: "Official rules into challenge/brief/ and run /hackforge:rules (check rules on prior work)" }
  # Event-day logistics
  - { id: power, group: logistics, due: "2026-11-13 15:00", label: "Chargers, power strip, extension cord" }
  - { id: hotspot, group: logistics, due: "2026-11-13 15:00", label: "Phone hotspot as backup internet" }
  - { id: headset, group: logistics, due: "2026-11-13 15:00", label: "Headset or mic for recording narration" }
  - { id: logins, group: logistics, due: "2026-11-13 16:00", label: "Everyone logged in to Claude Code, GitHub and partner consoles; repo cloned" }
  - { id: travel, group: logistics, due: "2026-11-13 16:00", label: "At Hype Arena when doors open (metro from central Helsinki)" }
  # Preliminary submission — check the platform for exactly what it asks for
  - { id: p-challenge, group: preliminary, due: "2026-11-13 23:55", label: "Challenge chosen" }
  - { id: p-team, group: preliminary, due: "2026-11-13 23:55", label: "All four members on the submission" }
  - { id: p-name, group: preliminary, due: "2026-11-13 23:55", label: "Project name and one-line pitch" }
  - { id: p-desc, group: preliminary, due: "2026-11-13 23:55", label: "Short description of the idea and approach" }
  - { id: p-sent, group: preliminary, due: "2026-11-13 23:00", label: "Submitted (target 23:00)" }
  # Final submission
  - { id: f-freeze, group: final, due: "2026-11-15 06:00", label: "Feature freeze at 06:00" }
  - { id: f-verify, group: final, due: "2026-11-15 08:00", label: "/hackforge:verify final shows COMPLIANCE: PASS" }
  - { id: f-video, group: final, due: "2026-11-15 08:30", label: "Demo video with narration, within the length limit" }
  - { id: f-readme, group: final, due: "2026-11-15 08:30", label: "README: what it does, setup, what's real vs mocked, partner tech used" }
  - { id: f-demo, group: final, due: "2026-11-15 08:30", label: "Deployed demo link works from a phone" }
  - { id: f-repo, group: final, due: "2026-11-15 08:30", label: "Repository shared as the rules require" }
  - { id: f-backup, group: final, due: "2026-11-15 09:00", label: "Backup demo recording on two laptops" }
  - { id: f-sent, group: final, due: "2026-11-15 09:00", label: "Submitted (target 09:00)" }
`

/** Team directive for HackForge (every file in challenge/prompts/ becomes one). */
export const JUNCTION_2026_STRATEGY = `# Junction 2026 strategy (team directive)

How we win Junction, in priority order:

1. **Win a partner track first.** Partner companies set the challenges and judge them. Build what that partner
   could actually use or show internally. Talk to their mentors early and quote what they said.
2. **Use the partner's technology at runtime.** Claude Code builds the product; the product itself should run on
   the chosen partner's stack (e.g. OpenAI, Featherless, Modal, Verda, Exa, Aiven, Cloudinary, Hostinger, Arduino).
3. **Fit the theme for the main stage:** "European Tech Renaissance — who moves the center of gravity?"
   Frame the project as questioning an inherited model and replacing it ("everyone does X; we flip it to Y").
4. **Demo over features.** One memorable, working, end-to-end demo moment beats breadth. The mock judge should
   reward a live demo that a judge understands in 30 seconds.
5. **Real time budget is ~40 h, not 48.** Preliminary submission is due Friday 23:55 (6 h after the opening).
   Final submission is Sunday 10:00. Feature freeze Sunday 06:00; submit by 09:00.

Working rules:

- Never reuse pre-written solution code. Prepared tools, boilerplates and starter kits are fine; check the official rules.
- Four people, four Claude Pro plans (\`plan: pro\` in hackforge.yaml → lean profile): split milestones across the four
  laptops with /hackforge:team claim (one builder each, in worktrees). Avoid spawning many parallel agents on one
  machine: it burns one person's limit while the others idle. Never use Fable on Pro plans.
- One driver: only one teammate runs the /hackforge:perfect loop (/hackforge:team driver); the others build their
  claimed tasks and pull.
- If a teammate hits their usage limit, hand their milestone to whoever has the most left.
- ElevenLabs is for pitch narration, and inside the product only when voice really is the point.
- Never submit anything automatically; prepare the submission and list the steps.
`

export const JUNCTION_2026_BRIEF = `# Junction 2026 — event brief

- **Event:** Junction 2026: The European Tech Renaissance — Europe's largest hackathon
- **Dates:** 13–15 November 2026, physical, 48 h format
- **Location:** Hype Arena, Vanha Jorvaksentie, 02320 Espoo (metro from central Helsinki)
- **Team:** 1–4 people (we are 4)
- **Theme:** "Who moves the center of gravity?" — question the inherited model and build the one that comes next.
  Copernicus did not discover a new star; he refused to accept where everyone had placed the center.
- **Challenge areas (tracks not locked yet):** AI, hardware, sustainability, fintech, health, defence, quantum.
  Challenges are set by partner companies and announced at the opening ceremony.

## Schedule (Helsinki time)
| When | What |
|---|---|
| Fri 13 Nov 16:00 | Doors open |
| Fri 13 Nov 18:00 | Opening ceremony (challenges presented) |
| Fri 13 Nov 23:55 | **Preliminary submission** |
| Sun 15 Nov 10:00 | **Final submissions** |
| Sun 15 Nov 14:00 | Review time |
| Sun 15 Nov 17:00 | Event ends |
| Sun 15 Nov 18:00 | Doors close |

## Partners
Aalto University, Arduino, cala.ai, Exa.ai, Hostinger, Verda, ironshard.ai, Aiven, atach.dev, Cloudinary,
craci.com, Featherless.ai, Modal, OpenAI, Qualia Studios, Lifeline Ventures.

## Not known yet
Official rules, judging criteria, submission format and video length. Add the official documents to
challenge/brief/ as soon as they are published and run /hackforge:rules.
`

/** Settings written to challenge/hackforge.yaml (merged into an existing file, keeping its comments). */
export const JUNCTION_2026_HACKFORGE = {
  challenge: 'Junction 2026',
  deadline: '2026-11-15T10:00+02:00',
  hours: 40,
  team: 4,
  // Four Claude Pro plans: HackForge 2.1's lean profile (Sonnet for most work, Opus only for architects
  // and the advisor, Haiku for checks, at most 2 agents at once, never Fable, which bills extra on Pro).
  plan: 'pro',
  fable_ok: false,
  profile: 'auto',
  // Empty = the profile's per-role defaults (clears overrides from earlier versions of this preset).
  models: { research: '', architect: '', judge: '', build: '', craft: '', verify: '' },
  loop: { enabled: true, target_score: 9.0, reserve_minutes: 240, plateau: 3 },
  checkpoints: ['decision', 'before_submit'],
} as const

export const EVENT_PRESETS = {
  'junction-2026': {
    yaml: JUNCTION_2026_EVENT_YAML,
    files: {
      'challenge/prompts/10-junction-strategy.md': JUNCTION_2026_STRATEGY,
      'challenge/brief/junction-2026-event.md': JUNCTION_2026_BRIEF,
    } as Record<string, string>,
    hackforge: JUNCTION_2026_HACKFORGE as unknown as Record<string, unknown>,
  },
}
export type EventPresetId = keyof typeof EVENT_PRESETS
export const DEFAULT_EVENT: EventPresetId = 'junction-2026'
