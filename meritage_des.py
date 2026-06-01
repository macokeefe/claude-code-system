"""
TUUCI Meritage 2-Seater Sofa Assembly Line
Discrete Event Simulation — SimPy + NumPy + Matplotlib

Scenarios modeled:
  1. Current State      — 3 ops (1 assembly, 2 weavers); bars block weaving station when delayed
  2. Proposed A         — 7 ops: 1 pre-assembly, 3 bar (parallel), 3 weavers (parallel)
  3. Proposed B         — 3 ops: 1 pre-assembly, 1 bar (sequential), 1 weaver (pipelined)
  4. Proposed C         — Proposed A + supplier screw fix (eliminates 3 min 15 sec Step 2 waste)

Search "# PLACEHOLDER" to find all inputs that need real production data.

Key modelling assumption for Current State cycle time:
  - No delay: assembly op handles bar attachment before the chair reaches the weaving station;
    bar attachment is NOT on the weaving-station critical path.
    Weaving station time = weave_total only.
  - Delay (PLACEHOLDER 30%): bars arrive late and are attached AT the weaving station,
    blocking both weavers. Weaving station time = bar_total + weave_total.
  This is what makes BAR_DELAY_PROB meaningful for cycle time in the sensitivity analysis.
"""

import csv
import simpy  # noqa: F401  (SimPy env used for DES process logic)
import numpy as np
import matplotlib
matplotlib.use("Agg")
import matplotlib.pyplot as plt
from dataclasses import dataclass
from typing import Dict, List


# ═══════════════════════════════════════════════════════════════════════════════
#  TIME CONSTANTS  (all units: minutes)
# ═══════════════════════════════════════════════════════════════════════════════

# Step 2 — Connector pre-assembly
STEP2_WASTE     = 3.25    # supplier waste: 90s (classic screws) + 90s (directional screws) + 15s (orientation)
STEP2_VALUE     = 16.0    # value-added: 12 connectors × 1 min 20 sec each
STEP2_TOTAL     = 19.25   # = STEP2_WASTE + STEP2_VALUE

# Step 3 — End cap & insert assembly
STEP3_TIME      = 8.0

# Step 5 — Leg attachment
STEP5_TIME      = 25.2    # 25 min 12 sec

# Step 12 — Bar attachment (2 bars/side × 3 sides)
BAR_PER_SIDE    = 7.333   # 2 bars × 3 min 40 sec each
BAR_TOTAL_SEQ   = 22.5    # all 3 sides sequential (1 op)
N_SIDES         = 3
N_BARS_PER_SIDE = 2

# Step 13 — Weaving
WEAVE_PER_SIDE  = 5.95    # 5 min 57 sec per side
WEAVE_TOTAL_SEQ = 18.0    # 3 sides × 1 op (deterministic reference)

# Pre-weaving subtotals (Steps 2 + 3 + 5)
T_PRE_FULL  = STEP2_TOTAL + STEP3_TIME + STEP5_TIME   # 52.45 min
T_PRE_FIXED = STEP2_VALUE + STEP3_TIME + STEP5_TIME   # 49.20 min (supplier fix, Scenario C)


# ═══════════════════════════════════════════════════════════════════════════════
#  STOCHASTIC PARAMETERS  — ALL PLACEHOLDER, validate before use
# ═══════════════════════════════════════════════════════════════════════════════

BAR_DELAY_PROB   = 0.30   # PLACEHOLDER: fraction of chairs where bars arrive out of sequence.
                          #              NOT a measured rate — one occurrence was observed.
                          #              Track on clipboard (bars ready before/after chair arrives)
                          #              for 2–4 weeks, then update this value.
HOLE_DEFECT_PROB = 0.10   # PLACEHOLDER: fraction of bar insertions needing full removal + re-run (problem 03)
HOLE_DEFECT_ADD  = 5.0    # PLACEHOLDER: minutes added per hole-sizing defect
RUBBER_RING_PROB = 0.15   # PLACEHOLDER: fraction of bar insertions needing rubber ring re-seating (problem 02)
RUBBER_RING_ADD  = 1.0    # PLACEHOLDER: minutes added per rubber ring event

