import type { HackforgeMode, HackforgeSnapshot } from '@shared/hackforge'

export interface NextStep {
  /** The HackForge action (lib/hackforgeActions) to open. */
  actionId: string
  /** Why it's next, shown as the chip's tooltip. */
  why: string
}

/**
 * The one thing to do next in a HackForge project, from its state: the chip above the prompt
 * box. Nothing outside HackForge projects (unless HackForge is on everywhere).
 */
export function nextStep(hf: HackforgeSnapshot | null | undefined, mode: HackforgeMode): NextStep | null {
  if (mode === 'off') return null
  if (!hf?.present) return mode === 'always' ? { actionId: 'hf-init', why: 'Set this project up for HackForge: challenge/ for the brief, rules and data.' } : null
  if (!hf.initialized) return { actionId: 'hf-run', why: 'Put the brief, rules and data into challenge/, then run the pipeline from kickoff.' }
  if (hf.loop?.active) return null
  switch (hf.state.phase) {
    case undefined:
    case 'config':
      return { actionId: 'hf-kickoff', why: 'Kickoff reads the challenge and writes the rules, brief and plan.' }
    case 'understand':
    case 'widen':
    case 'design':
    case 'decide':
      return { actionId: 'hf-run', why: `HackForge is in “${hf.state.phase}”: run it to carry on to the build.` }
    case 'build': {
      const all = hf.milestones.length > 0 && hf.milestones.every((m) => m.status === 'done')
      return all
        ? { actionId: 'hf-verify', why: 'Every milestone is done: verify it the way the judges will.' }
        : { actionId: 'hf-build', why: hf.state.milestone ? `Build ${hf.state.milestone}.` : 'Build the next milestone.' }
    }
    case 'pitch':
      return { actionId: 'hf-pitch', why: 'Write the pitch and the demo script.' }
    case 'verify':
      return { actionId: 'hf-verify', why: 'Score it against the judging criteria.' }
    case 'loop':
      return { actionId: 'hf-perfect', why: 'Improve it in a loop until it hits the target score.' }
    case 'submit':
      return { actionId: 'hf-status', why: 'Check everything the submission needs.' }
  }
}
