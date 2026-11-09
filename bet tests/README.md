# Betting test workbooks

Each game has **three sheets**:

1. **Results** — the imported game history.
2. **Configurations** — edit the blue cells in a configuration column. Basics, stakes, progression, payouts and draw protection are together. Expand the advanced groups for pauses, pushes, conditional rules, custom ladders and manual overrides.
3. **Config Results** — compare configurations at the top. Choose a configuration from the blue dropdown to see its round-by-round bets, profit and remaining cash below.

Open the `.xlsx` file in Excel or LibreOffice Calc. If you generate an `.ods` copy, use that in Calc. Changes to the blue controls recalculate the results automatically; no macros are needed. Dollar amounts and stake units are labelled separately. Hidden calculation columns keep the result page clean.

Initial scenarios: Flat, Martingale, Fibonacci, Win Press, Draw Protection. These are editable examples, not recommendations or historical winners.

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
- **Color selection:** `fixed` keeps the selected side for one player, enables both sides for two; `dual` requires two; `swap1` switches after a placed opposite-color loss; `swap2` switches after a loss of at least two units.
- **Ladder:** `double` plus after-loss `up 1` / after-win `reset` is Martingale. `double` plus after-win `up 1` / after-loss `reset` presses wins.
- **Fibonacci:** `1,1,2,3,5,8…`; after-loss `up 1`, after-win `down 2` is configurable. Custom values belong in **Configurations → Advanced: Ladders**, contiguous and positive; the final listed value repeats.
- **Pause:** preserves ladder position. `winPause`/`lossPause`/`pushPause` pauses after applying that progression action. `enter` resumes; `reset` resumes at the starting stake.
- **Caps:** before a scheduled bet exceeds the cap, repeat clamps, reset restarts, or pause sits out. Uncapped ladders have no hidden ceiling, but unsafe arithmetic stops the test.
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