# ── Labor cost ───────────────────────────────────────────────────────────────
OPERATOR_HOURLY_RATE = 20.0   # PLACEHOLDER: $/hour — replace with actual burdened labor rate

N_RUNS = 1000   # Monte Carlo replications per scenario


# ═══════════════════════════════════════════════════════════════════════════════
#  STOCHASTIC HELPER
# ═══════════════════════════════════════════════════════════════════════════════

def stochastic_bar_side(rng: np.random.Generator) -> float:
    """Time to attach bars on one side; each bar independently samples defect events."""
    t = BAR_PER_SIDE
    for _ in range(N_BARS_PER_SIDE):
        if rng.random() < HOLE_DEFECT_PROB:   # PLACEHOLDER
            t += HOLE_DEFECT_ADD              # PLACEHOLDER
        if rng.random() < RUBBER_RING_PROB:   # PLACEHOLDER
            t += RUBBER_RING_ADD              # PLACEHOLDER
    return t


# ═══════════════════════════════════════════════════════════════════════════════
#  RESULT CONTAINER
# ═══════════════════════════════════════════════════════════════════════════════

@dataclass
class Result:
    cycle_time: float       # total chair cycle time (min)
    idle: Dict[str, float]  # operator label → idle minutes this run
    op_minutes: float       # total operator-clock-minutes across all workers this run
    n_ops: int              # headcount (number of operators assigned to this chair)
    bottleneck: str


# ═══════════════════════════════════════════════════════════════════════════════
#  SCENARIO 1 — Current State
#
#  Operators: 1 assembly op (Steps 2, 3, 5 + bar when not delayed), 2 weavers.
#  Headcount: 3
#
#  Cycle time model:
#    No delay → assembly op finishes bar before chair reaches weaving station.
#               Weaving station sees only weave_total on the critical path.
#    Delayed   → bars arrive late; assembly op attaches them AT the weaving station,
#               blocking both weavers. Weaving station time = bar_total + weave_total.
#
#  Weaving (2-op model): sides 1+2 in parallel (round 1), side 3 solo (round 2).
#  Weaver 2 idles during round 2 (3rd side).
# ═══════════════════════════════════════════════════════════════════════════════

def scenario_current(rng: np.random.Generator, bar_delay_prob: float = BAR_DELAY_PROB) -> Result:
    side_bar_times = [stochastic_bar_side(rng) for _ in range(N_SIDES)]
    bar_total = sum(side_bar_times)

    delayed = rng.random() < bar_delay_prob  # PLACEHOLDER probability

    weave_total = 2 * WEAVE_PER_SIDE   # rounds 1 + 2 for 2-op model

    if delayed:
        # Bar attachment blocks weaving station → on critical path after pre-assembly
        cycle_time   = T_PRE_FULL + bar_total + weave_total
        weaver1_idle = bar_total          # idles at station during bar attach
        weaver2_idle = bar_total + WEAVE_PER_SIDE   # + idle on round-2 (3rd side)
        bottleneck   = "bar_attach_out_of_sequence"
        # op_minutes: assembly op (pre + bar) + 2 weavers (idle + weave)
        op_minutes = (T_PRE_FULL + bar_total) + 2 * (bar_total + weave_total)
    else:
        # Bar attachment done before weaving station → not on station critical path
        cycle_time   = T_PRE_FULL + weave_total
        weaver1_idle = 0.0
        weaver2_idle = WEAVE_PER_SIDE    # idle on round-2 (3rd side)
        bottleneck   = "weave_2op_third_side_idle"
        # op_minutes: assembly op (pre + bar) + 2 weavers (weave only)
        op_minutes = (T_PRE_FULL + bar_total) + 2 * weave_total

    return Result(
        cycle_time=cycle_time,
        idle={"weaver_1": weaver1_idle, "weaver_2": weaver2_idle},
        op_minutes=op_minutes,
        n_ops=3,
        bottleneck=bottleneck,
    )


# ═══════════════════════════════════════════════════════════════════════════════
#  SCENARIO A — Proposed: 3 bar ops (parallel, 1/side) → 3 weavers (parallel, 1/side)
#  Bars always in-sequence; weaving station never blocked by bar attachment.
#  Headcount: 7 (1 pre-assembly + 3 bar + 3 weave)
# ═══════════════════════════════════════════════════════════════════════════════

