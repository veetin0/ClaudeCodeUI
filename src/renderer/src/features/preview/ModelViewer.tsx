import { Box, Clapperboard, Eye, EyeOff, Grid3x3, Moon, RefreshCw, RotateCw, Send, Sun, X } from 'lucide-react'
import { useEffect, useRef, useState } from 'react'
import * as THREE from 'three'
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js'
import { RoomEnvironment } from 'three/examples/jsm/environments/RoomEnvironment.js'
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js'
import { fileUrl } from '@shared/visuals'
import { basename, cn } from '@/lib/format'
import { ipcErrorMessage } from '@/lib/time'
import { useApp } from '@/stores/app'
import type { SessionState } from '@/stores/reducer'

/** Above these a model is heavy for a web viewer or a 3D clip. */
const MAX_TRIS = 100_000
const MAX_BYTES = 10 * 1024 * 1024

interface Part {
  name: string
  object: THREE.Object3D
  tris: number
}

interface Stats {
  tris: number
  meshes: number
  materials: number
  textures: number
  /** Width, height, depth in model units (metres for a well-made glTF). */
  size: [number, number, number]
  bytes: number
}

function triangles(o: THREE.Object3D): number {
  let n = 0
  o.traverse((c) => {
    const m = c as THREE.Mesh
    if (!m.isMesh) return
    const g = m.geometry
    n += (g.index ? g.index.count : (g.attributes.position?.count ?? 0)) / 3
  })
  return Math.round(n)
}

/** The parts to list: the top-level children, or the children of a single root node (common in exports). */
function partsOf(root: THREE.Object3D): Part[] {
  let top = root.children
  while (top.length === 1 && top[0].children.length > 0 && !(top[0] as THREE.Mesh).isMesh) top = top[0].children
  return top.map((o, i) => ({ name: o.name || `part ${i + 1}`, object: o, tris: triangles(o) }))
}

const fmtBytes = (b: number) => (b > 1024 * 1024 ? `${(b / 1024 / 1024).toFixed(1)} MB` : `${Math.round(b / 1024)} KB`)
const fmtSize = (n: number) => (n >= 1 ? `${n.toFixed(2)} m` : `${Math.round(n * 1000)} mm`)

/**
 * A .glb/.gltf in the project, turned with the mouse: its named parts, how heavy it is, and ways to
 * act on it (ask Claude to change it, open it in Blender, use it in a 3D clip). It reloads when the
 * file changes, so a re-export from Blender or a script shows up here.
 */
