# UI rubric (4 axes, 0–10)

Adapted from Claude Code Harness's UI rubric profile (MIT). Used by frontend builders before they return, and by the *experience* judge.

| Axis | What it measures | 0 | 5 | 10 |
|---|---|---|---|---|
| **Design quality** | Information hierarchy, spacing, where the eye goes, readability | Can't tell what matters; cramped | Readable but flat hierarchy | The important thing is obvious in one glance |
| **Originality** | Intentional visual identity that fits the challenge and sponsor | Default template look | Some intent, weak impression | Distinct, fits the brief, memorable |
| **Craft** | Alignment, consistent spacing and type scale, states (empty/loading/error/hover) | Misaligned, inconsistent, missing states | No big breaks, rough details | Consistent down to states and transitions |
| **Functionality** | Main path works without explanation at demo resolution | Main path unclear or broken | Works but the user hesitates | A judge completes the main path without help |

Rules
- Score each axis with one line of evidence (screenshot path or element).
- Any axis below 6 is a **major** finding with a concrete fix.
- Judge at the actual demo resolution and on the actual demo machine where possible.
- `DESIGN.md` at the project root is the intended system: Craft means the screens follow it consistently.
- When impeccable is installed (the Harness app ships it), `tools design-scan` gives deterministic evidence: `quality` findings (contrast, accessibility) count against Craft and Functionality; `slop` findings (gradient text, glow, overused fonts, nested cards, generic hero layouts) count against Originality. Check each finding in context; detectors have false positives.