def scenario_A(rng: np.random.Generator, _delay_prob: float = BAR_DELAY_PROB) -> Result:
    side_bar_times = [stochastic_bar_side(rng) for _ in range(N_SIDES)]
    bar_phase      = max(side_bar_times)       # slowest side gates the phase
    bar_idles      = [bar_phase - t for t in side_bar_times]

    weave_phase = WEAVE_PER_SIDE               # all 3 weavers finish simultaneously
    weave_idles = [0.0, 0.0, 0.0]

    cycle_time = T_PRE_FULL + bar_phase + weave_phase
    op_minutes = T_PRE_FULL + 3 * bar_phase + 3 * weave_phase

    idle = {f"bar_op_{i+1}": bar_idles[i] for i in range(N_SIDES)}
    idle.update({f"weave_op_{i+1}": weave_idles[i] for i in range(N_SIDES)})

    slowest = int(np.argmax(side_bar_times)) + 1
    has_defect = any(t > BAR_PER_SIDE for t in side_bar_times)
    bottleneck = f"bar_side_{slowest}_defect" if has_defect else "pre_assembly"

    return Result(cycle_time=cycle_time, idle=idle, op_minutes=op_minutes,
                  n_ops=7, bottleneck=bottleneck)


# ═══════════════════════════════════════════════════════════════════════════════
#  SCENARIO B — Proposed: 1 bar op + 1 weaver (sequential, pipelined)
#  Bar op: sides 1→2→3 sequentially. Weave op: starts each side the moment bars done.
#  Headcount: 3 (1 pre-assembly + 1 bar + 1 weave)
# ═══════════════════════════════════════════════════════════════════════════════

def scenario_B(rng: np.random.Generator, _delay_prob: float = BAR_DELAY_PROB) -> Result:
    side_bar_times = [stochastic_bar_side(rng) for _ in range(N_SIDES)]

    bar_end = [0.0] * N_SIDES
    bar_end[0] = side_bar_times[0]
    bar_end[1] = bar_end[0] + side_bar_times[1]
    bar_end[2] = bar_end[1] + side_bar_times[2]

    weave_start = [0.0] * N_SIDES
    weave_end   = [0.0] * N_SIDES
    weave_start[0] = bar_end[0]
    weave_end[0]   = weave_start[0] + WEAVE_PER_SIDE
    for i in range(1, N_SIDES):
        weave_start[i] = max(weave_end[i - 1], bar_end[i])
        weave_end[i]   = weave_start[i] + WEAVE_PER_SIDE

    weave_idle  = weave_start[0]
    for i in range(1, N_SIDES):
        weave_idle += max(0.0, bar_end[i] - weave_end[i - 1])

    pipeline_end = max(bar_end[-1], weave_end[-1])
    cycle_time   = T_PRE_FULL + pipeline_end
    # Both operators are "on the clock" for the full post-pre-assembly phase
    op_minutes   = T_PRE_FULL + bar_end[-1] + weave_end[-1]

    bottleneck = "bar_op_sequential" if bar_end[-1] >= weave_end[-1] else "weave_op_sequential"

    return Result(
        cycle_time=cycle_time,
        idle={"bar_op": 0.0, "weave_op": weave_idle},
        op_minutes=op_minutes,
        n_ops=3,
        bottleneck=bottleneck,
    )


# ═══════════════════════════════════════════════════════════════════════════════
#  SCENARIO C — Proposed A + supplier screw fix
#  Eliminates STEP2_WASTE (3 min 15 sec) from Step 2.
#  Headcount: 7 (same as A)
# ═══════════════════════════════════════════════════════════════════════════════

