# Betting test workbooks

Kickoff uses **Results**, **Test Options**, and **Test Results**. Other games use:

1. **Results** — the imported game history.
2. **Configurations** — edit blue cells. Basics, stakes, progression, pauses, payouts and Draw triggers are visible. Live metrics update for each slot. Expand advanced groups for pushes, rules, custom ladders and overrides.
3. **Config Results** — compare all slots, inspect the active strategy's settings and round-by-round ledger, and expand saved reviews.

Open the `.xlsx` file in Excel or LibreOffice Calc. If you generate an `.ods` copy, use that in Calc. Changes to the blue controls recalculate the results automatically; no macros are needed. Dollar amounts and stake units are labelled separately. Hidden calculation columns keep the result page clean.

## Kickoff numeric test

Enter four core values in blue **Test Options** cells to start: `B5` Players (`1` or `2`), `B6` Color net payout multiplier (`>0`), `B16` P1 starting bankroll, and `B17` P1 Bet 1. Payout is net profit per stake; returned stake is additional. Amounts use dollars and whole cents.

For two players, enter P2 bankroll in `C16`. Draw payout `B7` is required only if any Draw line is positive. All other controls are optional and blank defaults apply: starting side `B8` Red, color mode `B9` 0, Draw loss trigger `B10` 0, Draw owner `B11` P1, profit target `B12` and loss limit `B13` off, and after-Bet-10 action hold. Setup status stays incomplete until required core cells (and conditional cells) are supplied.

Rows 16–27 hold separate P1, P2, and Draw schedules: bankroll, Bet 1–10, then after-Bet-10 action. Bet lines 2–10 blank inherit previous line; explicit `0` stops that wager. Wins advance one line, losses reset to Bet 1; losses never raise color stake. After Bet 10, blank/`0` holds Bet 10; `1` resets to Bet 1.

Color mode choices: `0` fixed P1 Red / P2 Blue in dual play (or P1 follows starting side with one player); `1` switch leader after any non-Draw leader loss; `2` switch after a non-Draw leader loss only when that stake is at least 2× Bet 1; `3` cover opposite side with its Bet 1 when leader stake reaches 2× Bet 1; `4` cover at 4×. Modes 3–4 require two players and switch leader after a non-Draw leader loss. Two-player P1 always owns Red, P2 Blue. Switching resets both color steps.

Draw rows use same blank-inherit and explicit-zero rules; Draw Bet 1 must be positive to activate Draw. Trigger `0` makes Draw eligible every round; positive trigger latches Draw on after that many consecutive leader losses, until a Draw win. Triggered Draw losses advance its line; Draw win resets line and clears latch. Untriggered Draw wins advance line; losses reset. Draw owner `1` funds all from P1, `2` all from P2, `3` splits cents with odd cent assigned to P1; profit rounds separately for each funder's share. P1 funds all Draw in one-player mode. Bankroll sufficiency includes color and allocated Draw stake. Profit target and loss limit stop after settled round.

Test Results recalculates historical outcomes continuously and shows leader, active side/step, bets, settlements, bankrolls and stop status. Refreshing older Kickoff versions (including V1) starts fresh V2 inputs and saves incompatible settings in timestamped backup. `.ods` takes precedence; `--no-convert` refuses refresh while `.ods` exists. Archive single test and clear inputs with `npm run store:tests -- --game kickoff --slot S1`; close workbook first.

Historical replay describes supplied outcomes only. It is not forecast, recommendation, or evidence of future profitability.

## Other games

Slots S1–S5 start as one-player Flat, Martingale, Fibonacci, Win Press and Draw Protection examples. Slots S6–S10 start as two-player Split Draw, Cover 2u+, Cover 4u+, Momentum Flip and Dual Ladders. These are editable historical examples, not recommendations or forecasts.

Set **Active strategy** to TRUE on one slot. If several are TRUE, the leftmost wins; if none are TRUE, S1 is shown. The selector can also be edited manually.

