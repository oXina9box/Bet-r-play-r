import unittest
from dataclasses import replace
import json
import tempfile
from pathlib import Path
from unittest.mock import patch

import rank
from rank import Pattern, State, decide, advance, simulate, settle, load_rolls


class RulesTest(unittest.TestCase):
    def test_decimal_settlement(self):
        self.assertEqual(settle((3, 3, 1), 'R'), -10)
        self.assertEqual(settle((3, 3, 1), 'D'), -120)
        self.assertEqual(settle((0, 0, 1), 'D'), 480)

    def test_uncapped_ladders_have_no_hidden_ceiling(self):
        self.assertEqual(rank.amount('linear', 30, 0), 31)
        self.assertEqual(rank.amount('double', 30, 0), 2**30)
        self.assertEqual(rank.amount('fib', 30, 0), 1346269)

    def test_draw_loses_colors(self):
        self.assertEqual(settle((4, 8, 0), 'D'), -1200)

    def test_first_bets_and_single_player_restriction(self):
        self.assertEqual(decide(Pattern(), State()), (1, 0, 0))
        for engine in ('swap2', 'swap1', 'red', 'blue', 'trend2'):
            p = Pattern(engine=engine)
            result = simulate(p, ['R', 'B', 'D'] * 10, 1, trace=True)
            self.assertTrue(all(not (r['red'] and r['blue']) for r in result['rows']))

    def test_win_press_and_cap(self):
        p = Pattern(cap=4)
        s = State()
        for expected in (1, 2, 4, 1):
            self.assertEqual(decide(p, s)[0], expected)
            s = advance(p, s, 'R', decide(p, s))

    def test_swap_at_two_not_one(self):
        p = Pattern()
        s = advance(p, State(), 'B', (1, 0, 0))
        self.assertEqual(s.leader, 'R')
        s = advance(p, s, 'R', (1, 0, 0))
        self.assertEqual(decide(p, s), (2, 0, 0))
        s = advance(p, s, 'B', (2, 0, 0))
        self.assertEqual(decide(p, s), (0, 1, 0))

    def test_draw_does_not_switch_leader(self):
        s = advance(Pattern(), replace(State(), leader='B', index=2), 'D', (0, 4, 0))
        self.assertEqual(decide(Pattern(), s), (0, 1, 0))

    def test_cover_only_after_press(self):
        p = Pattern(engine='cover2')
        self.assertEqual(decide(p, State()), (1, 0, 0))
        self.assertEqual(decide(p, replace(State(), index=1)), (2, 1, 0))

    def test_draw_trigger_uses_only_prior_losses(self):
        p = Pattern(draw='cold', trigger=3, draw_ladder='linear', draw_cap=16)
        s = State()
        for _ in range(3):
            self.assertEqual(decide(p, s)[2], 0)
            s = advance(p, s, 'B', decide(p, s))
        self.assertEqual(decide(p, s)[2], 1)

    def test_draw_win_pauses_then_resumes_at_saved_step(self):
        p = Pattern(draw='cold', trigger=3, draw_ladder='linear', draw_cap=16)
        s = replace(State(), draw_active=True, draw_index=5, losses=4)
        s = advance(p, s, 'D', decide(p, s))
        self.assertFalse(s.draw_active)
        self.assertEqual(s.draw_index, 3)
        self.assertEqual(decide(p, s)[2], 0)

    def test_bankroll_stops_before_unaffordable_bet(self):
        p = Pattern(engine='red', ladder='double_loss', cap=0)
        r = simulate(p, ['B'] * 20, 1, trace=True)
        self.assertFalse(r['complete'])
        self.assertEqual(r['end'], [3700])
        self.assertEqual(len(r['rows']), 6)
        self.assertEqual(r['stop_round'], 7)

    def test_two_player_cash_is_separate(self):
        p = Pattern(engine='dual', ladder='double_loss', cap=0)
        r = simulate(p, ['B'] * 20, 2, trace=True)
        self.assertFalse(r['complete'])
        self.assertGreater(sum(r['end']), 10000)
        self.assertEqual(r['stop_round'], 7)

    def test_no_lookahead_prefix(self):
        p = Pattern(engine='cover2', draw='cold', trigger=2, draw_ladder='fib')
        a = simulate(p, ['R', 'B', 'B', 'D', 'R'], 2, trace=True)['rows']
        b = simulate(p, ['R', 'B', 'B', 'R', 'B'], 2, trace=True)['rows']
        self.assertEqual(a[:3], b[:3])
        self.assertEqual(tuple(a[3][k] for k in ('red','blue','draw')),
                         tuple(b[3][k] for k in ('red','blue','draw')))

    def test_waiting_does_not_count_as_color_loss(self):
        p = Pattern(engine='trend2', draw='cold', trigger=2)
        s = State()
        for outcome in ['B', 'R', 'B', 'R']:
            s = advance(p, s, outcome, decide(p, s))
        self.assertEqual(s.losses, 0)
        self.assertEqual(decide(p, s), (0, 0, 0))

    def test_independent_dual_ladders(self):
        p = Pattern(engine='dual')
        s = advance(p, State(), 'R', (1, 1, 0))
        self.assertEqual(decide(p, s), (2, 1, 0))
        s = advance(p, s, 'B', decide(p, s))
        self.assertEqual(decide(p, s), (1, 2, 0))

    def test_draw_cap_has_no_hidden_steps(self):
        p = Pattern(draw='cold', draw_ladder='fib', draw_cap=4)
        s = replace(State(), draw_active=True, draw_index=4)
        for _ in range(10):
            self.assertEqual(decide(p, s)[2], 4)
            s = advance(p, s, 'B', decide(p, s))
        s = advance(p, s, 'D', decide(p, s))
        self.assertEqual(s.draw_index, 2)

    def test_fibonacci_and_loss_ladders(self):
        for ladder, expected in [('fib_loss1', 2), ('fib_loss2', 1), ('double_loss', 0)]:
            p = Pattern(engine='red', ladder=ladder)
            s = replace(State(), index=3)
            self.assertEqual(advance(p, s, 'R', decide(p,s)).index, expected)
        p = Pattern(engine='red', ladder='double_loss', cap=4)
        s = replace(State(), index=2)
        self.assertEqual(advance(p,s,'B',decide(p,s)).index,0)

    def test_all_draw_funding_options(self):
        self.assertEqual(rank.allocate((2,1,3),2,'P1'), ((2,0,3),(0,1,0)))
        self.assertEqual(rank.allocate((2,1,3),2,'P2'), ((2,0,0),(0,1,3)))
        self.assertEqual(rank.allocate((2,1,3),2,'split'), ((2,0,2),(0,1,1)))
        with self.assertRaises(ValueError):
            rank.allocate((1,1,0),1,'P1')

    def test_report_and_csv_reconcile_end_to_end(self):
        rolls = load_rolls()
        def small_grid(players):
            engine = 'swap2' if players == 1 else 'cover2'
            return iter([Pattern(engine=engine, cap=n) for n in (2,4,8,16)] + [
                Pattern(engine=engine, draw='high'),
                Pattern(engine='red', ladder='double_loss', cap=0)])
        with tempfile.TemporaryDirectory() as directory:
            target = Path(directory)
            (target/'rolls.json').write_text(json.dumps(rolls))
            with patch.object(rank,'HERE',target), patch.object(rank,'candidates',small_grid):
                results = rank.search(rolls)
                self.assertTrue(all(len(s['top']) == 5 for s in results.values()))
                (target/'results.json').write_text(json.dumps(results))
                rank.write_outputs(rolls,results)
                rank.verify()
                self.assertEqual(len(list(target.glob('*p-rank*.csv'))),10)


if __name__ == '__main__':
    result = unittest.main(exit=False)
    if not result.result.wasSuccessful():
        raise SystemExit(1)
    print('RULE_CHECKS_PASSED')
