# Design system

The visual layer is an **instrument panel**: graphite chassis, one accent
reading, numbers carrying the weight. This page is the inventory of what
exists so a new component reaches for a name instead of inventing a value.

## Two layers of tokens

**Primitives** live in [`tailwind.config.js`](../tailwind.config.js) — the
surface/paper/muted greys, the `flux` constraint blue, `rose`/`jade`, the type
scale (`text-2xs` = 0.7rem), the two tracking values (`tracking-label` 0.18em,
`tracking-eyebrow` 0.4em), and the shadows (`panel`, `popover`, `glow*`). The
weight scale is **replaced**, not extended: only `normal`/`medium`/`semibold`/
`bold` compile, because those are the only weights `index.html` fetches. Ask
for `font-black` and you get nothing — deliberately.

**The accent is a seam, not a primitive.** `--accent`, `--accent-bright` and
`--accent-deep` are `"r g b"` triplets on `:root` in
[`src/index.css`](../src/index.css); Tailwind reads them through
`rgb(var(--accent) / <alpha-value>)` so opacity modifiers still work. A second
game overrides those three custom properties under a `[data-game]` selector and
inherits every accent-tinted rule for free — see `packages/engine/src/game/registry.ts`. Two
things can't follow the seam and say so in a comment: the `select.field`
chevron (a `background-image` data-URI can't read a custom property) and the
scrollbar greys.

**Element hues are a token set, not a seam.** `element.pyro`/`hydro`/`electro`/
`cryo`/`anemo`/`geo`/`dendro` in [`tailwind.config.js`](../tailwind.config.js)
are the seven canonical game hues, brightened for this chassis: each is stored
as an `rgb(r g b / <alpha-value>)` triplet like the accent, so `/alpha`
modifiers work, and each clears 4.5:1 as **text** on `surface-900` (the darkest
ground the app paints). Unlike the accent they are constant — an element is a
fact about the dataset, not a per-game reading. Domain code never writes these
classes: `ELEMENT_TONE` in
[`src/components/ui/elementTone.ts`](../src/components/ui/elementTone.ts) and
the [`ElementName`](../src/components/ui/ElementName.tsx) component own
the mapping, and `ElementName` always prints the element's name beside its dot,
so hue is a second channel and never the only one.

**Copy case.** Chrome copy (buttons, headings, chips, labels) is Title Case;
body, hints and status sentences are sentence case.

## Component classes

Defined in `@layer components` in [`src/index.css`](../src/index.css).

| Class                              | What it is                                                                       |
| ---------------------------------- | -------------------------------------------------------------------------------- |
| `.focus-ring`                      | The one focus treatment. See below.                                              |
| `.touch-target`                    | `min-h-11` + `touch-action: manipulation`.                                       |
| `.panel` + `.panel-md`/`.panel-sm` | Instrument panel with a hairline accent border. Padding is **not** baked in.     |
| `.card`                            | Second tier: a plain bordered slab for repeated rows inside a `.panel`.          |
| `.well`                            | Recessed inset block for nested lists and read-only detail.                      |
| `.field` / `.field-label`          | Form control shell and its label.                                                |
| `.btn-primary` / `.btn-ghost`      | The accent action and the ghosted constraint action.                             |
| `.chip`                            | Small mono pill — counts, nav steps, status.                                     |
| `.eyebrow`                         | Wide-tracked accent kicker above a heading.                                      |
| `.section-badge` (+ `-sm`)         | Numbered tick marking a real sequence, never a menu.                             |
| `.micro-label`                     | The uppercase micro-label idiom: `text-2xs uppercase tracking-label text-muted`. |

`.panel`, `.card` and `.well` deliberately carry **no padding** — callers pick
it, because the same shell wraps a two-line row and a whole form. `.panel-md`
(p-6) and `.panel-sm` (p-5) are the two sanctioned choices.

## React primitives

In [`src/components/ui/`](../src/components/ui). Domain-free: nothing here
imports from `game/`, `meta/` or `roster/`.

- **`tone.ts`** — the one `TONE` record: `accent`/`jade`/`flux`/`muted`/`rose`,
  each a border-`/40` + fill-`/10` + text triplet. Every tinted surface in the
  app resolves through it, so a band chip, a grade marker and an error callout
  are the same system rather than three hand-tuned near-misses. Domain code maps
  its own vocabulary onto a `Tone` (`BAND_TONE` and `GRADE_TONE`, both in
  `labels.ts`) rather than writing classes.
- **`Callout`** — every inline message. `tone="error"|"success"|"info"`; the
  caller supplies `role="alert"` (unprompted failure) or `role="status"`
  (confirmation of the user's own action).
- **`Segmented`** — the "pick one of N" control, `role="tablist"` or
  `"radiogroup"`. Owns roving tabindex and moves DOM focus **with** the
  selection; horizontal only, so Up/Down still scroll the drawer it lives in.
- **`Badge`** / **`Marker`** — pill and square-tick classifications.
- **`ElementName`** — an element's name in that element's hue, with a
  decorative dot. The only sanctioned way to print an element.
- **`GradeMarker`** — a build's grade letter as a `Marker`, with the one
  `role="img"` + `aria-label` sentence that explains what the letter means.
  Every view that shows a grade goes through it.
- **`CharacterLine`** — the identity line "element · weapon", with one
  separator and one "No weapon equipped" fallback.
- **`SourceLink`** — an outbound citation: bakes in `target="_blank"`,
  `rel="noreferrer"` and the screen-reader "(opens in new tab)", so no caller
  can open a tab without saying so.
- **`Disclosure`** — native `details`/`summary` with the app's twisty
  (`group-open:rotate-90`), the focus ring and two sizes/tones. The browser
  owns the expanded state and the aria wiring; callers own only what is inside.
- **`SearchCounts`** — "N leaves evaluated · M subtrees pruned", worded and
  set identically in the hero proof line, the exact-search line above the
  results, and the live progress line.
- **`Meter`** — a decorative bar restating a number printed beside it, hence
  `aria-hidden`. A bar that is the _only_ carrier of its value needs real
  `role="progressbar"` semantics and does not belong here (PlanView's live
  progress bar is bespoke for that reason). The optimiser's own progress line
  has no total to divide by, so it is neither: a plain pulsing `div`, marked
  `aria-hidden`, beside the counters that carry the real signal.
- **`Combobox`** — the searchable single-select. Takes an optional `id`,
  applied to whichever control is showing (button when closed, input when open,
  at the same position). Both are labelable elements, so a sibling
  `<label htmlFor>` reaches it either way — that is how a Combobox's visible
  label matches the `<select>`s beside it.
- **`AppDrawer`** — the app-wide detail panel: slides from the left on desktop,
  from the bottom on mobile. `vaul` supplies the focus trap, scroll lock and
  esc-close; `aria-modal` is set here because Vaul's content node does not set
  it.
- **`cn()`** — falsy-filtering class join. Registered in `.prettierrc.json` as
  a `tailwindFunctions` entry so its arguments get class-sorted too.

## Focus and touch

Every interactive surface is reachable and visibly focusable. `.focus-ring` is
`outline-none` plus `focus-visible:ring-2 ring-accent/70 ring-offset-2
ring-offset-surface-900`. **The offset colour is not optional** — Tailwind's
default `ringOffsetColor` is white, which paints a bright halo on this chassis
instead of a gap. It is `@apply`ed into `.field`, `.btn-primary`, `.btn-ghost`
and `.chip`; anything hand-rolled adds it explicitly.

Every control is at least **44px tall** (`.touch-target`), the minimum
comfortable touch target.

**Async actions use `aria-disabled`, not `disabled`.** A button that goes truly
`disabled` while it is the active element hands focus to `<body>`, dropping the
keyboard user at the top of the page mid-run. Every button that kicks off an
async job (Optimise, Use meta build, the sample presets, Build my Abyss plan,
Fetch, Explain this build) sets `aria-disabled` and holds a matching early
return in its handler — the guard has to exist, because the button is still
clickable and, inside a `<form>`, Enter still submits. `.btn-primary` and
`.btn-ghost` mirror every `disabled:` rule under `aria-disabled:` so the two
look identical.

**Live regions are persistent.** A region mounted in the same commit as its
text is not being observed yet, so nothing is announced. The pattern is an
always-mounted `sr-only` `role="status"` / `role="alert"` node whose text
changes, with the visible `Callout` carrying no role of its own. Every panel
that announces uses it (App, ImportPanel, Results, ArtifactForm, and
ExplainBuild, which is being aligned onto the same pattern).

**Re-announce identical text by clearing the region first.** A live region only
fires on content _change_, so writing the same string twice in a row is
silently dropped — the second occurrence of an unchanged message (a repeated
failure, a re-run that lands on the same result) has to blank the node and set
it again.

## One theme, on purpose

The app is dark-only. `color-scheme: dark` is pinned on `:root` and there is no
`prefers-color-scheme` branch anywhere. That is a decision, not an omission:
the instrument-panel aesthetic _is_ a lit readout on a dark chassis, and a
light inversion would make the accent glow, the hairline panel border and the
`bg-white/5` fills all read as mistakes.

If a light theme ever becomes a requirement, the work is: promote the surface
ramp and `paper`/`muted` to semantic custom properties on `:root` the way the
accent already is, invert them under a `[data-theme]` selector, replace the
`white/N` alpha fills (which assume a dark ground) with a token, and re-check
the `TONE` record's `/10` fills for contrast. The accent seam is already in the
right shape; the chassis is not.

## Motion / easing

Transitions use Tailwind's default timing functions (`ease-in`, `ease-out`,
`ease-in-out`, and the default `transition` curve) with no custom easing
tokens in `tailwind.config.js`. That is a decision, not an omission: the UI's
transitions are short, incidental (hover, focus, panel open/close) rather than
brand-defining, so Tailwind's defaults already read as natural and adding
`--ease-*` tokens would be ceremony without a matching design need.
