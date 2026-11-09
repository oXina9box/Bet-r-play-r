# Reference board

Created: 2026-11-08
Mode: Operate
Design read: Compact dark app-shell workbench for a player operating beside a live casino stream; technical and restrained, with density 9/10, variance 3/10, motion 2/10, art direction 4/10.

**Source status:** Existing repository UI was inspected. External sources listed below are inferred, not viewed; no URLs or pixel references were supplied or collected. These are quality-bar hypotheses, not claims of source review or direct influence.

## Quality bar

- Existing Bet-R Play-R `styles.css` and `index.html` (viewed): preserve dark surfaces, orange/blue side distinction, compact operation-first layout, and split-window constraints.
- Direct competitors (inferred, not viewed): live-game companion and score-tracking interfaces should prioritize glanceable state and never imply unavailable wager certainty.
- Adjacent products (inferred, not viewed): monitoring consoles should keep dense numeric status stable and group controls by task.
- Cultural source (inferred, not viewed): casino table scoreboards suggest clear side labels and immediate state distinction; avoid imitating casino ornament.
- Interface system (inferred, not viewed): native HTML controls and system font stack suit this small dependency-free app better than importing an unrelated component system.

## Borrow

- Palette/material: existing app only, observed hex palette; matte near-black page and panels with restrained orange/blue signals. Planned OKLCH values remain unverified against this palette.
- Type/hierarchy: existing app only, observed system sans stack and compact labels with large next-bet figure; favor stable numeric alignment.
- Layout/composition: existing app only, observed narrow workbench with top bar, advice and history above entry controls; protect zero-scroll geometry.
- Motion/interaction: inferred operational convention, not sourced from a viewed reference; use quick feedback, clear focus and reduced motion.
- Asset language: existing app markup contains functional text and native controls; favor purposeful accessible labels and crisp inline icons over decorative emoji.

## Avoid

- Inferred anti-references, not viewed: generic gradient dashboard styling, oversized marketing hero sections, decoration competing with live game content, controls that require page scrolling, and state indicated by color alone.

## Direction contract

- Thesis: keep current game state and entry controls glanceable while stream remains primary.
- First viewport: tight top bar; compact advice/history region; immediately available manual-entry surface.
- System: existing HTML/CSS/JS stack, dark palette, semantic color roles, stable numeric typography, accessible focus, restrained motion, compact spacing.
- Risk: density can reduce readability; preserve semantic grouping and verify actual contrast and split-window fit before treating this direction as accepted.
