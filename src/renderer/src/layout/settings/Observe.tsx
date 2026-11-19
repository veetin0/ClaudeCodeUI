import { SquareTerminal } from 'lucide-react'
import { useEffect, useState } from 'react'
import type { ObserveStatus } from '@shared/ipc'
import { ipcErrorMessage } from '@/lib/time'
import { Row } from './parts'

/** Watching Claude Code sessions started outside Harness, plus optional status hooks. */
export function ObserveSection() {
  const [status, setStatus] = useState<ObserveStatus | null>(null)
  const [error, setError] = useState<string | null>(null)
  useEffect(() => {
    void window.harness.getObserveStatus().then(setStatus)
  }, [])
  if (!status) return null

  const run = async (fn: () => Promise<ObserveStatus>) => {
    try {
      setStatus(await fn())
      setError(null)
    } catch (e) {
      setError(ipcErrorMessage(e))
    }
  }

  return (
    <Row
      icon={<SquareTerminal className="size-3.5" />}
      title="Show sessions from your terminal"
      description={
        <>
          Claude Code sessions you start in iTerm, Terminal or an editor appear in the sidebar and are visualized live, from their transcripts.
          {status.enabled && status.watching > 0 && ` Watching ${status.watching} now.`}
        </>
      }
      on={status.enabled}
      onToggle={(on) => void run(() => window.harness.setObserveEnabled(on))}
    >
      <div className="text-[11px] text-muted">
          <div className="mb-1.5 font-medium text-fg">Live status hooks {status.hooksInstalled ? '· installed' : '(optional)'}</div>
          <p className="mb-2">
            Adds a small hook to <code>{status.settingsPath}</code> so watched sessions show “needs approval”, “done” and “ended” instantly. A backup of the
            file is saved first; removing takes out only Harness’s entries.
          </p>
          {status.hookPort === null && <p className="mb-2 text-warn-ink">Port 47821 is busy, so hooks can’t reach Harness right now.</p>}
          {status.hooksInstalled ? (
            <button
              onClick={() => void run(window.harness.removeObserveHooks)}
              className="rounded-md border border-line px-2.5 py-1 text-[12px] text-fg hover:bg-surface-2"
            >
              Remove hooks
            </button>
          ) : (
            <button
              onClick={() => {
                if (window.confirm(`Add Harness status hooks to ${status.settingsPath}? A backup is saved next to it.`))
                  void run(window.harness.installObserveHooks)
              }}
              className="rounded-md bg-accent px-2.5 py-1 text-[12px] font-medium text-white hover:brightness-110"
            >
              Install hooks
            </button>
          )}
          {error && <p className="mt-1.5 text-danger-ink">{error}</p>}
      </div>
    </Row>
  )
}
