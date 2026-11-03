/* Display the actual replayed sets, retaining the pattern size recorded at each factor. */
(function (root) {
  const sameSession = (a, b) => a.s === b.s && a.sessionNo === b.sessionNo;
  const effective = row => row.side === 'A' || row.side === 'B' || row.effSide === 'A' || row.effSide === 'B';

  function setGroup(rows, index) {
    const factor = rows[index];
    const size = Array.isArray(factor.plan) ? factor.plan.length + 1 : factor.cfg?.n || 4;
    const patternIndices = [];
    for (let i = index - 1; i >= 0 && sameSession(rows[i], factor) && patternIndices.length < size; i--) {
      if (effective(rows[i])) patternIndices.push(i);
    }
    const sourceIndices = patternIndices.slice().reverse();
    const waitIndices = [];
    const betIndices = [];
    for (let i = index + 1; i < rows.length; i++) {
      const row = rows[i];
      if (!sameSession(row, factor) || row.setNo !== factor.setNo) break;
      if (row.role === 'factor-wait' || row.role === 'factor-break') waitIndices.push(i);
      else if (row.role === 'bet') betIndices.push(i);
      else break;
      if (row.setEnd && !(row.setEnd === 'bust' && rows[i + 1]?.bet?.continuation && rows[i + 1].setNo === factor.setNo)) break;
    }
    const indices = [...sourceIndices, index, ...waitIndices, ...betIndices].sort((a, b) => a - b);
    const lastIndex = indices.at(-1) ?? index;
    return {
      indices, index,
      group: {
        kind: 'set', size, setNo: factor.setNo, s: factor.s, sessionNo: factor.sessionNo,
        pattern: sourceIndices.map(i => rows[i]), factor, waits: waitIndices.map(i => rows[i]), bets: betIndices.map(i => rows[i]),
        rows: indices.map(i => rows[i]), cfg: { ...factor.cfg, n: size },
        status: rows[lastIndex].setEnd || (lastIndex === rows.length - 1 ? 'active' : 'interrupted'),
      },
    };
  }

  /**
   * Input: chronological Engine.run(...).rows, optionally spanning sessions.
   * Output: chronological set/collect/cooldown blocks. A set's pattern may reuse rows
   * from an earlier set, exactly as the engine's rolling window does. Original rows
   * are referenced, never modified; output arrays and configuration copies are new.
   */
  function groupRows(rows) {
    const sets = rows.flatMap((row, index) => row.role === 'factor' ? [setGroup(rows, index)] : []);
    const covered = new Set(sets.flatMap(set => set.indices));
    const blocks = sets.map(set => ({ index: set.index, group: set.group }));
    for (let i = 0; i < rows.length;) {
      if (covered.has(i)) { i++; continue; }
      const start = i;
      const kind = rows[i].role === 'cooldown' ? 'cooldown' : 'collect';
      while (i < rows.length && !covered.has(i) && sameSession(rows[start], rows[i]) &&
        (rows[i].role === 'cooldown' ? 'cooldown' : 'collect') === kind) i++;
      const original = rows.slice(start, i);
      const cfg = { ...original[0].cfg };
      blocks.push({ index: start, group: {
        kind, size: cfg.n || null, setNo: null, s: original[0].s, sessionNo: original[0].sessionNo,
        pattern: original.slice(), factor: null, bets: [], rows: original, cfg,
        status: kind === 'cooldown' ? 'cooldown' : 'collecting',
      } });
    }
    return blocks.slice().sort((a, b) => a.index - b.index).map(block => block.group);
  }

  const api = { groupRows };
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  else root.History = api;
})(this);
