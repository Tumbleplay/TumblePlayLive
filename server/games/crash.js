import { db, tx } from '../db.js';
import { floats, sha256, randomHex } from '../fair.js';
import { wager, settle, balanceOf } from '../wallet.js';
import { AppError, parseAmount, floor2 } from '../util.js';
import { CENTS, MAX_BET, MAX_WIN } from '../config.js';
import { toAll, toUser } from '../bus.js';
import { recordBet, announce } from './casino.js';
import { peekRule, consumeRule, takeCrashOverride, setGlobal, getGlobal } from '../gm.js';
import { crashPoint, crashAt, CRASH_SALT } from '../../shared/math.js';

const WAIT_MS = 7000, PAUSE_MS = 3500, TICK_MS = 50;
let R = null;
const history = [];

const publicBets = () => [...R.bets.values()].map(b => ({ username: b.user.username, hue: b.user.hue, amount: b.amount / CENTS, cashedAt: b.cashedAt, payout: b.payout / CENTS }));
export function crashState() {
  return {
    serverNow: Date.now(),
    round: R && { id: R.id, hash: R.hash, phase: R.phase, startAt: R.startAt, point: R.phase === 'crashed' ? R.point : null, seed: R.phase === 'crashed' ? R.seed : null, bets: publicBets() },
    history: history.slice(0, 20)
  };
}

export function gmCrashStatus() {
  const g = getGlobal();
  if (!R) return { phase: 'idle', queuedPoint: g.crashNextPoint };
  const liveMult = R.phase === 'running' ? floor2(crashAt(Date.now() - R.startAt)) : 1.0;
  return {
    id: R.id,
    phase: R.phase,
    scheduledPoint: R.point,
    liveMult,
    queuedPoint: g.crashNextPoint,
    bets: [...R.bets.values()].map(b => ({
      userId: b.user.id,
      username: b.user.username,
      amount: b.amount / CENTS,
      auto: b.auto,
      cashedAt: b.cashedAt
    }))
  };
}

export function gmCrashControl(body) {
  if (body.action === 'crash_now') {
    if (!R || R.phase !== 'running') throw new AppError('Crash round is not currently flying');
    R.point = Math.max(1.0, floor2(crashAt(Date.now() - R.startAt)));
    db.prepare('UPDATE crash_rounds SET point=? WHERE id=?').run(R.point, R.id);
    end();
    return { ok: true, crashedAt: R.point };
  }
  if (body.action === 'set_point') {
    if (body.point === null || body.point === '') {
      setGlobal({ crashNextPoint: null });
      return { ok: true, queuedPoint: null };
    }
    const pt = floor2(Number(body.point));
    if (!(pt >= 1.0 && pt <= 1e6)) throw new AppError('Crash point must be at least 1.00×');
    if (R && R.phase === 'betting') {
      R.point = pt;
      db.prepare('UPDATE crash_rounds SET point=? WHERE id=?').run(R.point, R.id);
      return { ok: true, appliedToRound: R.id, point: pt };
    }
    setGlobal({ crashNextPoint: pt });
    return { ok: true, queuedPoint: pt };
  }
  throw new AppError('Unknown crash GM action');
}

function newRound() {
  const seed = randomHex(32), hash = sha256(seed);
  const forced = takeCrashOverride();
  const point = forced !== null ? forced : crashPoint(floats(seed, CRASH_SALT, 0, 1));
  const id = db.prepare('INSERT INTO crash_rounds(seed,hash,point) VALUES (?,?,?)').run(seed, hash, point).lastInsertRowid;
  R = { id, seed, hash, point, phase: 'betting', startAt: Date.now() + WAIT_MS, bets: new Map() };
  toAll('crash:round', { id, hash, startAt: R.startAt, serverNow: Date.now() });
  setTimeout(start, WAIT_MS);
}

function start() {
  if (!R || R.phase !== 'betting') return;

  let forceLoss = false;
  let minWinTarget = null;
  for (const b of R.bets.values()) {
    const mode = peekRule(b.user.id, 'crash');
    if (mode === 'loss') {
      forceLoss = true;
      consumeRule(b.user.id, 'crash');
    } else if (mode === 'win') {
      const target = b.auto ? floor2(b.auto + 0.5) : 3.5;
      minWinTarget = minWinTarget ? Math.max(minWinTarget, target) : target;
      consumeRule(b.user.id, 'crash');
    }
  }
  if (forceLoss) {
    R.point = 1.0;
    db.prepare('UPDATE crash_rounds SET point=? WHERE id=?').run(R.point, R.id);
  } else if (minWinTarget && R.point < minWinTarget) {
    R.point = minWinTarget;
    db.prepare('UPDATE crash_rounds SET point=? WHERE id=?').run(R.point, R.id);
  }

  R.phase = 'running'; R.startAt = Date.now();
  db.prepare('UPDATE crash_rounds SET started_at=? WHERE id=?').run(R.startAt, R.id);
  toAll('crash:start', { id: R.id, startAt: R.startAt, serverNow: Date.now() });
  tick();
}

