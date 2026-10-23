// APP: the real screens of your app and what the hero lands on. capture_ui.mjs opens `url`, runs
// each state's `go`, screenshots it and measures its targets. The names are what timeline.py uses.
//
// Targets and panels are Playwright selectors: CSS ('#build'), text ('text=Publish'), role
// ('role=button[name="Publish"]'). Panels are the slabs the screen is cut into (measured on the
// first state); together they should cover the window.
//
// The example drives demo/index.html (a stand-in app). For your app: set `url` to where it runs
// (start it first), and make each `go` click or navigate the way a user would; push fake data
// only where a real run would need a backend or an AI call.

export const url = 'demo/index.html' // or 'http://localhost:3000'

export const panels = { sidebar: 'aside', header: 'main > header', content: 'main > section.on' }

const show = (name) => (page) => page.evaluate((n) => window.show(n), name)

export const states = [
  { name: 'describe_empty', go: show('describe_empty'), targets: { prompt: '#prompt', build: '#build' } },
  { name: 'describe_filled', go: show('describe_filled'), targets: { build: '#build' } },
  { name: 'build_1', go: show('build_1'), targets: { step1: '#c1', step2: '#c2', step3: '#c3' } },
  { name: 'build_2', go: show('build_2') },
  { name: 'build_3', go: show('build_3') },
  { name: 'preview', go: show('preview'), targets: { publish: '#publish' } },
  { name: 'live', go: show('live'), targets: { badge: '#badge' } },
]

// An Electron app (or anything Playwright can't just open by URL): export `launch` and return the
// window's page; capture_ui.mjs sets the size, the 2× scale and the dark theme itself.
//
// import { _electron } from 'playwright-core'
// export async function launch() {
//   const app = await _electron.launch({ args: ['.'], cwd: '../..' })
//   const page = await app.firstWindow()
//   return { page, close: () => app.close() }
// }
