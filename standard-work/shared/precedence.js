// Critical-path / earliest-finish analysis over a SKU's step dependency graph.
// Shared by the server and the browser build. Pure functions — steps in,
// numbers out.
//
// Each step carries depends_on: [stepId, ...] — steps that must finish before
// it can start. The critical path is the longest chain of dependent step
// times: the fastest the SKU could be built with unlimited operators.

export function criticalPath(steps) {
  const byId = new Map(steps.map(s => [s.id, s]));
  const dur = s => s.effective_seconds || 0;
  // overlap(s, d): fraction of prerequisite d that must be done before s starts.
  // Default 1 (d must fully finish). < 1 lets s start partway through d.
  const ovOf = (s, d) => (s.dep_overlap && s.dep_overlap[d] != null) ? s.dep_overlap[d] : 1;
  // dep_need_at(s, d): fraction INTO s at which prerequisite d is actually
  // needed. 0 = needed at the start (classic). 0.9 = "only needed for the last
  // 10% of s" — so s can run almost to the end before d must be ready.
  const needAtOf = (s, d) => (s.dep_need_at && s.dep_need_at[d] != null) ? s.dep_need_at[d] : 0;
  const esMemo = new Map();
  const efMemo = new Map();
  const inStack = new Set();
  let hasCycle = false;

  // Earliest start = latest moment any prerequisite reaches its required
  // fraction: es(d) + overlap·dur(d).
  function es(id) {
    if (esMemo.has(id)) return esMemo.get(id);
    if (inStack.has(id)) { hasCycle = true; return 0; }
    inStack.add(id);
    const s = byId.get(id);
    let start = 0;
    for (const d of (s.depends_on || [])) {
      if (!byId.has(d)) continue;
      const ov = ovOf(s, d);
      // when d's output is available: partial overlap → when d reaches its
      // fraction; full dependency → d's true finish (ef).
      const ready = ov < 1 ? es(d) + ov * dur(byId.get(d)) : ef(d);
      // minus how late into s the prerequisite is actually needed
      start = Math.max(start, ready - needAtOf(s, d) * dur(s));
    }
    start = Math.max(0, start);
    inStack.delete(id);
    esMemo.set(id, start);
    return start;
  }
  // Earliest finish = start + duration, but never before a partially-overlapped
  // supplier finishes (can't deliver the last unit before it's made).
  function ef(id) {
    if (efMemo.has(id)) return efMemo.get(id);
    const s = byId.get(id);
    let finish = es(id) + dur(s);
    for (const d of (s.depends_on || [])) {
      if (byId.has(d) && ovOf(s, d) < 1) finish = Math.max(finish, ef(d));
    }
    efMemo.set(id, finish);
    return finish;
  }

  let criticalSeconds = 0;
  let endId = null;
  for (const s of steps) {
    const e = ef(s.id);
    if (e > criticalSeconds) { criticalSeconds = e; endId = s.id; }
  }

  // Walk back along the binding chain to mark the critical steps.
  const critical = new Set();
  function walk(id) {
    if (id == null || critical.has(id)) return;
    critical.add(id);
    const s = byId.get(id);
    let best = null, bestVal = -1;
    for (const d of (s.depends_on || [])) {
      if (!byId.has(d)) continue;
      const ready = ovOf(s, d) < 1 ? es(d) + ovOf(s, d) * dur(byId.get(d)) : ef(d);
      const v = ready - needAtOf(s, d) * dur(s);
      if (v > bestVal) { bestVal = v; best = d; }
    }
    if (best != null && bestVal >= es(id) - 1e-6) walk(best);
  }
  walk(endId);

  return { criticalSeconds, criticalStepIds: [...critical], hasCycle };
}

// Would adding `newDep` to `stepId`'s dependencies form a cycle?
export function wouldCycle(steps, stepId, newDep) {
  if (stepId === newDep) return true;
  const byId = new Map(steps.map(s => [s.id, s]));
  // Cycle forms if stepId is reachable from newDep through existing deps.
  const seen = new Set();
  const stack = [newDep];
  while (stack.length) {
    const cur = stack.pop();
    if (cur === stepId) return true;
    if (seen.has(cur)) continue;
    seen.add(cur);
    const s = byId.get(cur);
    if (s) for (const d of (s.depends_on || [])) stack.push(d);
  }
  return false;
}
