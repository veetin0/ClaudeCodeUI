import type { MetricUpdate, ProgressUpdate } from './visuals'

const MAX_POINTS_PER_METRIC = 500

/** Metric names we recognise in free-form output, e.g. "loss: 0.42", "val_acc=0.91". */
const METRIC_RE =
  /\b((?:train_|val_|valid_|test_|eval_)?(?:loss|acc|accuracy|f1|auc|precision|recall|mae|mse|rmse|r2|lr|reward|perplexity|ppl|bleu|score))\s*[:=]\s*(-?\d+(?:\.\d+)?(?:e[-+]?\d+)?)/gi

/** tqdm: "Training:  45%|████▌     | 450/1000 [00:12<00:15, 36.2it/s]" */
const TQDM_RE = /(?:^|\r|\n)\s*([^\r\n|]*?):?\s*(\d{1,3})%\|[^|]*\|\s*(\d+(?:\.\d+)?[kKM]?)\/(\d+(?:\.\d+)?[kKM]?)/g

/** "Epoch 3/10", "step 120/500", "batch 7 / 32", "[3/10]" style counters. */
const COUNTER_RE = /\b(epoch|step|iteration|iter|batch|round|episode|generation|fold|trial)\s*[:#]?\s*(\d+)\s*(?:\/|of)\s*(\d+)/gi

function num(s: string): number {
  const m = /^(\d+(?:\.\d+)?)([kKM]?)$/.exec(s)
  if (!m) return Number(s)
  const mult = m[2] === 'M' ? 1e6 : m[2] ? 1e3 : 1
  return Number(m[1]) * mult
}

/**
 * Pulls progress counters and metric series out of command output.
 * Returns the *latest* value of each progress counter and the full series of each metric.
 */
export function parseOutput(text: string): { progress: ProgressUpdate[]; metrics: MetricUpdate[] } {
  const progress = new Map<string, ProgressUpdate>()

  for (const m of text.matchAll(TQDM_RE)) {
    const label = m[1].trim().replace(/[:\s]+$/, '') || 'progress'
    const total = num(m[4])
    if (total > 0) progress.set(label, { kind: 'progress', label, current: num(m[3]), total })
  }
  for (const m of text.matchAll(COUNTER_RE)) {
    const label = m[1].toLowerCase()
    const total = Number(m[3])
    const current = Number(m[2])
    if (total > 0 && current <= total) progress.set(label, { kind: 'progress', label, current, total })
  }

  const metrics: MetricUpdate[] = []
  const counts = new Map<string, number>()
  for (const m of text.matchAll(METRIC_RE)) {
    const name = m[1].toLowerCase()
    const value = Number(m[2])
    if (!Number.isFinite(value)) continue
    const step = counts.get(name) ?? 0
    counts.set(name, step + 1)
    metrics.push({ kind: 'metric', name, value, step })
  }

  // Keep the most recent points if a long log produced too many.
  const byName = new Map<string, MetricUpdate[]>()
  for (const m of metrics) byName.set(m.name, [...(byName.get(m.name) ?? []), m])
  const trimmed = [...byName.values()].flatMap((list) => list.slice(-MAX_POINTS_PER_METRIC))

  return { progress: [...progress.values()], metrics: trimmed }
}