def scenario_C(rng: np.random.Generator, _delay_prob: float = BAR_DELAY_PROB) -> Result:
    side_bar_times = [stochastic_bar_side(rng) for _ in range(N_SIDES)]
    bar_phase      = max(side_bar_times)
    bar_idles      = [bar_phase - t for t in side_bar_times]

    weave_phase = WEAVE_PER_SIDE
    weave_idles = [0.0, 0.0, 0.0]

    cycle_time = T_PRE_FIXED + bar_phase + weave_phase   # T_PRE_FIXED: no supplier waste
    op_minutes = T_PRE_FIXED + 3 * bar_phase + 3 * weave_phase

    idle = {f"bar_op_{i+1}": bar_idles[i] for i in range(N_SIDES)}
    idle.update({f"weave_op_{i+1}": weave_idles[i] for i in range(N_SIDES)})

    return Result(cycle_time=cycle_time, idle=idle, op_minutes=op_minutes,
                  n_ops=7, bottleneck="pre_assembly")


# ═══════════════════════════════════════════════════════════════════════════════
#  RUNNER + ANALYSIS
# ═══════════════════════════════════════════════════════════════════════════════

def run_scenario(fn, n_runs: int = N_RUNS, seed: int = 42,
                 bar_delay_prob: float = BAR_DELAY_PROB) -> List[Result]:
    rng = np.random.default_rng(seed)
    return [fn(rng, bar_delay_prob) for _ in range(n_runs)]


def summarize(results: List[Result], hourly_rate: float = OPERATOR_HOURLY_RATE) -> Dict:
    times      = np.array([r.cycle_time for r in results])
    op_mins    = np.array([r.op_minutes for r in results])
    costs      = (op_mins / 60.0) * hourly_rate

    all_keys: set = set()
    for r in results:
        all_keys |= r.idle.keys()
    idle_means = {k: float(np.mean([r.idle.get(k, 0.0) for r in results]))
                  for k in sorted(all_keys)}

    bns, cts = np.unique([r.bottleneck for r in results], return_counts=True)
    bottleneck_dist = dict(zip(bns.tolist(), (cts / len(results)).tolist()))

    return {
        "mean":            float(np.mean(times)),
        "median":          float(np.median(times)),
        "p90":             float(np.percentile(times, 90)),
        "std":             float(np.std(times)),
        "min":             float(np.min(times)),
        "max":             float(np.max(times)),
        "times":           times,
        "idle_means":      idle_means,
        "total_idle":      float(sum(idle_means.values())),
        "mean_op_minutes": float(np.mean(op_mins)),
        "mean_cost":       float(np.mean(costs)),
        "n_ops":           results[0].n_ops,
        "bottleneck_dist": bottleneck_dist,
    }


def print_summary(label: str, s: Dict) -> None:
    print(f"\n{'─' * 66}")
    print(f"  {label}")
    print(f"{'─' * 66}")
    print(f"  Cycle time (min):   Mean={s['mean']:.2f}  Median={s['median']:.2f}  "
          f"P90={s['p90']:.2f}  Std={s['std']:.2f}")
    print(f"  Range: [{s['min']:.2f}, {s['max']:.2f}]")
    print(f"  Headcount:          {s['n_ops']} operators")
    print(f"  Mean op-minutes:    {s['mean_op_minutes']:.1f} min  "
          f"(${s['mean_cost']:.2f}/chair @ ${OPERATOR_HOURLY_RATE:.2f}/hr)")  # PLACEHOLDER rate
    print(f"  Avg idle / operator:")
    for op, idle in s["idle_means"].items():
        print(f"    {op:<24s}  {idle:.2f} min")
    print(f"  Bottleneck(s):")
    for bn, pct in sorted(s["bottleneck_dist"].items(), key=lambda x: -x[1]):
        print(f"    {pct * 100:5.1f}%  {bn}")


# ═══════════════════════════════════════════════════════════════════════════════
#  PLOTS — histograms + scenario comparison
# ═══════════════════════════════════════════════════════════════════════════════

PALETTE = ["#1565C0", "#2E7D32", "#E65100", "#6A1B9A"]
_PLACEHOLDER_NOTE = (
    "⚠  PLACEHOLDER inputs — bar delay 30%, hole defect 10% (+5 min), "
    "rubber ring 15% (+1 min), labor $20/hr\n"
    "Replace with real production data before using these results for decisions."
)


