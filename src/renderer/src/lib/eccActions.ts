import { BookOpen, Bug, ClipboardCheck, FileText, Hammer, ListChecks, Paintbrush, Plus, Repeat, ScanSearch, ShieldCheck, Sparkles, TestTube, Trash2, Wrench } from 'lucide-react'
import type { QuickAction } from './actions'

/**
 * ECC's pipeline and its most useful tools as buttons (plugin commands and skills are invoked as
 * /ecc:<name>). The order is the build's: idea → PRD → plan → MVP → make it better → check it.
 */
export const ECC_ACTIONS: QuickAction[] = [
  {
    id: 'ecc-prd',
    label: 'Write the PRD',
    icon: FileText,
    description: 'A lean, problem-first product spec for an idea: who it is for, what it must do, what is out of scope. Saved in .claude/prds/.',
    template: '/ecc:plan-prd {idea}',
    params: [{ key: 'idea', label: 'Idea', example: '', hint: 'Blank: Claude starts with questions', multiline: true }],
  },
  {
    id: 'ecc-plan',
    label: 'Plan it',
    icon: ListChecks,
    description: 'Requirements, risks and a step-by-step implementation plan from a PRD or a description. Waits for your OK before touching code.',
    template: '/ecc:plan {what}',
    params: [{ key: 'what', label: 'PRD or feature', example: '', hint: 'A .claude/prds/*.prd.md path, or describe the feature' }],
  },
  {
    id: 'ecc-mvp',
    label: 'Build the MVP',
    icon: Hammer,
    description: 'From a PRD or design doc to a running app: slice it, scaffold, build each slice test-first with builder and evaluator agents, review, and commit at each gate.',
    template: '/ecc:orch-build-mvp {doc}',
    params: [{ key: 'doc', label: 'Spec', example: '', hint: 'Path to the PRD or design doc' }],
  },
  {
    id: 'ecc-improve',
    label: 'Make it better',
    icon: Repeat,
    description: 'A generator → evaluator loop: one agent builds, another uses the app in a real browser and scores it against the rubric, until it passes.',
    template: '/ecc:gan-build "{ask}" --max-iterations {max}',
    params: [
      { key: 'ask', label: 'What should be better?', example: '', multiline: true },
      { key: 'max', label: 'Max iterations', example: '5', options: ['3', '5', '10', '15'] },
    ],
  },
  {
    id: 'ecc-feature',
    label: 'Add a feature',
    icon: Plus,
    description: 'Research, plan, build test-first, review, and commit a new feature end to end.',
    template: '/ecc:orch-add-feature {feature}',
    params: [{ key: 'feature', label: 'Feature', example: '', multiline: true }],
  },
  {
    id: 'ecc-bug',
    label: 'Fix a bug',
    icon: Bug,
    description: 'Reproduce it as a failing test, fix it to green, review, and commit.',
    template: '/ecc:orch-fix-defect {bug}',
    params: [{ key: 'bug', label: 'What goes wrong', example: '', multiline: true }],
  },
  {
    id: 'ecc-polish',
    label: 'Polish the UI',
    icon: Paintbrush,
    description: 'A product-specific design direction, then the screens reworked to it: layout, type, colour, states, motion and accessibility.',
    template: 'Use the ecc:frontend-design-direction skill to set a design direction for this product, then apply it to the app. {focus}',
    params: [{ key: 'focus', label: 'Focus', example: '', hint: 'Optional, e.g. the landing page' }],
  },
  {
    id: 'ecc-review',
    label: 'Code review',
    icon: ScanSearch,
    description: 'A checklist review of the uncommitted changes (or a PR number): correctness, security, tests, readability.',
    template: '/ecc:code-review {target}',
    params: [{ key: 'target', label: 'PR', example: '', hint: 'Optional: a PR number or URL; blank reviews local changes' }],
  },
  {
    id: 'ecc-security',
    label: 'Security review',
    icon: ShieldCheck,
    description: 'Auth, input handling, secrets, API endpoints and payments checked against ECC’s security checklist, with fixes.',
    template: 'Use the ecc:security-review skill to review this project for security problems and fix what you find. {focus}',
    params: [{ key: 'focus', label: 'Focus', example: '', hint: 'Optional, e.g. the API routes' }],
  },
  {
    id: 'ecc-verify',
    label: 'Verify',
    icon: ClipboardCheck,
    description: 'Build, type check, lint, tests with coverage, a security grep and a diff review, with a PASS/FAIL report.',
    template: 'Use the ecc:verification-loop skill to verify the project and report PASS or FAIL.',
    params: [],
  },
  {
    id: 'ecc-build-fix',
    label: 'Fix the build',
    icon: Wrench,
    description: 'Finds the build system and fixes build and type errors one at a time with the smallest safe change.',
    template: '/ecc:build-fix',
    params: [],
  },
  {
    id: 'ecc-tests',
    label: 'Add tests',
    icon: TestTube,
    description: 'Measures coverage, finds the gaps and writes the missing tests toward a target.',
    template: '/ecc:test-coverage {target}',
    params: [{ key: 'target', label: 'Target', example: '80%' }],
  },
  {
    id: 'ecc-clean',
    label: 'Remove dead code',
    icon: Trash2,
    description: 'Finds unused code and removes it safely, checking after each change.',
    template: '/ecc:refactor-clean',
    params: [],
  },
  {
    id: 'ecc-docs',
    label: 'Update the docs',
    icon: BookOpen,
    description: 'Brings the README and docs in line with the code: scripts, routes, schemas and exports.',
    template: '/ecc:update-docs',
    params: [],
  },
]

/** ECC's orchestrated flows, shown first in the menus. */
export const ECC_FLOW = new Set(['ecc-prd', 'ecc-plan', 'ecc-mvp', 'ecc-improve', 'ecc-feature', 'ecc-bug'])

/** Icon for a free-form "ask ECC" entry. */
export const ECC_ICON = Sparkles
