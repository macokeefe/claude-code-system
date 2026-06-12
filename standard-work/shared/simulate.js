// Discrete-event staffing simulation with multi-unit flow (pipelining),
// named operators, dynamic helping, and manual assignment rules.
//
// Build `quantity` units of the same product with a shared crew. Each unit is
// an independent copy of the step graph; operators grab ready work from ANY
// in-process unit, so while one unit is at frame assembly another can be at
// rivnut — that's what keeps a crew busy and what the single-unit model can't
// show. Operators are the shared constraint.
//
// Assignments reference TEMPLATE step ids (the SKU's step ids): owning step 6
// means owning step 6 on every unit (you're "the frame person").
//
// Returns:
//   { makespan, utilization, idleSeconds,
//     operators: [{ intervals:[{template,unit,role,start,end}], busySeconds, idleSeconds }],
//     byTemplate: Map(templateId -> [{start,finish}]),  // instances per station
//     unitFinishes: [seconds...], stuck }

export function simulateBuild(templateSteps, operatorCount, opts = {}) {
  const helping = opts.helping !== false;
  const maxWorkersDefault = opts.maxWorkersDefault || 2;
  const N = Math.max(1, Math.floor(operatorCount));
  const Q = Math.max(1, Math.floor(opts.quantity || 1));
  const assignments = opts.assignments || [];
  const U = 1000000; // unit id stride

  // expand units
  const steps = [];
  for (let u = 0; u < Q; u++) {
    for (const ts of templateSteps) {
      steps.push({
        id: u * U + ts.id, template: ts.id, unit: u,
        depends_on: (ts.depends_on || []).map(d => u * U + d),
        // overlap: a dep may be only partly required before this can start
        dep_overlap: ts.dep_overlap
          ? Object.fromEntries(Object.entries(ts.dep_overlap).map(([d, f]) => [u * U + Number(d), f]))
          : null,
        effective_seconds: ts.effective_seconds || 0,
        helpable: !!ts.helpable, help_seconds: ts.help_seconds || 0,
      });
    }
  }

  const st = new Map();
  for (const s of steps) st.set(s.id, { remaining: s.effective_seconds || 0, status: 'wait', workers: [], start: null, finish: null });

  // ownership/help by template
  const ops = [];
  const ownedTemplates = []; // Set per op
  for (let i = 0; i < N; i++) {
    const a = assignments[i] || {};
    ownedTemplates.push(new Set(a.own || []));
    ops.push({ ownSet: new Set(a.own || []), helpSet: new Set(a.help || []), on: null, role: null, intervals: [], busy: 0, _iv: null });
  }
  const templateOwned = new Set();
  for (const set of ownedTemplates) for (const tid of set) templateOwned.add(tid);
  const ownersOf = s => ops.map((op, i) => op.ownSet.has(s.template) ? i : -1).filter(i => i >= 0);

  function power(s, k) {
    if (k <= 1 || !s.helpable) return 1;
    const base = s.effective_seconds || 0;
    let r = 0.5;
    if (s.help_seconds > 0 && base > 0) r = Math.max(0, base / s.help_seconds - 1);
    return 1 + (k - 1) * r;
  }
  const maxWorkers = s => (s.helpable ? Math.max(2, maxWorkersDefault) : 1);
  const stepById = new Map(steps.map(s => [s.id, s]));
  const ovOf = (s, d) => (s.dep_overlap && s.dep_overlap[d] != null) ? s.dep_overlap[d] : 1;
  // A dep is "ready enough" when it is done, or — if an overlap < 1 is set —
  // when it has progressed past that fraction (the next station can start once
  // a few parts are made).
  const depReady = (s, d) => {
    const x = st.get(d);
    if (!x) return true;
    if (x.status === 'done') return true;
    const ov = ovOf(s, d);
    if (ov >= 1 || x.status !== 'active') return false;
    const total = stepById.get(d)?.effective_seconds || 0;
    if (total <= 0) return true;
    return (1 - x.remaining / total) >= ov - 1e-9;
  };
  const depsDone = s => (s.depends_on || []).every(d => depReady(s, d));
  const ownsSomethingLeft = op => [...op.ownSet].some(tid => steps.some(s => s.template === tid && st.get(s.id).status !== 'done'));
  const isGeneralist = op => op.ownSet.size === 0 || !ownsSomethingLeft(op);

  let t = 0, done = 0, guard = 0;
  const totalSteps = steps.length;

  function setOp(i, step, role) {
    const op = ops[i];
    const stepId = step ? step.id : null;
    if (op.on === stepId && op.role === role) return;
    if (op._iv) { op._iv.end = t; if (op._iv.end > op._iv.start) op.intervals.push(op._iv); op._iv = null; }
    if (op.on != null) { const x = st.get(op.on); x.workers = x.workers.filter(w => w !== i); }
    op.on = stepId; op.role = role;
    if (step) {
      const x = st.get(step.id); x.workers.push(i);
      op._iv = { template: step.template, unit: step.unit, role, start: t, end: null };
    }
  }

  function finishZeroes() {
    let changed = true;
    while (changed) {
      changed = false;
      for (const s of steps) {
        const x = st.get(s.id);
        if (x.status === 'wait' && depsDone(s) && (x.remaining || 0) <= 0) { x.status = 'done'; x.start = t; x.finish = t; done++; changed = true; }
      }
    }
  }

  function assign() {
    finishZeroes();
    // 1. ready owned steps → an owner (pull off a helping job if needed)
    for (const s of steps) {
      const x = st.get(s.id);
      if (x.status !== 'wait' || !depsDone(s)) continue;
      const owners = ownersOf(s);
      if (owners.length === 0) continue;
      const cand = owners.find(i => ops[i].on == null || ops[i].role === 'help');
      if (cand != null) { setOp(cand, s, 'own'); x.status = 'active'; x.start = t; }
    }
    // 2. ready unpinned steps → idle/helping generalists (longest remaining first)
    const readyUnpinned = steps
      .filter(s => st.get(s.id).status === 'wait' && depsDone(s) && !templateOwned.has(s.template))
      .sort((a, b) => st.get(b.id).remaining - st.get(a.id).remaining);
    for (const s of readyUnpinned) {
      const cand = ops.findIndex(op => (op.on == null || op.role === 'help') && isGeneralist(op));
      if (cand === -1) break;
      setOp(cand, s, 'own'); const x = st.get(s.id); x.status = 'active'; x.start = t;
    }
    // 3. idle operators go help
    for (let i = 0; i < N; i++) {
      const op = ops[i];
      if (op.on != null) continue;
      let target = null;
      for (const tid of op.helpSet) {
        const s = steps.find(s => s.template === tid && st.get(s.id).status === 'active' && s.helpable && st.get(s.id).workers.length < maxWorkers(s));
        if (s) { target = s; break; }
      }
      if (!target && helping) {
        let bestRem = -1;
        for (const s of steps) {
          const x = st.get(s.id);
          if (x.status === 'active' && s.helpable && x.workers.length < maxWorkers(s) && x.remaining > bestRem) { target = s; bestRem = x.remaining; }
        }
      }
      if (target) setOp(i, target, 'help');
    }
  }

  assign();
  while (done < totalSteps && guard++ < 500000) {
    let dt = Infinity;
    for (const s of steps) {
      const x = st.get(s.id);
      if (x.status === 'active' && x.workers.length > 0) { const tt = x.remaining / power(s, x.workers.length); if (tt < dt) dt = tt; }
    }
    // also stop at the next moment a waiting step's partial dependency crosses
    // its overlap threshold, so the downstream can start right then
    for (const s of steps) {
      const x = st.get(s.id);
      if (x.status !== 'wait') continue;
      for (const d of (s.depends_on || [])) {
        const ov = ovOf(s, d);
        if (ov >= 1) continue;
        const xd = st.get(d);
        if (!xd || xd.status !== 'active' || xd.workers.length === 0) continue;
        const total = stepById.get(d)?.effective_seconds || 0;
        const targetRem = (1 - ov) * total;
        if (xd.remaining > targetRem + 1e-6) {
          const tt = (xd.remaining - targetRem) / power(stepById.get(d), xd.workers.length);
          if (tt < dt) dt = tt;
        }
      }
    }
    if (!isFinite(dt)) break;
    for (const s of steps) { const x = st.get(s.id); if (x.status === 'active' && x.workers.length > 0) x.remaining -= power(s, x.workers.length) * dt; }
    for (let i = 0; i < N; i++) if (ops[i].on != null) ops[i].busy += dt;
    t += dt;
    for (const s of steps) {
      const x = st.get(s.id);
      if (x.status === 'active' && x.remaining <= 1e-6) { x.status = 'done'; x.finish = t; done++; for (const w of [...x.workers]) setOp(w, null, null); }
    }
    assign();
  }
  for (let i = 0; i < N; i++) { const op = ops[i]; if (op._iv) { op._iv.end = t; op.intervals.push(op._iv); op._iv = null; } }

  const byTemplate = new Map();
  for (const ts of templateSteps) byTemplate.set(ts.id, []);
  for (const s of steps) { const x = st.get(s.id); byTemplate.get(s.template).push({ unit: s.unit, start: x.start, finish: x.finish }); }
  const unitFinishes = [];
  for (let u = 0; u < Q; u++) {
    let f = 0; for (const s of steps) if (s.unit === u) f = Math.max(f, st.get(s.id).finish || 0);
    unitFinishes.push(f);
  }
  let busyTotal = 0; for (const op of ops) busyTotal += op.busy;
  return {
    makespan: t,
    utilization: N * t > 0 ? busyTotal / (N * t) : 0,
    idleSeconds: Math.max(0, N * t - busyTotal),
    operators: ops.map(o => ({ intervals: o.intervals, busySeconds: o.busy, idleSeconds: Math.max(0, t - o.busy) })),
    byTemplate,
    unitFinishes,
    quantity: Q,
    stuck: done < totalSteps,
  };
}