def plot_histograms(all_stats: Dict, path: str = "meritage_histograms.png") -> None:
    fig, axes = plt.subplots(2, 2, figsize=(14, 10))
    axes = axes.flatten()
    for i, (label, s) in enumerate(all_stats.items()):
        ax = axes[i]
        ax.hist(s["times"], bins=50, color=PALETTE[i], alpha=0.80,
                edgecolor="white", linewidth=0.4)
        ax.axvline(s["mean"],   color="crimson",   ls="--", lw=1.8,
                   label=f"Mean   {s['mean']:.1f}")
        ax.axvline(s["median"], color="darkorange", ls="-.", lw=1.8,
                   label=f"Median {s['median']:.1f}")
        ax.axvline(s["p90"],    color="black",      ls=":",  lw=1.8,
                   label=f"P90    {s['p90']:.1f}")
        ax.set_title(label, fontsize=10, fontweight="bold")
        ax.set_xlabel("Cycle Time (min)", fontsize=9)
        ax.set_ylabel("Frequency", fontsize=9)
        ax.legend(fontsize=8)
        ax.grid(axis="y", alpha=0.25)
    fig.suptitle(
        f"TUUCI Meritage 2-Seater — Cycle Time Distributions  (n={N_RUNS:,} runs)\n"
        + _PLACEHOLDER_NOTE,
        fontsize=9.5, fontweight="bold",
    )
    plt.tight_layout()
    fig.savefig(path, dpi=150, bbox_inches="tight")
    plt.close(fig)
    print(f"[saved] {path}")


def plot_comparison(all_stats: Dict, path: str = "meritage_comparison.png") -> None:
    labels = list(all_stats.keys())
    x = np.arange(len(labels))
    w = 0.22

    means      = [s["mean"]   for s in all_stats.values()]
    medians    = [s["median"] for s in all_stats.values()]
    p90s       = [s["p90"]    for s in all_stats.values()]
    total_idle = [s["total_idle"] for s in all_stats.values()]

    fig, (ax1, ax2) = plt.subplots(1, 2, figsize=(16, 6))

    def _annotate(ax, bars):
        for bar in bars:
            h = bar.get_height()
            ax.text(bar.get_x() + bar.get_width() / 2, h + 0.3, f"{h:.1f}",
                    ha="center", va="bottom", fontsize=7)

    b1 = ax1.bar(x - w, means,   w, label="Mean",   color="#1565C0", alpha=0.85)
    b2 = ax1.bar(x,     medians, w, label="Median", color="#2E7D32", alpha=0.85)
    b3 = ax1.bar(x + w, p90s,    w, label="P90",    color="#E65100", alpha=0.85)
    for bars in (b1, b2, b3):
        _annotate(ax1, bars)
    ax1.set_xticks(x)
    ax1.set_xticklabels(labels, rotation=14, ha="right", fontsize=9)
    ax1.set_ylabel("Cycle Time (min)")
    ax1.set_title("Cycle Time by Scenario", fontweight="bold")
    ax1.legend()
    ax1.grid(axis="y", alpha=0.25)

    bars2 = ax2.bar(range(len(labels)), total_idle, color=PALETTE, alpha=0.85)
    _annotate(ax2, bars2)
    ax2.set_xticks(range(len(labels)))
    ax2.set_xticklabels(labels, rotation=14, ha="right", fontsize=9)
    ax2.set_ylabel("Sum of Avg Idle (min, across all operators per chair)")
    ax2.set_title("Total Idle Labor per Chair (Operator-Minutes)", fontweight="bold")
    ax2.grid(axis="y", alpha=0.25)

    fig.suptitle(
        "TUUCI Meritage 2-Seater — Scenario Comparison\n" + _PLACEHOLDER_NOTE,
        fontsize=9.5, fontweight="bold",
    )
    plt.tight_layout()
    fig.savefig(path, dpi=150, bbox_inches="tight")
    plt.close(fig)
    print(f"[saved] {path}")


# ═══════════════════════════════════════════════════════════════════════════════
#  SENSITIVITY ANALYSIS — sweep BAR_DELAY_PROB from 0% → 100%
#
#  Only scenario_current is affected by bar_delay_prob (proposed scenarios do not
#  model out-of-sequence bar attachment).  Proposed lines appear flat.
#
#  Two panels:
#    Left  — Mean cycle time vs. delay frequency
#    Right — Total idle operator-minutes vs. delay frequency
# ═══════════════════════════════════════════════════════════════════════════════

