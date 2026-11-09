# Style lock — Bet-R Play-R

Established: 2026-11-08. Status: pending review. Source: existing `styles.css` and `index.html`, plus the approved UI cleanup plan; no external reference was viewed.

## Direction

- App-shell workbench for operating alongside a live casino stream; mode: Operate. Visual lane: compact, dark, technical. Dials: variance 3/10, motion 2/10, density 9/10, art direction 4/10.
- Thesis: keep game information and controls legible without competing with the stream. First viewport: compact top bar, next-bet advice, history, manual entry and strategy details. System: existing app stack, dark surfaces, restrained borders, orange/blue side distinction, task-oriented motion. Risk: excess ornament or spacing can obscure controls or cause split-window overflow.
- Preserve IDs, keyboard shortcuts and existing game behavior. Target the narrow split tile and retain accessible recorder and options controls without page overflow; browser verification is pending.
- Foundation: existing HTML, CSS and JavaScript; `package.json` lists no UI component framework. No new design-system dependency is selected.

## Palette and provenance

The following **existing hex colors** were read from `styles.css`; the matrix below measures only these hex values, not the planned OKLCH values.

| Role | Hex | Existing use |
|---|---|---|
| bg | `#0e1116` | page background |
| surface | `#161b22` | panels |
| secondary surface | `#1d232c` | inputs and buttons; not included in matrix |
| text | `#e6edf3` | primary text |
| muted | `#8b949e` | secondary text; not included in matrix |
| border | `#2a313c` | dividers and panel borders |
| primary | `#f0883e` | side A / Big accent |
| accent | `#3fb8ff` | side B / Small accent |
| on-primary | `#0e1116` | dark label on strong colored fill; same input as bg |
| win / loss / warning | `#3fb950` / `#f85149` / `#d29922` | semantic states; not included in matrix |

Dark is the existing single mode; no companion palette or runtime mode switch is specified. The plan proposes OKLCH semantic tokens for these roles. Their rendered values and contrast have not been measured here; **do not assume they equal these hex values or inherit this matrix**. Measure the actual rendered OKLCH colors and every additional pair before relying on their contrast.

## Color contract — measured original hex palette

Measured with `python3 /home/ox/.agents/skills/tastemaker/scripts/check_contrast.py --matrix 'text=#e6edf3' 'bg=#0e1116' 'surface=#161b22' 'primary=#f0883e' 'accent=#3fb8ff' 'border=#2a313c' 'on-primary=#0e1116'`. Ratios are rounded as reported by the tool. Foreground/background order does not change contrast.

| Pair | Ratio | Classification |
|---|---:|---|
| text / bg | 16.00 | text-safe |
| text / on-primary | 16.00 | text-safe |
| text / surface | 14.64 | text-safe |
| text / border | 11.09 | text-safe |
| bg / accent | 8.57 | text-safe |
| accent / on-primary | 8.57 | text-safe |
| surface / accent | 7.83 | text-safe |
| bg / primary | 7.47 | text-safe |
| primary / on-primary | 7.47 | text-safe |
| surface / primary | 6.83 | text-safe |
| accent / border | 5.93 | text-safe |
| primary / border | 5.18 | text-safe |
| text / primary | 2.14 | decorative |
| text / accent | 1.87 | decorative |
| bg / border | 1.44 | decorative |
| border / on-primary | 1.44 | decorative |
| surface / border | 1.32 | decorative |
| primary / accent | 1.15 | decorative |
| bg / surface | 1.09 | decorative |
| surface / on-primary | 1.09 | decorative |
| bg / on-primary | 1.00 | decorative |

Text-safe means at least 4.5:1; UI-safe means at least 3:1 and below 4.5:1; decorative means below 3:1. No pair in this matrix falls in the UI-safe-only band. Use a text-safe pair for ordinary text and labels. Decorative pairs cannot be the sole visual indicator for essential boundaries or states. This matrix does not establish compliance for muted text, state colors, transparency, gradients, or rendered OKLCH values.

## Typography, shape and density

- Existing font stack: `system-ui, -apple-system, 'Segoe UI', Roboto, sans-serif`; existing split-game body text is 11px, with smaller labels and larger advice figures. Preserve hierarchy while improving legibility where space permits.
- Existing split-game panels use 8px corners and compact 5px 6px padding; controls and panels use borders for separation. Existing general cards use a 12px radius. Keep spatial changes subordinate to the zero-page-scroll requirement.
- Planned spacing foundation: 4px scale with a 2px micro-step; existing compact exceptions are not evidence that every spacing value already follows that scale.
- Numeric values should use tabular figures; keyboard focus should be visibly distinct. Check actual rendered contrast of focus and state indicators.

## Motion and interaction

- Target quick, restrained app-state feedback; plan specifies `cubic-bezier(0.16, 1, 0.3, 1)` and 120ms/180ms durations. Reduce movement for reduced-motion preferences and gate hover effects to capable pointers.
- Design default, hover, focus-visible, active, disabled, loading, error and success states without changing control geometry. Existing motion and accessibility audits are pending; no pass is claimed.

## Reference intelligence and taste memory

- `.tastemaker/reference-board.md`: existing source files observed; all external reference categories inferred, not viewed.
- No personal profile was found or used. Project decisions: `.tastemaker/decisions.log`; current choices are `pending-review`, not user acceptance. Profile promotion: none.
- Avoid decorative emoji, gratuitous motion, marketing-page chrome, invented reference provenance, and treating low-contrast hairlines as the only state signal.
