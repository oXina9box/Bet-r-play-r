# Betting test workbooks

Each game has **three sheets**:

1. **Results** — the imported game history.
2. **Configurations** — edit blue cells. Basics, stakes, progression, pauses, payouts and Draw triggers are visible. Live metrics update for each slot. Expand advanced groups for pushes, rules, custom ladders and overrides.
3. **Config Results** — compare all slots, inspect the active strategy's settings and round-by-round ledger, and expand saved reviews.

Open the `.xlsx` file in Excel or LibreOffice Calc. If you generate an `.ods` copy, use that in Calc. Changes to the blue controls recalculate the results automatically; no macros are needed. Dollar amounts and stake units are labelled separately. Hidden calculation columns keep the result page clean.

Slots S1–S5 start as one-player Flat, Martingale, Fibonacci, Win Press and Draw Protection examples. Slots S6–S10 start as two-player Split Draw, Cover 2u+, Cover 4u+, Momentum Flip and Dual Ladders. These are editable historical examples, not recommendations or forecasts.

Set **Active strategy** to TRUE on one slot. If several are TRUE, the leftmost wins; if none are TRUE, S1 is shown. The selector can also be edited manually.

## Store a review

Set **Lock & store result** to TRUE on each desired slot and run `npm run sync:tests`. Alternatively run `npm run store:tests -- --game kickoff --slot S6`; without `--slot`, the active slot is stored when no slots are flagged. An explicit slot is stored alongside any flagged slots. Close the workbook before running either command.

Each stored strategy receives a protected snapshot in `bet tests/saved/` and a frozen review on **Config Results**. Its slot resets to a flat ready template; its active rules and overrides are removed. Other slots remain unchanged. Sheet protection prevents accidental edits, not deliberate changes by someone who unprotects the workbook.

## Create and refresh

Close the workbook before refreshing:

```sh
npm run generate:tests -- --source-dir "live results"
npm run sync:tests
```

Refresh remembers the existing workbook's source file. An explicit source directory overrides that setting. Saved `.ods` inputs take precedence over `.xlsx`. Refresh also upgrades the previous multi-sheet layout. It preserves scenarios, custom ladders, rules, and overrides, keeps a timestamped backup, and refuses open-file locks. A disappearing or empty source cannot erase populated history.

Source filenames: `Sic_Bo_Results.xlsx`, `The_Kickoff_Results.xlsx`, `Teen_Patti_Results.xlsx`, `Baccarat_Results.xlsx`. Master files are read-only. Missing masters create an empty workbook marked **Awaiting history**. Baccarat waits for the master producer to supply its history.

Explicit CSV or application backup import:

```sh
npm run generate:tests -- --game kickoff --source "/absolute/path/to/master.csv"
npm run generate:tests -- --game kickoff --source "/absolute/path/to/betrplayr.json"
```

Use `--capacity 1000` for additional prepared formula rows, or `--rule-slots 24` for more rule rows per scenario. Refresh automatically makes room for additional historical rounds. Close and refresh after adding history beyond the prepared detail rows. Limits are checked, never silently truncated.

`--no-convert` generates `.xlsx` plus CSV snapshots without invoking LibreOffice. CSV snapshots are written under `csv/<game>_Tests/`, one file per scenario plus a comparison. They do not recalculate by themselves.

## Common settings

