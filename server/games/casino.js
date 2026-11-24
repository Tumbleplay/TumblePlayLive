import { db, tx } from '../db.js';
import { draw } from '../fair.js';
import { wager, settle, balanceOf } from '../wallet.js';
import { AppError, parseAmount, pickInt, pickOne } from '../util.js';
import { CENTS, MAX_BET, MAX_WIN } from '../config.js';
import { toAll } from '../bus.js';
import { peekRule, consumeRule } from '../gm.js';
import * as M from '../../shared/math.js';

export const INSTANT = ['dice', 'limbo', 'plinko', 'keno', 'wheel'];
const insertBet = db.prepare('INSERT INTO bets(user_id,game,amount,multiplier,payout,seed_id,nonce,detail,created_at) VALUES (?,?,?,?,?,?,?,?,?)');

export function recordBet(user, game, amount, multiplier, payout, seedId, nonce, detail) {
  const r = insertBet.run(user.id, game, amount, multiplier, payout, seedId, nonce, JSON.stringify(detail), Date.now());
  return r.lastInsertRowid;
}
export function announce(user, game, betId, amount, multiplier, payout) {
  toAll('bet', { id: `${game}-${betId}`, game, username: user.username, hue: user.hue, amount: amount / CENTS, multiplier, payout: payout / CENTS, at: Date.now() });
}

