// Monaco, bundled locally (no CDN): the editor core, syntax highlighting for common languages,
// and the one web worker the diff editor needs to compute diffs.
import * as monaco from 'monaco-editor/editor/editor.api'
import 'monaco-editor/languages/definitions/register.all'
// Opt-in editor features a read-only diff viewer uses (icon font, diff gutter, find, folding…).
import 'monaco-editor/features/codicon/register'
import 'monaco-editor/features/diffEditor/register'
import 'monaco-editor/features/find/register'
import 'monaco-editor/features/folding/register'
import 'monaco-editor/features/bracketMatching/register'
import 'monaco-editor/features/wordHighlighter/register'
import 'monaco-editor/features/clipboard/register'
import 'monaco-editor/features/contextmenu/register'
import 'monaco-editor/features/hover/register'
import EditorWorker from 'monaco-editor/editor/editor.worker?worker'

self.MonacoEnvironment = { getWorker: () => new EditorWorker() }

const LANG_BY_EXT: Record<string, string> = {
  ts: 'typescript', tsx: 'typescript', mts: 'typescript', cts: 'typescript',
  js: 'javascript', jsx: 'javascript', mjs: 'javascript', cjs: 'javascript',
  py: 'python', rb: 'ruby', go: 'go', rs: 'rust', java: 'java', kt: 'kotlin', swift: 'swift',
  c: 'cpp', h: 'cpp', cc: 'cpp', cpp: 'cpp', hpp: 'cpp', cs: 'csharp', php: 'php', scala: 'scala',
  json: 'json', jsonc: 'json', md: 'markdown', mdx: 'mdx', yml: 'yaml', yaml: 'yaml', toml: 'ini', ini: 'ini',
  html: 'html', htm: 'html', vue: 'html', svelte: 'html', xml: 'xml', svg: 'xml', css: 'css', scss: 'scss', less: 'less',
  sh: 'shell', bash: 'shell', zsh: 'shell', sql: 'sql', graphql: 'graphql', gql: 'graphql', lua: 'lua', r: 'r',
  dockerfile: 'dockerfile', proto: 'protobuf',
}

export function languageFor(path: string): string {
  const name = path.split('/').pop()?.toLowerCase() ?? ''
  if (name === 'dockerfile') return 'dockerfile'
  return LANG_BY_EXT[name.split('.').pop() ?? ''] ?? 'plaintext'
}

export { monaco }
