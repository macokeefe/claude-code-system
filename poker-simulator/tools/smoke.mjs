import * as E from "../public/engine.js";

const TOTAL = E.START_STACK * 6;
let games = 0, hands = 0;
for (let seed = 1; seed <= 30; seed++) {
  const g = E.newGame(seed, ["viktor", "lena", "sonny", "gus", "rita"]);
  g.players[0].persona = E.PERSONAS.lena; // hero plays like a balanced pro
  let guard = 0;
  while (!g.over && guard++ < 3000) {
    E.startHand(g);
    hands++;
    let acts = 0;
    while (g.toAct !== -1 && acts++ < 200) {
      const evs = E.act(g, E.aiDecide(g, g.toAct));
      if (acts >= 200) throw new Error("betting loop did not terminate");
      void evs;
    }
    const sum = g.players.reduce((s, p) => s + p.stack + p.commit, 0);
    if (sum !== TOTAL) throw new Error(`chip leak: ${sum} != ${TOTAL} (seed ${seed}, hand ${g.handNum})`);
    for (const p of g.players) if (p.stack < 0) throw new Error("negative stack");
  }
  if (!g.over) throw new Error(`game ${seed} did not finish in 3000 hands`);
  games++;
}
console.log(`OK: ${games} games, ${hands} hands, chips conserved, all terminated`);
