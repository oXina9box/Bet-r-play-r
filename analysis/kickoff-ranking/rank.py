"""Finite historical search; dollars are integer units, balances integer cents."""
import argparse
import csv
import hashlib
import itertools
import json
from dataclasses import asdict, dataclass, replace
from functools import cache
from pathlib import Path

HERE = Path(__file__).resolve().parent
@cache
def fibonacci(index):
    return 1 if index < 2 else fibonacci(index-1) + fibonacci(index-2)


@dataclass(frozen=True)
class Pattern:
    engine: str = 'swap2'
    ladder: str = 'double_win'
    cap: int = 16
    draw: str = 'none'
    trigger: int = 3
    draw_ladder: str = 'linear'
    draw_cap: int = 4
    drop: int = 2
    owner: str = 'P1'


@dataclass(frozen=True)
class State:
    leader: str = 'R'
    index: int = 0
    blue_index: int = 0
    draw_index: int = 0
    draw_active: bool = False
    losses: int = 0
    gap: int = 0
    last: str = ''
    run: int = 0


def amount(ladder, index, cap):
    index = max(0, index)
    if ladder == 'flat':
        value = 1
    elif ladder.startswith('double'):
        value = 2 ** index
    elif ladder.startswith('fib'):
        value = fibonacci(index)
    elif ladder == 'gentle_win' or ladder == 'gentle_loss':
        value = (1, 2, 3, 6, 12)[min(index, 4)]
    elif ladder == 'partial_win':
        value = (1, 2, 3, 5, 8)[min(index, 4)]
    else:
        value = index + 1
    return min(value, cap) if cap else value


def next_index(p, index, win):
    stake = amount(p.ladder, index, p.cap)
    if p.ladder.endswith('_win'):
        return (0 if p.cap and stake >= p.cap else index + 1) if win else 0
    if p.ladder.startswith('fib_loss'):
        drop = 1 if p.ladder.endswith('1') else 2
        return max(0, index - drop) if win else index + 1
    if p.ladder.endswith('_loss'):
        return 0 if win or (p.cap and stake >= p.cap) else index + 1
    return 0


