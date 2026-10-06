import { Anvil, ClipboardCheck, Compass, Crosshair, FolderPlus, Gauge, Hammer, Megaphone, Repeat, Rocket, Scale } from 'lucide-react'
import { HACKFORGE_PROFILES } from '@shared/hackforge'
import type { QuickAction } from './actions'

/** HackForge's commands as buttons (plugin skills are invoked as /hackforge:<name>). */
export const HACKFORGE_ACTIONS: QuickAction[] = [
  {
    id: 'hf-init',
    label: 'Init',
    icon: FolderPlus,
    description: 'Create challenge/ (brief, data, assets, prompts, examples) and hackforge.yaml, set up git, and check which tools are installed.',
    template: '/hackforge:init',
    params: [],
  },
  {
    id: 'hf-run',
    label: 'Run',
    icon: Rocket,
    description: 'The full pipeline: kickoff → build → pitch → verify → improvement loop, stopping only at your checkpoints. The profile is saved to hackforge.yaml first.',
    template: '/hackforge:run {notes}',
    params: [
      { key: 'profile', label: 'Profile', example: 'auto', options: [...HACKFORGE_PROFILES], hint: 'sprint = fast · max = deepest' },
      { key: 'notes', label: 'Extra instructions', example: '', hint: 'Optional' },
    ],
    beforeRun: async (values, cwd) => {
      if (values.profile) await window.harness.hackforgeSetProfile(cwd, values.profile)
    },
  },
  {
    id: 'hf-kickoff',
    label: 'Kickoff',
    icon: Compass,
    description: 'Read everything in challenge/, extract rules and research in parallel, scout possibilities, have N architects propose and a judge panel pick.',
    template: '/hackforge:kickoff',
    params: [],
  },
  {
    id: 'hf-build',
    label: 'Build',
    icon: Hammer,
    description: 'Vertical-slice plan, frozen contracts and gate.sh, then waves of parallel builders in worktrees, integrated and verified.',
    template: '/hackforge:build {args}',
    params: [{ key: 'args', label: 'Milestone or focus', example: '', hint: 'Optional, e.g. M2' }],
  },
  {
    id: 'hf-verify',
    label: 'Verify',
    icon: ClipboardCheck,
    description: 'Clean run, rules audit and judge panel. Writes COMPLIANCE and MOCK_SCORE to .hackforge/VERIFY.md.',
    template: '/hackforge:verify {mode}',
    params: [{ key: 'mode', label: 'Mode', example: '', options: ['', 'final'], hint: '"final" also checks submission details' }],
  },
  {
    id: 'hf-perfect',
    label: 'Perfect',
    icon: Repeat,
    description: 'Improve → verify loop. A Stop hook keeps it going until the gate passes, it plateaus, or hits the cap, time limit or deadline.',
    template: '/hackforge:perfect target {target} max {max} hours {hours}',
    params: [
      { key: 'target', label: 'Target score', example: '9.0', options: ['8.5', '9.0', '9.5'] },
      { key: 'max', label: 'Max iterations', example: '30' },
      { key: 'hours', label: 'Max hours', example: '3' },
    ],
  },
  {
    id: 'hf-pitch',
    label: 'Pitch',
    icon: Megaphone,
    description: 'README, timed demo script, slides, video and a backup demo.',
    template: '/hackforge:pitch {args}',
    params: [{ key: 'args', label: 'Notes', example: '', hint: 'Optional, e.g. 3-minute limit' }],
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
    id: 'hf-status',
    label: 'Status',
    icon: Compass,
    description: 'Where things stand and the next best action.',
    template: '/hackforge:status',
    params: [],
  },
]

/** Actions that make sense before kickoff has created .hackforge/. */
export const HACKFORGE_SETUP = new Set(['hf-init', 'hf-run', 'hf-kickoff', 'hf-status'])
