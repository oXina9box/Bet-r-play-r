# Design system — Bet-R Play-R workbench

## Identity

- **Genre:** modern-minimal / technical.
- **Macrostructure:** compact, live-data workbench for Sic Bo, Teen Patti, Baccarat, and The Kickoff.
- **Tone:** dark, restrained, functional; color distinguishes sides, statuses, and active risk states rather than decoration.
- **Existing palette:** preserve the stylesheet's dark neutral surfaces, orange side A, blue side B, green wins, red losses, and gold warnings. `tokens.css` expresses observed stylesheet colors in OKLCH. Values were calculated from the source hex using standard sRGB-to-OKLab conversion; generated fractional OKLCH values represent those source colors, not separate perceptual redesign. Additional translucent surface tints and semantic role colors are defined as design values where prior literals were alpha colors or distinguishable shades.

## Typography

`--font-body` retains existing system stack (`system-ui`, `-apple-system`, Segoe UI, Roboto, sans-serif). `--font-display` aliases body stack to preserve the current single-family visual system. `--font-mono` reserves platform monospace for compact technical/numeric readouts. No external fonts or font downloads required. Use upright display headings; numeric data may use tabular figures.

## Color and semantics

Source of truth: root `tokens.css`.

- `--color-paper`, `--color-paper-2`, `--color-paper-3`: page, panel, elevated surface.
- `--color-ink`, `--color-ink-2`: primary and muted text.
- `--color-rule`, `--color-rule-strong`, `--color-rule-hover`: borders and separators.
- `--color-accent` / `--color-accent-ink`: side A / primary emphasis.
- `--color-side-b` / `--color-side-b-ink`: side B.
- `--color-win`, `--color-loss`, `--color-warn`: outcome and caution roles.
- `--color-focus`: keyboard focus indicator.
- `--color-side-*-tint`, `--color-*-tint`, and `--color-*-border`: low-emphasis status fills and edges.
- Further named roles retain distinct existing blue informational, urgent red, caution yellow, recovery gold, ladder violet, voice, overlay, and draw-signal appearances.
- `--bg`, `--panel`, `--panel2`, `--line`, `--text`, `--fg`, `--muted`, `--a`, `--b`, `--win`, `--loss`, `--warn`, and `--radius` remain aliases for existing stylesheet consumers.

Colors must not be the only indication of outcome or interaction. Pair status colors with existing labels, symbols, and state text. Contrast claims require measurement against rendered surfaces; no contrast audit result is claimed here.

## Spacing and shape

Use 4-point increments from `--space-2xs: 4px` through `--space-xl: 24px`, with `--space-3xs: 2px` for dense controls. These values provide compact spacing tiers, not an assertion that every legacy stylesheet spacing has been migrated. Use `--radius-sm: 4px`, `--radius-md: 8px`, `--radius-lg: 12px`; legacy `--radius` maps to large radius.

## Motion and interaction

`--dur-fast` (120ms), `--dur-short` (180ms), `--ease-out`, and `--ease-balanced` are shared motion primitives. Prefer short, explicit transitions on opacity and transform; preserve distinct status signaling and avoid broad `transition: all`. Keyboard focus must be immediately visible and not animated. Provide reduced-motion behavior that removes spatial motion and minimizes transitions. Pointer-only hover effects belong in `(hover: hover) and (pointer: fine)`. Static data changes should not require motion to communicate state.

Interactive controls should account for default, hover, focus-visible, active, disabled, loading, error, and success states where applicable. Preserve constant borders between states to avoid layout shift. Numeric surfaces should use `font-variant-numeric: tabular-nums` where values update live.

## Responsive contract

This is a narrow split-window workbench. Preserve existing DOM hooks, keyboard behavior, and game layouts; prioritize controls and core live state in compact view. `node test/browser.test.js --ui` checks the page, advice, statistics, Recorder, and Options for Sic Bo, Teen Patti, and Kickoff at 600×800, 522×828, 390×900, 650×900, 760×900, and 960×900. `node test/browser.test.js --sicbo-ui` also checks Sic Bo layout, keyboard entry, and controls at these sizes. Both use isolated temporary data and an existing Playwright installation.

## CSS usage

Load `tokens.css` before consumers. Existing server routing must serve `/tokens.css` with `text/css; charset=utf-8`; stylesheet entry markup should load tokens before `styles.css`. Declare new colors and fonts in the token file, then reference them by name. Legacy aliases are retained for a clean in-place migration; remove only after every consumer has been migrated.

## Exports

`tokens.css` is canonical CSS custom-property source. This project is vanilla CSS/HTML; no Tailwind, DTCG token pipeline, or shadcn/ui dependency was found in the inspected package manifest. No secondary export is checked in. To port the system:

- **Tailwind v4:** copy the used `--color-*`, `--font-*`, and `--radius-*` properties into `@theme`; map `--space-*` to Tailwind's `--spacing-*` names when spacing utilities are desired.
- **DTCG:** convert CSS custom properties to token objects with `$type` and `$value`; keep OKLCH as a CSS color string if target tooling supports it.
- **shadcn/ui:** map paper/ink, surfaces, accent, warning/destructive, borders, and focus to the package's semantic variables. Convert each `oklch(L C H)` to space-separated `L C H` only when the consumer expects that representation; keep alpha values separate where the target composes alpha.

Exports above are mapping guidance, not generated or validated files. Color serialization into consumers without modern CSS Color 4 support requires explicit conversion and measurement.

## Provenance and verification

The underlying palette was read from current `styles.css` legacy variables and literal status colors. Core literal hex values were numerically converted to OKLCH; fractional conversion is not a claim that prior approximations match exactly. Tokens for tinted roles preserve their role/hue and opacity intent; translucent legacy RGB colors do not necessarily share identical rendered composites on every background. No browser, contrast scanner, build, lint, or tests were run for these artifacts. See `.hallmark/preflight.json` and `.hallmark/log.json` for scan scope and verification status.
