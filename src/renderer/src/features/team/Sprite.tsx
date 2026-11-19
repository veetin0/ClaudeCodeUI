import type { CSSProperties } from 'react'
import { cn } from '@/lib/format'
import { useApp } from '@/stores/app'
import type { AgentView } from '@/features/agents/model'
import { animRow, characterFor, frameMs, TEAM, variantFor, type Character } from './cast'
import { poseFor } from './pose'

const SHEETS = import.meta.glob('../../assets/team/*.png', { eager: true, query: '?url', import: 'default' }) as Record<string, string>
const sheetUrl = (c: Character, outfit: number, skin: number) => SHEETS[`../../assets/team/${c}-${outfit}-${skin}.png`]

export type TeamMode = 'animated' | 'still' | 'off'
export const useTeamMode = (): TeamMode => useApp((s) => s.settings?.teamCharacters ?? 'animated')

/**
 * One character, stepping through an animation's 4 frames (CSS only: the sheet's row slides by
 * whole frames). Integer scales keep the pixels crisp. Decorative: the text around it says the same.
 */
export function Sprite({
  character,
  variant,
  anim,
  scale = 1,
  className,
}: {
  character: Character
  variant: { outfit: number; skin: number }
  anim: string
  scale?: number
  className?: string
}) {
  const still = useTeamMode() === 'still'
  const size = TEAM.frame * scale
  const rows = TEAM.characters[character].anims.length
  const style = {
    width: size,
    height: size,
    backgroundImage: `url(${sheetUrl(character, variant.outfit, variant.skin)})`,
    backgroundSize: `${size * TEAM.frames}px ${size * rows}px`,
    backgroundPositionY: `${-animRow(character, anim) * size}px`,
    '--sprite-w': `${size * TEAM.frames}px`,
    '--sprite-cycle': `${frameMs(character, anim) * TEAM.frames}ms`,
  } as CSSProperties
  // Keyed by animation so a new one starts on its first frame.
  return <span key={anim} aria-hidden className={cn('sprite', still && 'sprite-still', className)} style={style} />
}

/** An agent's character as its avatar (cards, the graph, the detail view), posed by what it's doing. */
export function AgentAvatar({ agent, scale = 1, className }: { agent: AgentView; scale?: number; className?: string }) {
  const sessionId = useApp((s) => s.activeId)
  const character = characterFor(agent.subagentType, agent.id === null)
  const variant = variantFor(agent.id ?? `main:${sessionId}`)
  const pose = poseFor(agent, character, { now: Date.now() })
  return <Sprite character={character} variant={variant} anim={pose.anim} scale={scale} className={className} />
}
