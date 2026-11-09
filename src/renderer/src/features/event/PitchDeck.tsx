import { FileText, FolderOpen, Sparkles } from 'lucide-react'
import { deckPrompt, DECK_FILE, PITCH_DIR, type PitchState } from '@shared/pitch'
import { relativeTime } from '@/lib/time'
import { useEvent } from '@/stores/event'

/**
 * The pitch deck PDF that many submissions ask for next to the video. Claude builds it from what the
 * team made (its source stays in pitch/deck/) and saves pitch/deck.pdf, shared through git.
 */
export function PitchDeck({ state }: { state: PitchState }) {
  const askClaude = useEvent((s) => s.askClaude)
  const deck = state.deck
  const make = () => void askClaude(deckPrompt(), 'Pitch deck', { fresh: true })
  return (
    <section data-testid="pitch-deck" className="flex flex-wrap items-center gap-3 rounded-2xl border border-line p-3">
      <FileText className="size-5 shrink-0 text-accent-ink" />
      <div className="min-w-0 flex-1">
        <h2 className="text-[13px] font-semibold">Pitch deck (PDF)</h2>
        <p className="mt-0.5 text-[12px] text-muted">
          {deck
            ? `${PITCH_DIR}/${DECK_FILE} · updated ${relativeTime(deck.mtime)}`
            : 'Many submissions ask for a deck next to the video. Claude builds 8-10 slides from what you made and saves them as pitch/deck.pdf.'}
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
