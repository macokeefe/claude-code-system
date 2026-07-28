// Earliest-start/earliest-finish schedule over the step dependency graph,
// assuming unlimited operators (each step starts as soon as its dependencies
// finish). Drives the 3D floor playback — parallel branches run concurrently.
// `durationOf(step)` lets callers pass size-adjusted times.

export function scheduleSteps(steps, durationOf) {
  const byId = new Map(steps.map(s => [s.id, s]));
  const dur = durationOf || (s => s.effective_seconds || 0);
  const memo = new Map();
  const inStack = new Set();
  let cycle = false;

  function ef(id) {
    if (memo.has(id)) return memo.get(id);
    if (inStack.has(id)) { cycle = true; return 0; }
    inStack.add(id);
    const s = byId.get(id);
    let start = 0;
    for (const d of (s.depends_on || [])) if (byId.has(d)) start = Math.max(start, ef(d));
    inStack.delete(id);
    const finish = start + dur(s);
    memo.set(id, finish);
    return finish;
  }

  const schedule = new Map();
  let total = 0;
  for (const s of steps) {
    const finish = ef(s.id);
    const d = dur(s);
    schedule.set(s.id, { start: finish - d, finish, duration: d });
    total = Math.max(total, finish);
  }
  return { schedule, total, cycle };
}
