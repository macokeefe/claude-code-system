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
  const memo = new Map();
  const inStack = new Set();
  let hasCycle = false;

  // Earliest finish = max(earliest finish of deps) + own duration.
  function ef(id) {
    if (memo.has(id)) return memo.get(id);
    if (inStack.has(id)) { hasCycle = true; return 0; }
    inStack.add(id);
    const s = byId.get(id);
    let maxDep = 0;
    for (const d of (s.depends_on || [])) {
      if (byId.has(d)) maxDep = Math.max(maxDep, ef(d));
    }
    inStack.delete(id);
    const v = maxDep + dur(s);
    memo.set(id, v);
    return v;
  }

  let criticalSeconds = 0;
  let endId = null;
  for (const s of steps) {
    const e = ef(s.id);
    if (e > criticalSeconds) { criticalSeconds = e; endId = s.id; }
  }

  // Walk back along a longest path to mark the critical steps.
  const critical = new Set();
  function walk(id) {
    if (id == null || critical.has(id)) return;
    critical.add(id);
    const s = byId.get(id);
    const target = ef(id) - dur(s);
    for (const d of (s.depends_on || [])) {
      if (byId.has(d) && ef(d) === target) { walk(d); break; }
    }
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
