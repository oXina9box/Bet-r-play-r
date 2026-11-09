# Kickoff: corrected historical ranking

128 source rolls, chronological order. Decimal payouts: colors 2.3×, draw 5.8×, including returned stake. Single player starts $100; two players start $100 each, P1 Red and P2 Blue. $1 units. One player may bet one color plus draw, never both colors. Two-player search includes both alternating seats and simultaneous cross-bets. No transfers, loans, top-ups, or stake clipping. A strategy stops before its first unaffordable scheduled bet; only full-history survivors rank.

State and balances carry across the four recorded sessions. A draw loses both colors. Draws keep the existing color leader. Press ladders reset on a draw; Fibonacci loss ladders advance because it is a loss. All decisions use completed prior rolls only. “After 2 losses” means bet on the prospective third round; “after 3 losses” means bet on the following fourth round. Cold triggers count the leader’s losing color wagers, even if a cross-cover wins; a color win resets that counter. For independent dual ladders, the draw trigger reference color starts Red and follows the latest non-draw outcome. While a triggered draw ladder is active, it continues through color wins until a draw win. The draw win clears the cold counter and pauses the draw ladder. Capped draw ladders stop advancing their index at the first capped step; a win steps back from that index.

**These are hindsight winners within the declared search, not a proven profitable system or an exhaustive optimum.** Selection uses all 128 rolls; the later-session results below are descriptive, not an untouched validation set. No per-roll tuning, stop-profit optimization, or future-result access was used. Under independent fair dice, each dollar on either color has expected net −1/24 dollar; draw −1/30 dollar. Changing stakes or player count does not change those per-dollar expectations.

## Search scope

One-player engines: fixed Red, fixed Blue, swap after any opposite-color loss, swap only after a $2+ loss, wait for two same-color outcomes. Two-player engines: $1 cover from $2, $1 cover from $4, quarter-size cover, independent dual ladders, asymmetric momentum (Red base cover while Blue leads). Color ladders: flat, win doubling, loss doubling, Fibonacci loss-up/win-down-1 or down-2 at $2/$4/$8/$16/uncapped, gentle 1,2,3,6,12 on win or loss, partial press 1,2,3,5,8 on wins. Draw: none, flat $1–$4, $1 at color $4+, streak ladder, leader-loss or non-draw-gap trigger after 2/3 completed outcomes; linear/doubling/Fibonacci; caps $4/$8/$16/$21/uncapped; drop 1/2 on wins. Two-player draw ownership P1/P2/split. Parameter combinations that produce identical aggregate Red/Blue/Draw ledgers are counted once for ranking; alternative draw funding is not a different pattern. Rank by net dollars, then lower drawdown, lower total stake, higher minimum individual cash, then stable parameter order.

## 1 player(s)

Tested 16,920 parameter combinations; 5,704 finished affordably; 11,216 stopped for insufficient cash.

| Rank | Net | Ending cash | Bankroll ROI | Lowest cash | Max drawdown | Total wagered | Cross-bets? |
|---|---:|---|---:|---:|---:|---:|---|
| 1 | $469.80 | $569.80 | 469.80% | $87.50 | $269.50 | $1,063.00 | No |
| 2 | $448.00 | $548.00 | 448.00% | $74.30 | $271.70 | $1,025.00 | No |
| 3 | $433.20 | $533.20 | 433.20% | $62.00 | $272.00 | $1,003.00 | No |
| 4 | $423.60 | $523.60 | 423.60% | $51.30 | $269.50 | $1,008.00 | No |
| 5 | $405.70 | $505.70 | 405.70% | $44.20 | $271.60 | $973.00 | No |

### Rank 1

Start Red; switch leader after any opposite-color loss. double on win, reset on loss; cap $16; completed cap bet resets ladder. Draw after 3 completed consecutive leader color losses; linear ladder; up one on draw loss, down 1 on draw win; pause after win until fresh trigger; uncapped; paid by P1.

Lowest individual cash: $87.50. Largest combined round stake: $42.00. Full history: [1p-rank1.csv](1p-rank1.csv), [1p-rank1.md](1p-rank1.md).

Session net, in chronological order: $78.20, $19.10, $76.40, $296.10.

### Rank 2

Start Red; switch leader after any opposite-color loss. 1,2,3,6,12 on wins, reset on loss; cap $12; completed cap bet resets ladder. Draw after 3 completed consecutive leader color losses; linear ladder; up one on draw loss, down 1 on draw win; pause after win until fresh trigger; uncapped; paid by P1.

Lowest individual cash: $74.30. Largest combined round stake: $38.00. Full history: [1p-rank2.csv](1p-rank2.csv), [1p-rank2.md](1p-rank2.md).

Session net, in chronological order: $67.80, $13.00, $79.20, $288.00.

### Rank 3

Start Red; switch leader after any opposite-color loss. 1,2,3,5,8 on wins, reset on loss; cap $8; completed cap bet resets ladder. Draw after 3 completed consecutive leader color losses; linear ladder; up one on draw loss, down 1 on draw win; pause after win until fresh trigger; uncapped; paid by P1.

Lowest individual cash: $62.00. Largest combined round stake: $34.00. Full history: [1p-rank3.csv](1p-rank3.csv), [1p-rank3.md](1p-rank3.md).

Session net, in chronological order: $61.30, $7.50, $82.90, $281.50.

### Rank 4

Start Red; switch leader after any opposite-color loss. double on win, reset on loss; cap $8; completed cap bet resets ladder. Draw after 3 completed consecutive leader color losses; linear ladder; up one on draw loss, down 1 on draw win; pause after win until fresh trigger; uncapped; paid by P1.

