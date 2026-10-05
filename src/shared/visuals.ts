/**
 * Visual updates: what an agent wants shown about its work beyond tool calls.
 * They come from three places, all producing the same shapes:
 *   1. the in-process `harness` MCP tools the agent calls between steps,
 *   2. scripts posting to $HARNESS_URL while they run (e.g. a training loop),
 *   3. progress/metrics parsed out of command output (tqdm bars, "Epoch 3/10", "loss=0.42").
 */

export interface ProgressUpdate {
  kind: 'progress'
  label: string
  current: number
  total: number
  unit?: string
  /** Scalar metrics reported alongside this progress step, e.g. { loss: 0.42 }. */
  metrics?: Record<string, number>
}

export interface MetricUpdate {
  kind: 'metric'
  name: string
  value: number
  step?: number
}

export type ShowContent =
  | { type: 'image'; path: string }
  | { type: 'markdown'; text: string }
  | { type: 'table'; columns: string[]; rows: (string | number)[][] }
  | { type: 'chart'; series: { name: string; points: [number, number][] }[]; xLabel?: string; yLabel?: string }

export interface ShowUpdate {
  kind: 'show'
  id: string
  title?: string
  content: ShowContent
}

export interface StatusUpdate {
  kind: 'status'
  /** One-line, present-tense description of what the agent is doing right now. */
  text: string
}

export type VisualUpdate = ProgressUpdate | MetricUpdate | ShowUpdate | StatusUpdate

export type VisualSource = 'tool' | 'telemetry' | 'parsed'

export const IMAGE_EXTENSIONS = ['.png', '.jpg', '.jpeg', '.gif', '.webp', '.svg']
/** What the local file protocol will serve: images agents show and videos Remotion renders. */
export const MEDIA_EXTENSIONS = [...IMAGE_EXTENSIONS, '.mp4', '.webm', '.mov', '.m4v']

/** URL scheme the main process serves local media files on (see main/system/fileProtocol.ts). */
export const FILE_SCHEME = 'harness-file'

export function fileUrl(path: string): string {
  return `${FILE_SCHEME}://local${encodeURI(path)}`
}

function resolvePath(p: string, cwd: string): string {
  if (p.startsWith('/')) return p
  if (p.startsWith('~/')) return p // left as-is; the file protocol expands it
  return `${cwd.replace(/\/$/, '')}/${p.replace(/^\.\//, '')}`
}

const isNum = (v: unknown): v is number => typeof v === 'number' && Number.isFinite(v)

/**
 * Builds a VisualUpdate from a `harness` tool call input or a $HARNESS_URL payload; both use the
 * same field names. Returns null for malformed input rather than throwing: this is untrusted data.
 */
export function toVisual(kind: string, input: Record<string, unknown>, id: string, cwd: string): VisualUpdate | null {
  switch (kind) {
    case 'status':
      return typeof input.text === 'string' ? { kind: 'status', text: input.text.slice(0, 200) } : null
    case 'progress': {
      if (!isNum(input.current) || !isNum(input.total) || input.total <= 0) return null
      const metrics =
        input.metrics && typeof input.metrics === 'object'
          ? Object.fromEntries(Object.entries(input.metrics as Record<string, unknown>).filter(([, v]) => isNum(v)) as [string, number][])
          : undefined
      return {
        kind: 'progress',
        label: typeof input.label === 'string' && input.label ? input.label : 'progress',
        current: input.current,
        total: input.total,
        unit: typeof input.unit === 'string' ? input.unit : undefined,
        metrics: metrics && Object.keys(metrics).length ? metrics : undefined,
      }
    }
    case 'metric':
      return typeof input.name === 'string' && isNum(input.value)
        ? { kind: 'metric', name: input.name, value: input.value, step: isNum(input.step) ? input.step : undefined }
        : null
    case 'show': {
      const title = typeof input.title === 'string' ? input.title : undefined
      const image = input.image_path ?? input.image
      if (typeof image === 'string' && image) return { kind: 'show', id, title, content: { type: 'image', path: resolvePath(image, cwd) } }
      if (typeof input.markdown === 'string') return { kind: 'show', id, title, content: { type: 'markdown', text: input.markdown } }
      const table = input.table as { columns?: unknown; rows?: unknown } | undefined
      if (table && Array.isArray(table.columns) && Array.isArray(table.rows)) {
        return { kind: 'show', id, title, content: { type: 'table', columns: table.columns.map(String), rows: table.rows as (string | number)[][] } }
      }
      const chart = input.chart as { series?: unknown; x_label?: unknown; y_label?: unknown } | undefined
      if (chart && Array.isArray(chart.series)) {
        return {
          kind: 'show',
          id,
          title,
          content: {
            type: 'chart',
            series: chart.series as { name: string; points: [number, number][] }[],
            xLabel: typeof chart.x_label === 'string' ? chart.x_label : undefined,
            yLabel: typeof chart.y_label === 'string' ? chart.y_label : undefined,
          },
        }
      }
      return null
    }
    default:
      return null
  }
}
