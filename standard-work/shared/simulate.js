// Discrete-event staffing simulation with dynamic helping.
//
// Models a flexible crew building one unit. Operators start any step whose
// dependencies are met (precedence-respecting). When an operator has no step
// of its own ready, it joins an in-progress *helpable* step to speed it up —
// and peels back off the moment a step it could own becomes ready ("go help
// until you have your own task"). How much a helper speeds a step is set per
// step (help_seconds = time with two people); steps not marked helpable gain
// nothing from extra hands.
//
// steps: [{ id, depends_on:[ids], effective_seconds, helpable, help_seconds }]
// Returns { makespan, utilization, idleSeconds, perStep: Map(id->{start,finish,maxWorkers}), stuck }

export function simulateBuild(steps, operatorCount, opts = {}) {
  const helping = opts.helping !== false;
  const maxWorkersDefault = opts.maxWorkersDefault || 2;
  const N = Math.max(1, Math.floor(operatorCount));
  const byId = new Map(steps.map(s => [s.id, s]));

  // Worker-power with k workers. 1 worker = 1.0. A helper on a helpable step
  // adds marginal power r, derived from help_seconds (time at 2 workers).
  function power(s, k) {
    if (k <= 1 || !s.helpable) return 1;
    const base = s.effective_seconds || 0;
    let r = 0.5; // default: a 2nd person adds 50% throughput
    if (s.help_seconds > 0 && base > 0) r = Math.max(0, base / s.help_seconds - 1);
    return 1 + (k - 1) * r;
  }
  const maxWorkers = s => (s.helpable ? Math.max(2, maxWorkersDefault) : 1);

  const st = new Map();
  for (const s of steps) st.set(s.id, { remaining: s.effective_seconds || 0, status: 'wait', workers: 0, start: null, finish: null, maxWorkers: 0 });

  const committed = () => steps.reduce((a, s) => a + st.get(s.id).workers, 0);
  const depsDone = s => (s.depends_on || []).every(d => !st.get(d) || st.get(d).status === 'done');
  const isReady = s => { const x = st.get(s.id); return x.status === 'wait' && depsDone(s); };

  let t = 0, done = 0, busyAccum = 0, guard = 0;
  const totalSteps = steps.length;

  function assign() {
    // finish any ready zero-time steps immediately (cascades)
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
    const readySteps = steps.filter(s => isReady(s) && st.get(s.id).remaining > 0);

    // free operators to staff ready steps — pull helpers off if needed
    let avail = N - committed();
    if (helping) {
      while (avail < readySteps.length) {
        // reclaim a helper (a worker beyond the first on an active helpable step)
        let from = null;
        for (const s of steps) { const x = st.get(s.id); if (x.status === 'active' && x.workers > 1) { from = s; break; } }
        if (!from) break;
        st.get(from.id).workers--; avail++;
      }
    }
    // start ready steps (one primary each)
    for (const s of readySteps) {
      if (avail <= 0) break;
      const x = st.get(s.id);
      x.status = 'active'; x.workers = 1; x.start = t; x.maxWorkers = Math.max(x.maxWorkers, 1); avail--;
    }
    // spare operators help on active helpable steps (most remaining first)
    if (helping) {
      avail = N - committed();
      while (avail > 0) {
        let best = null, bestRem = -1;
        for (const s of steps) {
          const x = st.get(s.id);
          if (x.status === 'active' && s.helpable && x.workers < maxWorkers(s) && x.remaining > bestRem) { best = s; bestRem = x.remaining; }
        }
        if (!best) break;
        const x = st.get(best.id); x.workers++; x.maxWorkers = Math.max(x.maxWorkers, x.workers); avail--;
      }
    }
  }

  assign();
  while (done < totalSteps && guard++ < 200000) {
    // time to the next step completion at current crewing
    let dt = Infinity;
    for (const s of steps) {
      const x = st.get(s.id);
      if (x.status === 'active') { const tt = x.remaining / power(s, x.workers); if (tt < dt) dt = tt; }
    }
    if (!isFinite(dt)) break; // nothing active but not done → blocked (cycle)
    for (const s of steps) {
      const x = st.get(s.id);
      if (x.status === 'active') { x.remaining -= power(s, x.workers) * dt; busyAccum += x.workers * dt; }
    }
    t += dt;
    for (const s of steps) {
      const x = st.get(s.id);
      if (x.status === 'active' && x.remaining <= 1e-6) { x.status = 'done'; x.finish = t; x.workers = 0; done++; }
    }
    assign();
  }

  const makespan = t;
  const perStep = new Map();
  for (const s of steps) { const x = st.get(s.id); perStep.set(s.id, { start: x.start, finish: x.finish, maxWorkers: x.maxWorkers }); }
  return {
    makespan,
    utilization: N * makespan > 0 ? busyAccum / (N * makespan) : 0,
    idleSeconds: Math.max(0, N * makespan - busyAccum),
    perStep,
    stuck: done < totalSteps,
  };
}