Lowest individual cash: $51.30. Largest combined round stake: $34.00. Full history: [1p-rank4.csv](1p-rank4.csv), [1p-rank4.md](1p-rank4.md).

Session net, in chronological order: $58.00, $-1.40, $91.40, $275.60.

### Rank 5

Start Red; switch leader after any opposite-color loss. double on win, reset on loss; cap $4; completed cap bet resets ladder. Draw after 3 completed consecutive leader color losses; linear ladder; up one on draw loss, down 1 on draw win; pause after win until fresh trigger; uncapped; paid by P1.

Lowest individual cash: $44.20. Largest combined round stake: $34.00. Full history: [1p-rank5.csv](1p-rank5.csv), [1p-rank5.md](1p-rank5.md).

Session net, in chronological order: $55.80, $-4.20, $88.30, $265.80.

## 2 player(s)

Tested 101,040 parameter combinations; 44,956 finished affordably; 56,084 stopped for insufficient cash.

| Rank | Net | Ending cash | Bankroll ROI | Lowest cash | Max drawdown | Total wagered | Cross-bets? |
|---|---:|---|---:|---:|---:|---:|---|
| 1 | $469.80 | $320.30 / $349.50 | 234.90% | $187.50 | $269.50 | $1,063.00 | No |
| 2 | $465.50 | $525.60 / $139.90 | 232.75% | $186.40 | $268.00 | $1,111.00 | Yes |
| 3 | $461.30 | $519.90 / $141.40 | 230.65% | $184.50 | $269.90 | $1,083.00 | Yes |
| 4 | $459.60 | $310.10 / $349.50 | 229.80% | $187.40 | $265.10 | $1,133.00 | Yes |
| 5 | $457.00 | $531.30 / $125.70 | 228.50% | $178.20 | $257.30 | $1,315.00 | Yes |

### Rank 1

Start Red; switch leader after any opposite-color loss. double on win, reset on loss; cap $16; completed cap bet resets ladder. Draw after 3 completed consecutive leader color losses; linear ladder; up one on draw loss, down 1 on draw win; pause after win until fresh trigger; uncapped; paid by split (odd extra dollar to P1).

Lowest individual cash: $100.00 / $76.60. Largest combined round stake: $42.00. Full history: [2p-rank1.csv](2p-rank1.csv), [2p-rank1.md](2p-rank1.md).

Session net, in chronological order: $78.20, $19.10, $76.40, $296.10.

### Rank 2

Start Red; other player covers $1 whenever leader stake is at least $2; switch after opposite-color win. double on win, reset on loss; cap $16; completed cap bet resets ladder. Draw after 3 completed consecutive leader color losses; linear ladder; up one on draw loss, down 1 on draw win; pause after win until fresh trigger; uncapped; paid by P1.

Lowest individual cash: $78.00 / $89.90. Largest combined round stake: $43.00. Full history: [2p-rank2.csv](2p-rank2.csv), [2p-rank2.md](2p-rank2.md).

Session net, in chronological order: $73.10, $19.30, $79.10, $294.00.

### Rank 3

Start Red; other player covers $1 whenever leader stake is at least $4; switch after opposite-color win. double on win, reset on loss; cap $16; completed cap bet resets ladder. Draw after 3 completed consecutive leader color losses; linear ladder; up one on draw loss, down 1 on draw win; pause after win until fresh trigger; uncapped; paid by P1.

Lowest individual cash: $74.20 / $92.60. Largest combined round stake: $43.00. Full history: [2p-rank3.csv](2p-rank3.csv), [2p-rank3.md](2p-rank3.md).

Session net, in chronological order: $74.20, $18.70, $76.30, $292.10.

### Rank 4

Start Red alone; switch after opposite-color win; Red additionally bets $1 while Blue leads. double on win, reset on loss; cap $16; completed cap bet resets ladder. Draw after 3 completed consecutive leader color losses; linear ladder; up one on draw loss, down 1 on draw win; pause after win until fresh trigger; uncapped; paid by split (odd extra dollar to P1).

Lowest individual cash: $100.00 / $76.60. Largest combined round stake: $42.00. Full history: [2p-rank4.csv](2p-rank4.csv), [2p-rank4.md](2p-rank4.md).

Session net, in chronological order: $79.70, $14.60, $76.40, $288.90.

### Rank 5

Both colors independently start $1 and follow their own ladders every roll. double on win, reset on loss; cap $16; completed cap bet resets ladder. Draw after 3 completed consecutive leader color losses; linear ladder; up one on draw loss, down 1 on draw win; pause after win until fresh trigger; uncapped; paid by P1.

Lowest individual cash: $78.90 / $84.70. Largest combined round stake: $42.00. Full history: [2p-rank5.csv](2p-rank5.csv), [2p-rank5.md](2p-rank5.md).

Session net, in chronological order: $74.80, $3.60, $95.00, $283.60.

## Transcript corrections

Use rolls.json, extracted from data/betrplayr.json, not the transcript’s later roll tables. Those tables change winners and credit a draw payout on a Red win. Verified no-draw benchmark: Red start, double wins through $16 then reset, switch on opposite-color loss at $2+, ties retain leader and reset stake: $326 wagered, $402.50 returned, $76.50 net. At $8 cap: $251 wagered, $43.40 net. These benchmark results alone do not establish future profitability.

Reproduce: `python3 analysis/kickoff-ranking/rank.py`; verify ledgers: `python3 analysis/kickoff-ranking/rank.py --verify`; tests: `python3 -m unittest discover -s analysis/kickoff-ranking -p "test_*.py" -v`.
