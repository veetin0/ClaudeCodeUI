---
name: Harness
description: Live timing for Claude Code agents. A graphite timing-tower rail, sector strips and condensed tabular readouts.
colors:
  accent: "#7a2fd0"
  accent-ink: "#7a2fd0"
  on-accent: "#ffffff"
  ok: "#12a15e"
  ok-ink: "#0a7a45"
  warn: "#f2b300"
  warn-ink: "#8a5800"
  danger: "#d92626"
  danger-ink: "#b91c1c"
  info: "#2a78d6"
  info-ink: "#1f63b8"
  forge: "#eb6834"
  idle: "#a3a5b3"
  rail: "#15161d"
  surface: "#ffffff"
  surface-2: "#f3f4f7"
  fg: "#15161d"
  muted: "#5e6172"
  line: "rgb(21 22 29 / 0.1)"
  hover: "rgb(21 22 29 / 0.045)"
  active: "rgb(21 22 29 / 0.08)"
  grid: "rgb(21 22 29 / 0.06)"
  series-1: "#2a78d6"
  series-2: "#eb6834"
  series-3: "#1baf7a"
  series-4: "#eda100"
  series-5: "#e87ba4"
  series-6: "#008300"
  series-7: "#4a3aa7"
  series-8: "#e34948"
  accent-ink-dark: "#b794f6"
  ok-dark: "#22b573"
  ok-ink-dark: "#4ade96"
  warn-dark: "#f5be1e"
  warn-ink-dark: "#f7c948"
  danger-dark: "#ef4444"
  danger-ink-dark: "#f87171"
  info-dark: "#3987e5"
  info-ink-dark: "#7cb2f5"
  forge-dark: "#f07a45"
  idle-dark: "#6b6d7c"
  rail-dark: "#0e0f14"
  surface-dark: "#191a21"
  surface-2-dark: "#20212a"
  fg-dark: "#edeef3"
  muted-dark: "#9a9cad"
  line-dark: "rgb(255 255 255 / 0.09)"
  hover-dark: "rgb(255 255 255 / 0.05)"
  active-dark: "rgb(255 255 255 / 0.09)"
  grid-dark: "rgb(255 255 255 / 0.07)"
  series-1-dark: "#3987e5"
  series-2-dark: "#d95926"
  series-3-dark: "#199e70"
  series-4-dark: "#c98500"
  series-5-dark: "#d55181"
  series-6-dark: "#008300"
  series-7-dark: "#9085e9"
  series-8-dark: "#e66767"
  rail-surface: "#1d1e27"
  rail-surface-2: "#23242e"
  rail-line: "rgb(255 255 255 / 0.08)"
  rail-hover: "rgb(255 255 255 / 0.06)"
  rail-active: "rgb(255 255 255 / 0.11)"
