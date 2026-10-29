import { Binary, Box, Flame, Globe, LibraryBig, Palette, Plug, Sparkles } from 'lucide-react'
import { useEffect, useState } from 'react'
import type { DesignSkillsSettings, DesignState } from '@shared/design'
import { REA_NODE, type BlenderInfo, type DevToolsSettings, type DevToolsState, type ReaInfo } from '@shared/devtools'
import type { HackforgeMode } from '@shared/hackforge'
import { ipcErrorMessage } from '@/lib/time'
import { useApp } from '@/stores/app'
import { ExtLink, ok, Row, smallBtn, warn } from './parts'

/**
 * Settings › Tools: one switch per tool. Turning one on sets it up by itself (downloads the
 * browser, installs REA, sets up the Blender add-on, fetches the design detector); the row says
 * what's happening and what, if anything, is missing.
 */
export function ToolsTab() {
  const { settings, updateSettings } = useApp()
  const [dev, setDev] = useState<DevToolsState | null>(null)
  const [design, setDesign] = useState<DesignState | null>(null)
  const [error, setError] = useState<string | null>(null)
  useEffect(() => {
    void window.harness.devToolsState().then(setDev)
    void window.harness.designState().then(setDesign)
    const off1 = window.harness.onDevTools(setDev)
    const off2 = window.harness.onDesign(setDesign)
    return () => {
      off1()
      off2()
    }
  }, [])
  if (!settings) return null
  const s = settings.devTools
  const d = settings.designSkills
  const act = (fn: () => Promise<unknown>) =>
    void fn().then(
      () => setError(null),
      (e) => setError(ipcErrorMessage(e)),
    )

  /** Saves the switch, then does whatever the tool still needs to be ready. */
  const toggle = (key: 'browser' | 'docs' | 'partnerServers' | 'rea' | 'blender', on: boolean) =>
    act(async () => {
      await updateSettings({ devTools: { ...s, [key]: on } })
      if (!on) return
      const st = await window.harness.devToolsState()
      setDev(st)
      if (key === 'browser' && (st.browser.status === 'missing' || st.browser.status === 'failed')) setDev(await window.harness.devToolsInstallBrowser())
      if (key === 'rea' && (st.rea.status === 'not-installed' || st.rea.status === 'failed')) setDev(await window.harness.devToolsInstallRea())
      if (key === 'blender' && st.blender.status === 'needs-addon') setDev(await window.harness.devToolsSetupBlender())
    })
  const setDevOption = (patch: Partial<DevToolsSettings>) => void updateSettings({ devTools: { ...s, ...patch } })
  const setDesignOption = (patch: Partial<DesignSkillsSettings>) =>
    act(async () => {
      await updateSettings({ designSkills: { ...d, ...patch } })
      if (patch.impeccable && design?.engine?.status !== 'ready' && design?.engine?.status !== 'checking') setDesign(await window.harness.designPrepare())
    })

  return (
    <div className="space-y-3">
      <p className="text-[11.5px] text-muted">Claude uses these by itself when they help. Their definitions load only when needed, so unused tools cost little. Changes apply to new sessions.</p>
      {error && <div className="selectable rounded-lg border border-red-500/40 bg-red-500/5 px-3 py-2 text-[12px] text-red-600">{error}</div>}

      <Row
        icon={<Flame className="size-3.5 text-orange-500" />}
        title="HackForge"
        description="Sessions get the /hackforge:* skills, the Next step suggestion and the HackForge actions in the / menu."
        control={
          <select
            value={settings.hackforgeMode}
            onChange={(e) => void updateSettings({ hackforgeMode: e.target.value as HackforgeMode })}
            className="rounded-md border border-line bg-surface-2 px-2 py-1 text-[12px]"
          >
            <option value="projects">In projects that use it</option>
            <option value="always">In every session</option>
            <option value="off">Off</option>
          </select>
        }
      />

      <Row
        icon={<Palette className="size-3.5 text-[var(--accent)]" />}
        title="impeccable"
        via={pluginInfo(design, 'impeccable')}
        description="Builds, polishes, critiques and audits UI. Its detector checks every UI edit for “AI slop” (cramped spacing, gradient text, low contrast…) and does a deeper pass when Claude finishes."
        on={d.impeccable}
        onToggle={(impeccable) => setDesignOption({ impeccable })}
        status={d.impeccable && <EngineStatus design={design} onRetry={() => act(async () => setDesign(await window.harness.designPrepare()))} />}
        options={
          <label className="flex items-center gap-1.5">
            <input type="checkbox" checked={d.quietDetector} onChange={(e) => setDesignOption({ quietDetector: e.target.checked })} /> Quiet detector: report only problems (saves tokens)
          </label>
        }
      />
      <Row
        icon={<Sparkles className="size-3.5 text-[var(--accent)]" />}
        title="UI/UX Pro Max"
        via={pluginInfo(design, 'uiUxProMax')}
        description="Picks a design system for the product (style, palette, fonts) once and writes DESIGN.md, plus UX and accessibility rules. Needs Python 3."
        on={d.uiUxProMax}
        onToggle={(uiUxProMax) => setDesignOption({ uiUxProMax })}
      />

      <Row
        icon={<Globe className="size-3.5" />}
        title="Browser"
        via="Playwright, built in"
        description="Claude opens the running app, clicks through the demo, reads console errors and saves screenshots. HackForge's verifier keeps them as evidence."
        on={s.browser}
        onToggle={(on) => toggle('browser', on)}
        status={s.browser && dev && <BrowserStatus dev={dev} onRetry={() => act(async () => setDev(await window.harness.devToolsInstallBrowser()))} />}
        options={
          <label className="flex items-center gap-1.5">
            <input type="checkbox" checked={s.showBrowser} onChange={(e) => setDevOption({ showBrowser: e.target.checked })} /> Show the browser window (off: it runs in the background)
          </label>
        }
      />
      <Row
        icon={<LibraryBig className="size-3.5" />}
        title="Library docs"
        via="Context7, hosted"
        description="Current docs for any library or SDK, so Claude looks up a partner's SDK instead of guessing its API. Works without a key; a free key raises the limits."
        on={s.docs}
        onToggle={(on) => toggle('docs', on)}
        status={s.docs && (settings.hasContext7Key ? <span className={ok}>key saved</span> : 'no key (fine for most use)')}
        options={<Context7Key hasKey={settings.hasContext7Key} />}
      />
      <Row
        icon={<Plug className="size-3.5" />}
        title="Partner servers"
        description="A partner's own MCP server, in sessions in the event project once its key is set (Hackathon › Challenges). Anything that changes a partner account still asks first."
        on={s.partnerServers}
        onToggle={(on) => toggle('partnerServers', on)}
        status={
          s.partnerServers &&
          !!dev?.partners.length && (
            <span className="flex flex-wrap gap-1.5">
              {dev.partners.map((p) => (
                <span
                  key={p.id}
                  className={p.status === 'ready' ? 'rounded-full bg-emerald-500/10 px-2 text-emerald-700 dark:text-emerald-300' : 'rounded-full bg-surface-2 px-2'}
                  title={p.status === 'ready' ? `Sessions in the event project get mcp__${p.id}__*` : 'Set its key under Hackathon › Challenges'}
                >
                  {p.name} {p.status === 'ready' ? '· ready' : '· needs key'}
                </span>
              ))}
            </span>
          )
        }
      />
      <Row
        icon={<Binary className="size-3.5" />}
        title="Reverse engineering"
        via="REA, installed when you turn it on"
        description="Claude works out how existing software works, with evidence: a partner's site or a HAR capture becomes its real API, an SDK bundle, DLL or APK shows how it's called. Running a target still asks first. Only for software you own or may analyse."
        on={s.rea}
        onToggle={(on) => toggle('rea', on)}
        status={s.rea && dev && <ReaStatus rea={dev.rea} onInstall={() => act(async () => setDev(await window.harness.devToolsInstallRea()))} />}
      />
      <Row
        icon={<Box className="size-3.5" />}
        title="Blender"
        via="live, through MCP for Blender (community, open source)"
        description="Claude builds and adjusts 3D objects and scenes in your open Blender, looks at the result, and exports a .glb for the product, the pitch or a 3D clip. Running code in Blender, importing assets and AI generation ask first."
        on={s.blender}
        onToggle={(on) => toggle('blender', on)}
        status={dev && <BlenderStatus info={dev.blender} on={s.blender} setDev={setDev} act={act} />}
      />
    </div>
  )
}