def sensitivity_bar_delay(
    sweep: List[float] = None,
    n_runs: int = N_RUNS,
    path: str = "meritage_sensitivity.png",
) -> None:
    if sweep is None:
        sweep = [round(p, 2) for p in np.arange(0.0, 1.01, 0.10)]  # 0% to 100% in 10% steps

    print(f"\n  Running sensitivity sweep ({len(sweep)} delay levels × {len(SCENARIOS)} scenarios) ...")

    # Results indexed as {scenario_label: {delay_prob: stats}}
    sweep_results: Dict[str, Dict[float, Dict]] = {label: {} for label in SCENARIOS}

    for prob in sweep:
        for label, fn in SCENARIOS.items():
            results = run_scenario(fn, n_runs=n_runs, seed=42, bar_delay_prob=prob)
            sweep_results[label][prob] = summarize(results)

    pct_labels = [f"{int(p * 100)}%" for p in sweep]
    x = np.arange(len(sweep))

    fig, (ax1, ax2) = plt.subplots(1, 2, figsize=(16, 6))

    for i, (label, prob_dict) in enumerate(sweep_results.items()):
        means      = [prob_dict[p]["mean"]       for p in sweep]
        idle_totals = [prob_dict[p]["total_idle"] for p in sweep]
        ax1.plot(x, means,       color=PALETTE[i], marker="o", ms=4, lw=2, label=label)
        ax2.plot(x, idle_totals, color=PALETTE[i], marker="s", ms=4, lw=2, label=label)

    for ax, ylabel, title in [
        (ax1, "Mean Cycle Time (min)",
         "Mean Cycle Time vs. Bar Delay Frequency"),
        (ax2, "Total Idle Operator-Minutes per Chair",
         "Idle Labor Waste vs. Bar Delay Frequency"),
    ]:
        ax.set_xticks(x)
        ax.set_xticklabels(pct_labels, fontsize=9)
        ax.set_xlabel("Bar Delay Probability  [PLACEHOLDER — needs real data]", fontsize=9)
        ax.set_ylabel(ylabel)
        ax.set_title(title, fontweight="bold")
        ax.legend(fontsize=8)
        ax.grid(alpha=0.25)

    fig.suptitle(
        "TUUCI Meritage 2-Seater — Sensitivity: Bar Delay Frequency\n" + _PLACEHOLDER_NOTE,
        fontsize=9.5, fontweight="bold",
    )
    plt.tight_layout()
    fig.savefig(path, dpi=150, bbox_inches="tight")
    plt.close(fig)
    print(f"[saved] {path}")


# ═══════════════════════════════════════════════════════════════════════════════
#  LABOR COST MODEL
#
#  cost_per_chair = (mean_op_minutes / 60) × OPERATOR_HOURLY_RATE   [PLACEHOLDER rate]
#
#  op_minutes = sum of all operators' clock-in minutes for one chair:
#    - Current State (3 ops): assembly+bar op + 2 weavers (including idle)
#    - Proposed A/C (7 ops):  1 pre-asm op + 3 bar ops (bar_phase each) + 3 weavers
#    - Proposed B   (3 ops):  1 pre-asm op + bar op (seq time) + weave op (seq time)
# ═══════════════════════════════════════════════════════════════════════════════

def print_cost_model(all_stats: Dict) -> None:
    print(f"\n{'═' * 66}")
    print(f"  LABOR COST MODEL  (@ ${OPERATOR_HOURLY_RATE:.2f}/hr — PLACEHOLDER rate)")
    print(f"{'═' * 66}")
    print(f"  {'Scenario':<36} {'Ops':>4}  {'Op-min':>7}  {'$/chair':>8}")
    print(f"  {'─'*36}  {'─'*4}  {'─'*7}  {'─'*8}")
    for label, s in all_stats.items():
        print(f"  {label:<36} {s['n_ops']:>4}  {s['mean_op_minutes']:>7.1f}  "
              f"${s['mean_cost']:>7.2f}")
    print(f"\n  ⚠ PLACEHOLDER: OPERATOR_HOURLY_RATE = ${OPERATOR_HOURLY_RATE:.2f}/hr")
    print(f"    Update with burdened labor rate (wages + benefits + overhead).")
    print(f"    Note: op-minutes includes idle time — idle workers still cost money.")