export default function ModelViewer({ path, session, version, blender }: { path: string; session: SessionState; version?: number; blender: boolean }) {
  const host = useRef<HTMLDivElement>(null)
  const api = useRef<{ setAutoRotate(v: boolean): void; setWireframe(v: boolean): void; setDark(v: boolean): void; highlight(p: Part | null, isolate: boolean): void; shot(): string } | null>(null)
  const [reload, setReload] = useState(0)
  const [error, setError] = useState<string | null>(null)
  const [loading, setLoading] = useState(true)
  const [stats, setStats] = useState<Stats | null>(null)
  const [parts, setParts] = useState<Part[]>([])
  const [selected, setSelected] = useState<Part | null>(null)
  const [isolate, setIsolate] = useState(false)
  const [autoRotate, setAutoRotate] = useState(true)
  const [wireframe, setWireframe] = useState(false)
  const [dark, setDark] = useState(true)
  const [asking, setAsking] = useState(false)
  const [text, setText] = useState('')
  const [note, setNote] = useState<string | null>(null)

  useEffect(() => {
    const el = host.current
    if (!el) return
    let disposed = false
    setLoading(true)
    setError(null)
    setSelected(null)
    setIsolate(false)
    // preserveDrawingBuffer: the screenshot for "Ask Claude" reads the canvas.
    let renderer: THREE.WebGLRenderer
    try {
      renderer = new THREE.WebGLRenderer({ antialias: true, preserveDrawingBuffer: true })
    } catch {
      // No WebGL (some VMs and remote desktops): say so instead of taking the window down.
      setError('this computer can’t show 3D here (WebGL isn’t available). Open the model in Blender, or check that hardware acceleration is on.')
      setLoading(false)
      return
    }
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2))
    renderer.toneMapping = THREE.NeutralToneMapping
    renderer.shadowMap.enabled = true
    renderer.shadowMap.type = THREE.PCFSoftShadowMap
    el.appendChild(renderer.domElement)
    const scene = new THREE.Scene()
    const pmrem = new THREE.PMREMGenerator(renderer)
    scene.environment = pmrem.fromScene(new RoomEnvironment(), 0.04).texture
    scene.environmentIntensity = 0.8
    const camera = new THREE.PerspectiveCamera(35, 1, 0.01, 1000)
    const controls = new OrbitControls(camera, renderer.domElement)
    controls.enableDamping = true
    controls.autoRotate = autoRotate
    controls.autoRotateSpeed = 1.2
    const key = new THREE.DirectionalLight(0xffffff, 1.6)
    key.castShadow = true
    key.shadow.mapSize.set(2048, 2048)
    scene.add(key, new THREE.HemisphereLight(0xffffff, 0x404040, 0.4))
    const ground = new THREE.Mesh(new THREE.PlaneGeometry(1, 1), new THREE.ShadowMaterial({ opacity: 0.3 }))
    ground.rotation.x = -Math.PI / 2
    ground.receiveShadow = true
    scene.add(ground)
    const setBg = (d: boolean) => (scene.background = new THREE.Color(d ? 0x17181b : 0xeeeeef))
    setBg(dark)

    let model: THREE.Object3D | null = null
    const originals = new Map<THREE.Mesh, THREE.Material | THREE.Material[]>()
    const resize = () => {
      const w = el.clientWidth
      const h = el.clientHeight
      renderer.setSize(w, h, false)
      renderer.domElement.style.width = '100%'
      renderer.domElement.style.height = '100%'
      camera.aspect = w / Math.max(1, h)
      camera.updateProjectionMatrix()
    }
    const ro = new ResizeObserver(resize)
    ro.observe(el)
    resize()
    let raf = 0
    const loop = () => {
      raf = requestAnimationFrame(loop)
      controls.update()
      renderer.render(scene, camera)
    }
    loop()

    api.current = {
      setAutoRotate: (v) => (controls.autoRotate = v),
      setWireframe: (v) =>
        model?.traverse((c) => {
          const m = c as THREE.Mesh
          if (m.isMesh) for (const mat of ([] as THREE.Material[]).concat(m.material)) (mat as THREE.MeshStandardMaterial).wireframe = v
        }),
      setDark: setBg,
      highlight: (p, iso) => {
        // Back to the original materials, then tint the selected part and (optionally) hide the rest.
        for (const [m, mat] of originals) m.material = mat
        originals.clear()
        if (!model) return
        for (const part of partsOf(model)) part.object.visible = !iso || !p || part.object === p.object
        p?.object.traverse((c) => {
          const m = c as THREE.Mesh
          if (!m.isMesh) return
          originals.set(m, m.material)
          m.material = ([] as THREE.Material[]).concat(m.material).map((mat) => {
            const copy = mat.clone() as THREE.MeshStandardMaterial
            if (copy.emissive) {
              copy.emissive = new THREE.Color(0xd97757)
              copy.emissiveIntensity = 0.45
            }
            return copy
          }) as unknown as THREE.Material
        })
      },
      shot: () => {
        renderer.render(scene, camera)
        return renderer.domElement.toDataURL('image/png')
      },
    }

    void (async () => {
      try {
        const res = await fetch(`${fileUrl(path)}?v=${version ?? 0}-${reload}`)
        if (!res.ok) throw new Error(`Couldn't read the file (${res.status}).`)
        const buf = await res.arrayBuffer()
        const dir = path.replace(/[\\/][^\\/]*$/, '')
        const gltf = await new GLTFLoader().parseAsync(buf, `${fileUrl(dir)}/`)
        if (disposed) return
        model = gltf.scene
        model.traverse((c) => {
          const m = c as THREE.Mesh
          if (m.isMesh) m.castShadow = m.receiveShadow = true
        })
        // Stand it on the ground, centred, and frame it.
        const box = new THREE.Box3().setFromObject(model)
        const size = box.getSize(new THREE.Vector3())
        const centre = box.getCenter(new THREE.Vector3())
        model.position.sub(new THREE.Vector3(centre.x, box.min.y, centre.z))
        scene.add(model)
        const radius = Math.max(size.length() / 2, 1e-3)
        const dist = radius / Math.sin(THREE.MathUtils.degToRad(camera.fov / 2)) * 1.1
        camera.near = dist / 100
        camera.far = dist * 100
        camera.updateProjectionMatrix()
        camera.position.set(dist * 0.6, size.y * 0.5 + dist * 0.35, dist * 0.75)
        controls.target.set(0, size.y * 0.45, 0)
        controls.update()
        ground.scale.setScalar(radius * 8)
        key.position.set(radius * 3, radius * 6, radius * 4)
        key.shadow.camera.left = key.shadow.camera.bottom = -radius * 2
        key.shadow.camera.right = key.shadow.camera.top = radius * 2
        key.shadow.camera.far = radius * 20
        key.shadow.camera.updateProjectionMatrix()

        const materials = new Set<THREE.Material>()
        const textures = new Set<THREE.Texture>()
        let meshes = 0
        model.traverse((c) => {
          const m = c as THREE.Mesh
          if (!m.isMesh) return
          meshes++
          for (const mat of ([] as THREE.Material[]).concat(m.material)) {
            materials.add(mat)
            for (const v of Object.values(mat)) if ((v as THREE.Texture)?.isTexture) textures.add(v as THREE.Texture)
          }
        })
        setStats({ tris: triangles(model), meshes, materials: materials.size, textures: textures.size, size: [size.x, size.y, size.z], bytes: buf.byteLength })
        setParts(partsOf(model))
        setLoading(false)
      } catch (err) {
        if (!disposed) {
          setError(err instanceof Error ? err.message : String(err))
          setLoading(false)
        }
      }
    })()

    return () => {
      disposed = true
      cancelAnimationFrame(raf)
      ro.disconnect()
      controls.dispose()
      pmrem.dispose()
      renderer.dispose()
      el.removeChild(renderer.domElement)
      api.current = null
    }
    // The toggles apply through `api`; only a new file (or reload) rebuilds the scene.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [path, version, reload])

  useEffect(() => api.current?.setAutoRotate(autoRotate), [autoRotate])
  useEffect(() => api.current?.setWireframe(wireframe), [wireframe, stats])
  useEffect(() => api.current?.setDark(dark), [dark])
  useEffect(() => api.current?.highlight(selected, isolate), [selected, isolate])

  const ask = async () => {
    if (!text.trim() || !api.current) return
    const data = api.current.shot().split(',')[1]
    const part = selected ? ` (the part "${selected.name}" is highlighted in the screenshot)` : ''
    const prompt = `In the 3D model ${path}${part}: ${text.trim()}\n\nChange it where it's made (its build script, or in Blender if you're connected to it), export the .glb again to the same path, and keep the named top-level parts.`
    try {
      await useApp.getState().sendTo(session.id, prompt, [{ mediaType: 'image/png', data }])
      setNote('Sent to Claude. The model reloads here when the file changes.')
      setText('')
      setAsking(false)
    } catch (err) {
      setNote(ipcErrorMessage(err))
    }
  }
  const useInClip = async () => {
    const prompt = `Add a product clip to video/kit3d/story.py (HackForge's 3D pitch kit) that uses the model ${path}: it turns on the pedestal, explodes into its named parts${parts.length ? ` (${parts.map((p) => p.name).join(', ')})` : ''}, and labels the ones that matter. Check it with python3 story.py <name> in video/kit3d, then tell me its name: I'll render it from the Pitch studio's 3D clips.`
    try {
      await useApp.getState().sendTo(session.id, prompt)
      setNote('Asked Claude for a product clip with this model (Pitch studio → 3D clips to render it).')
    } catch (err) {
      setNote(ipcErrorMessage(err))
    }
  }
  const heavy = stats && (stats.tris > MAX_TRIS || stats.bytes > MAX_BYTES)
  const btn = 'flex items-center gap-1 rounded-md px-2 py-0.5 text-[11.5px] hover:bg-black/5 dark:hover:bg-white/10'

  return (
    <div className="flex h-full min-h-0">
      <div className="relative min-w-0 flex-1">
        <div ref={host} className="absolute inset-0" />
        <div className="absolute inset-x-2 top-2 flex flex-wrap items-center gap-1 rounded-lg bg-surface/90 px-2 py-1 text-fg shadow backdrop-blur">
          <Box className="size-3.5 text-[var(--accent)]" />
          <span className="truncate font-mono text-[11.5px]" title={path}>
            {basename(path)}
          </span>
          <div className="ml-auto flex items-center gap-0.5">
            <button className={cn(btn, autoRotate && 'text-[var(--accent)]')} onClick={() => setAutoRotate(!autoRotate)} title="Turn slowly">
              <RotateCw className="size-3.5" />
            </button>
            <button className={cn(btn, wireframe && 'text-[var(--accent)]')} onClick={() => setWireframe(!wireframe)} title="Wireframe">
              <Grid3x3 className="size-3.5" />
            </button>
            <button className={btn} onClick={() => setDark(!dark)} title="Background">
              {dark ? <Sun className="size-3.5" /> : <Moon className="size-3.5" />}
            </button>
            <button className={btn} onClick={() => setReload((r) => r + 1)} title="Reload">
              <RefreshCw className="size-3.5" />
            </button>
            <span className="mx-1 h-4 w-px bg-line" />
            <button className={btn} onClick={() => setAsking(!asking)} disabled={!!error}>
              <Send className="size-3.5" /> Ask Claude to change
            </button>
            {blender && (
              <button className={btn} onClick={() => void window.harness.devToolsOpenBlender(path).catch((e) => setNote(ipcErrorMessage(e)))}>
                Open in Blender
              </button>
            )}
            <button className={btn} onClick={() => void useInClip()} disabled={!!error}>
              <Clapperboard className="size-3.5" /> Use in a 3D clip
            </button>
          </div>
        </div>
        {loading && <div className="absolute inset-0 flex items-center justify-center text-[12px] text-muted">Loading the model…</div>}
        {error && (
          <div className="absolute inset-0 flex items-center justify-center p-6">
            <div className="selectable max-w-md rounded-lg border border-red-500/40 bg-surface px-3 py-2 text-[12px] text-red-500">Couldn't open this model: {error}</div>
          </div>
        )}
        {asking && (
          <div className="absolute inset-x-2 bottom-2 flex gap-1.5 rounded-xl border border-line bg-surface p-2 shadow-2xl">
            <input
              value={text}
              onChange={(e) => setText(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter') void ask()
                if (e.key === 'Escape') setAsking(false)
              }}
              placeholder={selected ? `What should change about ${selected.name}?` : 'What should change? e.g. rounder edges, a brushed metal shell, the screen glowing'}
              className="selectable min-w-0 flex-1 rounded-lg border border-line bg-surface-2 px-2.5 py-1.5 text-[12px] outline-none focus:border-[var(--accent)]/60"
              autoFocus
            />
            <button onClick={() => void ask()} disabled={!text.trim()} className="rounded-md bg-[var(--accent)] px-3 text-[12px] font-medium text-white hover:brightness-110 disabled:opacity-40">
              Send with screenshot
            </button>
            <button onClick={() => setAsking(false)} className="rounded p-1 text-muted hover:text-fg">
              <X className="size-3.5" />
            </button>
          </div>
        )}
        {note && (
          <div className="absolute inset-x-0 bottom-14 flex justify-center">
            <button onClick={() => setNote(null)} className="rounded-full bg-surface px-3 py-1 text-[11.5px] shadow">
              {note}
            </button>
          </div>
        )}
      </div>
      <aside className="w-56 shrink-0 overflow-y-auto border-l border-line p-3 text-[11.5px]">
        <div className="font-medium">Model</div>
        {stats ? (
          <dl className="mt-1 grid grid-cols-[auto_1fr] gap-x-2 gap-y-0.5 text-muted">
            <dt>Triangles</dt>
            <dd className={cn('text-fg', stats.tris > MAX_TRIS && 'text-amber-600')}>{stats.tris.toLocaleString()}</dd>
            <dt>Meshes</dt>
            <dd className="text-fg">{stats.meshes}</dd>
            <dt>Materials</dt>
            <dd className="text-fg">{stats.materials}</dd>
            <dt>Textures</dt>
            <dd className="text-fg">{stats.textures}</dd>
            <dt>Size</dt>
            <dd className="text-fg">{stats.size.map(fmtSize).join(' × ')}</dd>
            <dt>File</dt>
            <dd className={cn('text-fg', stats.bytes > MAX_BYTES && 'text-amber-600')}>{fmtBytes(stats.bytes)}</dd>
          </dl>
        ) : (
          <div className="mt-1 text-muted">…</div>
        )}
        {heavy && <div className="mt-2 rounded-md bg-amber-500/10 px-2 py-1 text-amber-700 dark:text-amber-300">Heavy for a web viewer or a 3D clip: aim for under 100k triangles and 10 MB.</div>}
        <div className="mt-3 flex items-center font-medium">
          Parts <span className="ml-1 font-normal text-muted">({parts.length})</span>
          {selected && (
            <button onClick={() => setIsolate(!isolate)} className="ml-auto flex items-center gap-1 text-muted hover:text-fg" title={isolate ? 'Show all parts' : 'Show only this part'}>
              {isolate ? <Eye className="size-3" /> : <EyeOff className="size-3" />} {isolate ? 'All' : 'Only'}
            </button>
          )}
        </div>
        <p className="mt-0.5 text-[10.5px] text-muted">Named top-level parts: a 3D clip's exploded view separates these.</p>
        <ul className="mt-1 space-y-px">
          {parts.map((p) => (
            <li key={p.object.uuid}>
              <button
                onClick={() => setSelected(selected?.object === p.object ? null : p)}
                className={cn('flex w-full items-center gap-1 rounded px-1.5 py-0.5 text-left hover:bg-surface-2', selected?.object === p.object && 'bg-[var(--accent)]/10 text-[var(--accent)]')}
              >
                <span className="min-w-0 flex-1 truncate">{p.name}</span>
                <span className="shrink-0 text-[10.5px] text-muted">{p.tris.toLocaleString()}</span>
              </button>
            </li>
          ))}
        </ul>
      </aside>
    </div>
  )
}
