import { db } from './db.js';
import { AppError } from './util.js';
import { CENTS } from './config.js';
import { toAll } from './bus.js';
import { VIP_LEVELS } from '../shared/math.js';

/* ---------- chat ---------- */
const recent = [];
const lastSent = new Map();
const row2msg = r => ({ id: r.id, username: r.username, hue: r.hue, role: r.role, vip: VIP_LEVELS[r.vip_level].name, text: r.text, at: r.created_at });
export function loadChat() {
  recent.push(...db.prepare('SELECT c.*, u.username, u.hue, u.role, u.vip_level FROM chat c JOIN users u ON u.id=c.user_id WHERE c.deleted=0 ORDER BY c.id DESC LIMIT 60').all().reverse().map(row2msg));
}
export const chatHistory = () => recent.slice(-60);
export function sendChat(user, text) {
  const u = db.prepare('SELECT * FROM users WHERE id=?').get(user.id);
  if (u.banned) throw new AppError('This account is suspended', 403);
  if (u.muted_until > Date.now()) throw new AppError(`You're muted until ${new Date(u.muted_until).toLocaleTimeString()}`);
  const t = String(text || '').replace(/\s+/g, ' ').trim().slice(0, 240);
  if (!t) throw new AppError('Type a message first');
  const last = lastSent.get(u.id) || 0;
  if (Date.now() - last < 1500) throw new AppError('Slow down a little');
  lastSent.set(u.id, Date.now());
  const id = db.prepare('INSERT INTO chat(user_id,text,created_at) VALUES (?,?,?)').run(u.id, t, Date.now()).lastInsertRowid;
  const msg = row2msg({ id, username: u.username, hue: u.hue, role: u.role, vip_level: u.vip_level, text: t, created_at: Date.now() });
  recent.push(msg); if (recent.length > 120) recent.splice(0, recent.length - 120);
  toAll('chat:msg', msg);
  return msg;
}
export function deleteChat(id) {
  db.prepare('UPDATE chat SET deleted=1 WHERE id=?').run(id);
  const i = recent.findIndex(m => m.id === id); if (i >= 0) recent.splice(i, 1);
  toAll('chat:delete', { id });
}

/* ---------- feeds & stats ---------- */
export function recentBets(limit = 30, minAmount = 0) {
  return db.prepare(`SELECT b.id, b.game, b.amount, b.multiplier, b.payout, b.created_at, u.username, u.hue FROM bets b JOIN users u ON u.id=b.user_id WHERE b.amount>=? ORDER BY b.id DESC LIMIT ?`)
    .all(minAmount * CENTS, limit)
    .map(r => ({ id: `${r.game}-${r.id}`, game: r.game, username: r.username, hue: r.hue, amount: r.amount / CENTS, multiplier: r.multiplier, payout: r.payout / CENTS, at: r.created_at }));
}

const PERIOD = { day: 864e5, week: 7 * 864e5 };
export function leaderboard(period = 'week', metric = 'profit') {
  if (!['day', 'week', 'all'].includes(period)) throw new AppError('Period must be day, week or all');
  if (!['profit', 'wagered', 'multiplier'].includes(metric)) throw new AppError('Unknown leaderboard');
  const since = period === 'all' ? 0 : Date.now() - PERIOD[period];
  let rows;
  if (metric === 'multiplier') {
    rows = db.prepare(`SELECT u.username, u.hue, u.vip_level, MAX(b.multiplier) value, b.game FROM bets b JOIN users u ON u.id=b.user_id
      WHERE b.created_at>=? AND b.payout>0 AND u.banned=0 GROUP BY b.user_id ORDER BY value DESC LIMIT 50`).all(since);
  } else {
    const expr = metric === 'profit' ? 'SUM(payout-amount)' : 'SUM(amount)';
    rows = db.prepare(`SELECT u.username, u.hue, u.vip_level, ${expr} value FROM (
        SELECT user_id, amount, payout, created_at FROM bets
        UNION ALL SELECT user_id, amount, payout, settled_at FROM sport_bets WHERE status!='pending'
      ) x JOIN users u ON u.id=x.user_id WHERE x.created_at>=? AND u.banned=0 GROUP BY x.user_id ORDER BY value DESC LIMIT 50`).all(since)
      .map(r => ({ ...r, value: r.value / CENTS }));
  }
  return rows.map((r, i) => ({ rank: i + 1, username: r.username, hue: r.hue, vip: VIP_LEVELS[r.vip_level].name, value: r.value, game: r.game }));
}

export function profile(username) {
  const u = db.prepare('SELECT * FROM users WHERE username=?').get(String(username));
  if (!u) throw new AppError('No player with that name', 404);
  const fav = db.prepare('SELECT game, COUNT(*) n FROM bets WHERE user_id=? GROUP BY game ORDER BY n DESC LIMIT 1').get(u.id);
  const best = db.prepare('SELECT game, multiplier, payout FROM bets WHERE user_id=? ORDER BY multiplier DESC LIMIT 1').get(u.id);
  const sports = db.prepare("SELECT COUNT(*) n, SUM(status='won') w FROM sport_bets WHERE user_id=?").get(u.id);
  return {
    username: u.username, hue: u.hue, role: u.role, joined: u.created_at, vip: VIP_LEVELS[u.vip_level].name,
    bets: u.bet_count, wagered: u.wagered / CENTS, profit: u.profit / CENTS,
    favorite: fav?.game || null, best: best ? { game: best.game, multiplier: best.multiplier, payout: best.payout / CENTS } : null,
    sports: { bets: sports.n, won: sports.w || 0 }
  };
}

export function myCasinoBets(user, game, limit = 50) {
  const args = [user.id]; let where = 'user_id=?';
  if (game) { where += ' AND game=?'; args.push(game); }
  return db.prepare(`SELECT id, game, amount, multiplier, payout, nonce, seed_id, detail, created_at FROM bets WHERE ${where} ORDER BY id DESC LIMIT ?`).all(...args, limit)
    .map(b => ({ id: b.id, game: b.game, amount: b.amount / CENTS, multiplier: b.multiplier, payout: b.payout / CENTS, nonce: b.nonce, seedId: b.seed_id, detail: JSON.parse(b.detail || '{}'), at: b.created_at }));
}
export function myLedger(user, limit = 100) {
  return db.prepare('SELECT kind, amount, balance_after, ref, created_at FROM ledger WHERE user_id=? ORDER BY id DESC LIMIT ?').all(user.id, limit)
    .map(l => ({ kind: l.kind, amount: l.amount / CENTS, balance: l.balance_after / CENTS, ref: l.ref, at: l.created_at }));
}

// Real "playing now" counts: distinct players per game over the last 15 minutes
const playingStmt = db.prepare('SELECT game, COUNT(DISTINCT user_id) AS n FROM bets WHERE created_at > ? GROUP BY game');
export function playingNow() {
  const out = {};
  for (const r of playingStmt.all(Date.now() - 15 * 60 * 1000)) out[r.game] = r.n;
  return out;
}
