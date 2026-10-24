// A clip of the 3D kit: loads build/<clip>/timeline.json (written by `python3 story.py <clip>`),
// sets up the core and only the modules the clip uses, then renders any moment on request:
// window.renderFrame(t), window.renderLogo(). Every frame is a pure function of time.
import { createCore } from './lib/core.js'

const clip = new URLSearchParams(location.search).get('clip') ?? 'film'
const TL = await (await fetch(`/build/${clip}/timeline.json`)).json()
const ctx = createCore(TL)
// In dependency order: the stage first, the app's surface before what rides on it, the logo last.
const ORDER = ['stage', 'screen', 'device', 'hero', 'cursor', 'cards', 'product', 'fx', 'logo']
for (const name of ORDER) {
  if (!TL.uses.includes(name)) continue
  const mod = await import(`./lib/${name}.js`)
  await mod.default(ctx)
}
ctx.hideForLogo = [ctx.hero?.root, ctx.stage?.floor, ctx.stage?.pedestal, ctx.surface?.group, ctx.screen?.monitor?.bezel, ctx.screen?.monitor?.glass, ctx.device?.root, ctx.product?.root]
window.renderFrame = ctx.renderFrame
window.ready = true
