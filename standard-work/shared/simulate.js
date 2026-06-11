// Discrete-event staffing simulation with named operators, dynamic helping,
// and manual assignment rules — drives both the Staffing page (aggregate) and
// the 3D floor (per-operator timelines).
//
// Operators:
//   • An operator may OWN steps (assignments[i].own = [stepIds]): they take
//     those when ready, and only they may start them. While none of their own
//     steps are ready they help; once all their own steps are done they
//     become generalists.
//   • An operator may have a HELP list (assignments[i].help = [stepIds]):
//     when idle they go help those steps first (in order), peeling off the
//     moment a step they must run becomes ready.
//   • Operators with no assignments are generalists: they start any ready
//     unpinned step, and (if helping is on) assist on helpable steps.
//
// A helper's effect comes from each step's help_seconds (time with 2 people);
// steps not marked helpable gain nothing from extra hands.
//
// Returns { makespan, utilization, idleSeconds, perStep, operators, stuck }
//   perStep: Map(id -> {start, finish, maxWorkers})
//   operators: [{ intervals: [{stepId, role:'own'|'help', start, end}] }]

export function simulateBuild(steps, operatorCount, opts = {}) {
  const helping = opts.helping !== false;
  const maxWorkersDefault = opts.maxWorkersDefault || 2;
  const N = Math.max(1, Math.floor(operatorCount));
  const assignments = opts.assignments || [];

  const st = new Map();
  for (const s of steps) st.set(s.id, { remaining: s.effective_seconds || 0, status: 'wait', workers: [], start: null, finish: null, maxWorkers: 0 });

  // step pinned to the set of operators that own it
  const owners = new Map(); // stepId -> [opIdx]
  const ops = [];
  for (let i = 0; i < N; i++) {
    const a = assignments[i] || {};
    const own = (a.own || []).filter(id => st.has(id));
    const help = (a.help || []).filter(id => st.has(id));
    for (const id of own) { if (!owners.has(id)) owners.set(id, []); owners.get(id).push(i); }
    ops.push({ own, help, on: null, role: null, intervals: [], _iv: null });
  }

  function power(s, k) {
    if (k <= 1 || !s.helpable) return 1;
    const base = s.effective_seconds || 0;
    let r = 0.5;
    if (s.help_seconds > 0 && base > 0) r = Math.max(0, base / s.help_seconds - 1);
    return 1 + (k - 1) * r;
  }
  const maxWorkers = s => (s.helpable ? Math.max(2, maxWorkersDefault) : 1);
  const byId = new Map(steps.map(s => [s.id, s]));
  const depsDone = s => (s.depends_on || []).every(d => !st.get(d) || st.get(d).status === 'done');
  const isGeneralist = op => op.own.length === 0 || op.own.every(id => st.get(id).status === 'done');

  let t = 0, done = 0, busyAccum = 0, guard = 0;
  const totalSteps = steps.length;

  function setOp(i, stepId, role) {
    const op = ops[i];
    if (op.on === stepId && op.role === role) return;
    if (op._iv) { op._iv.end = t; if (op._iv.end > op._iv.start) op.intervals.push(op._iv); op._iv = null; }
    if (op.on != null) {
      const x = st.get(op.on);
      x.workers = x.workers.filter(w => w !== i);
    }
    op.on = stepId; op.role = role;
    if (stepId != null) {
      const x = st.get(stepId);
      x.workers.push(i);
      x.maxWorkers = Math.max(x.maxWorkers, x.workers.length);
      op._iv = { stepId, role, start: t, end: null };
    }
  }

  function finishZeroes() {
    let changed = true;
    while (changed) {
      changed = false;
      for (const s of steps) {
        const x = st.get(s.id);
        if (x.status === 'wait' && depsDone(s) && (x.remaining || 0) <= 0) {
          x.status = 'done'; x.start = t; x.finish = t; done++; changed = true;
        }
      }
    }
  }

  function assign() {
    finishZeroes();

    // 1. Ready pinned steps → their owner takes over (even off a helping job).
    for (const s of steps) {
      const x = st.get(s.id);
      if (x.status !== 'wait' || !depsDone(s) || !owners.has(s.id)) continue;
      const cand = owners.get(s.id).find(i => ops[i].on == null || ops[i].role === 'help');
      if (cand != null) {
        setOp(cand, s.id, 'own');
        x.status = 'active'; x.start = t;
      }
    }
    // 2. Ready unpinned steps → idle/helping generalists (longest first).
    const readyUnpinned = steps
      .filter(s => st.get(s.id).status === 'wait' && depsDone(s) && !owners.has(s.id))
      .sort((a, b) => st.get(b.id).remaining - st.get(a.id).remaining);
    for (const s of readyUnpinned) {
      const cand = ops.findIndex(op => (op.on == null || op.role === 'help') && isGeneralist(op));
      if (cand === -1) break;
      setOp(cand, s.id, 'own');
      const x = st.get(s.id);
      x.status = 'active'; x.start = t;
    }
    // 3. Idle operators go help.
    for (let i = 0; i < N; i++) {
      const op = ops[i];
      if (op.on != null) continue;
      let target = null;
      // explicit help list first, in the user's order
      for (const id of op.help) {
        const s = byId.get(id); const x = st.get(id);
        if (x.status === 'active' && s.helpable && x.workers.length < maxWorkers(s)) { target = id; break; }
      }
      // otherwise general helping (if enabled)
      if (target == null && helping) {
        let bestRem = -1;
        for (const s of steps) {
          const x = st.get(s.id);
          if (x.status === 'active' && s.helpable && x.workers.length < maxWorkers(s) && x.remaining > bestRem) { target = s.id; bestRem = x.remaining; }
        }
      }
      if (target != null) setOp(i, target, 'help');
    }
  }

  assign();
  while (done < totalSteps && guard++ < 200000) {
    let dt = Infinity;
    for (const s of steps) {
      const x = st.get(s.id);
      if (x.status === 'active' && x.workers.length > 0) {
        const tt = x.remaining / power(s, x.workers.length);
        if (tt < dt) dt = tt;
      }
    }
    if (!isFinite(dt)) break; // blocked: cycle, or pinned step whose owners never free
    for (const s of steps) {
      const x = st.get(s.id);
      if (x.status === 'active' && x.workers.length > 0) x.remaining -= power(s, x.workers.length) * dt;
    }
    busyAccum += ops.filter(o => o.on != null).length * dt;
    t += dt;
    for (const s of steps) {
      const x = st.get(s.id);
      if (x.status === 'active' && x.remaining <= 1e-6) {
        x.status = 'done'; x.finish = t; done++;
        for (const w of [...x.workers]) setOp(w, null, null);
      }
    }
    assign();
  }

  // close open intervals
  for (let i = 0; i < N; i++) { const op = ops[i]; if (op._iv) { op._iv.end = t; op.intervals.push(op._iv); op._iv = null; } }

  const perStep = new Map();
  for (const s of steps) { const x = st.get(s.id); perStep.set(s.id, { start: x.start, finish: x.finish, maxWorkers: x.maxWorkers }); }
  return {
    makespan: t,
    utilization: N * t > 0 ? busyAccum / (N * t) : 0,
    idleSeconds: Math.max(0, N * t - busyAccum),
    perStep,
    operators: ops.map(o => ({ intervals: o.intervals })),
    stuck: done < totalSteps,
  };
}
