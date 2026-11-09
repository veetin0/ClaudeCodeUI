/**
 * The built-in example event: a generic weekend hackathon. Its dates roll forward (the first Friday
 * at least two weeks away, in this computer's time zone), so the example never runs out. Setting up
 * an event project writes a copy into challenge/event.yaml with those concrete dates, to edit.
 */
import { isTimeZone, zoneOffsetMinutes, zonedTime } from '../event'

export const DEFAULT_EVENT = 'weekend-hackathon'
export type EventPresetId = typeof DEFAULT_EVENT

export interface EventPreset {
  /** challenge/event.yaml */
  yaml: string
  /** Other files written into the project (only when missing), by path. */
  files: Record<string, string>
  /** Settings merged into challenge/hackforge.yaml. */
  hackforge: Record<string, unknown>
}

export const EVENT_NAME = 'Weekend Hackathon'

export function localTimeZone(): string {
  try {
    const zone = Intl.DateTimeFormat().resolvedOptions().timeZone
    return zone && isTimeZone(zone) ? zone : 'UTC'
  } catch {
    return 'UTC'
  }
}

const pad = (n: number) => String(n).padStart(2, '0')
const ymd = (d: Date) => `${d.getUTCFullYear()}-${pad(d.getUTCMonth() + 1)}-${pad(d.getUTCDate())}`

/** The event's Friday as a calendar date (UTC midnight): the first Friday at least `leadDays` after `now` in `zone`. */
function eventFriday(now: number, zone: string, leadDays = 14): Date {
  const [y, m, d] = new Intl.DateTimeFormat('en-CA', { timeZone: zone, year: 'numeric', month: '2-digit', day: '2-digit' }).format(now).split('-').map(Number)
  const day = new Date(Date.UTC(y, m - 1, d + leadDays))
  while (day.getUTCDay() !== 5) day.setUTCDate(day.getUTCDate() + 1)
  return day
}

/** "2026-11-15 10:00" in `zone` as an ISO time with that zone's offset, e.g. "2026-11-15T10:00+02:00". */
function isoWithOffset(local: string, zone: string): string {
  const off = zoneOffsetMinutes(zonedTime(local, zone), zone)
  const sign = off < 0 ? '-' : '+'
  return `${local.replace(' ', 'T')}${sign}${pad(Math.floor(Math.abs(off) / 60))}:${pad(Math.abs(off) % 60)}`
}