typography:
  display:
    fontFamily: "Barlow Semi Condensed, -apple-system, BlinkMacSystemFont, system-ui, sans-serif"
    fontSize: "34px"
    fontWeight: 600
    lineHeight: 1.25
  headline:
    fontFamily: "Barlow Semi Condensed, -apple-system, BlinkMacSystemFont, system-ui, sans-serif"
    fontSize: "24px"
    fontWeight: 600
    lineHeight: 1.25
  title-lg:
    fontFamily: "Barlow Semi Condensed, -apple-system, BlinkMacSystemFont, system-ui, sans-serif"
    fontSize: "20px"
    fontWeight: 600
    lineHeight: 1.25
  title:
    fontFamily: "Barlow Semi Condensed, -apple-system, BlinkMacSystemFont, system-ui, sans-serif"
    fontSize: "18px"
    fontWeight: 600
    lineHeight: 1.25
  body:
    fontFamily: "-apple-system, BlinkMacSystemFont, SF Pro Text, system-ui, Segoe UI, sans-serif"
    fontSize: "13px"
    fontWeight: 400
    lineHeight: 1.5
  control:
    fontFamily: "-apple-system, BlinkMacSystemFont, SF Pro Text, system-ui, Segoe UI, sans-serif"
    fontSize: "13px"
    fontWeight: 500
    lineHeight: 1.5
  body-sm:
    fontFamily: "-apple-system, BlinkMacSystemFont, SF Pro Text, system-ui, Segoe UI, sans-serif"
    fontSize: "12px"
    fontWeight: 400
    lineHeight: 1.5
  caption:
    fontFamily: "-apple-system, BlinkMacSystemFont, SF Pro Text, system-ui, Segoe UI, sans-serif"
    fontSize: "11px"
    fontWeight: 400
    lineHeight: 1.5
  label:
    fontFamily: "Barlow Semi Condensed, -apple-system, BlinkMacSystemFont, system-ui, sans-serif"
    fontSize: "11.5px"
    fontWeight: 600
    letterSpacing: "0.07em"
  step-label:
    fontFamily: "Barlow Semi Condensed, -apple-system, BlinkMacSystemFont, system-ui, sans-serif"
    fontSize: "12px"
    fontWeight: 600
    letterSpacing: "0.06em"
  readout:
    fontFamily: "Barlow Semi Condensed, -apple-system, BlinkMacSystemFont, system-ui, sans-serif"
    fontSize: "12px"
    fontWeight: 600
    letterSpacing: "0.01em"
    fontFeature: "'tnum'"
  readout-md:
    fontFamily: "Barlow Semi Condensed, -apple-system, BlinkMacSystemFont, system-ui, sans-serif"
    fontSize: "16px"
    fontWeight: 600
    letterSpacing: "0.01em"
    fontFeature: "'tnum'"
  readout-lg:
    fontFamily: "Barlow Semi Condensed, -apple-system, BlinkMacSystemFont, system-ui, sans-serif"
    fontSize: "22px"
    fontWeight: 600
    lineHeight: 1
    letterSpacing: "0.01em"
    fontFeature: "'tnum'"
  readout-xl:
    fontFamily: "Barlow Semi Condensed, -apple-system, BlinkMacSystemFont, system-ui, sans-serif"
    fontSize: "26px"
    fontWeight: 600
    lineHeight: 1
    letterSpacing: "0.01em"
    fontFeature: "'tnum'"
  mono:
    fontFamily: "SF Mono, ui-monospace, Menlo, Consolas, monospace"
    fontSize: "12px"
    fontWeight: 400
    lineHeight: 1.55
rounded:
  sector: "1px"
  xs: "2px"
  sm: "3px"
  md: "4px"
  lg: "6px"
  xl: "8px"
  "2xl": "10px"
spacing:
  hair: "2px"
  xs: "4px"
  sm: "6px"
  md: "8px"
  lg: "12px"
  xl: "16px"
  "2xl": "24px"
