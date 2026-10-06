import {
  Bot,
  BrainCircuit,
  Bug,
  ChartLine,
  Clapperboard,
  FileSearch,
  GitCommitHorizontal,
  Hammer,
  type LucideIcon,
  Minimize2,
  ScanSearch,
  ShieldCheck,
  Sparkles,
  TestTube,
} from 'lucide-react'

export interface ActionParam {
  key: string
  label: string
  /** Prefilled value; also shown as the placeholder so it's clear what fits. */
  example: string
  hint?: string
  multiline?: boolean
  options?: string[]
}

export interface QuickAction {
  id: string
  label: string
  icon: LucideIcon
  description: string
  /** Prompt with {param} placeholders. */
  template: string
  params: ActionParam[]
  /** Runs before the prompt is sent (e.g. saving a setting the command reads). */
  beforeRun?: (values: Record<string, string>, cwd: string) => Promise<void>
}

/** Prompt-level actions: what people most often ask Claude to do, with sensible example parameters. */
export const QUICK_ACTIONS: QuickAction[] = [
  {
    id: 'parallel',
    label: 'Parallel agents',
    icon: Bot,
    description: 'Split work across several subagents that run at the same time. Each gets its own live card on the Board.',
    template:
      'Spawn {count} subagents in parallel to {goal}. Give each a distinct focus: {areas}. Have each report progress and show its key results in Harness. Then combine their findings into one summary.',
    params: [
      { key: 'count', label: 'How many agents', example: '3', options: ['2', '3', '4', '5'] },
      { key: 'goal', label: 'Goal', example: 'review the code in src/' },
      { key: 'areas', label: 'Focus areas', example: 'correctness, performance, readability' },
    ],
  },
  {
    id: 'train',
    label: 'Train a model',
    icon: BrainCircuit,
    description: 'Write and run a training script that streams live progress and metrics to its card, then shows the loss curve.',
    template:
      'Train a {model} on {dataset} for {epochs} epochs. Write the training script so it reports each epoch to Harness ($HARNESS_URL) with loss and accuracy, run it in the background, then plot the learning curves and show them. Summarize the final metrics.',
    params: [
      { key: 'model', label: 'Model', example: 'small MLP classifier' },
      { key: 'dataset', label: 'Dataset', example: 'scikit-learn digits dataset' },
      { key: 'epochs', label: 'Epochs', example: '20' },
    ],
  },
  {
    id: 'visualize',
    label: 'Analyze data',
    icon: ChartLine,
    description: 'Explore a data file and display charts and tables of what stands out.',
    template: 'Load {file}, explore it, and show the {n} most interesting findings in Harness as charts or tables, each with a one-line takeaway.',
    params: [
      { key: 'file', label: 'Data file', example: 'data/sales.csv' },
      { key: 'n', label: 'Number of findings', example: '3' },
    ],
  },
  {
    id: 'tests',
    label: 'Fix failing tests',
    icon: TestTube,
    description: 'Run the test suite, then fix what fails, with progress on the card.',
    template: 'Run `{command}` and fix any failing tests. Track each failure as a task and report progress as you go. Do not skip or disable tests.',
    params: [{ key: 'command', label: 'Test command', example: 'npm test' }],
  },
  {
    id: 'feature',
    label: 'Build a feature',
    icon: Hammer,
    description: 'Plan with tasks, implement, and verify a feature end to end.',
    template: 'Implement {feature}. First break it into tasks, then build it, add tests, and run them. Constraints: {constraints}.',
    params: [
      { key: 'feature', label: 'Feature', example: 'a dark-mode toggle in the settings page', multiline: true },
      { key: 'constraints', label: 'Constraints', example: 'follow the existing code style; no new dependencies' },
    ],
  },
  {
    id: 'debug',
    label: 'Debug an issue',
    icon: Bug,
    description: 'Reproduce, find the root cause, and fix a bug.',
    template: 'Debug this: {symptom}. Reproduce it first, find the root cause, fix it, and add a regression test.',
    params: [{ key: 'symptom', label: 'What goes wrong', example: 'the app crashes when the upload is larger than 10 MB', multiline: true }],
  },
  {
    id: 'explain',
    label: 'Explain code',
    icon: FileSearch,
    description: 'Get a guided tour of how something works, with file references.',
    template: 'Explain how {topic} works in this codebase. Walk through the flow with file:line references and draw a short diagram in markdown.',
    params: [{ key: 'topic', label: 'Topic', example: 'authentication' }],
  },
  {
    id: 'remotion',
    label: 'Remotion video',
    icon: Clapperboard,
    description: 'Create or change a Remotion composition.',
    template: 'In this Remotion project, create a {duration}-second composition called {name} that {description}. Register it in the root and render a still of frame {frame} to show me.',
    params: [
      { key: 'name', label: 'Composition name', example: 'Intro' },
      { key: 'duration', label: 'Duration (seconds)', example: '5' },
      { key: 'description', label: 'What it shows', example: 'animates the logo in with a spring and fades in a tagline', multiline: true },
      { key: 'frame', label: 'Preview frame', example: '60' },
    ],
  },
  {
    id: 'commit',
    label: 'Commit changes',
    icon: GitCommitHorizontal,
    description: 'Review uncommitted changes and write a clear commit.',
    template: 'Review my uncommitted changes, then commit them with a clear message{scope}.',
    params: [{ key: 'scope', label: 'Extra instructions', example: ' in conventional-commit style', hint: 'Optional' }],
  },
]

