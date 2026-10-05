import { ImageOff } from 'lucide-react'
import { useState } from 'react'
import { fileUrl, type ShowUpdate } from '@shared/visuals'
import { Markdown } from '../conversation/Markdown'
import { LineChart } from './LineChart'

/** Renders something an agent chose to show: image, markdown, table or chart. */
export function ShowView({ show, compact }: { show: ShowUpdate; compact?: boolean }) {
  const c = show.content
  return (
    <figure className="min-w-0 overflow-hidden rounded-lg border border-line bg-surface">
      {show.title && <figcaption className="border-b border-line px-3 py-1.5 text-[12px] font-medium">{show.title}</figcaption>}
      <div className={compact ? 'p-2' : 'p-3'}>
        {c.type === 'image' && <Img path={c.path} compact={compact} />}
        {c.type === 'markdown' && <Markdown text={c.text} className={compact ? 'line-clamp-6' : undefined} />}
        {c.type === 'chart' && <LineChart series={c.series} height={compact ? 90 : 220} compact={compact} xLabel={c.xLabel} yLabel={c.yLabel} />}
        {c.type === 'table' && <Table columns={c.columns} rows={compact ? c.rows.slice(0, 5) : c.rows} more={compact ? c.rows.length - 5 : 0} />}
      </div>
    </figure>
  )
}

function Img({ path, compact }: { path: string; compact?: boolean }) {
  const [failed, setFailed] = useState(false)
  if (failed) {
    return (
      <div className="flex items-center gap-2 text-[12px] text-muted">
        <ImageOff className="size-4" /> Couldn’t load {path}
      </div>
    )
  }
  return (
    <img
      src={fileUrl(path)}
      alt={path.split('/').pop()}
      onError={() => setFailed(true)}
      className={compact ? 'max-h-40 w-full rounded object-contain' : 'mx-auto max-h-[480px] rounded object-contain'}
    />
  )
}

function Table({ columns, rows, more }: { columns: string[]; rows: (string | number)[][]; more: number }) {
  const numeric = columns.map((_, j) => rows.length > 0 && rows.every((r) => typeof r[j] === 'number'))
  return (
    <div className="selectable overflow-auto">
      <table className="w-full text-[11.5px] tabular-nums">
        <thead>
          <tr>
            {columns.map((c, j) => (
              <th key={c} className={`border-b border-line px-2 py-1 font-medium text-muted ${numeric[j] ? 'text-right' : 'text-left'}`}>
                {c}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.map((r, i) => (
            <tr key={i} className="border-b border-line/60 last:border-0">
              {r.map((v, j) => (
                <td key={j} className={`px-2 py-1 ${typeof v === 'number' ? 'text-right' : ''}`}>
                  {String(v)}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
      {more > 0 && <div className="px-2 pt-1 text-[11px] text-muted">+{more} more rows</div>}
    </div>
  )
}