function tick() {
  if (!R || R.phase !== 'running') return;
  const m = crashAt(Date.now() - R.startAt);
  for (const b of R.bets.values())
    if (!b.cashedAt && b.auto && b.auto < R.point && m >= b.auto) doCashout(b, b.auto);
  if (m >= R.point) return end();
  setTimeout(tick, TICK_MS);
}

function end() {
  if (!R || R.phase !== 'running') return;
  R.phase = 'crashed';
  const losers = [...R.bets.values()].filter(b => !b.cashedAt);
  tx(() => {
    db.prepare('UPDATE crash_rounds SET ended_at=? WHERE id=?').run(Date.now(), R.id);
    for (const b of losers) {
      settle(b.user.id, 0, b.amount, 'win', 'crash');
      b.betId = recordBet(b.user, 'crash', b.amount, 0, 0, null, null, { round: R.id, point: R.point });
    }
  })();
  for (const b of losers) announce(b.user, 'crash', b.betId, b.amount, 0, 0);
  history.unshift({ id: R.id, point: R.point });
  history.length = Math.min(history.length, 30);
  toAll('crash:end', { id: R.id, point: R.point, seed: R.seed, hash: R.hash });
  setTimeout(newRound, PAUSE_MS);
}

function doCashout(b, m) {
  b.cashedAt = m;
  b.payout = Math.min(MAX_WIN, Math.floor(b.amount * m));
  b.betId = tx(() => {
    settle(b.user.id, b.payout, b.amount, 'win', 'crash');
    db.prepare('UPDATE crash_bets SET cashed_at=?, payout=? WHERE round_id=? AND user_id=?').run(m, b.payout, R.id, b.user.id);
    return recordBet(b.user, 'crash', b.amount, m, b.payout, null, null, { round: R.id, point: R.point });
  })();
  announce(b.user, 'crash', b.betId, b.amount, m, b.payout);
  toAll('crash:cashout', { username: b.user.username, cashedAt: m, payout: b.payout / CENTS });
  toUser(b.user.id, 'balance', { balance: balanceOf(b.user.id) / CENTS });
}

export function crashBet(user, body) {
  if (!R || R.phase !== 'betting') throw new AppError('Bets open between rounds. Wait for the next round.');
  if (R.bets.has(user.id)) throw new AppError('You already have a bet in this round');
  const amount = parseAmount(body.amount, { max: MAX_BET });
  const autoN = Number(body.autoCashout);
  const auto = body.autoCashout == null || body.autoCashout === '' ? null : floor2(autoN);
  if (auto !== null && !(auto >= 1.01 && auto <= 1e6)) throw new AppError('Auto cash out must be 1.01× or more');
  tx(() => {
    wager(user.id, amount, 'bet', 'crash');
    db.prepare('INSERT INTO crash_bets(round_id,user_id,amount,auto_cashout) VALUES (?,?,?,?)').run(R.id, user.id, amount, auto);
  })();
  R.bets.set(user.id, { user: { id: user.id, username: user.username, hue: user.hue }, amount, auto, cashedAt: null, payout: 0 });
  toAll('crash:bet', { username: user.username, hue: user.hue, amount: amount / CENTS });
  return { roundId: R.id, balance: balanceOf(user.id) / CENTS };
}

export function crashCashout(user) {
  const b = R?.bets.get(user.id);
  if (!R || R.phase !== 'running' || !b) throw new AppError('No active Crash bet to cash out');
  if (b.cashedAt) throw new AppError('Already cashed out');
  const m = floor2(crashAt(Date.now() - R.startAt));
  if (m >= R.point) throw new AppError('Too late. The round crashed.');
  doCashout(b, m);
  return { cashedAt: m, payout: b.payout / CENTS, balance: balanceOf(user.id) / CENTS };
}

export function startCrash() {
  const open = db.prepare('SELECT b.* FROM crash_bets b JOIN crash_rounds r ON r.id=b.round_id WHERE r.ended_at IS NULL AND b.cashed_at IS NULL').all();
  tx(() => {
    for (const b of open) settle(b.user_id, b.amount, b.amount, 'refund', `crash round ${b.round_id}`);
    db.prepare('UPDATE crash_rounds SET ended_at=? WHERE ended_at IS NULL').run(Date.now());
  })();
  for (const r of db.prepare('SELECT id, point FROM crash_rounds WHERE started_at IS NOT NULL ORDER BY id DESC LIMIT 30').all()) history.push(r);
  newRound();
}
