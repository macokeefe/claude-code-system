// Assembly-line optimizer. Given a product's steps (with precedence + times)
// and a crew size, find a realistic line: group the steps into stations along
// a topological order, staff the bottlenecks, and report the cycle time and
// throughput. "Realistic" = an operator stays at one station doing the same
// grouped steps on every unit (no teleporting around the floor); a unit flows
// station → station; output rate = the slowest station. Adding a 2nd/3rd
// person to a station speeds it with diminishing returns (the help model the
// Line Designer and simulation already use), and we only add people who
// actually shrink the bottleneck.
import { stepTimeAtWorkers } from './workerTime.js';

// Stable topological order: respect depends_on, break ties by input order
// (which is the step sequence the engineer authored).
export function topoOrder(steps) {
  const byId = new Map(steps.map(s => [s.id, s]));
  const placed = new Set();
  const order = [];
  while (order.length < steps.length) {
    const next = steps.find(s => !placed.has(s.id) &&
      (s.depends_on || []).every(d => !byId.has(d) || placed.has(d)));
    if (!next) { // dependency cycle — append whatever's left, in input order
      for (const s of steps) if (!placed.has(s.id)) { order.push(s); placed.add(s.id); }
      break;
    }
    order.push(next); placed.add(next.id);
  }
  return order;
}

// Split `order` into exactly S contiguous segments minimizing the largest
// segment base-time. Contiguous over a topo order keeps precedence valid
// (every prerequisite lands in an earlier-or-same station). DP — n is small.
function bestPartition(order, S, dur) {
  const n = order.length;
  const prefix = [0];
  for (const s of order) prefix.push(prefix[prefix.length - 1] + dur(s));
  const seg = (i, j) => prefix[j] - prefix[i]; // [i, j)
  const dp = Array.from({ length: S + 1 }, () => Array(n + 1).fill(Infinity));
  const cut = Array.from({ length: S + 1 }, () => Array(n + 1).fill(n));
  dp[0][n] = 0;
  for (let k = 1; k <= S; k++) {
    for (let i = n - 1; i >= 0; i--) {
      for (let j = i + 1; j <= n; j++) {
        const cand = Math.max(seg(i, j), dp[k - 1][j]);
        if (cand < dp[k][i]) { dp[k][i] = cand; cut[k][i] = j; }
      }
    }
  }
  const segs = [];
  let i = 0, k = S;
  while (k > 0) { const j = cut[k][i]; segs.push(order.slice(i, j)); i = j; k--; }
  return segs;
}

export function optimizeLine(rawSteps, opts = {}) {
  const operators = Math.max(1, Math.floor(opts.operators || 4));
  const shiftSeconds = opts.shiftSeconds || 8 * 3600;
  const cap = opts.maxPerStation || 3;
  const dur = opts.durationOf || (s => s.effective_seconds || 0);
  const order = topoOrder(rawSteps);
  const n = order.length;
  if (!n) return null;

  const helpSec = s => (s.help_seconds && s.help_seconds > 0) ? s.help_seconds : Math.round(dur(s) * 0.62);
  const stepTime = (s, w) => stepTimeAtWorkers(dur(s), w, true, helpSec(s));
  const stationTime = (seg, w) => seg.reduce((a, s) => a + stepTime(s, w), 0);

  let best = null;
  const maxStations = Math.min(operators, n);
  for (let S = 1; S <= maxStations; S++) {
    const segs = bestPartition(order, S, dur);
    const workers = segs.map(() => 1);
    let extra = operators - S;
    // Spend the spare people on whatever cuts the current bottleneck most.
    while (extra > 0) {
      let cand = -1, bestGain = 0;
      for (let k = 0; k < segs.length; k++) {
        if (workers[k] >= cap) continue;
        const gain = stationTime(segs[k], workers[k]) - stationTime(segs[k], workers[k] + 1);
        // only worth it if this station is at/near the bottleneck
        if (gain > bestGain) { bestGain = gain; cand = k; }
      }
      if (cand < 0 || bestGain <= 0) break; // nobody left who'd help
      // don't add to a station that isn't the bottleneck if it won't matter
      const times = segs.map((seg, k) => stationTime(seg, workers[k]));
      const bottleneck = Math.max(...times);
      if (times[cand] < bottleneck) {
        // redirect to the actual bottleneck if it can still take help
        const bk = times.indexOf(bottleneck);
        if (workers[bk] < cap && stationTime(segs[bk], workers[bk]) > stationTime(segs[bk], workers[bk] + 1)) {
          workers[bk]++; extra--; continue;
        }
      }
      workers[cand]++; extra--;
    }
    const times = segs.map((seg, k) => stationTime(seg, workers[k]));
    const cycle = Math.max(...times);
    const usedOps = workers.reduce((a, b) => a + b, 0);
    const totalWork = times.reduce((a, b) => a + b, 0);
    const balance = cycle > 0 ? totalWork / (segs.length * cycle) : 0;
    const cand = {
      stationCount: S, cycle, usedOps, balance, totalWork,
      stations: segs.map((seg, k) => ({
        stepIds: seg.map(s => s.id), workers: workers[k], seconds: times[k],
      })),
    };
    // prefer faster cycle; tie → fewer people; then better balance
    if (!best || cand.cycle < best.cycle - 0.5 ||
      (Math.abs(cand.cycle - best.cycle) <= 0.5 && cand.usedOps < best.usedOps) ||
      (Math.abs(cand.cycle - best.cycle) <= 0.5 && cand.usedOps === best.usedOps && cand.balance > best.balance)) {
      best = cand;
    }
  }
  best.operators = operators;
  best.unitsPerShift = best.cycle > 0 ? Math.floor(shiftSeconds / best.cycle) : 0;
  // Theoretical floor: you can never beat the longest single (helped) step,
  // nor the total hands-on work spread perfectly over the crew.
  const longest = Math.max(0, ...order.map(s => stepTime(s, Math.min(cap, operators))));
  const totalBase = order.reduce((a, s) => a + dur(s), 0);
  best.floorCycle = Math.max(longest, Math.round(totalBase / operators));
  return best;
}
