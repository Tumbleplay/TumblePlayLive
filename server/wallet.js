import { db } from './db.js';
import { AppError } from './util.js';
import { CENTS } from './config.js';
import { VIP_LEVELS, vipIndexFor } from '../shared/math.js';
import { toUser } from './bus.js';

const getBal = db.prepare('SELECT balance FROM users WHERE id=?');
const setBal = db.prepare('UPDATE users SET balance=? WHERE id=?');
const addLedger = db.prepare('INSERT INTO ledger(user_id,kind,amount,balance_after,ref,created_at) VALUES (?,?,?,?,?,?)');

// Every balance change goes through here and leaves a ledger row. Call inside a transaction.
export function move(userId, amount, kind, ref = '') {
  const u = getBal.get(userId);
  if (!u) throw new AppError('Account not found', 404);
  const next = u.balance + amount;
  if (next < 0) throw new AppError('Not enough coins. Lower the bet or claim a bonus on the Rewards page.');
  setBal.run(next, userId);
  addLedger.run(userId, kind, amount, next, String(ref), Date.now());
  return next;
}

// Debit a wager, count it toward VIP progress and accrue rakeback.
export function wager(userId, amount, kind, ref) {
  move(userId, -amount, kind, ref);
  const u = db.prepare('SELECT wagered, vip_level FROM users WHERE id=?').get(userId);
  const wagered = u.wagered + amount;
  const rb = Math.floor(amount * VIP_LEVELS[u.vip_level].rakeback);
  db.prepare('UPDATE users SET wagered=?, bet_count=bet_count+1, rakeback=rakeback+? WHERE id=?').run(wagered, rb, userId);
  const lvl = vipIndexFor(wagered / CENTS);
  if (lvl > u.vip_level) {
    let reward = 0;
    for (let i = u.vip_level + 1; i <= lvl; i++) reward += VIP_LEVELS[i].reward * CENTS;
    db.prepare('UPDATE users SET vip_level=? WHERE id=?').run(lvl, userId);
    if (reward) move(userId, reward, 'vip_reward', VIP_LEVELS[lvl].name);
    queueMicrotask(() => toUser(userId, 'vip:levelup', { level: lvl, name: VIP_LEVELS[lvl].name, reward: reward / CENTS }));
  }
}

// Credit a win (if any) and record profit for the wager it settles.
export function settle(userId, payout, stake, kind, ref) {
  if (payout > 0) move(userId, payout, kind, ref);
  db.prepare('UPDATE users SET profit=profit+? WHERE id=?').run(payout - stake, userId);
}

export const balanceOf = userId => getBal.get(userId)?.balance ?? 0;