def decide(p, s):
    stake = amount(p.ladder, s.index, p.cap)
    leader = s.leader
    if p.engine == 'dual':
        red, blue = stake, amount(p.ladder, s.blue_index, p.cap)
    elif p.engine == 'trend2' and s.run < 2:
        red = blue = 0
    else:
        if p.engine == 'trend2':
            leader = s.last
        red, blue = (stake, 0) if leader == 'R' else (0, stake)
        if p.engine.startswith('cover'):
            threshold = 4 if p.engine == 'cover4' else 2
            cover = (max(1, (stake + 3) // 4) if p.engine == 'cover_quarter' else 1) if stake >= threshold else 0
            red, blue = (stake, cover) if leader == 'R' else (cover, stake)
        elif p.engine == 'momentum':
            red, blue = (stake, 0) if leader == 'R' else (1, stake)
    draw = 0
    if p.draw == 'always':
        draw = p.draw_cap
    elif p.draw == 'high' and max(red, blue) >= 4:
        draw = 1
    elif p.draw == 'streak' and s.run >= 2:
        draw = amount(p.draw_ladder, s.run - 2, p.draw_cap)
    elif p.draw in ('cold', 'gap'):
        count = s.losses if p.draw == 'cold' else s.gap
        if s.draw_active or count >= p.trigger:
            draw = amount(p.draw_ladder, s.draw_index, p.draw_cap)
    return red, blue, draw


def advance(p, s, outcome, bets):
    red, blue, draw = bets
    leader = s.last if p.engine == 'trend2' and s.run >= 2 else s.leader
    win = outcome == leader
    main = red if leader == 'R' else blue
    index = next_index(p, s.index, win) if main else 0
    blue_index = s.blue_index
    if p.engine == 'dual':
        index = next_index(p, s.index, outcome == 'R')
        blue_index = next_index(p, s.blue_index, outcome == 'B')
        leader = outcome if outcome != 'D' else s.leader
    elif p.engine not in ('red', 'blue', 'trend2') and outcome != 'D' and not win:
        threshold = 1 if p.engine in ('swap1', 'momentum') or p.engine.startswith('cover') else 2
        if main >= threshold:
            leader, index = outcome, 0
    draw_index, active = s.draw_index, s.draw_active
    losses = (0 if win else s.losses + 1) if main else s.losses
    gap = 0 if outcome == 'D' else s.gap + 1
    if p.draw in ('cold', 'gap') and draw:
        if outcome == 'D':
            draw_index, active, losses = max(0, draw_index - p.drop), False, 0
        else:
            # ponytail: clamp at first capped step, avoiding hidden escalation beyond cap.
            draw_index = draw_index + 1 if not p.draw_cap or amount(p.draw_ladder, draw_index, 0) < p.draw_cap else draw_index
            active = True
    last = '' if outcome == 'D' else outcome
    run = 0 if outcome == 'D' else (s.run + 1 if outcome == s.last else 1)
    return State(leader, index, blue_index, draw_index, active, losses, gap, last, run)


def settle(bets, outcome):
    red, blue, draw = bets
    return (230 * (red if outcome == 'R' else blue if outcome == 'B' else 0)
            + 580 * draw * (outcome == 'D') - 100 * sum(bets))


def allocate(bets, players, owner):
    red, blue, draw = bets
    if players == 1:
        if red and blue:
            raise ValueError('Single player cannot cross-bet colors')
        return ((red, blue, draw),)
    d1 = draw if owner == 'P1' else 0 if owner == 'P2' else (draw + 1) // 2
    return ((red, 0, d1), (0, blue, draw - d1))


def simulate(p, outcomes, players, trace=False, reset_at=()):
    cash = (10000,) * players
    state = State(leader='B' if p.engine == 'blue' else 'R')
    peak, low, max_drawdown, staked, max_bet = sum(cash), sum(cash), 0, 0, 0
    cross = False
    player_low = cash
    rows = []
    stop = None
    for i, outcome in enumerate(outcomes, 1):
        if i in reset_at:
            state = State(leader='B' if p.engine == 'blue' else 'R')
        bets = decide(p, state)
        allocations = allocate(bets, players, p.owner)
        if any(100 * sum(a) > c for a, c in zip(allocations, cash)):
            stop = i
            break
        cross = cross or bool(bets[0] and bets[1])
        before = cash
        cash = tuple(c + settle(a, outcome) for c, a in zip(cash, allocations))
        total = sum(cash)
        peak = max(peak, total)
        low = min(low, total)
        player_low = tuple(min(a, b) for a, b in zip(player_low, cash))
        max_drawdown = max(max_drawdown, peak - total)
        staked += sum(bets)
        max_bet = max(max_bet, sum(bets))
        if trace:
            rows.append(dict(round=i, outcome=outcome, red=bets[0], blue=bets[1], draw=bets[2],
                             allocations=allocations, before=before, after=cash,
                             net=total-sum(before), running=total-10000*players))
        state = advance(p, state, outcome, bets)
    return dict(pattern=asdict(p), net=sum(cash)-10000*players, end=list(cash),
                complete=stop is None, stop_round=stop, staked=staked,
                low=low, player_low=list(player_low), drawdown=max_drawdown,
                max_bet=max_bet, cross=cross, rows=rows)


def load_rolls(path=HERE / 'rolls.json'):
    rolls = json.loads(Path(path).read_text())
    assert len(rolls) == 128
    assert all(a['t'] <= b['t'] for a, b in zip(rolls, rolls[1:]))
    for row in rolls:
        raw = row['raw']
        if isinstance(raw, list):
            assert len(raw) == 2 and all(type(n) is int and 1 <= n <= 6 for n in raw)
            expected = 'R' if raw[0] > raw[1] else 'B' if raw[1] > raw[0] else 'D'
        else:
            expected = {'A': 'R', 'B': 'B', 'T': 'D'}[raw['w']]
        assert row['outcome'] == expected
    assert {o: sum(r['outcome'] == o for r in rolls) for o in 'RBD'} == {'R': 50, 'B': 53, 'D': 25}
    return rolls


def candidates(players):
    engines = ('swap2', 'swap1', 'red', 'blue', 'trend2')
    if players == 2:
        engines += ('cover2', 'cover4', 'cover_quarter', 'dual', 'momentum')
    colors = [('flat', 1)] + [(ladder, cap) for ladder in
        ('double_win', 'double_loss', 'fib_loss1', 'fib_loss2') for cap in (2, 4, 8, 16, 0)] + [
        ('gentle_win', 12), ('gentle_loss', 12), ('partial_win', 8)]
    draws = [dict(draw='none'), dict(draw='high')]
    draws += [dict(draw='always', draw_cap=n) for n in (1, 2, 3, 4)]
    draws += [dict(draw='streak', draw_ladder=ladder, draw_cap=cap)
              for ladder, cap in itertools.product(('linear', 'double', 'fib'), (4, 8, 16, 21, 0))]
    draws += [dict(draw=mode, trigger=n, draw_ladder=ladder, draw_cap=cap, drop=drop)
              for mode, n, ladder, cap, drop in itertools.product(
                  ('cold', 'gap'), (2, 3), ('linear', 'double', 'fib'), (4, 8, 16, 21, 0), (1, 2))]
    owners = ('P1',) if players == 1 else ('P1', 'P2', 'split')
    for engine, (ladder, cap), draw in itertools.product(engines, colors, draws):
        for owner in (owners if draw['draw'] != 'none' else ('P1',)):
            yield Pattern(engine=engine, ladder=ladder, cap=cap, owner=owner, **draw)


def rank_key(r):
    return (-r['net'], r['drawdown'], r['staked'], -min(r['player_low']), json.dumps(r['pattern'], sort_keys=True))


def money(cents):
    return f'${cents / 100:,.2f}'


def describe(p):
    engines = {
        'swap2': 'Start Red; switch leader after opposite-color loss at $2 or higher; stay after $1 loss',
        'swap1': 'Start Red; switch leader after any opposite-color loss',
        'red': 'Red only', 'blue': 'Blue only',
        'trend2': 'Wait for two consecutive same-color outcomes; bet that color',
        'cover2': 'Start Red; other player covers $1 whenever leader stake is at least $2; switch after opposite-color win',
        'cover4': 'Start Red; other player covers $1 whenever leader stake is at least $4; switch after opposite-color win',
        'cover_quarter': 'Start Red; cover opposite color with ceil(leader stake/4) when leader is at least $2; switch after opposite-color win',
        'dual': 'Both colors independently start $1 and follow their own ladders every roll',
        'momentum': 'Start Red alone; switch after opposite-color win; Red additionally bets $1 while Blue leads',
    }
    ladders = {'flat': 'flat $1', 'double_win': 'double on win, reset on loss',
               'double_loss': 'double on loss, reset on win',
               'gentle_win': '1,2,3,6,12 on wins, reset on loss',
               'gentle_loss': '1,2,3,6,12 on losses, reset on win',
               'partial_win': '1,2,3,5,8 on wins, reset on loss',
               'fib_loss1': 'Fibonacci 1,1,2,3,5,8…; up one step on loss, down one on win',
               'fib_loss2': 'Fibonacci 1,1,2,3,5,8…; up one step on loss, down two on win'}
    color = ladders[p.ladder] + (f'; cap ${p.cap}' if p.cap else '; uncapped')
    if p.ladder.endswith('_win') or p.ladder in ('double_loss','gentle_loss'):
        color += '; completed cap bet resets ladder'
    elif p.ladder.startswith('fib_loss'):
        color += '; capped stake repeats until step falls'
    if p.draw == 'none':
        draw = 'No draw bets'
    elif p.draw == 'always':
        draw = f'Draw ${p.draw_cap} every round'
    elif p.draw == 'high':
        draw = 'Draw $1 whenever largest color bet is at least $4'
    elif p.draw == 'streak':
        draw = f'Draw after two prior consecutive same-color outcomes; {p.draw_ladder} ladder, reset on streak break'
    else:
        trigger = 'leader color losses' if p.draw == 'cold' else 'non-draw outcomes'
        draw = (f'Draw after {p.trigger} completed consecutive {trigger}; {p.draw_ladder} ladder; '
                f'up one on draw loss, down {p.drop} on draw win; pause after win until fresh trigger')
    if p.draw not in ('none', 'always', 'high'):
        draw += f'; cap ${p.draw_cap}' if p.draw_cap else '; uncapped'
    if p.draw != 'none':
        draw += f'; paid by {p.owner}' + (' (odd extra dollar to P1)' if p.owner == 'split' else '')
    return engines[p.engine] + '. ' + color + '. ' + draw + '.'


def write_outputs(rolls, summaries):
    report = ['# Kickoff: corrected historical ranking', '',
              '128 source rolls, chronological order. Decimal payouts: colors 2.3×, draw 5.8×, including returned stake. '
              'Single player starts $100; two players start $100 each, P1 Red and P2 Blue. $1 units. '
              'One player may bet one color plus draw, never both colors. Two-player search includes both alternating seats and simultaneous cross-bets. '
              'No transfers, loans, top-ups, or stake clipping. A strategy stops before its first unaffordable scheduled bet; only full-history survivors rank.', '',
              'State and balances carry across the four recorded sessions. A draw loses both colors. '
              'Draws keep the existing color leader. Press ladders reset on a draw; Fibonacci loss ladders advance because it is a loss. '
              'All decisions use completed prior rolls only. “After 2 losses” means bet on the prospective third round; '
              '“after 3 losses” means bet on the following fourth round. Cold triggers count the leader’s losing color wagers, '
              'even if a cross-cover wins; a color win resets that counter. '
              'For independent dual ladders, the draw trigger reference color starts Red and follows the latest non-draw outcome. '
              'While a triggered draw ladder is active, '
              'it continues through color wins until a draw win. The draw win clears the cold counter and pauses the draw ladder. '
              'Capped draw ladders stop advancing their index at the first capped step; a win steps back from that index.', '',
              '**These are hindsight winners within the declared search, not a proven profitable system or an exhaustive optimum.** '
              'Selection uses all 128 rolls; the later-session results below are descriptive, not an untouched validation set. '
              'No per-roll tuning, stop-profit optimization, or future-result access was used. '
              'Under independent fair dice, each dollar on either color has expected net −1/24 dollar; draw −1/30 dollar. '
              'Changing stakes or player count does not change those per-dollar expectations.', '',
              '## Search scope', '',
              'One-player engines: fixed Red, fixed Blue, swap after any opposite-color loss, swap only after a $2+ loss, '
              'wait for two same-color outcomes. Two-player engines: $1 cover from $2, $1 cover from $4, quarter-size cover, '
              'independent dual ladders, asymmetric momentum (Red base cover while Blue leads). '
              'Color ladders: flat, win doubling, loss doubling, Fibonacci loss-up/win-down-1 or down-2 at $2/$4/$8/$16/uncapped, '
              'gentle 1,2,3,6,12 on win or loss, partial press 1,2,3,5,8 on wins. Draw: none, flat $1–$4, $1 at color $4+, streak ladder, '
              'leader-loss or non-draw-gap trigger after 2/3 completed outcomes; linear/doubling/Fibonacci; '
              'caps $4/$8/$16/$21/uncapped; drop 1/2 on wins. Two-player draw ownership P1/P2/split. '
              'Parameter combinations that produce identical aggregate Red/Blue/Draw ledgers are counted once for ranking; '
              'alternative draw funding is not a different pattern. '
              'Rank by net dollars, then lower drawdown, lower total stake, higher minimum individual cash, then stable parameter order.', '']
    for players, summary in summaries.items():
        report += [f'## {players} player(s)', '',
                   f"Tested {summary['tested']:,} parameter combinations; {summary['affordable']:,} finished affordably; "
                   f"{summary['unaffordable']:,} stopped for insufficient cash.", '',
                   '| Rank | Net | Ending cash | Bankroll ROI | Lowest cash | Max drawdown | Total wagered | Cross-bets? |',
                   '|---|---:|---|---:|---:|---:|---:|---|']
        for rank, r in enumerate(summary['top'], 1):
            report.append(f"| {rank} | {money(r['net'])} | {' / '.join(money(c) for c in r['end'])} | "
                          f"{r['net'] / (10000 * players):.2%} | {money(r['low'])} | {money(r['drawdown'])} | {money(100*r['staked'])} | {'Yes' if r['cross'] else 'No'} |")
        report.append('')
        for rank, r in enumerate(summary['top'], 1):
            p = Pattern(**r['pattern'])
            detail = simulate(p, [row['outcome'] for row in rolls], players, trace=True)
            stem = f'{players}p-rank{rank}'
            report += [f'### Rank {rank}', '', describe(p), '',
                       f"Lowest individual cash: {' / '.join(money(c) for c in r['player_low'])}. "
                       f"Largest combined round stake: {money(r['max_bet']*100)}. "
                       f"Full history: [{stem}.csv]({stem}.csv), [{stem}.md]({stem}.md).", '']
            sessions = []
            for session in dict.fromkeys(row['s'] for row in rolls):
                selected = [x for x, source in zip(detail['rows'], rolls) if source['s'] == session]
                sessions.append(money(sum(x['net'] for x in selected)))
            report += ['Session net, in chronological order: ' + ', '.join(sessions) + '.', '']
            fields = ['round','session','red_die','blue_die','outcome','red','blue','draw',
                      'P1_draw','P2_draw','staked','returned','round_net','running_net','P1_cash','P2_cash']
            ledger = []
            for x, source in zip(detail['rows'], rolls):
                raw = source['raw']
                stake = sum(sum(a) for a in x['allocations']) * 100
                ledger.append(dict(round=x['round'], session=source['s'],
                    red_die=raw[0] if isinstance(raw,list) else 'quick',
                    blue_die=raw[1] if isinstance(raw,list) else 'quick', outcome=x['outcome'],
                    red=x['red'], blue=x['blue'], draw=x['draw'],
                    P1_draw=x['allocations'][0][2], P2_draw=x['allocations'][1][2] if players==2 else 0,
                    staked=f'{stake/100:.2f}', returned=f"{(stake+x['net'])/100:.2f}",
                    round_net=f"{x['net']/100:.2f}", running_net=f"{x['running']/100:.2f}",
                    P1_cash=f"{x['after'][0]/100:.2f}", P2_cash=f"{x['after'][1]/100:.2f}" if players==2 else ''))
            with (HERE / f'{stem}.csv').open('w') as f:
                writer = csv.DictWriter(f, fieldnames=fields)
                writer.writeheader()
                writer.writerows(ledger)
            md = [f'# {players} player(s), rank {rank}', '', describe(p), '',
                  'All currency columns in dollars; bets in $1 units. R/B/D = Red/Blue/Draw.', '',
                  '| # | Dice R/B | Winner | Red | Blue | Draw | P1/P2 draw | Staked | Returned | Net | Running | P1 cash | P2 cash |',
                  '|---|---|---|---:|---:|---:|---|---:|---:|---:|---:|---:|---:|']
            for x in ledger:
                md.append(f"| {x['round']} | {x['red_die']}/{x['blue_die']} | {x['outcome']} | {x['red']} | {x['blue']} | {x['draw']} | "
                          f"{x['P1_draw']}/{x['P2_draw']} | {x['staked']} | {x['returned']} | {x['round_net']} | "
                          f"{x['running_net']} | {x['P1_cash']} | {x['P2_cash']} |")
            (HERE / f'{stem}.md').write_text('\n'.join(md) + '\n')
    report += ['## Transcript corrections', '',
               'Use rolls.json, extracted from data/betrplayr.json, not the transcript’s later roll tables. '
               'Those tables change winners and credit a draw payout on a Red win. '
               'Verified no-draw benchmark: Red start, double wins through $16 then reset, switch on opposite-color loss at $2+, '
               'ties retain leader and reset stake: $326 wagered, $402.50 returned, $76.50 net. '
               'At $8 cap: $251 wagered, $43.40 net. These benchmark results alone do not establish future profitability.', '',
               'Reproduce: `python3 analysis/kickoff-ranking/rank.py`; '
               'verify ledgers: `python3 analysis/kickoff-ranking/rank.py --verify`; '
               'tests: `python3 -m unittest discover -s analysis/kickoff-ranking -p "test_*.py" -v`.', '']
    (HERE / 'REPORT.md').write_text('\n'.join(report))


def search(rolls):
    summaries = {}
    outcomes = [row['outcome'] for row in rolls]
    for players in (1, 2):
        tested = affordable = unaffordable = 0
        survivors = []
        for p in candidates(players):
            tested += 1
            result = simulate(p, outcomes, players)
            if not result['complete']:
                unaffordable += 1
                continue
            affordable += 1
            survivors.append(result)
        survivors.sort(key=rank_key)
        top, seen = [], set()
        for result in survivors:
            detail = simulate(Pattern(**result['pattern']), outcomes, players, trace=True)
            signature = tuple((r['red'], r['blue'], r['draw']) for r in detail['rows'])
            if signature in seen:
                continue
            seen.add(signature)
            if len(top) < 5:
                top.append(result)
            if len(top) == 5:
                break
        summaries[players] = dict(tested=tested, affordable=affordable, unaffordable=unaffordable,
                                  top=top)
        print(f'{players}p: tested {tested}; top net cents {[r["net"] for r in top]}', flush=True)
    return summaries


def verify():
    from decimal import Decimal
    rolls = load_rolls()
    summaries = json.loads((HERE / 'results.json').read_text())
    outcomes = [r['outcome'] for r in rolls]
    for players in (1, 2):
        top = summaries[str(players)]['top']
        assert len(top) == 5 and top == sorted(top, key=rank_key)
        for rank, result in enumerate(top, 1):
            actual = simulate(Pattern(**result['pattern']), outcomes, players)
            assert actual == result
            cash = [Decimal(100)] * players
            peak = low = sum(cash)
            drawdown = total_stake = net = Decimal(0)
            with (HERE / f'{players}p-rank{rank}.csv').open() as f:
                rows = list(csv.DictReader(f))
            assert len(rows) == len(rolls)
            cross = False
            for row, source in zip(rows, rolls):
                assert row['outcome'] == source['outcome']
                red, blue, draw = (int(row[k]) for k in ('red','blue','draw'))
                d1, d2 = int(row['P1_draw']), int(row['P2_draw'])
                assert d1 + d2 == draw
                cross |= bool(red and blue)
                if players == 1:
                    assert not (red and blue) and d2 == 0
                    allocations = [(red, blue, draw)]
                else:
                    allocations = [(red, 0, d1), (0, blue, d2)]
                before = sum(cash)
                returned = Decimal(0)
                for i, (r, b, d) in enumerate(allocations):
                    stake = Decimal(r+b+d)
                    assert stake <= cash[i]
                    payout = Decimal('2.3') * (r if row['outcome']=='R' else b if row['outcome']=='B' else 0)
                    payout += Decimal('5.8') * d if row['outcome']=='D' else 0
                    cash[i] += payout - stake
                    returned += payout
                stake = Decimal(red+blue+draw)
                change = sum(cash)-before
                net += change
                total_stake += stake
                peak = max(peak, sum(cash)); low = min(low, sum(cash))
                drawdown = max(drawdown, peak-sum(cash))
                assert Decimal(row['staked']) == stake
                assert Decimal(row['returned']) == returned
                assert Decimal(row['round_net']) == change
                assert Decimal(row['running_net']) == net
                assert Decimal(row['P1_cash']) == cash[0]
                if players == 2:
                    assert Decimal(row['P2_cash']) == cash[1]
            assert result['cross'] == cross
            assert int(net*100) == result['net']
            assert int(total_stake) == result['staked']
            assert int(drawdown*100) == result['drawdown']
            assert int(low*100) == result['low']
            assert [int(c*100) for c in cash] == result['end']
    assert simulate(Pattern(), outcomes, 1)['net'] == 7650
    assert simulate(Pattern(cap=8), outcomes, 1)['net'] == 4340
    print('VERIFIED: ten ledgers, 1,280 rounds, independent decimal accounting, bankroll limits, benchmarks')


if __name__ == '__main__':
    parser = argparse.ArgumentParser()
    parser.add_argument('--verify', action='store_true')
    args = parser.parse_args()
    if args.verify:
        verify()
    else:
        rolls = load_rolls()
        results = search(rolls)
        (HERE / 'results.json').write_text(json.dumps(results, indent=2) + '\n')
        write_outputs(rolls, results)
