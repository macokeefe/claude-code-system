// Assembly-LINE simulation (flow shop WITH precedence). Operators are pinned to
// fixed stations; each station holds ONE unit at a time. A station starts the
// next unit as soon as (a) it has finished the previous unit AND (b) that unit's
// real prerequisites — the upstream STATIONS its steps depend on — are done.
//
// Crucially this is driven by the dependency graph, not by station order: a
// prerequisite-free station (e.g. seat-support frame, legs, connector prep) has
// no upstream stations, so it runs flat-out from t=0, unit after unit, stockpiling
// sub-assemblies ahead of the line. Steady-state output is still paced by the
// slowest station (the bottleneck = cycle time).
import { stepTimeAtWorkers } from './workerTime.js';

export function simulateLine(stations, opts = {}) {
  const Q = Math.max(1, Math.floor(opts.quantity || 1));
  const shiftSeconds = opts.shiftSeconds || 8 * 3600;
  const N = stations.length;
  if (!N) return null;

  // time one station needs for one unit, at its worker count
  const stime = stations.map(st => {
    const w = Math.max(1, st.workers || 1);
    return (st.steps || []).reduce((a, s) => {
      const base = s.effective_seconds || 0;
      const helpSec = (s.help_seconds && s.help_seconds > 0) ? s.help_seconds : Math.round(base * 0.62);
      return a + stepTimeAtWorkers(base, w, true, helpSec);
    }, 0);
  });

  // which station each step lives in, and the upstream stations each depends on
  const stationOf = new Map();
  stations.forEach((st, k) => (st.steps || []).forEach(s => stationOf.set(s.id, k)));
  const deps = stations.map(() => new Set());
  stations.forEach((st, k) => (st.steps || []).forEach(s => (s.depends_on || []).forEach(d => {
    const kk = stationOf.get(d);
    if (kk != null && kk !== k) deps[k].add(kk);
  })));

  // topological order over stations (so a station is computed after its deps)
  const order = []; const seen = new Set(); const temp = new Set(); let cyclic = false;
  const visit = k => {
    if (seen.has(k)) return;
    if (temp.has(k)) { cyclic = true; return; }
    temp.add(k);
    for (const d of deps[k]) visit(d);
    temp.delete(k); seen.add(k); order.push(k);
  };
  for (let k = 0; k < N; k++) visit(k);
  const seq = cyclic ? stations.map((_, k) => k) : order;

  const start = Array.from({ length: Q }, () => new Array(N).fill(0));
  const finish = Array.from({ length: Q }, () => new Array(N).fill(0));
  for (let u = 0; u < Q; u++) {
    for (const k of seq) {
      let s0 = u > 0 ? finish[u - 1][k] : 0;          // station free (single bench)
      for (const k2 of deps[k]) s0 = Math.max(s0, finish[u][k2]); // upstream sub-assemblies ready
      start[u][k] = s0;
      finish[u][k] = s0 + stime[k];
    }
  }

  const unitFinishes = Array.from({ length: Q }, (_, u) => Math.max(...finish[u]));
  const makespan = Math.max(...unitFinishes);
  const cycleTime = Math.max(...stime);
  const bottleneck = stime.indexOf(cycleTime);
  const stationsOut = stations.map((st, k) => ({
    idx: k, workers: Math.max(1, st.workers || 1), time: stime[k],
    busy: stime[k] * Q, idle: makespan - stime[k] * Q,
    stepIds: (st.steps || []).map(s => s.id),
    intervals: Array.from({ length: Q }, (_, u) => ({ unit: u, start: start[u][k], finish: finish[u][k] })),
  }));
  const totalOps = stationsOut.reduce((a, s) => a + s.workers, 0);
  const busyTotal = stationsOut.reduce((a, s) => a + s.busy, 0);
  const utilization = makespan > 0 && totalOps > 0 ? busyTotal / (makespan * totalOps) : 0;
  const idleSeconds = makespan * totalOps - busyTotal;

  return {
    kind: 'line', makespan, cycleTime, bottleneck, utilization, idleSeconds,
    stations: stationsOut, operatorsCount: totalOps, unitFinishes, quantity: Q,
    unitsPerShift: cycleTime > 0 ? Math.floor(shiftSeconds / cycleTime) : 0,
  };
}