function pluginInfo(state: DesignState | null, key: 'impeccable' | 'uiUxProMax'): string | undefined {
  const p = state?.plugins.find((x) => x.key === key)
  if (!p || p.source === 'off') return undefined
  return p.source === 'missing' ? 'not bundled' : `${p.version ?? ''} ${p.source === 'installed' ? '(your install)' : 'built in'}`.trim()
}

function EngineStatus({ design, onRetry }: { design: DesignState | null; onRetry: () => void }) {
  const engine = design?.engine
  return (
    <>
      Detector:{' '}
      {engine?.status === 'ready' ? (
        <span className={ok}>ready ({engine.version})</span>
      ) : engine?.status === 'checking' ? (
        'downloading…'
      ) : engine?.status === 'failed' ? (
        <>
          <span className={warn} title={engine.error}>
            not ready: {engine.error}
          </span>
          <button onClick={onRetry} className={smallBtn}>
            Retry
          </button>
        </>
      ) : (
        <>
          not downloaded yet
          <button onClick={onRetry} className={smallBtn}>
            Get it now
          </button>
        </>
      )}
      <span className="block text-[10.5px]">Downloaded once per computer from impeccable’s GitHub releases; do it before the event, not on venue wifi.</span>
    </>
  )
}

function BrowserStatus({ dev, onRetry }: { dev: DevToolsState; onRetry: () => void }) {
  const b = dev.browser
  return b.status === 'ready' ? (
    <span className={ok}>{b.via}</span>
  ) : b.status === 'installing' ? (
    <>downloading Chromium (about 150 MB)…</>
  ) : (
    <>
      <span className={warn} title={b.error}>
        {b.status === 'failed' ? `download failed: ${b.error}` : 'no Chrome or Edge found'}
      </span>
      <button onClick={onRetry} className={smallBtn}>
        {b.status === 'failed' ? 'Retry' : 'Get Chromium'}
      </button>
    </>
  )
}