export function eventPreset(_id: EventPresetId = DEFAULT_EVENT, now = Date.now(), zone = localTimeZone()): EventPreset {
  const fri = eventFriday(now, zone)
  /** The date `offset` days from the event's Friday. */
  const day = (offset: number) => ymd(new Date(fri.getTime() + offset * 86_400_000))
  const at = (offset: number, time: string) => `${day(offset)} ${time}`
  const final = at(2, '10:00')

  const yaml = `# ${EVENT_NAME} — the built-in example event for Harness.
# Everything here is an example: put your event's name, times, partners and checklists in.
# Times are local to the time zone below. Harness and HackForge both read this file;
# commit it so the whole team shares it.

id: ${DEFAULT_EVENT}
name: "${EVENT_NAME}"
theme: "Open track"
tagline: "Build something you'd want to use yourself"
location: "Your venue"
timezone: ${zone}
team_size: 4
team: ["Member 1", "Member 2", "Member 3", "Member 4"]

schedule:
  # Official
  - { id: doors-open, label: "Doors open", at: "${at(0, '16:00')}", kind: official }
  - { id: opening, label: "Opening ceremony", at: "${at(0, '18:00')}", kind: official, note: "Challenges are presented — paste them into challenge/brief/ right away" }
  - { id: preliminary, label: "Preliminary submission", at: "${at(0, '23:55')}", kind: deadline }
  - { id: final, label: "Final submissions", at: "${final}", kind: deadline }
  - { id: review, label: "Judging", at: "${at(2, '14:00')}", kind: official }
  - { id: event-ends, label: "Event ends", at: "${at(2, '17:00')}", kind: official }
  - { id: doors-close, label: "Doors close", at: "${at(2, '18:00')}", kind: official }
  # Suggested plan (edit it to fit your team)
  - { id: shortlist, label: "Shortlist 2–3 challenges, talk to their mentors", at: "${at(0, '18:45')}", kind: plan }
  - { id: decision, label: "Decision checkpoint: one challenge, one idea, one demo moment", at: "${at(0, '21:30')}", kind: plan }
  - { id: prelim-target, label: "Send the preliminary submission", at: "${at(0, '23:00')}", kind: plan, note: "55 min buffer" }
  - { id: mvp, label: "Thinnest end-to-end version works and is deployed", at: "${at(1, '09:00')}", kind: plan }
  - { id: mentor-check, label: "Show it to a partner mentor, adjust", at: "${at(1, '12:00')}", kind: plan }
  - { id: verify-loop, label: "Verify, then start the improvement loop", at: "${at(1, '20:00')}", kind: plan }
  - { id: freeze, label: "Feature freeze", at: "${at(2, '06:00')}", kind: plan }
  - { id: video, label: "Demo video, README, final verify", at: "${at(2, '06:00')}", end: "${at(2, '08:30')}", kind: plan }
  - { id: submit-target, label: "Submit", at: "${at(2, '09:00')}", kind: plan, note: "1 h buffer" }
  # Sleep in shifts so someone is always awake
  - { id: sleep-1, label: "Sleep: first shift", at: "${at(1, '03:00')}", end: "${at(1, '06:30')}", kind: sleep }
  - { id: sleep-2, label: "Sleep: second shift", at: "${at(1, '06:30')}", end: "${at(1, '10:00')}", kind: sleep }

# The event's partners (name, url, category, note). Add yours here; API keys go under
# Hackathon › Challenges → API keys.
partners: []

checklist:
  # Preparation (an example list: replace it with your own)
  - { id: install, group: prep, due: "${day(-14)}", label: "Harness and HackForge installed and tested on every laptop" }
  - { id: roles, group: prep, due: "${day(-14)}", label: "Roles agreed (for example: pilot, core builder, experience builder, story & partners)" }
  - { id: past-winners, group: prep, due: "${day(-11)}", label: "Past winners and challenges collected in challenge/examples/" }
  - { id: accounts, group: prep, due: "${day(-8)}", label: "Accounts and API keys for the services you might use (add them under Hackathon › Challenges → API keys)" }
  - { id: kits, group: prep, due: "${day(-8)}", label: "A tested hello-world starter kit per partner technology" }
  - { id: boilerplates, group: prep, due: "${day(-5)}", label: "Boilerplates ready (web app, API + database, deploy script)", note: "Tools only, never the solution. Publish them as open source before the event: some rules allow only open-source code written beforehand" }
  - { id: practice, group: prep, due: "${day(-3)}", label: "A short practice run on a past challenge, on the real schedule" }
  - { id: rules, group: prep, due: "${day(-1)}", label: "Official rules into challenge/brief/ and run /hackforge:rules" }
  # Event-day logistics
  - { id: power, group: logistics, due: "${at(0, '15:00')}", label: "Chargers, power strip, extension cord" }
  - { id: hotspot, group: logistics, due: "${at(0, '15:00')}", label: "Phone hotspot as backup internet" }
  - { id: headset, group: logistics, due: "${at(0, '15:00')}", label: "Headset or mic for recording narration" }
  - { id: logins, group: logistics, due: "${at(0, '16:00')}", label: "Everyone logged in to Claude Code, GitHub and partner consoles; repo cloned" }
  - { id: travel, group: logistics, due: "${at(0, '16:00')}", label: "At the venue when doors open" }
  # Preliminary submission — check the platform for exactly what it asks for
  - { id: p-challenge, group: preliminary, due: "${at(0, '23:55')}", label: "Challenge chosen" }
  - { id: p-team, group: preliminary, due: "${at(0, '23:55')}", label: "Every team member on the submission" }
  - { id: p-name, group: preliminary, due: "${at(0, '23:55')}", label: "Project name and one-line pitch" }
  - { id: p-desc, group: preliminary, due: "${at(0, '23:55')}", label: "Short description of the idea and approach" }
  - { id: p-sent, group: preliminary, due: "${at(0, '23:00')}", label: "Submitted (target 23:00)" }
  # Final submission
  - { id: f-freeze, group: final, due: "${at(2, '06:00')}", label: "Feature freeze at 06:00" }
  - { id: f-verify, group: final, due: "${at(2, '08:00')}", label: "/hackforge:verify final shows COMPLIANCE: PASS" }
  - { id: f-video, group: final, due: "${at(2, '08:30')}", label: "Demo video with narration, within the length limit" }
  - { id: f-deck, group: final, due: "${at(2, '08:30')}", label: "Pitch deck PDF, if the submission asks for one (Pitch tab)" }
  - { id: f-readme, group: final, due: "${at(2, '08:30')}", label: "README: what it does, setup, what's real vs mocked, partner tech used" }
  - { id: f-demo, group: final, due: "${at(2, '08:30')}", label: "Deployed demo link works from a phone" }
  - { id: f-repo, group: final, due: "${at(2, '08:30')}", label: "Repository shared as the rules require" }
  - { id: f-backup, group: final, due: "${at(2, '09:00')}", label: "Backup demo recording on two laptops" }
  - { id: f-sent, group: final, due: "${at(2, '09:00')}", label: "Submitted (target 09:00)" }
`

  const strategy = `# Event approach (team directive, an example: edit it)

What tends to win a partner-track hackathon, in priority order:

1. **Win a partner track first.** Partner companies set the challenges and judge them. Build what that partner
   could actually use or show internally. Talk to their mentors early and quote what they said.
2. **Use the partner's technology at runtime.** Claude Code builds the product; the product itself should run on
   the chosen partner's stack.
3. **Fit the event's theme for the main stage.** Frame the project as questioning an inherited model and
   replacing it ("everyone does X; this does Y").
4. **Demo over features.** One memorable, working, end-to-end demo moment beats breadth. The mock judge should
   reward a live demo that a judge understands in 30 seconds.
5. **The real time budget is ~40 h, not 48.** The preliminary submission is due Friday 23:55 (6 h after the
   opening). Final submission is Sunday 10:00. Feature freeze Sunday 06:00; submit by 09:00.

Working rules:

- Never reuse pre-written solution code. Prepared tools, boilerplates and starter kits are usually fine, but some events
  allow only open-source code written before the event: publish them as open source beforehand or rebuild them there.
  Check the official rules.
- Split milestones across the team's laptops with /hackforge:team claim (one builder each, in worktrees) rather than
  running many parallel agents on one machine, which burns one person's plan while the others idle.
- One driver: only one teammate runs the /hackforge:perfect loop (/hackforge:team driver); the others build their
  claimed tasks and pull.
- If a teammate hits their usage limit, hand their milestone to whoever has the most left.
- Never submit anything automatically; prepare the submission and list the steps.
`

  const brief = `# ${EVENT_NAME} — event brief (an example: replace it with your event's)

- **Format:** 48 h, in person, teams of 1–4
- **Theme:** "Open track": build something you'd want to use yourself.
- **Challenges** are set by partner companies and announced at the opening ceremony.

## Schedule (${zone})
| When | What |
|---|---|
| ${at(0, '16:00')} | Doors open |
| ${at(0, '18:00')} | Opening ceremony (challenges presented) |
| ${at(0, '23:55')} | **Preliminary submission** |
| ${final} | **Final submissions** |
| ${at(2, '14:00')} | Judging |
| ${at(2, '17:00')} | Event ends |

## Not known yet
Official rules, judging criteria, submission format and video length. Add the official documents to
challenge/brief/ as soon as they are published and run /hackforge:rules.
`

  return {
    yaml,
    files: {
      'challenge/prompts/10-event-strategy.md': strategy,
      'challenge/brief/event-brief.md': brief,
    },
    // Written to challenge/hackforge.yaml (merged into an existing file, keeping its comments).
    hackforge: {
      challenge: EVENT_NAME,
      deadline: isoWithOffset(final, zone),
      hours: 40,
      team: 4,
      // Assumes Claude Pro plans: HackForge's lean profile (Sonnet for most work, Opus only for architects and
      // the advisor, Haiku for checks, at most 2 agents at once). Change to 'max' in hackforge.yaml on Max plans.
      plan: 'pro',
      fable_ok: false,
      profile: 'auto',
      // Empty = the profile's per-role defaults (clears overrides from earlier versions of this preset).
      models: { research: '', architect: '', judge: '', build: '', craft: '', verify: '' },
      loop: { enabled: true, target_score: 9.0, reserve_minutes: 240, plateau: 3 },
      checkpoints: ['decision', 'before_submit'],
    },
  }
}