## Store a review

Set **Lock & store result** to TRUE on each desired slot and run `npm run sync:tests`. Alternatively run `npm run store:tests -- --game sicbo --slot S6`; without `--slot`, the active slot is stored when no slots are flagged. An explicit slot is stored alongside any flagged slots. Close the workbook before running either command.

Each stored strategy receives a protected snapshot in `bet tests/saved/` and a frozen review on **Config Results**. Its slot resets to a flat ready template; its active rules and overrides are removed. Other slots remain unchanged. Sheet protection prevents accidental edits, not deliberate changes by someone who unprotects the workbook.

## Create and refresh

Close the workbook before refreshing:

```sh
npm run generate:tests -- --source-dir "live results"
npm run sync:tests
```

Refresh remembers the existing workbook's source file. An explicit source directory overrides that setting. Saved `.ods` inputs take precedence over `.xlsx`. Refresh upgrades older layouts, keeps a timestamped backup, and refuses open-file locks. For other games, it preserves scenarios, custom ladders, rules and overrides. A disappearing or empty source cannot erase populated history.

Source filenames: `Sic_Bo_Results.xlsx`, `The_Kickoff_Results.xlsx`, `Teen_Patti_Results.xlsx`, `Baccarat_Results.xlsx`. Master files are read-only. Missing masters create an empty workbook marked **Awaiting history**. Baccarat waits for the master producer to supply its history.

Explicit CSV or application backup import:

```sh
npm run generate:tests -- --game kickoff --source "/absolute/path/to/master.csv"
npm run generate:tests -- --game kickoff --source "/absolute/path/to/betrplayr.json"
```

Other games support `--capacity 1000` for additional prepared formula rows and `--rule-slots 24` for more rule rows per scenario. Kickoff prepares one result row per imported round. Refresh automatically makes room for additional historical rounds. Close and refresh after adding history. Limits are checked, never silently truncated.

`--no-convert` generates `.xlsx` without invoking LibreOffice. Other games also write CSV snapshots under `csv/<game>_Tests/`, one file per scenario plus a comparison. They do not recalculate by themselves.

## Other games: common settings

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

For example, gross Draw odds 5.8 require Draw stakes $1/$2/$4 to fully protect color stakes $4/$8/$16 before commission. Protection is calculated fresh each round. It has no saved growing Draw ladder. Opposite-color wins still lose both bets.

## Manual bets and new scenarios

Expand the history detail columns on **Results** to copy the original round key. Add it to a prepared row in **Configurations → Advanced: Overrides**. Supply scenario ID. Blank amount is automatic; zero sits out. A positive outside-ladder bet requires that lane's explicit next step. Invalid amounts, duplicate overrides, prohibited cross-bets, or insufficient cash do not bypass simulation controls.

Duplicate a configuration column on **Configurations**, assign a unique Excel-safe scenario ID, and add matching custom ladder/rule/override rows. Close and refresh to build that scenario's ledger. Rename related IDs consistently; orphaned inputs are rejected rather than discarded. Insert/copy prepared input rows as needed and refresh to rebuild expanded rule ranges. Keep the advanced section headings intact when inserting rows.

## Payouts and verification

Other games require you to enter and confirm enabled-market payouts before financial tests run. Their gross decimal payouts include returned stake; commission is a percentage of winnings excluding returned stake.

Kickoff ties lose colors. Sic Bo triples lose Big/Small and win the optional Any Triple market. Teen Patti/Baccarat ties push side bets. Their displayed labels use actual market names.

```sh
npm run test:betting
npm run verify:tests
npm test
```

`verify:tests` opens isolated headless Calc instances and compares actual recalculated wagers, payouts and bankrolls with the independent JavaScript simulator, including rule/override cases, four-game settlement and edits made inside Calc. Verification requires LibreOffice and its Python UNO module.

Historical results describe the selected history only. They do not establish future profitability.