components:
  button-primary:
    backgroundColor: "{colors.accent}"
    textColor: "{colors.on-accent}"
    typography: "{typography.control}"
    rounded: "{rounded.lg}"
    height: "28px"
    padding: "0 12px"
  button-primary-step:
    backgroundColor: "{colors.accent}"
    textColor: "{colors.on-accent}"
    typography: "{typography.control}"
    rounded: "{rounded.lg}"
    padding: "8px 16px"
  button-secondary:
    backgroundColor: "{colors.surface}"
    textColor: "{colors.fg}"
    typography: "{typography.control}"
    rounded: "{rounded.lg}"
    height: "28px"
    padding: "0 12px"
  button-secondary-hover:
    backgroundColor: "{colors.hover}"
  button-send:
    backgroundColor: "{colors.accent}"
    textColor: "{colors.on-accent}"
    rounded: "{rounded.md}"
    size: "28px"
  button-stop:
    backgroundColor: "{colors.fg}"
    textColor: "{colors.surface}"
    rounded: "{rounded.md}"
    size: "28px"
  button-icon:
    backgroundColor: "transparent"
    textColor: "{colors.muted}"
    rounded: "{rounded.md}"
    padding: "4px"
  button-icon-hover:
    backgroundColor: "{colors.hover}"
    textColor: "{colors.fg}"
  segmented-track:
    backgroundColor: "{colors.surface-2}"
    rounded: "{rounded.lg}"
    padding: "2px"
  segmented-tab:
    backgroundColor: "transparent"
    textColor: "{colors.muted}"
    typography: "{typography.body-sm}"
    rounded: "{rounded.md}"
    height: "24px"
    padding: "0 10px"
  segmented-tab-selected:
    backgroundColor: "{colors.surface}"
    textColor: "{colors.fg}"
  rail-nav-row:
    backgroundColor: "transparent"
    textColor: "{colors.fg-dark}"
    typography: "{typography.control}"
    rounded: "{rounded.md}"
    height: "32px"
    padding: "0 10px"
  rail-nav-row-active:
    backgroundColor: "{colors.rail-active}"
  status-square-running:
    backgroundColor: "{colors.ok}"
    rounded: "{rounded.xs}"
    size: "8px"
  status-square-waiting:
    backgroundColor: "{colors.warn}"
    rounded: "{rounded.xs}"
    size: "8px"
  status-square-failed:
    backgroundColor: "{colors.danger}"
    rounded: "{rounded.xs}"
    size: "8px"
  status-square-idle:
    backgroundColor: "{colors.idle}"
    rounded: "{rounded.xs}"
    size: "8px"
  badge-waiting:
    backgroundColor: "{colors.warn}"
    textColor: "{colors.rail}"
    typography: "{typography.readout}"
    rounded: "{rounded.sm}"
    height: "18px"
    padding: "0 6px"
  sector-done:
    backgroundColor: "{colors.ok}"
    rounded: "{rounded.sector}"
    height: "4px"
  sector-wait:
    backgroundColor: "{colors.warn}"
    rounded: "{rounded.sector}"
    height: "4px"
  sector-fail:
    backgroundColor: "{colors.danger}"
    rounded: "{rounded.sector}"
    height: "4px"
  sector-best:
    backgroundColor: "{colors.accent}"
    rounded: "{rounded.sector}"
    height: "4px"
  sector-fill:
    backgroundColor: "color-mix(in oklab, #15161d 70%, transparent)"
    rounded: "{rounded.sector}"
    height: "4px"
  sector-todo:
    backgroundColor: "color-mix(in srgb, #5e6172 30%, transparent)"
    rounded: "{rounded.sector}"
    height: "4px"
  card-agent:
    backgroundColor: "{colors.surface}"
    textColor: "{colors.fg}"
    rounded: "{rounded.lg}"
    padding: "12px"
  command-well:
    backgroundColor: "{colors.rail}"
    textColor: "{colors.fg-dark}"
    typography: "{typography.mono}"
    rounded: "{rounded.md}"
    padding: "8px 10px"
  tile-readout:
    backgroundColor: "{colors.surface}"
    textColor: "{colors.fg}"
    typography: "{typography.readout-xl}"
    rounded: "{rounded.lg}"
    padding: "12px"
  panel:
    backgroundColor: "{colors.surface}"
    rounded: "{rounded.xl}"
    padding: "12px"
  section-large:
    backgroundColor: "{colors.surface}"
    rounded: "{rounded.2xl}"
    padding: "16px"
  input-prompt:
    backgroundColor: "{colors.surface}"
    textColor: "{colors.fg}"
    typography: "{typography.body}"
    rounded: "{rounded.xl}"
    padding: "12px 16px 4px"
  popover:
    backgroundColor: "{colors.surface}"
    textColor: "{colors.fg}"
    typography: "{typography.body}"
    rounded: "{rounded.lg}"
    padding: "4px"
  menu-item:
    backgroundColor: "transparent"
    textColor: "{colors.fg}"
    typography: "{typography.body}"
    rounded: "{rounded.md}"
    padding: "6px 10px"
  menu-item-hover:
    backgroundColor: "{colors.hover}"
  sheet:
    backgroundColor: "{colors.surface}"
    textColor: "{colors.fg}"
    rounded: "{rounded.xl}"
---

# Design System: Harness

## Overview

**Creative North Star: "The Timing Tower"**

Harness reads like the live timing graphics of a race broadcast laid over a developer's desk. A graphite tower runs down the left edge in both light and dark mode, listing every session the way a timing tower lists cars: a square status flag, a short name, and a condensed lap time ticking on the right. The work area beside it is cool and quiet: white in light mode, graphite in dark. Progress and history are drawn as rows of timed sectors, never as smooth bars. Every number is set in Barlow Semi Condensed tabular figures, so times, costs and percentages line up and can be read from across the room.

