import { FileText, FolderOpen, Sparkles } from 'lucide-react'
import { deckPrompt, DECK_FILE, PITCH_DIR, type PitchState } from '@shared/pitch'
import { relativeTime } from '@/lib/time'
import { useProject } from '@/stores/project'

/**
 * The project's presentation deck as a PDF. Claude builds it from what the project is (its source
 * stays in promo/deck/) and saves promo/deck.pdf, kept in git.
 */
export function PitchDeck({ state }: { state: PitchState }) {
  const askClaude = useProject((s) => s.askClaude)
  const deck = state.deck
  const make = () => void askClaude(deckPrompt(), 'Presentation deck', { fresh: true })
  return (
    <section data-testid="pitch-deck" className="flex flex-wrap items-center gap-3 rounded-2xl border border-line p-3">
      <FileText className="size-5 shrink-0 text-accent-ink" />
      <div className="min-w-0 flex-1">
        <h2 className="text-[13px] font-semibold">Presentation deck (PDF)</h2>
        <p className="mt-0.5 text-[12px] text-muted">
          {deck
            ? `${PITCH_DIR}/${DECK_FILE} · updated ${relativeTime(deck.mtime)}`
            : `For investors, demos and launches: Claude builds 8-10 slides from what you made and saves them as ${PITCH_DIR}/${DECK_FILE}.`}
        </p>
      </div>
      <div className="flex flex-wrap gap-2 text-[12px]">
        {deck && (
          <button onClick={() => void window.harness.revealFile(deck.path)} className="flex items-center gap-1.5 rounded-md border border-line px-3 py-1.5 hover:bg-surface-2">
            <FolderOpen className="size-3.5" /> Show in folder
          </button>
        )}
        <button
          onClick={make}
          className={
            deck
              ? 'flex items-center gap-1.5 rounded-md border border-line px-3 py-1.5 hover:bg-surface-2'
              : 'flex items-center gap-1.5 rounded-md bg-accent px-3 py-1.5 font-medium text-white hover:brightness-110'
          }
        >
          <Sparkles className="size-3.5" /> {deck ? 'Update it with Claude' : 'Make the deck with Claude'}
        </button>
      </div>
    </section>
  )
}