def plot_cost_model(all_stats: Dict, path: str = "meritage_cost.png") -> None:
    labels     = list(all_stats.keys())
    op_mins    = [s["mean_op_minutes"] for s in all_stats.values()]
    costs      = [s["mean_cost"]       for s in all_stats.values()]
    n_ops_list = [s["n_ops"]           for s in all_stats.values()]

    x = np.arange(len(labels))
    w = 0.35

    fig, (ax1, ax2) = plt.subplots(1, 2, figsize=(16, 6))

    def _annotate(ax, bars, fmt):
        for bar in bars:
            h = bar.get_height()
            ax.text(bar.get_x() + bar.get_width() / 2, h + 0.3,
                    fmt.format(h), ha="center", va="bottom", fontsize=8)

    # Left: cost per chair
    b1 = ax1.bar(x, costs, color=PALETTE, alpha=0.85)
    _annotate(ax1, b1, "${:.2f}")
    ax1.set_xticks(x)
    ax1.set_xticklabels(labels, rotation=14, ha="right", fontsize=9)
    ax1.set_ylabel(f"Labor Cost per Chair ($)  [@ ${OPERATOR_HOURLY_RATE:.2f}/hr — PLACEHOLDER]")
    ax1.set_title("Labor Cost per Chair by Scenario", fontweight="bold")
    ax1.grid(axis="y", alpha=0.25)

    # Right: op-minutes breakdown (stacked: active vs idle)
    active_mins = [s["mean_op_minutes"] - s["total_idle"] for s in all_stats.values()]
    idle_mins   = [s["total_idle"] for s in all_stats.values()]
    b_active = ax2.bar(x, active_mins, w * 2, label="Active",  color="#43A047", alpha=0.85)
    b_idle   = ax2.bar(x, idle_mins,   w * 2, label="Idle",    color="#EF5350", alpha=0.85,
                       bottom=active_mins)
    # Label headcount on each bar
    for i, (bar, n) in enumerate(zip(b_active, n_ops_list)):
        total_h = active_mins[i] + idle_mins[i]
        ax2.text(bar.get_x() + bar.get_width() / 2, total_h + 0.5,
                 f"{n} ops\n{total_h:.0f} min",
                 ha="center", va="bottom", fontsize=8)
    ax2.set_xticks(x)
    ax2.set_xticklabels(labels, rotation=14, ha="right", fontsize=9)
    ax2.set_ylabel("Total Operator-Minutes per Chair")
    ax2.set_title("Active vs Idle Labor per Chair", fontweight="bold")
    ax2.legend()
    ax2.grid(axis="y", alpha=0.25)

    fig.suptitle(
        f"TUUCI Meritage 2-Seater — Labor Cost Model  [PLACEHOLDER rate: ${OPERATOR_HOURLY_RATE:.2f}/hr]\n"
        + _PLACEHOLDER_NOTE,
        fontsize=9.5, fontweight="bold",
    )
    plt.tight_layout()
    fig.savefig(path, dpi=150, bbox_inches="tight")
    plt.close(fig)
    print(f"[saved] {path}")


# ═══════════════════════════════════════════════════════════════════════════════
#  CSV EXPORT
#  One row per scenario — ready to paste into PowerPoint / Excel
# ═══════════════════════════════════════════════════════════════════════════════