- **Unit:** dollar value of one unit. **Increment:** minimum stake increment in units. Starting bankrolls are dollars.
- **Players:** one player may bet only one color plus Draw. Two players: P1 owns A, P2 owns B, either or both can fund Draw. No transfers or borrowing.
- **Color selection:** `fixed`, `swap1`, `swap2`, `dual`, `trend2`, `cover2`, `cover4`, `cover_quarter` and `momentum`. Cover, momentum and dual require two players; cover places an opposite-side wager when the leader reaches its threshold.
- **Ladder:** `double`, `linear`, `fib`, `gentle` (1,2,3,6,12), `partial` (1,2,3,5,8), flat or custom. After-win/loss controls determine movement.
- **Fibonacci:** `1,1,2,3,5,8…`; after-loss `up 1`, after-win `down 2` is configurable. Custom values belong in **Configurations → Advanced: Ladders**, contiguous and positive; the final listed value repeats.
- **Pause:** preserves ladder position. `winPause`/`lossPause`/`pushPause` pauses after applying that progression action. `enter` resumes; `reset` resumes at the starting stake.
- **Caps:** before a scheduled bet exceeds the cap, repeat clamps, reset restarts, or pause sits out. Uncapped ladders have no hidden ceiling, but unsafe arithmetic stops the test.
- **Draw modes:** `high` uses the color stake threshold; `streak` uses the preceding same-color run; `cold` uses consecutive leader losses; `gap` uses consecutive non-Draw outcomes. Trigger count and Draw win-pause control cycle entry.
- **Targets:** profit/loss targets stop future wagering after a settled round; they may overshoot. Insufficient cash stops the entire scenario before that round is wagered.

## Rules and timing

Lower numeric priority wins within each lane/phase. Two conditions in one row mean AND; separate rows provide alternatives. Entry and stake phases inspect completed previous rounds. After rules inspect the just-settled round and control the next bet. An after rule replaces the normal after-win/loss/push action.

`observedA`, `observedB`, `observedD` count actual game outcomes. `betA`, `betB`, `betD` count only placed bets. Skipped bets never become losses. Pushes return stake and break consecutive win/loss counters.

**Third possible win:** threshold 3 with timing `entering` requires two completed wins. **After third win:** threshold 3 with timing `after` requires three completed wins. Neither predicts the next result.

**Delayed Blue entry:** choose two players/fixed mode; B enabled/start paused. Add an entry rule targeting B, action `enter`, conditions `betA losses >= 1` AND `betA stake >= 2`, timing `after`. Blue remains active after entering unless another rule pauses it.

**Independent Draw ladder:** enable D, mode `progression`, select ladder, configure win/loss changes. For down-two then pause, choose win action `down`, value `2`, and Pause after win TRUE. Add an entry/enter rule to resume saved position. For example, `observedD losses >= 3` waits for three completed non-draw outcomes; this is different from three losing color wagers.

## Draw protection

Choose D enabled / mode `protection`. Activation is the largest current color stake; protected exposure is the combined current color stake multiplied by the selected percentage. Sizing includes Draw commission and rounds upward to the configured stake increment. Manual color overrides update the protection amount; a manual Draw override replaces protection.

At Kickoff odds 5.8, full protection of color stakes $4/$8/$16 needs Draw stakes $1/$2/$4. Protection is calculated fresh each round. It has no saved growing Draw ladder. Opposite-color wins still lose both bets.

## Manual bets and new scenarios

Expand the history detail columns on **Results** to copy the original round key. Add it to a prepared row in **Configurations → Advanced: Overrides**. Supply scenario ID. Blank amount is automatic; zero sits out. A positive outside-ladder bet requires that lane's explicit next step. Invalid amounts, duplicate overrides, prohibited cross-bets, or insufficient cash do not bypass simulation controls.

Duplicate a configuration column on **Configurations**, assign a unique Excel-safe scenario ID, and add matching custom ladder/rule/override rows. Close and refresh to build that scenario's ledger. Rename related IDs consistently; orphaned inputs are rejected rather than discarded. Insert/copy prepared input rows as needed and refresh to rebuild expanded rule ranges. Keep the advanced section headings intact when inserting rows.

## Payouts and verification

Kickoff defaults to gross decimal payouts 2.3 / 2.3 / 5.8. Other games require you to enter and confirm enabled-market payouts before financial tests run. Commission is a percentage of winnings excluding returned stake.

Kickoff ties lose colors. Sic Bo triples lose Big/Small and win the optional Any Triple market. Teen Patti/Baccarat ties push side bets. Their displayed labels use actual market names.

```sh
npm run test:betting
npm run verify:tests
npm test
```

`verify:tests` opens isolated headless Calc instances and compares actual recalculated wagers, payouts and bankrolls with the independent JavaScript simulator, including rule/override cases, four-game settlement and edits made inside Calc. Verification requires LibreOffice and its Python UNO module.

Historical results describe the selected history only. They do not establish future profitability.
