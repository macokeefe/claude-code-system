// Assembly-LINE simulation (flow shop). The opposite of simulate.js's
// free-roaming model: operators are pinned to fixed stations, each station
// holds ONE unit at a time, and a unit flows station 1 → 2 → … → N. A station
// can start the next unit only when (a) it has finished the previous unit and
// (b) the unit has cleared the station before it. Steady-state output is paced
// by the slowest station (the bottleneck = cycle time). This is the line the
// Line Designer / Workflow optimizer describe, so its numbers match them.
import { stepTimeAtWorkers } from './workerTime.js';

export function simulateLine(stations, opts = {}) {
  const Q = Math.max(1, Math.floor(opts.quantity || 1));
  const shiftSeconds = opts.shiftSeconds || 8 * 3600;
  const N = stations.length;
  if (!N) return null;

  // time one station needs for one unit, at that station's worker count
  const stime = stations.map(st => {
    const w = Math.max(1, st.workers || 1);
    return (st.steps || []).reduce((a, s) => {
      const base = s.effective_seconds || 0;
      const helpSec = (s.help_seconds && s.help_seconds > 0) ? s.help_seconds : Math.round(base * 0.62);
      return a + stepTimeAtWorkers(base, w, true, helpSec);
    }, 0);
  });

  // flow-shop start/finish per unit per station
  const start = Array.from({ length: Q }, () => new Array(N).fill(0));
  const finish = Array.from({ length: Q }, () => new Array(N).fill(0));
  for (let u = 0; u < Q; u++) {
    for (let k = 0; k < N; k++) {
      const prevStation = k > 0 ? finish[u][k - 1] : 0;  // unit cleared the station before
      const stationFree = u > 0 ? finish[u - 1][k] : 0;  // station done with the previous unit
      start[u][k] = Math.max(prevStation, stationFree);
      finish[u][k] = start[u][k] + stime[k];
    }
  }

  const makespan = finish[Q - 1][N - 1];
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
  const unitFinishes = Array.from({ length: Q }, (_, u) => finish[u][N - 1]);

  return {
    kind: 'line', makespan, cycleTime, bottleneck, utilization, idleSeconds,
    stations: stationsOut, operatorsCount: totalOps, unitFinishes, quantity: Q,
    unitsPerShift: cycleTime > 0 ? Math.floor(shiftSeconds / cycleTime) : 0,
  };
}
