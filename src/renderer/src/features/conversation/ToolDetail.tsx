import type { ToolCall } from '@/stores/reducer'

/** Expanded view of one tool call: a readable rendering for common tools, raw JSON otherwise. */
export function ToolDetail({ tool }: { tool: ToolCall }) {
  const input = tool.input
  const str = (k: string) => (typeof input[k] === 'string' ? (input[k] as string) : '')

  let body: React.ReactNode
  if (tool.name === 'Bash') {
    body = <Code label="$" text={str('command')} />
  } else if (tool.name === 'Edit') {
    body = <Diff path={str('file_path')} before={str('old_string')} after={str('new_string')} />
  } else if (tool.name === 'MultiEdit' && Array.isArray(input.edits)) {
    body = (input.edits as { old_string: string; new_string: string }[]).map((e, i) => (
      <Diff key={i} path={i === 0 ? str('file_path') : ''} before={e.old_string} after={e.new_string} />
    ))
  } else if (tool.name === 'Write') {
    body = <Diff path={str('file_path')} before="" after={str('content')} />
  } else if (tool.name === 'Read') {
    body = <div className="font-mono text-[11px] text-muted">{str('file_path')}</div>
  } else {
    body = <Code text={JSON.stringify(input, null, 2)} />
  }

  return (
    <div className="space-y-2 rounded-lg border border-line bg-surface-2/60 p-3">
      {body}
      {tool.output !== undefined && tool.name !== 'Read' && tool.output.length > 0 && (
        <Code label={tool.status === 'error' ? 'error' : 'output'} text={tool.output} error={tool.status === 'error'} />
      )}
      {tool.name === 'Read' && tool.output && (
        <div className="text-[11px] text-muted">{tool.output.split('\n').length} lines read</div>
      )}
    </div>
  )
}

function Code({ text, label, error }: { text: string; label?: string; error?: boolean }) {
  return (
    <div>
      {label && <div className={`mb-1 text-[10px] font-semibold uppercase tracking-wide ${error ? 'text-red-500' : 'text-muted'}`}>{label}</div>}
      <pre className="selectable max-h-72 overflow-auto whitespace-pre-wrap break-words font-mono text-[11.5px] leading-relaxed">{text}</pre>
    </div>
  )
}

function Diff({ path, before, after }: { path: string; before: string; after: string }) {
  return (
    <div>
      {path && <div className="mb-1 font-mono text-[11px] text-muted">{path}</div>}
      <pre className="selectable max-h-80 overflow-auto rounded border border-line font-mono text-[11.5px] leading-relaxed">
        {before &&
          before.split('\n').map((l, i) => (
            <div key={`b${i}`} className="bg-red-500/10 px-2 text-red-700 dark:text-red-300">
              - {l}
            </div>
          ))}
        {after.split('\n').map((l, i) => (
          <div key={`a${i}`} className="bg-emerald-500/10 px-2 text-emerald-700 dark:text-emerald-300">
            + {l}
          </div>
        ))}
      </pre>
    </div>
  )
}