The system is dense and calm on purpose. Most controls are 28px high, most type is 12 or 13px, and structure comes from hairlines and small tonal steps rather than shadows. Colour is scarce and always means something. There are four timing colours, each with one job: green means running or done, yellow means waiting for you, red means failed, and violet marks the best result and the one primary action. Everything else is ink, slate and graphite. One thing moves: a highlight sweeping across the live sector, like a sector being timed.

The world refuses the category default: a grey macOS sidebar, white panes, one brand-orange accent and smooth progress bars. It should read as clearly at 3 a.m. on a hackathon weekend as on a Tuesday afternoon.

**Key Characteristics:**
- A graphite rail (the timing tower) in both modes; anything inside it, menus included, switches to dark tokens.
- Mini-sector strips wherever progress or history shows: run steps, HackForge phases, tool calls, milestones, meters.
- Condensed tabular figures for every readout; the same face at heading size.
- Four timing colours with one job each, each a fill paired with a text-safe ink.
- Crisp corners from 1px to a 10px ceiling, square status flags and 28px controls.
- Flat surfaces separated by hairlines; shadows only on things that float.
- One primary button per screen or card; everything else sits behind ▾, ⋯, the / menu or ⌘K.

## Colors

A graphite-and-ink neutral world with four timing colours. Each colour is a fill paired with a darker (light mode) or lighter (dark mode) ink for text.

