// Pure workload-allocation and waste math, shared by the server and the
// standalone (browser) build. No DB or DOM access — just numbers in, plan out.
//
// First-pass model for a flexible-operator floor (everyone can do anything):
// we level the day's work content across N operators with a Longest-
// Processing-Time greedy assignment (a fast, near-optimal makespan heuristic)
// and report idle time as the primary "waste" signal.
//
// Two granularities answer the cells-vs-stations question the redesign faces:
//   • 'unit'  — each ordered unit is one indivisible task (one builder per
//               piece, the cell model).
//   • 'split' — every step of every unit is its own task (work divided across
//               people, the station model). This is the theoretical best
//               balance if work is freely divisible; it ignores precedence,
//               which a later layer will add.

// Build the task list for a day's orders.
//   orders:   [{ sku_id, qty }]
//   skuDetail: Map(sku_id -> { name, total_seconds, steps:[{...effective_seconds}] })
export function buildTasks(orders, skuDetail, mode) {
  const tasks = [];
  for (const order of orders) {
    const sku = skuDetail.get(order.sku_id);
    if (!sku) continue;
    const qty = Math.max(0, Math.round(order.qty || 0));
    for (let n = 1; n <= qty; n++) {
      if (mode === 'split') {
        for (const step of sku.steps) {
          const secs = step.effective_seconds || 0;
          if (secs > 0) {
            tasks.push({
              seconds: secs,
              sku_id: sku.id,
              sku_name: sku.name,
              label: `${sku.name} #${n}: ${step.tag_id ? step.tag_name : step.name}`,
            });
          }
        }
      } else {
        tasks.push({
          seconds: sku.total_seconds || 0,
          sku_id: sku.id,
          sku_name: sku.name,
          label: `${sku.name} #${n}`,
        });
      }
    }
  }
  return tasks;
}

// Longest-Processing-Time greedy: assign each task (largest first) to the
// currently least-loaded operator. Minimizes makespan well in practice.
export function allocate(tasks, operatorCount) {
  const n = Math.max(1, operatorCount);
  const bins = Array.from({ length: n }, (_, i) => ({ operator: i, load: 0, tasks: [] }));
  const sorted = [...tasks].sort((a, b) => b.seconds - a.seconds);
  for (const t of sorted) {
    let min = bins[0];
    for (const b of bins) if (b.load < min.load) min = b;
    min.tasks.push(t);
    min.load += t.seconds;
  }
  const totalWork = tasks.reduce((s, t) => s + t.seconds, 0);
  const makespan = Math.max(0, ...bins.map(b => b.load));
  // Idle = time operators stand around waiting for the last one to finish.
  const idle = bins.reduce((s, b) => s + (makespan - b.load), 0);
  return {
    bins, makespan, totalWork, idle,
    utilization: makespan > 0 ? totalWork / (makespan * n) : 0,
  };
}

// Full day summary for one mode, including shift fit and takt.
//   shiftSeconds = usable seconds per operator in the day
export function planDay(orders, skuDetail, operatorCount, shiftSeconds, mode) {
  const tasks = buildTasks(orders, skuDetail, mode);
  const alloc = allocate(tasks, operatorCount);
  const totalUnits = orders.reduce((s, o) => s + Math.max(0, Math.round(o.qty || 0)), 0);
  const capacity = operatorCount * shiftSeconds;
  return {
    mode,
    ...alloc,
    taskCount: tasks.length,
    totalUnits,
    capacity,
    fits: alloc.makespan <= shiftSeconds,
    // Reference takt: usable shift time per unit demanded.
    taktSeconds: totalUnits > 0 ? shiftSeconds / totalUnits : null,
    // Headroom (or shortfall) on the most-loaded operator vs the shift.
    slackSeconds: shiftSeconds - alloc.makespan,
  };
}
