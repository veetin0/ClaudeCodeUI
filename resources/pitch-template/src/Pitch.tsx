import { AbsoluteFill, Audio, getStaticFiles, Img, interpolate, OffthreadVideo, Series, spring, staticFile, useCurrentFrame, useVideoConfig } from 'remotion'
import { freshAudio, sceneFrames, type Scene, type Script } from './timing'

const FONT = 'Inter, ui-sans-serif, system-ui, -apple-system, "Segoe UI", Roboto, sans-serif'
const BG = '#0f0f12'
const FG = '#f4f2ee'
const MUTED = '#a19d96'

/** Files in public/, so a missing demo clip shows a placeholder instead of failing the render. */
function hasFile(path?: string): boolean {
  if (!path) return false
  try {
    return getStaticFiles().some((f) => f.name === path || f.name === `/${path}`)
  } catch {
    return false
  }
}

export const Pitch = ({ script }: { script: Script }) => {
  const accent = script.accent || '#d97757'
  return (
    <AbsoluteFill style={{ backgroundColor: BG, color: FG, fontFamily: FONT }}>
      <Series>
        {script.scenes.map((s) => (
          <Series.Sequence key={s.id} durationInFrames={sceneFrames(s, script.voiceId)} name={s.title || s.visual}>
            <SceneView scene={s} script={script} accent={accent} />
            {freshAudio(s, script.voiceId) && hasFile(s.audio) && <Audio src={staticFile(s.audio!)} />}
          </Series.Sequence>
        ))}
      </Series>
      <Progress accent={accent} />
    </AbsoluteFill>
  )
}

function useEnter(delay = 0) {
  const frame = useCurrentFrame()
  const { fps } = useVideoConfig()
  const p = spring({ frame: frame - delay, fps, config: { damping: 200 } })
  return { opacity: p, transform: `translateY(${interpolate(p, [0, 1], [24, 0])}px)` }
}

function SceneView({ scene, script, accent }: { scene: Scene; script: Script; accent: string }) {
  switch (scene.visual) {
    case 'bullets':
      return <Bullets scene={scene} accent={accent} />
    case 'quote':
      return <Quote scene={scene} accent={accent} />
    case 'screen':
      return <Screen scene={scene} accent={accent} />
    case 'end':
      return <End scene={scene} script={script} accent={accent} />
    default:
      return <Title scene={scene} script={script} accent={accent} />
  }
}

const Center = ({ children }: { children: React.ReactNode }) => (
  <AbsoluteFill style={{ justifyContent: 'center', alignItems: 'center', padding: 140, textAlign: 'center' }}>{children}</AbsoluteFill>
)

function Title({ scene, script, accent }: { scene: Scene; script: Script; accent: string }) {
  const a = useEnter(0)
  const b = useEnter(10)
  return (
    <Center>
      <div style={{ ...a, fontSize: 120, fontWeight: 800, letterSpacing: -3, lineHeight: 1.05 }}>{scene.title || script.title}</div>
      {script.tagline && <div style={{ ...b, marginTop: 36, fontSize: 44, color: MUTED }}>{script.tagline}</div>}
      <div style={{ ...b, marginTop: 56, width: 120, height: 8, borderRadius: 4, background: accent }} />
    </Center>
  )
}

function Bullets({ scene, accent }: { scene: Scene; accent: string }) {
  const head = useEnter(0)
  const frame = useCurrentFrame()
  const { fps } = useVideoConfig()
  return (
    <AbsoluteFill style={{ padding: '140px 180px', justifyContent: 'center' }}>
      <div style={{ ...head, fontSize: 84, fontWeight: 800, letterSpacing: -2 }}>{scene.title}</div>
      <div style={{ marginTop: 56 }}>
        {(scene.bullets ?? []).map((b, i) => {
          const p = spring({ frame: frame - 12 - i * 10, fps, config: { damping: 200 } })
          return (
            <div key={i} style={{ opacity: p, transform: `translateX(${interpolate(p, [0, 1], [-30, 0])}px)`, display: 'flex', alignItems: 'center', gap: 28, fontSize: 52, margin: '22px 0' }}>
              <span style={{ width: 18, height: 18, borderRadius: 9, background: accent, flexShrink: 0 }} />
              {b}
            </div>
          )
        })}
      </div>
    </AbsoluteFill>
  )
}

function Quote({ scene, accent }: { scene: Scene; accent: string }) {
  const a = useEnter(0)
  return (
    <Center>
      <div style={{ ...a, fontSize: 96, fontWeight: 700, lineHeight: 1.15, letterSpacing: -2, maxWidth: 1500 }}>
        <span style={{ color: accent }}>“</span>
        {scene.title}
        <span style={{ color: accent }}>”</span>
      </div>
    </Center>
  )
}

function Screen({ scene, accent }: { scene: Scene; accent: string }) {
  const head = useEnter(0)
  const frame = useEnter(6)
  const media = scene.media
  const ok = hasFile(media)
  const isVideo = !!media && /\.(mp4|webm|mov|m4v)$/i.test(media)
  return (
    <AbsoluteFill style={{ padding: '70px 120px 110px', alignItems: 'center' }}>
      <div style={{ ...head, fontSize: 56, fontWeight: 800, marginBottom: 32, alignSelf: 'flex-start' }}>
        <span style={{ color: accent }}>● </span>
        {scene.title}
      </div>
      <div style={{ ...frame, flex: 1, width: '100%', borderRadius: 28, overflow: 'hidden', background: '#1c1c22', border: '2px solid #2c2c34', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
        {ok && isVideo ? (
          <OffthreadVideo src={staticFile(media!)} muted style={{ width: '100%', height: '100%', objectFit: 'contain' }} />
        ) : ok ? (
          <Img src={staticFile(media!)} style={{ width: '100%', height: '100%', objectFit: 'contain' }} />
        ) : (
          <div style={{ fontSize: 40, color: MUTED, textAlign: 'center', lineHeight: 1.5 }}>
            Demo recording goes here
            <br />
            <span style={{ fontSize: 30 }}>put {media || 'demo.mp4'} in pitch/public/</span>
          </div>
        )}
      </div>
    </AbsoluteFill>
  )
}

function End({ scene, script, accent }: { scene: Scene; script: Script; accent: string }) {
  const a = useEnter(0)
  const b = useEnter(12)
  return (
    <Center>
      <div style={{ ...a, fontSize: 110, fontWeight: 800, letterSpacing: -3 }}>{scene.title || script.title}</div>
      {script.tagline && <div style={{ ...b, marginTop: 28, fontSize: 42, color: MUTED }}>{script.tagline}</div>}
      {script.team && <div style={{ ...b, marginTop: 64, fontSize: 36, color: accent, fontWeight: 600 }}>{script.team}</div>}
    </Center>
  )
}

function Progress({ accent }: { accent: string }) {
  const frame = useCurrentFrame()
  const { durationInFrames } = useVideoConfig()
  return (
    <AbsoluteFill style={{ justifyContent: 'flex-end' }}>
      <div style={{ height: 8, width: `${(frame / Math.max(1, durationInFrames - 1)) * 100}%`, background: accent, opacity: 0.85 }} />
    </AbsoluteFill>
  )
}
