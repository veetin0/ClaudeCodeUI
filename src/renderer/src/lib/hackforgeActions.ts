import { Anvil, Clapperboard, ClipboardCheck, Compass, Crosshair, FolderPlus, Gauge, Hammer, History, LayoutDashboard, LifeBuoy, Megaphone, Repeat, Rocket, Scale, Users } from 'lucide-react'
import { HACKFORGE_PROFILES } from '@shared/hackforge'
import type { QuickAction } from './actions'

/** HackForge 2.1's commands as buttons (plugin skills are invoked as /hackforge:<name>). */
export const HACKFORGE_ACTIONS: QuickAction[] = [
  {
    id: 'hf-help',
    label: 'Help',
    icon: LifeBuoy,
    description: 'The one next thing to do, based on where the project is.',
    template: '/hackforge:help',
    params: [],
  },
  {
    id: 'hf-init',
    label: 'Init',
    icon: FolderPlus,
    description: 'Set up challenge/ and hackforge.yaml with a short guided setup (deadline, team size, Claude plan, profile), set up git, and check this machine can run HackForge.',
    template: '/hackforge:init {name}',
    params: [{ key: 'name', label: 'Project name', example: '', hint: 'Optional' }],
  },
  {
    id: 'hf-run',
    label: 'Run',
    icon: Rocket,
    description: 'The full pipeline: kickoff → build → pitch → verify → improvement loop, stopping only at your checkpoints. The profile is saved to hackforge.yaml first.',
    template: '/hackforge:run {notes}',
    params: [
      { key: 'profile', label: 'Profile', example: 'auto', options: [...HACKFORGE_PROFILES], hint: 'lean = Pro-plan friendly · max = deepest' },
      { key: 'notes', label: 'Options', example: '', hint: 'Optional: --auto (skip checkpoints), --focus "…"' },
    ],
    beforeRun: async (values, cwd) => {
      if (values.profile) await window.harness.hackforgeSetProfile(cwd, values.profile)
    },
  },
  {
    id: 'hf-kickoff',
    label: 'Kickoff',
    icon: Compass,
    description: 'Read everything in challenge/, extract rules and research in parallel, scout possibilities, have architects propose and a judge panel pick.',
    template: '/hackforge:kickoff',
    params: [],
  },
  {
    id: 'hf-build',
    label: 'Build',
    icon: Hammer,
    description: 'Per-milestone contracts and gate.sh, then waves of builders in worktrees, a scope check before each merge, integrated and verified.',
    template: '/hackforge:build {args}',
    params: [{ key: 'args', label: 'Milestone or focus', example: '', hint: 'Optional, e.g. M2' }],
  },
  {
    id: 'hf-verify',
    label: 'Verify',
    icon: ClipboardCheck,
    description: 'Independent audit: clean run with evidence, read-only compliance audit, judge panel. Writes verify.json and VERIFY.md. Quick = one judge on what changed; full = whole panel; final = full plus submission checks.',
    template: '/hackforge:verify {mode}',
    params: [{ key: 'mode', label: 'Mode', example: 'full', options: ['quick', 'full', 'final'] }],
  },
  {
    id: 'hf-perfect',
    label: 'Perfect',
    icon: Repeat,
    description: 'Improve → verify loop with locked checks. A Stop hook keeps it going until the gate passes, it plateaus, the advisor stops it, or it hits the cap, time limit or deadline. One teammate drives the loop.',
    template: '/hackforge:perfect --target {target} --max {max} {extra}',
    params: [
      { key: 'target', label: 'Target score', example: '9.0', options: ['8.5', '9.0', '9.5'] },
      { key: 'max', label: 'Max iterations', example: '30' },
      { key: 'extra', label: 'More options', example: '', hint: 'Optional: --hours 3, --reserve 90, --plateau 3, --wake' },
    ],
  },
  {
    id: 'hf-pitch',
    label: 'Pitch',
    icon: Megaphone,
    description: 'README, timed demo script, slides, video and a backup demo, with a blind first-impression check.',
    template: '/hackforge:pitch {args}',
    params: [{ key: 'args', label: 'Notes', example: '', hint: 'Optional, e.g. 3-minute limit' }],
  },
  {
    id: 'hf-video',
    label: 'Video',
    icon: Clapperboard,
    description: 'The pitch or demo video: picks a treatment for the subject (3D product hero, digital-twin flythrough, data in motion, device mockup…), storyboard first. Builds on the Pitch studio in pitch/.',
    template: '/hackforge:video {args}',
    params: [{ key: 'args', label: 'Options', example: '--length 90', hint: 'Optional: --vertical, --no-3d, --voice elevenlabs' }],
  },
  {
    id: 'hf-craft',
    label: 'Craft',
    icon: Anvil,
    description: 'Scripted, reproducible non-code assets: 3D (Blender), CAD, audio, video, hardware, interactive, pitch assets.',
    template: '/hackforge:craft {asset}',
    params: [{ key: 'asset', label: 'Asset', example: 'a 20-second product teaser video' }],
  },
  {
    id: 'hf-eval',
    label: 'Eval',
    icon: Gauge,
    description: 'Real metric, honest split, baseline and a run log.',
    template: '/hackforge:eval {args}',
    params: [{ key: 'args', label: 'Metric or notes', example: '', hint: 'Optional' }],
  },
  {
    id: 'hf-team',
    label: 'Team',
    icon: Users,
    description: 'Coordinate the team on one project: join (pull and check this machine), claim a task, who is on what, hand off, or choose the one teammate who drives the loop.',
    template: '/hackforge:team {cmd} {arg}',
    params: [
      { key: 'cmd', label: 'Command', example: 'who', options: ['join', 'who', 'claim', 'handoff', 'driver'] },
      { key: 'arg', label: 'Task or name', example: '', hint: 'For claim (task) or driver (name)' },
    ],
  },
  {
    id: 'hf-focus',
    label: 'Focus',
    icon: Crosshair,
    description: 'Steer the run mid-way. Saved to challenge/prompts/ as a team directive.',
    template: '/hackforge:focus "{text}"',
    params: [{ key: 'text', label: 'Directive', example: 'Prioritise the live demo over extra features', multiline: true }],
  },
  {
    id: 'hf-rules',
    label: 'Rules',
    icon: Scale,
    description: 'Fold new organiser announcements from challenge/brief/ into the rules.',
    template: '/hackforge:rules',
    params: [],
  },
  {
    id: 'hf-views',
    label: 'Views',
    icon: LayoutDashboard,
    description: 'One-page HTML views for teammates, mentors and sponsors: plan brief, progress with score history, and ship / wait / reject.',
    template: '/hackforge:views {which}',
    params: [{ key: 'which', label: 'Which', example: 'all', options: ['all', 'brief', 'progress', 'accept'] }],
  },
  {
    id: 'hf-status',
    label: 'Status',
    icon: Compass,
    description: 'Where things stand and the next best action.',
    template: '/hackforge:status',
    params: [],
  },
  {
    id: 'hf-retro',
    label: 'Retro',
    icon: History,
    description: 'After the hackathon: turn what went wrong into short lessons (you approve each) that HackForge loads at every future kickoff.',
    template: '/hackforge:retro',
    params: [],
  },
]

/** Actions that make sense before kickoff has created .hackforge/. */
export const HACKFORGE_SETUP = new Set(['hf-help', 'hf-init', 'hf-run', 'hf-kickoff', 'hf-team', 'hf-status'])