export interface CommandInfo {
  description: string
  args?: ActionParam
  icon?: LucideIcon
}

/** Descriptions and example arguments for slash commands worth surfacing as buttons. */
export const KNOWN_COMMANDS: Record<string, CommandInfo> = {
  compact: {
    description: 'Summarize the conversation to free up context.',
    icon: Minimize2,
    args: { key: 'args', label: 'What to keep in focus', example: 'Keep the API design decisions and open TODOs', hint: 'Optional' },
  },
  init: { description: 'Analyze this project and write a CLAUDE.md with its conventions.', icon: Sparkles },
  'code-review': {
    description: 'Review the current changes for bugs.',
    icon: ScanSearch,
    args: { key: 'args', label: 'Target or effort', example: 'high', options: ['low', 'medium', 'high', 'max'] },
  },
  'security-review': { description: 'Security review of the pending changes on this branch.', icon: ShieldCheck },
  simplify: { description: 'Clean up the changed code for reuse and clarity.' },
  review: { description: 'Review a pull request.', args: { key: 'args', label: 'PR number', example: '42' } },
  context: { description: 'Show what is using the context window.' },
  usage: { description: 'Show usage and cost for this session.' },
  recap: { description: 'Summarize what happened in this session so far.' },
  model: { description: 'Switch model.', args: { key: 'args', label: 'Model', example: 'opus', options: ['opus', 'sonnet', 'haiku'] } },
}

/** Commands that only make sense in the terminal UI. */
const HIDDEN_COMMANDS = new Set([
  'clear', 'color', 'config', 'heapdump', 'fast', 'focus', 'output-style', 'reload-plugins', 'reload-skills',
  'design-consent', 'design-revoke', 'rename', 'import', 'doctor', 'mcp', 'agents', 'list-agents', 'autocompact', 'effort',
])

export function visibleCommands(all: string[]): string[] {
  return all.filter((c) => !c.startsWith('_') && !HIDDEN_COMMANDS.has(c))
}

export function commandAction(name: string): QuickAction {
  const info = KNOWN_COMMANDS[name]
  const args = info?.args ?? { key: 'args', label: 'Arguments', example: '', hint: 'Optional' }
  return {
    id: `cmd:${name}`,
    label: `/${name}`,
    icon: info?.icon ?? Sparkles,
    description: info?.description ?? `Run the /${name} command or skill.`,
    template: `/${name} {args}`,
    params: [args],
  }
}

/** Fills {param} placeholders; trims the trailing space a blank optional argument leaves. */
export function fillTemplate(template: string, values: Record<string, string>): string {
  return template.replace(/\{(\w+)\}/g, (_, k: string) => values[k] ?? '').replace(/[ \t]+$/gm, '').trim()
}