def export_csv(all_stats: Dict, path: str = "meritage_results.csv") -> None:
    fieldnames = [
        "scenario",
        "n_ops",
        "mean_cycle_time_min",
        "median_cycle_time_min",
        "p90_cycle_time_min",
        "std_cycle_time_min",
        "min_cycle_time_min",
        "max_cycle_time_min",
        "total_idle_operator_min",
        "mean_op_minutes",
        "labor_cost_per_chair_usd",
        "labor_rate_per_hr_usd",   # PLACEHOLDER label
        "bar_delay_prob",           # PLACEHOLDER label
        "hole_defect_prob",         # PLACEHOLDER label
        "rubber_ring_prob",         # PLACEHOLDER label
        "n_simulation_runs",
    ]
    with open(path, "w", newline="") as fh:
        writer = csv.DictWriter(fh, fieldnames=fieldnames)
        writer.writeheader()
        for label, s in all_stats.items():
            writer.writerow({
                "scenario":                  label,
                "n_ops":                     s["n_ops"],
                "mean_cycle_time_min":       round(s["mean"],            2),
                "median_cycle_time_min":     round(s["median"],          2),
                "p90_cycle_time_min":        round(s["p90"],             2),
                "std_cycle_time_min":        round(s["std"],             2),
                "min_cycle_time_min":        round(s["min"],             2),
                "max_cycle_time_min":        round(s["max"],             2),
                "total_idle_operator_min":   round(s["total_idle"],      2),
                "mean_op_minutes":           round(s["mean_op_minutes"], 2),
                "labor_cost_per_chair_usd":  round(s["mean_cost"],       2),
                "labor_rate_per_hr_usd":     f"{OPERATOR_HOURLY_RATE} PLACEHOLDER",
                "bar_delay_prob":            f"{BAR_DELAY_PROB} PLACEHOLDER",
                "hole_defect_prob":          f"{HOLE_DEFECT_PROB} PLACEHOLDER",
                "rubber_ring_prob":          f"{RUBBER_RING_PROB} PLACEHOLDER",
                "n_simulation_runs":         N_RUNS,
            })
    print(f"[saved] {path}")


# ═══════════════════════════════════════════════════════════════════════════════
#  SCENARIO REGISTRY
# ═══════════════════════════════════════════════════════════════════════════════

SCENARIOS = {
    "1. Current State":                 scenario_current,
    "2. Proposed A (3+3 parallel)":     scenario_A,
    "3. Proposed B (1 bar + 1 weave)":  scenario_B,
    "4. Proposed C (A + supplier fix)": scenario_C,
}


# ═══════════════════════════════════════════════════════════════════════════════
#  MAIN
# ═══════════════════════════════════════════════════════════════════════════════

def main() -> None:
    print("=" * 66)
    print("  TUUCI Meritage 2-Seater Assembly Line — DES")
    print(f"  {N_RUNS:,} replications per scenario | seed=42")
    print("=" * 66)
    print("\n  ⚠ PLACEHOLDER inputs (validate with real production data):")
    print(f"    BAR_DELAY_PROB        = {BAR_DELAY_PROB:.0%}   # PLACEHOLDER")
    print(f"    HOLE_DEFECT_PROB      = {HOLE_DEFECT_PROB:.0%}  # PLACEHOLDER")
    print(f"    RUBBER_RING_PROB      = {RUBBER_RING_PROB:.0%}  # PLACEHOLDER")
    print(f"    OPERATOR_HOURLY_RATE  = ${OPERATOR_HOURLY_RATE:.2f}/hr  # PLACEHOLDER")

    # ── Base scenario runs ───────────────────────────────────────────────────
    all_stats: Dict[str, Dict] = {}
    for label, fn in SCENARIOS.items():
        results = run_scenario(fn)
        all_stats[label] = summarize(results)
        print_summary(label, all_stats[label])

    print()
    plot_histograms(all_stats)
    plot_comparison(all_stats)

    # ── Labor cost model ─────────────────────────────────────────────────────
    print_cost_model(all_stats)
    plot_cost_model(all_stats)

    # ── Sensitivity analysis ─────────────────────────────────────────────────
    sensitivity_bar_delay()

    # ── CSV export ───────────────────────────────────────────────────────────
    export_csv(all_stats)

    print("\n  Done. Charts and CSV saved to working directory.")
    print("  Output files:")
    print("    meritage_histograms.png   — cycle time distributions")
    print("    meritage_comparison.png   — cycle time + idle labor comparison")
    print("    meritage_cost.png         — labor cost model")
    print("    meritage_sensitivity.png  — sensitivity to bar delay frequency")
    print("    meritage_results.csv      — all metrics, paste into PowerPoint/Excel")


if __name__ == "__main__":
    main()
