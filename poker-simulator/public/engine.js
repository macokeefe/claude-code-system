// Midnight Felt — pure game engine (no DOM, no timers). Deterministic given a seed.

export function mulberry32(seed) {
  let a = seed >>> 0;
  return function () {
    a |= 0; a = (a + 0x6D2B79F5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

// Cards are ints 0..51: rank = c % 13 (0='2' .. 12='A'), suit = (c / 13) | 0.
export const rankOf = (c) => c % 13;
export const suitOf = (c) => (c / 13) | 0;

export function shuffledDeck(rng) {
  const d = Array.from({ length: 52 }, (_, i) => i);
  for (let i = 51; i > 0; i--) {
    const j = (rng() * (i + 1)) | 0;
    [d[i], d[j]] = [d[j], d[i]];
  }
  return d;
}

// ---------- hand evaluation ----------
// rank5 returns an integer; higher wins. Category occupies the top digits.
function rank5(cs) {
  const ranks = cs.map(rankOf).sort((a, b) => b - a);
  const flush = cs.every((c) => suitOf(c) === suitOf(cs[0]));
  const counts = new Map();
  for (const r of ranks) counts.set(r, (counts.get(r) || 0) + 1);
  // groups sorted by count desc, then rank desc
  const groups = [...counts.entries()].sort((a, b) => b[1] - a[1] || b[0] - a[0]);
  // straight: unique ranks descending, wheel A-5 special case
  let straightHigh = -1;
  const uniq = [...counts.keys()].sort((a, b) => b - a);
  if (uniq.length === 5) {
    if (uniq[0] - uniq[4] === 4) straightHigh = uniq[0];
    else if (uniq[0] === 12 && uniq[1] === 3) straightHigh = 3; // A2345, high card '5'
  }
  const pack = (cat, ks) => {
    let v = cat;
    for (let i = 0; i < 5; i++) v = v * 13 + (ks[i] ?? 0);
    return v;
  };
  if (flush && straightHigh >= 0) return pack(8, [straightHigh]);
  if (groups[0][1] === 4) return pack(7, [groups[0][0], groups[1][0]]);
  if (groups[0][1] === 3 && groups[1][1] === 2) return pack(6, [groups[0][0], groups[1][0]]);
  if (flush) return pack(5, ranks);
  if (straightHigh >= 0) return pack(4, [straightHigh]);
  if (groups[0][1] === 3) return pack(3, [groups[0][0], groups[1][0], groups[2][0]]);
  if (groups[0][1] === 2 && groups[1][1] === 2)
    return pack(2, [groups[0][0], groups[1][0], groups[2][0]]);
  if (groups[0][1] === 2)
    return pack(1, [groups[0][0], groups[1][0], groups[2][0], groups[3][0]]);
  return pack(0, ranks);
}

const COMBOS_7C5 = [];
for (let a = 0; a < 7; a++) for (let b = a + 1; b < 7; b++)
  for (let c = b + 1; c < 7; c++) for (let d = c + 1; d < 7; d++)
    for (let e = d + 1; e < 7; e++) COMBOS_7C5.push([a, b, c, d, e]);

export function evaluate7(cards) {
  let best = -1;
  for (const idx of COMBOS_7C5) {
    const v = rank5(idx.map((i) => cards[i]));
    if (v > best) best = v;
  }
  return best;
}
export const handCategory = (v) => (v / (13 ** 5)) | 0; // 0..8 → name lives in strings

// ---------- game state ----------
export const PERSONAS = {
  viktor: { loose: 0.35, aggr: 0.80, bluff: 0.15, sticky: 0.30 },
  lena:   { loose: 0.50, aggr: 0.55, bluff: 0.12, sticky: 0.50 },
  sonny:  { loose: 0.75, aggr: 0.85, bluff: 0.25, sticky: 0.45 },
  gus:    { loose: 0.25, aggr: 0.30, bluff: 0.04, sticky: 0.25 },
  rita:   { loose: 0.80, aggr: 0.25, bluff: 0.05, sticky: 0.85 },
};

export const START_STACK = 1000;
export const BASE_SB = 5;
export const BLIND_LEVEL_HANDS = 8;
export const MAX_BLIND_LEVEL = 4;

export function newGame(seed, aiIds) {
  const players = [{ id: "hero", ai: false, stack: START_STACK }];
  for (const id of aiIds) players.push({ id, ai: true, persona: PERSONAS[id], stack: START_STACK });
  for (const p of players) Object.assign(p, {
    hole: [], bet: 0, commit: 0, folded: true, allIn: false, out: false, acted: false,
  });
  return {
    rng: mulberry32(seed), players, button: 0, handNum: 0,
    deck: [], board: [], street: -1, toAct: -1,
    currentBet: 0, minRaise: 0, over: false, lastResult: null,
  };
}

const live = (g) => g.players.map((p, i) => i).filter((i) => !g.players[i].out);
const nextLive = (g, i) => { do { i = (i + 1) % g.players.length; } while (g.players[i].out); return i; };
const inHand = (g) => g.players.map((p, i) => i).filter((i) => !g.players[i].folded);
const canActSeats = (g) => inHand(g).filter((i) => !g.players[i].allIn && g.players[i].stack > 0);

export function blinds(g) {
  const lvl = Math.min((g.handNum / BLIND_LEVEL_HANDS) | 0, MAX_BLIND_LEVEL);
  const sb = BASE_SB * (2 ** lvl);
  return { sb, bb: sb * 2 };
}

function post(g, seat, amount) {
  const p = g.players[seat];
  const a = Math.min(amount, p.stack);
  p.stack -= a; p.bet += a; p.commit += a;
  if (p.stack === 0) p.allIn = true;
  return a;
}

export function startHand(g) {
  const seats = live(g);
  for (const p of g.players) Object.assign(p, {
    hole: [], bet: 0, commit: 0, folded: p.out, allIn: false, acted: false, revealed: false,
  });
  g.deck = shuffledDeck(g.rng);
  g.board = [];
  g.street = 0;
  g.lastResult = null;
  g.button = nextLive(g, g.button);
  const { sb, bb } = blinds(g);
  const hu = seats.length === 2;
  const sbSeat = hu ? g.button : nextLive(g, g.button);
  const bbSeat = nextLive(g, sbSeat);
  post(g, sbSeat, sb);
  post(g, bbSeat, bb);
  g.currentBet = bb;
  g.minRaise = bb;
  for (const i of seats) g.players[i].hole = [g.deck.pop(), g.deck.pop()];
  g.toAct = nextLive(g, bbSeat);
  g.sbSeat = sbSeat; g.bbSeat = bbSeat;
  g.handNum++;
  // everyone with chips still owes action; all-in blinds don't act
  for (const i of seats) g.players[i].acted = g.players[i].allIn;
  skipToActor(g);
  return { sb, bb, sbSeat, bbSeat };
}

function skipToActor(g) {
  const able = canActSeats(g);
  if (able.length === 0) { g.toAct = -1; return; }
  let guard = 0;
  while ((g.players[g.toAct].folded || g.players[g.toAct].allIn || g.players[g.toAct].out) && guard++ < 12)
    g.toAct = nextLive(g, g.toAct);
}

export function legalActions(g) {
  const p = g.players[g.toAct];
  const owe = g.currentBet - p.bet;
  const callAmt = Math.min(owe, p.stack);
  const canCheck = owe === 0;
  const minTo = Math.min(g.currentBet + g.minRaise, p.bet + p.stack);
  const maxTo = p.bet + p.stack;
  const canRaise = maxTo > g.currentBet && canActSeats(g).length > 1;
  return { canCheck, callAmt, canRaise, minRaiseTo: minTo, maxRaiseTo: maxTo };
}

export const potTotal = (g) => g.players.reduce((s, p) => s + p.commit, 0);

// Applies one action for g.toAct. Returns a list of events for the UI to pace.
export function act(g, action) {
  const seat = g.toAct;
  const p = g.players[seat];
  const events = [{ t: "action", seat, action: { ...action } }];
  if (action.type === "fold") {
    p.folded = true;
  } else if (action.type === "check") {
    p.acted = true;
  } else if (action.type === "call") {
    post(g, seat, g.currentBet - p.bet);
    p.acted = true;
  } else if (action.type === "raise") {
    const to = Math.min(action.to, p.bet + p.stack);
    const inc = to - g.currentBet;
    post(g, seat, to - p.bet);
    if (inc >= g.minRaise) g.minRaise = inc; // short all-ins don't reopen
    g.currentBet = Math.max(g.currentBet, to);
    p.acted = true;
    for (const i of inHand(g)) if (i !== seat && !g.players[i].allIn) g.players[i].acted = false;
  }
  events[0].action.paid = p.bet;

  const alive = inHand(g);
  if (alive.length === 1) { finishHand(g, events, false); return events; }

  // street complete?
  const pending = canActSeats(g).filter((i) => !g.players[i].acted || g.players[i].bet < g.currentBet);
  if (pending.length === 0 || (canActSeats(g).length <= 1 && pending.length === 0)) {
    advanceStreet(g, events);
  } else {
    g.toAct = nextLive(g, seat);
    skipToActor(g);
  }
  return events;
}

function dealBoard(g, n, events) {
  const cards = [];
  for (let i = 0; i < n; i++) cards.push(g.deck.pop());
  g.board.push(...cards);
  events.push({ t: "street", street: g.street, cards, board: [...g.board] });
}

function advanceStreet(g, events) {
  for (const p of g.players) { p.bet = 0; p.acted = false; }
  g.currentBet = 0;
  g.minRaise = blinds(g).bb;
  const able = canActSeats(g);
  if (able.length <= 1) {
    // run out remaining board, then showdown
    while (g.street < 3) { g.street++; dealBoard(g, g.street === 1 ? 3 : 1, events); }
    finishHand(g, events, true);
    return;
  }
  if (g.street === 3) { finishHand(g, events, true); return; }
  g.street++;
  dealBoard(g, g.street === 1 ? 3 : 1, events);
  g.toAct = nextLive(g, g.button);
  skipToActor(g);
  for (const i of able) g.players[i].acted = false;
}

function finishHand(g, events, showdown) {
  const contenders = inHand(g);
  const results = []; // {seat, amount, value}
  if (!showdown || contenders.length === 1) {
    const seat = contenders[0];
    const amount = potTotal(g);
    g.players[seat].stack += amount;
    results.push({ seat, amount, value: -1 });
    events.push({ t: "handEnd", showdown: false, results, board: [...g.board] });
  } else {
    const values = {};
    for (const i of contenders) {
      values[i] = evaluate7([...g.players[i].hole, ...g.board]);
      g.players[i].revealed = true;
    }
    // side pots from commit levels
    const levels = [...new Set(g.players.filter((p) => p.commit > 0).map((p) => p.commit))].sort((a, b) => a - b);
    const won = new Map();
    let prev = 0;
    for (const lv of levels) {
      let pot = 0;
      for (const p of g.players) pot += Math.max(0, Math.min(p.commit, lv) - prev);
      const elig = contenders.filter((i) => g.players[i].commit >= lv);
      const best = Math.max(...elig.map((i) => values[i]));
      const winners = elig.filter((i) => values[i] === best);
      const share = (pot / winners.length) | 0;
      let rem = pot - share * winners.length;
      for (const w of winners) {
        const amt = share + (rem-- > 0 ? 1 : 0);
        won.set(w, (won.get(w) || 0) + amt);
      }
      prev = lv;
    }
    for (const [seat, amount] of won) {
      g.players[seat].stack += amount;
      results.push({ seat, amount, value: values[seat] });
    }
    results.sort((a, b) => b.amount - a.amount);
    events.push({ t: "handEnd", showdown: true, results, values, board: [...g.board] });
  }
  for (const p of g.players) { p.commit = 0; p.bet = 0; }
  for (const p of g.players) if (p.stack === 0 && !p.out) { p.out = true; events.push({ t: "bust", seat: g.players.indexOf(p) }); }
  g.toAct = -1;
  g.street = -1;
  const hero = g.players[0];
  const remaining = live(g);
  if (hero.out) { g.over = true; events.push({ t: "gameOver", win: false }); }
  else if (remaining.length === 1) { g.over = true; events.push({ t: "gameOver", win: true }); }
  g.lastResult = events[events.length - 1];
}

// ---------- AI ----------
function chenStrength(hole) {
  const r1 = Math.max(rankOf(hole[0]), rankOf(hole[1]));
  const r2 = Math.min(rankOf(hole[0]), rankOf(hole[1]));
  const suited = suitOf(hole[0]) === suitOf(hole[1]);
  const pts = (r) => (r === 12 ? 10 : r === 11 ? 8 : r === 10 ? 7 : r === 9 ? 6 : (r + 2) / 2);
  let s = pts(r1);
  if (r1 === r2) s = Math.max(s * 2, 5);
  if (suited) s += 2;
  const gap = r1 - r2;
  if (r1 !== r2) s -= gap === 1 ? 0 : gap === 2 ? 1 : gap === 3 ? 2 : gap === 4 ? 4 : 5;
  if (gap <= 2 && r1 < 10 && r1 !== r2) s += 1;
  return Math.max(0, Math.min(1, s / 20));
}

function equityVs(g, seat, opps, iters) {
  const me = g.players[seat];
  const used = new Set([...me.hole, ...g.board]);
  const pool = [];
  for (let c = 0; c < 52; c++) if (!used.has(c)) pool.push(c);
  let wins = 0;
  const k = Math.min(opps, 3);
  for (let it = 0; it < iters; it++) {
    // partial Fisher-Yates over a copy-by-index trick
    const idx = pool.slice();
    for (let i = idx.length - 1; i > idx.length - 1 - (2 * k + (5 - g.board.length)); i--) {
      const j = (g.rng() * (i + 1)) | 0;
      [idx[i], idx[j]] = [idx[j], idx[i]];
    }
    let ptr = idx.length - 1;
    const draw = () => idx[ptr--];
    const board = [...g.board];
    while (board.length < 5) board.push(draw());
    const myV = evaluate7([...me.hole, ...board]);
    let best = true, tie = false;
    for (let o = 0; o < k; o++) {
      const v = evaluate7([draw(), draw(), ...board]);
      if (v > myV) { best = false; break; }
      if (v === myV) tie = true;
    }
    if (best) wins += tie ? 0.5 : 1;
  }
  return wins / iters;
}

export function aiDecide(g, seat) {
  const p = g.players[seat];
  const ps = p.persona;
  const { canCheck, callAmt, canRaise, minRaiseTo, maxRaiseTo } = legalActions(g);
  const opps = inHand(g).length - 1;
  const rng = g.rng;
  let strength;
  if (g.street === 0 && g.board.length === 0) strength = chenStrength(p.hole);
  else strength = equityVs(g, seat, opps, 48);
  // multiway pressure
  if (g.street === 0) strength *= 1 - 0.04 * Math.max(0, opps - 1);

  const pot = potTotal(g);
  const potOdds = callAmt > 0 ? callAmt / (pot + callAmt) : 0;
  const jitter = (rng() - 0.5) * 0.08;
  const s = Math.max(0, Math.min(1, strength + jitter));

  const raiseTo = (frac) => {
    const target = Math.max(minRaiseTo, (g.currentBet + pot * frac) | 0);
    return Math.min(maxRaiseTo, target);
  };

  // strong: raise/bet
  const raiseBar = 0.62 - ps.aggr * 0.18;
  if (canRaise && s > raiseBar && rng() < 0.35 + ps.aggr * 0.55) {
    return { type: "raise", to: raiseTo(s > 0.85 ? 1.0 : 0.66) };
  }
  if (canCheck) {
    // bluff stab sometimes
    if (canRaise && rng() < ps.bluff * (g.street > 0 ? 1 : 0.4)) {
      return { type: "raise", to: raiseTo(0.5) };
    }
    return { type: "check" };
  }
  // facing a bet
  const need = potOdds * (1.25 - ps.sticky * 0.55) + (g.street === 0 ? (0.32 - ps.loose * 0.22) : 0.05);
  const stackPressure = callAmt / Math.max(1, p.stack + callAmt);
  if (s >= need + stackPressure * (0.35 - ps.sticky * 0.2)) {
    if (canRaise && s > 0.8 && rng() < ps.aggr * 0.6) return { type: "raise", to: raiseTo(0.85) };
    return { type: "call" };
  }
  // occasional float / bluff-raise
  if (canRaise && rng() < ps.bluff * 0.25 && callAmt < p.stack * 0.15) {
    return { type: "raise", to: raiseTo(0.6) };
  }
  if (callAmt === 0) return { type: "check" };
  return { type: "fold" };
}