function Context7Key({ hasKey }: { hasKey: boolean }) {
  const [key, setKey] = useState('')
  const [error, setError] = useState<string | null>(null)
  const save = async (k: string | null) => {
    try {
      useApp.setState({ settings: await window.harness.setContext7Key(k) })
      setKey('')
      setError(null)
    } catch (e) {
      setError(ipcErrorMessage(e))
    }
  }
  return (
    <div>
      <div className="flex gap-1.5">
        <input
          type="password"
          value={key}
          onChange={(e) => setKey(e.target.value)}
          onKeyDown={(e) => e.key === 'Enter' && key.trim() && void save(key)}
          placeholder={hasKey ? 'Context7 key saved (paste to replace)' : 'Context7 API key (optional, from context7.com)'}
          className="selectable min-w-0 flex-1 rounded-md border border-line bg-surface-2 px-2 py-1 font-mono text-[11.5px] outline-none focus:border-[var(--accent)]/60"
        />
        {key.trim() ? (
          <button onClick={() => void save(key)} className="rounded-md bg-[var(--accent)] px-2.5 text-[11.5px] font-medium text-white hover:brightness-110">
            Save
          </button>
        ) : (
          hasKey && (
            <button onClick={() => void save(null)} className="rounded-md border border-line px-2 text-[11.5px]">
              Remove
            </button>
          )
        )}
      </div>
      {error && <div className="mt-1 text-[11px] text-red-500">{error}</div>}
    </div>
  )
}

function ReaStatus({ rea, onInstall }: { rea: ReaInfo; onInstall: () => void }) {
  return rea.status === 'ready' ? (
    <span className={ok}>
      {rea.version} ready (Node {rea.node?.replace(/^v/, '')})
    </span>
  ) : rea.status === 'external' ? (
    <span className={ok}>using your own setup (Claude Code config)</span>
  ) : rea.status === 'installing' ? (
    <>installing {rea.version} (about 280 MB)…</>
  ) : rea.status === 'needs-node' ? (
    <>
      <span className={warn}>
        needs Node {REA_NODE}
        {rea.node ? ` (this computer has ${rea.node.replace(/^v/, '')})` : ' (none found)'}
      </span>
      <ExtLink url="https://nodejs.org/en/download">Get Node</ExtLink>
    </>
  ) : (
    <>
      {rea.status === 'failed' ? (
        <span className={warn} title={rea.error}>
          install failed: {rea.error}
        </span>
      ) : (
        'not installed'
      )}
      <button onClick={onInstall} className={smallBtn}>
        {rea.status === 'failed' ? 'Retry' : 'Install'}
      </button>
    </>
  )
}

function BlenderStatus({ info, on, setDev, act }: { info: BlenderInfo; on: boolean; setDev: (s: DevToolsState) => void; act: (fn: () => Promise<unknown>) => void }) {
  // While it waits for Blender to open, look every few seconds so "connected" shows up by itself.
  useEffect(() => {
    if (!on || (info.status !== 'ready' && info.status !== 'external')) return
    const t = setInterval(() => void window.harness.devToolsState().then(setDev), 4000)
    return () => clearInterval(t)
  }, [on, info.status, setDev])
  const open = () => act(() => window.harness.devToolsOpenBlender())
  return (
    <>
      Blender:{' '}
      {info.blender ? (
        <span className={ok}>{info.blender.version ? `${info.blender.version} found` : 'found'}</span>
      ) : (
        <>
          <span className={on ? warn : undefined}>not found</span>
          <ExtLink url="https://www.blender.org/download/">Get Blender</ExtLink>
        </>
      )}
      {on && (
        <>
          {' · '}
          {info.status === 'ready' || info.status === 'external' ? (
            info.live ? (
              <span className={ok}>connected: Claude can work in it now</span>
            ) : (
              <>
                {info.status === 'external' ? 'using your own MCP for Blender setup; ' : 'ready; '}open Blender to connect
                {info.blender && (
                  <button onClick={open} className={smallBtn}>
                    Open Blender
                  </button>
                )}
              </>
            )
          ) : info.status === 'needs-uv' ? (
            <>
              <span className={warn}>needs uv (it runs the connection)</span>
              <ExtLink url="https://docs.astral.sh/uv/getting-started/installation/">Get uv</ExtLink>
            </>
          ) : info.status === 'needs-addon' || info.status === 'failed' ? (
            <>
              {info.status === 'failed' ? (
                <span className={warn} title={info.error}>
                  {info.error}
                </span>
              ) : (
                'the Blender add-on isn’t set up yet'
              )}
              <button onClick={() => act(async () => setDev(await window.harness.devToolsSetupBlender()))} className={smallBtn}>
                {info.status === 'failed' ? 'Retry' : 'Set up'}
              </button>
            </>
          ) : info.status === 'installing' ? (
            'setting up the add-on…'
          ) : null}
        </>
      )}
    </>
  )
}
