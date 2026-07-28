// Time for one step done by `workers` people. A helper only speeds a step
// that's marked helpable; the speed-up comes from help_seconds (time with 2).
// Shared by the Line Designer and the simulation.
export function stepTimeAtWorkers(baseSeconds, workers, helpable, helpSeconds) {
  const base = baseSeconds || 0;
  if (workers <= 1 || !helpable || base <= 0) return base;
  let r = 0.5;
  if (helpSeconds > 0) r = Math.max(0, base / helpSeconds - 1);
  return Math.round(base / (1 + (workers - 1) * r));
}
