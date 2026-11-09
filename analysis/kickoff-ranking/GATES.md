# Gates: Kickoff historical ranking

OWNS: analysis/kickoff-ranking/**

Scope: Reproduce five highest-net affordable patterns in each player mode from a declared finite search of chat-derived rules, with full ledgers.

- [x] G1: Settlement, prospective triggers, caps, player restrictions and cash limits pass tests.
  CHECK: python3 analysis/kickoff-ranking/test_rank.py
  EXPECT: RULE_CHECKS_PASSED
  EVIDENCE: verification.json; exit 0; match true; SHA256 c533ee51e74b741ac6f45715ee488c6938e8912538e4d622ac0ef07629144342

- [x] G2: Snapshot reproduces ranked results and all ten ledgers independently reconcile.
  CHECK: python3 analysis/kickoff-ranking/rank.py --verify
  EXPECT: VERIFIED
  EVIDENCE: verification.json; exit 0; match true; SHA256 67f80de325e714ca31fbf6ff8643f04e83be7ec40a37e901b261eb7c08bd3f8b

- [x] G3: Independent review resolves material accounting and gameplay issues.
  EVIDENCE: /root/audit independently replayed all ten patterns against original JSON without importing rank.py; all 1,280 bets, payouts, cash limits, balances and drawdowns matched; no remaining material issues.
