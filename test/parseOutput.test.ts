import { describe, expect, it } from 'vitest'
import { parseOutput } from '@shared/parseOutput'

describe('parseOutput', () => {
  it('reads the latest tqdm bar per label', () => {
    const out = 'Training:  10%|█         | 100/1000 [00:01<00:09]\rTraining:  45%|████▌     | 450/1000 [00:05<00:06]'
    expect(parseOutput(out).progress).toEqual([{ kind: 'progress', label: 'Training', current: 450, total: 1000 }])
  })

  it('reads epoch/step counters', () => {
    const out = 'Epoch 1/10 loss=0.9\nEpoch 2/10 loss=0.7\nstep 50 of 200'
    const { progress } = parseOutput(out)
    expect(progress).toContainEqual({ kind: 'progress', label: 'epoch', current: 2, total: 10 })
    expect(progress).toContainEqual({ kind: 'progress', label: 'step', current: 50, total: 200 })
  })

  it('builds metric series in order', () => {
    const out = 'epoch 1 loss: 0.90 val_acc: 0.50\nepoch 2 loss: 0.62 val_acc: 0.71\nepoch 3 loss: 3.1e-1 val_acc=0.80'
    const { metrics } = parseOutput(out)
    expect(metrics.filter((m) => m.name === 'loss').map((m) => m.value)).toEqual([0.9, 0.62, 0.31])
    expect(metrics.filter((m) => m.name === 'val_acc').map((m) => m.step)).toEqual([0, 1, 2])
  })

  it('ignores impossible counters and ordinary text', () => {
    expect(parseOutput('page 3/2 of the doc; costs 5/10 dollars').progress).toEqual([])
    expect(parseOutput('Step 12/10 done').progress).toEqual([])
    expect(parseOutput('All tests passed').metrics).toEqual([])
  })
})