### Primary
- **Timing Violet** (#7a2fd0): the colour of the best result and the one primary action. As a solid fill it appears only on the primary button (white text, 6.7:1) and on best-result marks: the best loop iteration in a score chart, a criterion scored 8 or higher, a finished loop's meter, the top-ranked challenge's score. **Violet Ink** (`accent-ink`, #7a2fd0 in light mode, #b794f6 in dark mode and in the rail) carries the same meaning in text, and as a 10% wash with a violet-ink border it marks what you have picked: the selected option in a question or form, the palette's highlighted row, a selected tool chip. The focus ring (2px, violet ink at 70%), the text caret and the selection highlight use it as well.

### Secondary
- **Running Green** (`ok` #12a15e, ink #0a7a45; dark #22b573 / #4ade96): running and done. Live sectors, finished sectors, running status squares, PASS verdicts, the target line in score charts, and done or chosen badges as a 15% green wash with green-ink text.
- **Waiting Yellow** (`warn` #f2b300, ink #8a5800; dark #f5be1e / #f7c948): waiting for you. Permission prompts, the inbox count, a stuck milestone, notes that need action, and an amount nearing its limit. Text on a yellow fill is set in rail graphite (#15161d, 9.6:1), never in white.
- **Failed Red** (`danger` #d92626, ink #b91c1c; dark #ef4444 / #f87171): failed, over the limit, destructive. Failed sectors and tool calls, FAIL verdicts, an urgent race clock, Stop actions (outlined in red, never filled).

### Tertiary
- **Subagent Blue** (`info` #2a78d6, ink #1f63b8; dark #3987e5 / #7cb2f5): information and subagents. Subagent icons, the compacting status, in-progress task icons, and the marker for something ready in a tab (a Remotion project ready to preview).
- **Forge Flame** (`forge` #eb6834; dark #f07a45): HackForge's mark only. The flame icon on HackForge headers, empty states and the side panel. It is a brand mark, not a state.
- **Categorical series** (`series-1` to `series-8`, with dark-mode partners): the validated chart and tool-kind palette, assigned in order. Tool kinds are fixed to it: read 1 (blue), write 2 (orange), exec 3 (teal), plan 4 (amber), agent 5 (pink), search 6 (green), web 7 (indigo); MCP and other calls use slate.

### Neutral
- **Rail Graphite** (`rail` #15161d; dark #0e0f14): the timing tower's background and the app's backdrop. It also fills the command well inside agent cards and appears as the ink on yellow badges.
- **Rail Panel** (`rail-surface` #1d1e27, `rail-surface-2` #23242e): menus and raised surfaces that open inside the rail, with their own hairline (`rail-line`) and white-alpha hover and active washes.
- **Work Surface** (`surface` #ffffff; dark #191a21): the work area, cards, popovers, sheets and the prompt box.
- **Sunken Surface** (`surface-2` #f3f4f7; dark #20212a): segmented-control tracks, code tails, metric tiles, neutral badges, the user's chat bubble.
- **Ink** (`fg` #15161d; dark #edeef3): primary text, the stop button and plain-amount fills (at 70%).
- **Slate** (`muted` #5e6172; dark #9a9cad): secondary text, icons, labels and the empty-sector track (at 30%). It holds 6.1:1 on white and 6.4:1 on the dark surface.
- **Idle Grey** (`idle` #a3a5b3; dark #6b6d7c): ready, idle, done-and-quiet status squares. This is a fill, never text.
- **Hairline** (`line`, ink at 10%; dark white at 9%): every border and divider. **Hover** (4.5% / 5%) and **Active** (8% / 9%) are the two interaction washes. **Grid** (6% / 7%) is for chart gridlines.

### Named Rules

**The Four Flags Rule.** Green is running or done, yellow is waiting for you, red is failed, violet is best. A state never borrows another state's colour, and grey means ready or still to come. If a new state does not fit one of the four, it is ink.

**The Two Jobs Rule.** Solid violet does exactly two jobs: the one primary action and the best result. Its tint and ink mark only what you have chosen or focused. Violet never signals that something is running, waiting or merely present: status dots, spinners, count badges and any progress bar that is not a best result are never violet.

**The Fill-and-Ink Rule.** Dots, sectors and bars use the base colour; text uses its `-ink` partner, which holds at least 5.4:1 on the surface in both modes. Never set text in a fill colour.

**The Ink-for-Amounts Rule.** Plain amounts (context used, plan usage) fill in ink at 70%, not green. They turn yellow and then red near their limits: context past 65% and 85%, the 5-hour plan window past 70% and 90% (or when the plan warns or rejects). Usage left (a teammate's headroom) fills the same ink and turns yellow at 30% left and red at 10% left.

**The Graphite Rail Rule.** The rail is graphite in both modes and re-scopes every token inside it to its dark values, so menus opened from the rail are dark too. The same graphite material is reused as the command well that shows a running shell command inside an agent card. Any other always-dark surface takes the same re-scope, so its text uses the dark-mode `-ink` values, never raw palette colours.

## Typography

**Display Font:** Barlow Semi Condensed, weights 500/600/700 bundled via @fontsource (with -apple-system, system-ui, sans-serif)
**Body Font:** the platform sans: -apple-system / SF Pro Text on macOS, Segoe UI on Windows (with system-ui, sans-serif)
**Label/Mono Font:** Barlow Semi Condensed for labels and readouts; SF Mono (with ui-monospace, Menlo, Consolas) for code, commands and file paths

**Character:** The condensed face is the timing board: every figure, every column label and every heading at display size speaks in it, with tabular numerals so readouts stay aligned while they tick. The platform sans carries reading and controls, so the app feels native and the condensed face stays special.

### Hierarchy
- **Display** (600, 34px, 1.25): the Home question only ("What do you want to build?").
- **Headline** (600, 24px, 1.25): the title of a place or step: the run board's current milestone, each team-run step, and the event name at 26px.
- **Title Large** (600, 20px, 1.25): a view's heading inside a place: the Agents board, the HackForge challenge name.
- **Title** (600, 18px, 1.25): sheet and dialog titles (Settings, Usage, Hand off).
- **Body** (400, 13px, 1.5): the app's base size, used for text, menu items and card titles (titles at 600, in the platform sans and not the display face). Chat prose sits in a 768px column.
- **Control** (500, 13px): button labels and rail rows.
- **Body Small** (400, 12px, 1.5): the workhorse secondary line: subtitles, meta, tabs, chips, log rows.
- **Caption** (400, 11px): hints under menu items, file paths, severity and kind tags.
- **Label** (600, 11.5px, 0.07em, uppercase, slate): column, group and tile labels such as SESSIONS, TODAY, COMPLIANCE. Step labels under a sector stepper use 12px at 0.06em, ink when current and slate otherwise.
- **Readout** (600, tabular, 0.01em): times, costs, percentages and counts at 12px inline, 16px for a metric's latest value, 22px for the race clock and stat cards, 26px for verdict tiles. Live or primary readouts are semibold in ink; secondary ones are regular in slate.

### Named Rules

**The Condensed Readout Rule.** Every time, cost, percentage, token count and score is set in Barlow Semi Condensed with tabular figures. A number in the platform sans is a bug.

**The Three-Size Rule.** The interface runs on 13, 12 and 11px. 14px appears only where you type at length (the Home prompt, the ⌘K input) and in the Home lede. The display face takes over at heading size (18px and up) and nowhere smaller, except in labels and readouts.

**The Label, Not Eyebrow Rule.** Uppercase labels name a column, a group or a tile. They never sit above a heading as a kicker.

## Layout

A fixed two-column shell: the 240px graphite rail on the left, the work area on the right with a 48px top bar (session title and status, the Chat · Agents · Preview segmented control, and the status chip on the far right). The rail has three parts: where to go (Home, Hackathon with its race clock and five-sector run strip, New session), the session list, and a footer with plan usage as 20 sectors and Settings. On macOS, the rail's first 48px are left free for the traffic lights.

Content columns are centred and capped by purpose: Home at 672px, the conversation at 768px, sheets at 672px (wide sheets 1024px), and the run board at 1280px. The run board splits 3:2 from 1280px; tile rows go from two to four columns at 768px; teammate cards pair up at 768px; agent cards fill an auto grid of 320px minimum columns with 12px gaps. The window's minimum size is 960×600, and the top bar drops secondary labels (such as the side-panel summary) below 1180px.

Spacing is a 4px rhythm with a 2px hairline step. Sector gaps are 2px; gaps inside a row are 6–8px; cards pad 12px; panels pad 12–16px; content gutters are 24px; the top bar pads 16px and the rail 8px. Controls are 28px high, segmented tabs 24px, rail navigation rows 32px, and two-line session rows sit at about 44px. Density is the point: a whole agent's state (status, current action, progress, metrics, tool rhythm, elapsed time) fits in one card.

## Elevation & Depth

Flat by default. Depth comes from tone, not shadow: the rail is the darkest plane, the work surface sits on it, and sunken surfaces (`surface-2`) recess tracks and wells. Hairlines at 9–10% ink do the structural work. In dark mode the rail adds a 1px inner highlight on its right edge in place of a border.

### Shadow Vocabulary
- **Pop** (`box-shadow: 0 10px 28px -6px rgb(21 22 29 / 0.22), 0 2px 6px rgb(21 22 29 / 0.08)`; dark and in the rail: `0 12px 32px -6px rgb(0 0 0 / 0.6), 0 2px 6px rgb(0 0 0 / 0.3)`): everything that floats above the page: popovers, menus, sheets, dialogs, the command palette, the agent drawer, chart tooltips and preview overlays. It is the only floating shadow; there is no larger one.
- **Prompt lift** (`box-shadow: 0 6px 20px -8px rgb(21 22 29 / 0.18)`): the prompt box, the one resting surface that is lifted, because it is where every action starts.
- **Hover lift** (`box-shadow: 0 8px 24px -10px rgb(21 22 29 / 0.25)`): an agent card under the pointer, which says it opens.
- **Thumb** (`box-shadow: 0 1px 2px rgb(21 22 29 / 0.12)`): the selected segment in a segmented control.

### Named Rules

**The Flat-by-Default Rule.** Surfaces rest flat on hairlines. A shadow means the thing floats (pop), is where you start (prompt lift) or responds to the pointer (hover lift). Cards, panels and tiles never carry a resting shadow.

## Shapes

Crisp, small corners on a deliberate ladder, capped at 10px. The theme remaps the whole radius scale, so nothing in the app can round further than that. Sectors use 1px. Status squares use 2px. Badges and tags use 3px. Inner controls (menu items, rail rows, icon buttons, segmented tabs, tool chips and buttons nested in the prompt box) use 4px. Standalone buttons, cards, popovers and the segmented track use 6px. Panels, sheets and the prompt box use 8px. Large event and usage sections and the command palette use 10px. Nested shapes step down one rung from their container (a 6px track holds 4px tabs; an 8px prompt box holds 4px buttons).

Status is always a square, never a circle. Full rounding is kept for controls whose native idiom demands it: the on/off switch and round media play buttons. Borders are 1px hairlines; state colours tint a border at 40–50% (a running agent card's border is green at 40%) rather than thickening it. Empty states use a dashed hairline border.

### Named Rules

**The Ten-Pixel Ceiling Rule.** No corner exceeds 10px, and most are 4–6px. Pills belong only to switches and play buttons.

**The Square Flag Rule.** Status markers are squares: 8px at 2px radius, or 6px at 1px inline. A round status dot breaks the timing-board language.

## Components

### Buttons
Quiet, confident and few: one violet button per screen or card, everything else in ink.
- **Shape:** gently squared (6px) when standalone; 4px when nested in the prompt box.
- **Primary:** violet fill, white 13px medium label, 28px high with 12px side padding. A step's one action in the team run grows to 8px × 16px padding. When a primary has alternatives, they sit behind an attached ▾ segment divided by a 25% white hairline, so the next thing to do is obvious and nothing is lost.
- **Hover / Focus:** brightness 110% on hover, 95% when pressed; disabled at 40–60% opacity. Focus is the global 2px violet-ink ring at a 1px offset.
- **Busy:** a spinner replaces the button's icon and the button disables. The label stays.
- **Secondary:** a white surface with a hairline border and an ink label, the hover wash on hover. Pause and Resume, Copy, Usage history.
- **Send / Stop:** 28px squares in the prompt box. Send is violet when there is text and idle grey at 50% when empty; Stop is an ink square with a surface-coloured glyph.
- **Ghost / Icon:** slate glyph, 4px padding, 4px corners, the hover wash with ink on hover. The ⋯ menu trigger is the canonical one.
- **Destructive:** outlined in red at 40% with red ink, a 10% red wash on hover. It is never a solid red fill, and it lives behind ⋯ with a confirm wherever it can.

### Chips
- **Status chip (top bar):** a borderless 28px readout button: an 8-sector context meter, the percentage, plan usage when it runs warm, and the session cost in semibold ink. The whole chip turns warn-ink or danger-ink when context or the plan runs high. Details open in a popover.
- **Tool chip:** 4px corners, 12px text, tinted by tool kind (10% fill, 28% border) with the kind colour on the icon only; text stays in ink. Waiting chips turn yellow-washed with a "waiting for you" note; a selected chip takes the violet-ink ring.
- **Badges:** 3px corners, condensed semibold figures, 16–18px tall. A plain count (running agents, open tasks) is an ink chip with surface-coloured figures; a waiting count (the inbox) is yellow with rail-graphite text; a done or chosen badge is a 15% green wash with green-ink text. White text never sits on a green or yellow fill. Neutral tags use the sunken surface with a hairline; severity tags use a 15% wash of red or yellow with the matching ink.

### Cards / Containers
- **Corner Style:** cards 6px; panels and sheets 8px; large sections 10px.
- **Background:** work surface; neutral metric tiles use the sunken surface at 60%.
- **Shadow Strategy:** flat at rest (see Elevation & Depth); agent cards lift on hover.
- **Border:** a 1px hairline. A state tints the border: a running agent is green at 40%, waiting is yellow at 50%, failed is red at 40%. Verdict tiles also take a 5–6% wash of the same colour.
- **Internal Padding:** 12px for cards, tiles and panels; 16px for run-step cards and large sections; sheet headers pad 12px × 20px.

### Inputs / Fields
- **Style:** the prompt box is the field that matters: an 8px-cornered surface with a hairline border and the prompt lift, a borderless textarea (14px on Home, 13px in a session) above a row of 28px controls. Small fields (selects, the rail's session search) use 4px corners with a hairline border or the hover wash.
- **Focus:** the prompt box's border shifts to violet ink at 60%; the rail search deepens from the hover to the active wash; everything else shows the global violet-ink ring.
- **Error / Disabled:** errors appear as a red-ink line under the field or as a red-washed notice with an alert icon; disabled controls drop to 40–60% opacity.

### Navigation
- **Rail rows:** 32px, 4px corners, 13px medium labels at 90% ink with slate shortcut hints in condensed figures on the right. Hover takes the rail hover wash; the current place takes the active wash and full ink. Session rows lead with a status square and end with the elapsed turn time in semibold condensed figures while live, or the cost in slate when idle. Date groups (TODAY, YESTERDAY) are labels.
- **Segmented control:** the one tab style (session views, Hackathon tabs, Agents modes, Settings tabs). A sunken track with a hairline and 2px padding holds 24px tabs in 12px slate. The selected tab is a white segment in medium ink with the thumb shadow. A small green square marks something live in a tab; a blue one marks something ready.
- **Menus and the palette:** popovers on the pop shadow with 4px-cornered items (6px × 10px padding), slate icons, caption hints and condensed shortcut hints. Arrow keys move between items and Escape closes the innermost layer first.

### Mini-Sectors (signature)
Progress and history are drawn as a row of equal segments with 2px gaps and 1px corners, 3–6px tall, like a lap split into timed sectors. Done is green; the live sector is green with a white highlight sweeping across it; waiting is yellow; failed is red; best is violet; a plain amount is ink at 70%; still to come is slate at 30%. Variants: the meter (a value as N filled sectors: 20 for plan usage, 8 in the status chip, 24 for progress), steps (named stages with condensed uppercase labels under each sector, as in the team-run and HackForge phase steppers), and the activity strip (one 6px sector per tool call, coloured by tool kind, 4–14px wide). Every one carries an accessible label or meter role.

### Agent Card (signature)
A live tile per agent: icon, name and role, a status square with its word (Working, Needs you, Done, Failed), the current action in 13px medium, a "now" widget (the tail of the file being written, with line numbers and a caret, or the running command in a graphite command well with a green $ and a ticking timer), progress as sector meters, up to four metric tiles with sparklines, then a footer readout of the activity strip, call count, tokens and elapsed time in semibold ink. Inactive agents drop to 85% opacity.

### Named Rules

**The One Button Rule.** Each screen or card has exactly one primary (violet) button. Alternatives go behind its ▾; everything else goes behind ⋯, the / menu or ⌘K.

**The One Sweep Rule.** The highlight crossing the live sector (1.6s, `cubic-bezier(0.16, 1, 0.3, 1)`, repeating) is the only ambient animation, and only the leading sector of a live meter carries it; the sectors behind it are plain done. No opacity pulses, breathing dots or shimmer. The only other motions are functional: the stepped caret while text streams, a spinner standing in for an icon while something runs (slate, info blue for an in-progress task, or the busy button's own label colour; never violet), and 150ms colour and shadow transitions on hover. The sweep, the caret and every spinner stop under reduced motion.

## Do's and Don'ts

### Do:
- **Do** draw every progress, history or usage reading as mini-sectors with 2px gaps and 1px corners.
- **Do** set every readout (time, cost, percentage, count, score) in Barlow Semi Condensed with tabular figures.
- **Do** keep the rail graphite (#15161d light, #0e0f14 dark) in both modes and let anything that opens inside it inherit the dark tokens.
- **Do** give each screen or card exactly one violet primary button and put its alternatives behind an attached ▾.
- **Do** mark status with 8px squares at 2px radius: green running, yellow waiting for you, red failed, idle grey for ready.
- **Do** fill plain amounts in ink at 70% and switch them to yellow, then red, as they near their limits.
- **Do** pair every state fill with its `-ink` partner for text, and set text on yellow in rail graphite.
- **Do** keep UI text at 13/12/11px and use the condensed display face for headings at 18px and up.
- **Do** separate surfaces with 1px hairlines and tonal steps; reserve shadows for floating layers, the prompt box and agent-card hover.
- **Do** assign categorical colours in series order, and tint tool kinds at 10% fill and 28% border with the colour on the icon only.

### Don't:
- **Don't** use a grey macOS sidebar, white panes with a single brand-orange accent, or smooth continuous progress bars; that is the category default Harness refuses.
- **Don't** use violet to say something is running, waiting or new: no violet status dots, spinners, count badges or progress bars except for a best result.
- **Don't** animate anything but the live sector's sweep: no opacity pulses, breathing dots or shimmer skeletons.
- **Don't** use round status dots or pill-shaped badges; status is square and badges have 3px corners.
- **Don't** round any corner past 10px.
- **Don't** set a number in the platform sans, and don't set body copy in the condensed face.
- **Don't** put an uppercase label above a heading as an eyebrow; labels name columns, groups and tiles.
- **Don't** set text in a fill colour (yellow, green or idle grey) or white text on green or yellow fills.
- **Don't** fill a destructive action solid red; outline it, and put it behind ⋯ with a confirm.
- **Don't** cycle categorical colours or reassign a tool kind's colour.
