import { MessageSquare } from 'lucide-react'
import { sessionIn } from '@/lib/projects'
import { projectName } from '@/stores/project'

/** The project's build: where it is and what to do next. */
export function BuildTab({ dir }: { dir: string }) {
  return (
    <section className="rounded-2xl border border-line p-4">
      <h2 className="text-[15px] font-semibold">{projectName(dir)}</h2>
      <p className="mt-1 text-[13px] text-muted">Claude builds this project with ECC’s planners, builders and reviewers.</p>
      <button onClick={() => void sessionIn(dir)} className="mt-3 flex items-center gap-1.5 rounded-lg bg-accent px-3 py-1.5 text-[13px] font-medium text-white hover:brightness-110">
        <MessageSquare className="size-3.5" /> Open in a session
      </button>
    </section>
  )
}
