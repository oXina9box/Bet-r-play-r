# Sic Bo Top 20 Original Simulation Results (Canonical 3,840 Tests)

## Overview & Methodology
* **Game**: Sic Bo (Big / Small: 11–17 vs 4–10, triples lose)
* **Dataset**: 184 historical rolls (consolidated Giant Session)
* **Replay Horizons**: Starts 1–5 replay 184, 183, 182, 181, and 180 rolls respectively
* **Unit & Payout**: Unit = 1, Payout = 1 (1:1 even-money payout)
* **Progression**: **All top 20 use `plusone`** (`1x, 3x, 7x, 15x, 31x, 63x...`), factor delay 0
* **Reliability Metrics**: Every result below has zero recovery busts, zero back-to-back bust pairs, maximum bust streak 1

---

## Top 20 Leaderboard

| Rank | Group | Recovery | Win Wait | Bust Wait | Avg Net Units | Largest Stake | Max Drawdown | Starts 1–5 Net Units | Total Wins / Busts (R1) | Wagered (R1) |
| :---: | :---: | :---: | :---: | :---: | :---: | :---: | :---: | :---: | :---: | :---: |
| **1** | **Group 7** | **1 set** | **0** | **1** | **+464.8** | 847 | 604 | `[+466, +465, +465, +464, +464]` | 54W / 2B | 2,542 |
| **2** | **Group 7** | **1 set** | **3** | **1** | **+410.8** | 847 | 604 | `[+412, +411, +410, +409, +412]` | 27W / 2B | 2,218 |
| **3** | **Group 7** | **2 sets** | **0** | **1** | **+336.8** | 420 | 360 | `[+338, +337, +337, +336, +336]` | 54W / 2B | 1,922 |
| **4** | **Group 7** | **1 set** | **2** | **1** | **+309.6** | 847 | 604 | `[+311, +310, +309, +308, +310]` | 33W / 1B | 1,811 |
| **5** | **Group 7** | **3 sets** | **2** | **1** | **+300.6** | 1,240 | 1,040 | `[+302, +301, +300, +299, +301]` | 33W / 1B | 3,182 |
| **6** | **Group 6** | **1 set** | **2** | **3** | **+295.8** | 1,798 | 1,565 | `[+296, +295, +297, +296, +295]` | 34W / 1B | 3,582 |
| **7** | **Group 5** | **1 set** | **0** | **2** | **+274.4** | 405 | 323 | `[+277, +276, +270, +275, +274]` | 49W / 5B | 1,629 |
| **8** | **Group 7** | **3 sets** | **2** | **2** | **+260.6** | 1,240 | 1,040 | `[+262, +261, +260, +259, +261]` | 33W / 1B | 2,902 |
| **9** | **Group 7** | **3 sets** | **0** | **1** | **+254.8** | 280 | 280 | `[+256, +255, +255, +254, +254]` | 54W / 2B | 1,600 |
| **10** | **Group 7** | **4 sets** | **3** | **1** | **+245.8** | 210 | 240 | `[+247, +246, +245, +244, +247]` | 27W / 2B | 1,607 |
| **11** | **Group 7** | **3 sets** | **3** | **1** | **+239.8** | 280 | 280 | `[+241, +240, +239, +238, +241]` | 27W / 2B | 1,549 |
| **12** | **Group 7** | **4 sets** | **2** | **1** | **+239.6** | 930 | 780 | `[+241, +240, +239, +238, +240]` | 33W / 1B | 2,521 |
| **13** | **Group 6** | **2 sets** | **2** | **3** | **+234.8** | 899 | 811 | `[+235, +234, +236, +235, +234]` | 34W / 1B | 2,237 |
| **14** | **Group 6** | **3 sets** | **2** | **3** | **+226.8** | 589 | 551 | `[+227, +226, +228, +227, +226]` | 34W / 1B | 2,025 |
| **15** | **Group 7** | **2 sets** | **3** | **1** | **+223.8** | 420 | 360 | `[+225, +224, +223, +222, +225]` | 27W / 2B | 1,421 |
| **16** | **Group 7** | **1 set** | **0** | **2** | **+222.8** | 363 | 241 | `[+224, +223, +223, +222, +222]` | 54W / 2B | 1,332 |
| **17** | **Group 7** | **3 sets** | **2** | **3** | **+220.6** | 1,240 | 1,080 | `[+222, +221, +220, +219, +221]` | 33W / 1B | 2,782 |
| **18** | **Group 7** | **2 sets** | **0** | **2** | **+216.8** | 180 | 180 | `[+218, +217, +217, +216, +216]` | 54W / 2B | 1,322 |
| **19** | **Group 7** | **4 sets** | **0** | **1** | **+212.8** | 210 | 240 | `[+214, +213, +213, +212, +212]` | 54W / 2B | 1,438 |
| **20** | **Group 7** | **4 sets** | **2** | **2** | **+209.6** | 930 | 780 | `[+210, +210, +209, +208, +210]` | 33W / 1B | 2,296 |

---

## Structural Insights

1. **Progression Dominance**:
   * All Top 20 setups use **`plusone`** progression (`1x, 3x, 7x, 15x, 31x, 63x...`).
   * Group 7 Base Risk with `plusone` is $1 + 3 + 7 + 15 + 31 + 63 = 120$ units.

2. **Group Hierarchy**:
   * **Group 7 (6 bets)** accounts for **16 out of the top 20** spots.
   * **Group 6 (5 bets)** accounts for 3 spots (Rank 6, 13, 14).
   * **Group 5 (4 bets)** holds 1 spot (Rank 7: `G5 · Rec 1 · WW 0 · WB 2` at `+274.4` units).

3. **Drawdown vs Net Profit Archetypes**:
   * **Maximum Profit Profile**: `G7 · Rec 1 · WW 0 · WB 1` delivers **+464.8 units** (Largest stake 847, Max DD 604).
   * **Balanced Risk Profile**: `G7 · Rec 2 · WW 0 · WB 1` delivers **+336.8 units** with significantly reduced exposure (Largest stake 420, Max DD 360).
   * **Conservative Exposure Profile**: `G7 · Rec 4 · WW 3 · WB 1` delivers **+245.8 units** with a very mild ceiling (Largest stake 210, Max DD 240).
