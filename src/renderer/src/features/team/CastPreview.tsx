import { useEffect, useState } from 'react'
import { CHARACTER_LABEL, CHARACTERS, TEAM, type Character } from './cast'
import { Sprite, useTeamMode } from './Sprite'

const PLAYS: Record<Character, string> = {
  manager: 'The main agent: plans, hands out work, points at each new teammate',
  builder: 'Writes and fixes code; knocked down when a step fails',
  scientist: 'Reviewers and evaluators: reads, inspects with a magnifier',
  architect: 'Planners and architects: draws the plan',
  explorer: 'Explore agents and researchers: scouts and looks things up',
}

/** The whole cast on a stage, each one stepping through its animations (Settings › General). */
export function CastPreview() {
  const mode = useTeamMode()
  const [i, setI] = useState(0)
  useEffect(() => {
    if (mode !== 'animated') return
    const t = setInterval(() => setI((n) => n + 1), 2600)
    return () => clearInterval(t)
  }, [mode])
  return (
    <div data-testid="team-cast" className="team-stage grid grid-cols-5 gap-1 rounded-lg border border-line px-2 pt-2" style={{ '--floor': '12px' } as React.CSSProperties}>
      {CHARACTERS.map((c, k) => {
        const anims = TEAM.characters[c].anims
        const anim = mode === 'animated' ? anims[(i + k) % anims.length] : 'idle'
        return (
          <div key={c} className="flex flex-col items-center" title={PLAYS[c]}>
            <Sprite character={c} variant={{ outfit: k % 3, skin: (k + 1) % 3 }} anim={anim} scale={2} />
            <span className="num mb-1 mt-0.5 rounded-[3px] bg-surface/85 px-1 text-[11px] leading-[14px]">{CHARACTER_LABEL[c]}</span>
          </div>
        )
      })}
    </div>
  )
}