const pickRand = arr => arr[Math.floor(Math.random() * arr.length)];
function shuffle(arr) {
  const a = [...arr];
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

function buildPlinkoPathForBucket(rows, targetBucket) {
  const hiGoesRight = M.plinkoBucket(M.plinkoPath(Array(rows).fill(0.99), rows)) === rows;
  const incFloat = hiGoesRight ? 0.99 : 0.01;
  const decFloat = hiGoesRight ? 0.01 : 0.99;
  const syn = shuffle([
    ...Array(targetBucket).fill(incFloat),
    ...Array(rows - targetBucket).fill(decFloat)
  ]);
  return M.plinkoPath(syn, rows);
}

function applyInstantOverride(game, mode, p, base) {
  if (mode === 'normal') return base;
  switch (game) {
    case 'dice': {
      const chance = p.direction === 'over' ? 100 - p.target : p.target;
      const wantWin = mode === 'win';
      if (base.result.win === wantWin) return base;
      let roll;
      if (wantWin) {
        roll = p.direction === 'over'
          ? Math.min(99.99, p.target + 0.01 + Math.random() * Math.max(0.01, 99.98 - p.target))
          : Math.max(0, Math.random() * Math.max(0.01, p.target - 0.01));
      } else {
        roll = p.direction === 'over'
          ? Math.random() * p.target
          : Math.min(99.99, p.target + Math.random() * (99.99 - p.target));
      }
      roll = Math.round(roll * 100) / 100;
      const win = p.direction === 'over' ? roll > p.target : roll < p.target;
      return { multiplier: win ? M.diceMultiplier(chance) : 0, result: { roll, target: p.target, direction: p.direction, win } };
    }
    case 'limbo': {
      const wantWin = mode === 'win';
      if (base.result.win === wantWin) return base;
      let point;
      if (wantWin) {
        point = Math.round((p.target + Math.random() * Math.max(0.25, p.target * 0.6)) * 100) / 100;
      } else {
        const cap = Math.max(1.0, p.target - 0.01);
        point = Math.floor((1.0 + Math.random() * Math.max(0, cap - 1.0)) * 100) / 100;
        if (point >= p.target) point = 1.0;
      }
      const win = point >= p.target;
      return { multiplier: win ? p.target : 0, result: { point, target: p.target, win } };
    }
    case 'plinko': {
      const table = M.plinkoTable(p.rows, p.risk);
      const idxs = table.map((m, i) => ({ m, i }));
      let pool = mode === 'loss' ? idxs.filter(x => x.m < 1) : idxs.filter(x => x.m > 1);
      if (!pool.length) {
        const edge = mode === 'loss' ? Math.min(...table) : Math.max(...table);
        pool = idxs.filter(x => x.m === edge);
      }
      if (mode === 'loss') {
        const minM = Math.min(...pool.map(x => x.m));
        const lowest = pool.filter(x => x.m <= minM * 1.25);
        pool = lowest.length ? lowest : pool;
      }
      const chosen = pickRand(pool).i;
      const path = buildPlinkoPathForBucket(p.rows, chosen);
      const bucket = M.plinkoBucket(path);
      return { multiplier: table[bucket], result: { path, bucket, rows: p.rows, risk: p.risk } };
    }
    case 'keno': {
      const table = M.KENO[p.risk][p.picks.length];
      const tiers = table.map((m, hits) => ({ hits, m }));
      let pool = mode === 'loss' ? tiers.filter(t => t.m < 1) : tiers.filter(t => t.m > 1);
      if (!pool.length) {
        const targetM = mode === 'loss' ? Math.min(...table) : Math.max(...table);
        pool = tiers.filter(t => t.m === targetM);
      }
      const wantHits = mode === 'loss'
        ? pickRand(pool.filter(t => t.m === 0).length ? pool.filter(t => t.m === 0) : pool).hits
        : pool[Math.min(pool.length - 1, Math.floor(Math.random() * Math.min(pool.length, 3)))].hits;

      const nonPicks = [];
      for (let n = 1; n <= 40; n++) if (!p.picks.includes(n)) nonPicks.push(n);
      const chosenHits = shuffle(p.picks).slice(0, wantHits);
      const chosenMisses = shuffle(nonPicks).slice(0, 10 - wantHits);
      const drawn = shuffle([...chosenHits, ...chosenMisses]);
      const hits = p.picks.filter(n => drawn.includes(n));
      return { multiplier: table[hits.length], result: { drawn, hits, picks: p.picks, risk: p.risk } };
    }
    case 'wheel': {
      const table = M.wheelTable(p.segments, p.risk);
      const idxs = table.map((m, i) => ({ m, i }));
      let pool = mode === 'loss' ? idxs.filter(x => x.m < 1) : idxs.filter(x => x.m > 1);
      if (!pool.length) {
        const edge = mode === 'loss' ? Math.min(...table) : Math.max(...table);
        pool = idxs.filter(x => x.m === edge);
      }
      const index = pickRand(pool).i;
      return { multiplier: table[index], result: { index, segments: p.segments, risk: p.risk } };
    }
  }
  return base;
}

export function resolve(game, f, p) {
  switch (game) {
    case 'dice': {
      const roll = M.diceRoll(f), chance = p.direction === 'over' ? 100 - p.target : p.target;
      const win = p.direction === 'over' ? roll > p.target : roll < p.target;
      return { multiplier: win ? M.diceMultiplier(chance) : 0, result: { roll, target: p.target, direction: p.direction, win } };
    }
    case 'limbo': {
      const point = M.crashPoint(f), win = point >= p.target;
      return { multiplier: win ? p.target : 0, result: { point, target: p.target, win } };
    }
    case 'plinko': {
      const path = M.plinkoPath(f, p.rows), bucket = M.plinkoBucket(path);
      return { multiplier: M.plinkoTable(p.rows, p.risk)[bucket], result: { path, bucket, rows: p.rows, risk: p.risk } };
    }
    case 'keno': {
      const drawn = M.kenoDraw(f), hits = p.picks.filter(n => drawn.includes(n));
      return { multiplier: M.KENO[p.risk][p.picks.length][hits.length], result: { drawn, hits, picks: p.picks, risk: p.risk } };
    }
    case 'wheel': {
      const index = M.wheelIndex(f, p.segments);
      return { multiplier: M.wheelTable(p.segments, p.risk)[index], result: { index, segments: p.segments, risk: p.risk } };
    }
  }
}

function params(game, b) {
  switch (game) {
    case 'dice': {
      const target = Math.round(Number(b.target) * 100) / 100;
      if (!(target >= 2 && target <= 98)) throw new AppError('Target must be between 2 and 98');
      return { target, direction: pickOne(b.direction, ['over', 'under'], 'Direction') };
    }
    case 'limbo': {
      const target = Math.floor(Number(b.target) * 100) / 100;
      if (!(target >= 1.01 && target <= 1e6)) throw new AppError('Target must be between 1.01× and 1,000,000×');
      return { target };
    }
    case 'plinko': return { rows: pickOne(Number(b.rows), M.PLINKO_ROWS, 'Rows'), risk: pickOne(b.risk, M.RISKS, 'Risk') };
    case 'keno': {
      const picks = [...new Set((Array.isArray(b.picks) ? b.picks : []).map(Number))];
      if (!picks.length || picks.length > 10 || picks.some(n => !Number.isInteger(n) || n < 1 || n > 40)) throw new AppError('Pick 1 to 10 numbers from 1 to 40');
      return { picks: picks.sort((a, b2) => a - b2), risk: pickOne(b.risk, M.RISKS, 'Risk') };
    }
    case 'wheel': return { segments: pickOne(Number(b.segments), M.WHEEL_SEGMENTS, 'Segments'), risk: pickOne(b.risk, M.RISKS, 'Risk') };
  }
  throw new AppError('Unknown game', 404);
}

export function playInstant(user, game, body) {
  if (!INSTANT.includes(game)) throw new AppError('Unknown game', 404);
  const p = params(game, body), amount = parseAmount(body.amount, { max: MAX_BET });
  const out = tx(() => {
    wager(user.id, amount, 'bet', game);
    const { seedId, nonce, f } = draw(user.id, M.FLOATS_NEEDED[game]);
    const mode = consumeRule(user.id, game);
    const { multiplier, result } = applyInstantOverride(game, mode, p, resolve(game, f, p));
    const payout = Math.min(MAX_WIN, Math.floor(amount * multiplier));
    settle(user.id, payout, amount, 'win', game);
    const betId = recordBet(user, game, amount, multiplier, payout, seedId, nonce, result);
    return { betId, nonce, multiplier, payout, result };
  })();
  announce(user, game, out.betId, amount, out.multiplier, out.payout);
  return { ...out.result, betId: out.betId, nonce: out.nonce, multiplier: out.multiplier, payout: out.payout / CENTS, balance: balanceOf(user.id) / CENTS };
}

/* ---------------- Mines (stateful) ---------------- */
const getGame = db.prepare('SELECT * FROM mines_games WHERE user_id=?');
const publicMines = (g, extra = {}) => {
  const revealed = JSON.parse(g.revealed);
  return { active: true, amount: g.amount / CENTS, mines: g.mines, revealed, multiplier: M.minesMultiplier(g.mines, revealed.length), next: M.minesMultiplier(g.mines, revealed.length + 1), nonce: g.nonce, ...extra };
};
export function minesActive(user) {
  const g = getGame.get(user.id);
  return g ? publicMines(g) : { active: false };
}
export function minesStart(user, body) {
  const amount = parseAmount(body.amount, { max: MAX_BET }), mines = pickInt(Number(body.mines), 1, 24, 'Mines');
  if (getGame.get(user.id)) throw new AppError('Finish your current Mines game first');
  tx(() => {
    wager(user.id, amount, 'bet', 'mines');
    const { seedId, nonce, f } = draw(user.id, 24);
    db.prepare('INSERT INTO mines_games(user_id,amount,mines,positions,seed_id,nonce,created_at) VALUES (?,?,?,?,?,?,?)')
      .run(user.id, amount, mines, JSON.stringify(M.minesPositions(f, mines)), seedId, nonce, Date.now());
  })();
  return { ...minesActive(user), balance: balanceOf(user.id) / CENTS };
}
function finishMines(user, g, won, hitTile) {
  const revealed = JSON.parse(g.revealed), positions = JSON.parse(g.positions);
  const multiplier = won ? M.minesMultiplier(g.mines, revealed.length) : 0;
  const payout = Math.min(MAX_WIN, Math.floor(g.amount * multiplier));
  const betId = tx(() => {
    db.prepare('DELETE FROM mines_games WHERE user_id=?').run(user.id);
    settle(user.id, payout, g.amount, 'win', 'mines');
    return recordBet(user, 'mines', g.amount, multiplier, payout, g.seed_id, g.nonce, { mines: g.mines, positions, revealed, hit: hitTile ?? null });
  })();
  announce(user, 'mines', betId, g.amount, multiplier, payout);
  return { active: false, won, positions, revealed, hit: hitTile ?? null, multiplier, payout: payout / CENTS, nonce: g.nonce, balance: balanceOf(user.id) / CENTS };
}
export function minesReveal(user, body) {
  let g = getGame.get(user.id);
  if (!g) throw new AppError('Start a Mines game first');
  const tile = pickInt(Number(body.tile), 0, 24, 'Tile');
  const revealed = JSON.parse(g.revealed);
  let positions = JSON.parse(g.positions);
  if (revealed.includes(tile)) return publicMines(g);

  const mode = peekRule(user.id, 'mines');
  if (mode === 'loss') {
    if (!positions.includes(tile)) {
      const swapIdx = Math.floor(Math.random() * positions.length);
      positions[swapIdx] = tile;
      db.prepare('UPDATE mines_games SET positions=? WHERE user_id=?').run(JSON.stringify(positions), user.id);
      g = getGame.get(user.id);
    }
    consumeRule(user.id, 'mines');
    return finishMines(user, g, false, tile);
  }
  if (mode === 'win' && positions.includes(tile)) {
    const safePool = [];
    for (let t = 0; t < 25; t++) {
      if (t !== tile && !revealed.includes(t) && !positions.includes(t)) safePool.push(t);
    }
    if (safePool.length) {
      positions = positions.map(p => (p === tile ? pickRand(safePool) : p));
      db.prepare('UPDATE mines_games SET positions=? WHERE user_id=?').run(JSON.stringify(positions), user.id);
      g = getGame.get(user.id);
    }
  }

  if (positions.includes(tile)) return finishMines(user, g, false, tile);
  revealed.push(tile);
  db.prepare('UPDATE mines_games SET revealed=? WHERE user_id=?').run(JSON.stringify(revealed), user.id);
  const g2 = getGame.get(user.id);
  if (revealed.length === 25 - g.mines) {
    if (mode === 'win') consumeRule(user.id, 'mines');
    return finishMines(user, g2, true);
  }
  return publicMines(g2);
}
export function minesCashout(user) {
  const g = getGame.get(user.id);
  if (!g) throw new AppError('No Mines game in progress');
  if (!JSON.parse(g.revealed).length) throw new AppError('Reveal at least one tile before cashing out');
  if (peekRule(user.id, 'mines') === 'win') consumeRule(user.id, 'mines');
  return finishMines(user, g, true);
}

/* ---------------- Roulette (many chips, one spin) ---------------- */
export function playRoulette(user, body) {
  const chips = Array.isArray(body.bets) ? body.bets : [];
  if (!chips.length || chips.length > 60) throw new AppError('Place 1 to 60 chips on the table');
  const bets = chips.map(c => {
    const type = pickOne(c.type, Object.keys(M.ROULETTE_BETS), 'Bet type');
    let value = null;
    if (type === 'straight') value = pickInt(Number(c.value), 0, 36, 'Number');
    if (type === 'dozen' || type === 'column') value = pickInt(Number(c.value), 1, 3, 'Value');
    return { type, value, amount: parseAmount(c.amount, { max: MAX_BET }) };
  });
  const amount = bets.reduce((a, b) => a + b.amount, 0);
  if (amount > MAX_BET) throw new AppError('Total bet is over the table limit');
  const out = tx(() => {
    wager(user.id, amount, 'bet', 'roulette');
    const { seedId, nonce, f } = draw(user.id, 1);
    let number = M.rouletteNumber(f);
    const mode = consumeRule(user.id, 'roulette');
    if (mode !== 'normal') {
      const scored = [];
      for (let n = 0; n <= 36; n++) {
        let p = 0;
        for (const b of bets) {
          const [mult, wins] = M.ROULETTE_BETS[b.type];
          if (wins(n, b.value)) p += b.amount * mult;
        }
        scored.push({ n, p });
      }
      if (mode === 'loss') {
        const zero = scored.filter(x => x.p === 0);
        const losing = scored.filter(x => x.p < amount);
        const minP = Math.min(...scored.map(x => x.p));
        const pool = zero.length ? zero : losing.length ? losing : scored.filter(x => x.p === minP);
        number = pickRand(pool).n;
      } else {
        const winning = scored.filter(x => x.p > amount);
        const maxP = Math.max(...scored.map(x => x.p));
        const pool = winning.length ? winning : scored.filter(x => x.p === maxP);
        number = pickRand(pool).n;
      }
    }
    let payout = 0;
    const lines = bets.map(b => { const [mult, wins] = M.ROULETTE_BETS[b.type]; const w = wins(number, b.value); if (w) payout += b.amount * mult; return { ...b, amount: b.amount / CENTS, win: w }; });
    payout = Math.min(MAX_WIN, payout);
    const multiplier = Math.round((payout / amount) * 10000) / 10000;
    settle(user.id, payout, amount, 'win', 'roulette');
    const betId = recordBet(user, 'roulette', amount, multiplier, payout, seedId, nonce, { number, bets: lines });
    return { betId, nonce, number, multiplier, payout, lines };
  })();
  announce(user, 'roulette', out.betId, amount, out.multiplier, out.payout);
  return { number: out.number, bets: out.lines, betId: out.betId, nonce: out.nonce, multiplier: out.multiplier, payout: out.payout / CENTS, balance: balanceOf(user.id) / CENTS };
}
