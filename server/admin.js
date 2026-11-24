import { db, tx, scheduleSync, syncStatus, syncNow, getSetting, setSetting } from './db.js';
import { move } from './wallet.js';
import { AppError, parseAmount } from './util.js';
import { CENTS } from './config.js';
import { toUser } from './bus.js';
import { VIP_LEVELS } from '../shared/math.js';
import { getGlobal, setGlobal, setUserOverride, listOverrides, GM_GAMES } from './gm.js';
import { gmCrashStatus, gmCrashControl } from './games/crash.js';

export function stats() {
  const day = Date.now() - 864e5;
  const g = since => db.prepare('SELECT game, COUNT(*) bets, SUM(amount) wagered, SUM(amount-payout) house FROM bets WHERE created_at>=? GROUP BY game ORDER BY wagered DESC').all(since)
    .map(r => ({ game: r.game, bets: r.bets, wagered: r.wagered / CENTS, house: r.house / CENTS, edge: r.wagered ? r.house / r.wagered : 0 }));
  const sp = since => db.prepare("SELECT COUNT(*) bets, COALESCE(SUM(amount),0) wagered, COALESCE(SUM(CASE WHEN status!='pending' THEN amount-payout ELSE 0 END),0) house, SUM(status='pending') open FROM sport_bets WHERE created_at>=?").get(since);
  const s24 = sp(day), sAll = sp(0);
  return {
    users: db.prepare('SELECT COUNT(*) n FROM users').get().n,
    active24h: db.prepare('SELECT COUNT(DISTINCT user_id) n FROM bets WHERE created_at>=?').get(day).n,
    signups24h: db.prepare('SELECT COUNT(*) n FROM users WHERE created_at>=?').get(day).n,
    coinsInCirculation: db.prepare('SELECT COALESCE(SUM(balance),0) s FROM users').get().s / CENTS,
    pendingDeposits: db.prepare("SELECT COUNT(*) n FROM deposits WHERE status='pending'").get().n,
    casino24h: g(day), casinoAll: g(0),
    sports24h: { bets: s24.bets, wagered: s24.wagered / CENTS, house: s24.house / CENTS, open: s24.open || 0 },
    sportsAll: { bets: sAll.bets, wagered: sAll.wagered / CENTS, house: sAll.house / CENTS, open: sAll.open || 0 },
    giveaways: db.prepare("SELECT kind, COUNT(*) n, SUM(amount) total FROM ledger WHERE kind IN ('welcome','daily','refill','rakeback','vip_reward','admin','deposit') GROUP BY kind").all().map(r => ({ kind: r.kind, count: r.n, total: r.total / CENTS })),
    sync: syncStatus()
  };
}

export function users(q = '') {
  const ovMap = new Map(listOverrides().map(o => [o.userId, o]));
  return db.prepare('SELECT * FROM users WHERE username LIKE ? ORDER BY id DESC LIMIT 100').all(`%${String(q).slice(0, 20)}%`).map(u => ({
    id: u.id, username: u.username, role: u.role, balance: u.balance / CENTS, wagered: u.wagered / CENTS, profit: u.profit / CENTS,
    bets: u.bet_count, vip: VIP_LEVELS[u.vip_level].name, banned: !!u.banned, mutedUntil: u.muted_until, joined: u.created_at,
    gm: ovMap.get(u.id) || null
  }));
}

export function act(adminUser, id, b) {
  const u = db.prepare('SELECT * FROM users WHERE id=?').get(Number(id));
  if (!u) throw new AppError('User not found', 404);
  switch (b.action) {
    case 'adjust': {
      const sign = Number(b.amount) < 0 ? -1 : 1;
      const amt = sign * parseAmount(Math.abs(Number(b.amount)), { max: 1e9 * CENTS });
      const note = String(b.note || '').slice(0, 80) || 'Admin adjustment';
      const bal = tx(() => move(u.id, amt, 'admin', `${adminUser.username}: ${note}`))();
      scheduleSync(true);
      toUser(u.id, 'balance', { balance: bal / CENTS });
      return { ok: true, balance: bal / CENTS };
    }
    case 'ban': db.prepare('UPDATE users SET banned=? WHERE id=?').run(b.value ? 1 : 0, u.id); scheduleSync(true); return { ok: true };
    case 'mute': {
      const mins = Math.max(0, Math.min(60 * 24 * 30, Number(b.minutes) || 0));
      db.prepare('UPDATE users SET muted_until=? WHERE id=?').run(mins ? Date.now() + mins * 60000 : 0, u.id); scheduleSync(true); return { ok: true };
    }
    case 'role': {
      if (u.id === adminUser.id) throw new AppError("You can't change your own role");
      db.prepare('UPDATE users SET role=? WHERE id=?').run(b.value === 'admin' ? 'admin' : 'user', u.id); scheduleSync(true); return { ok: true };
    }
    case 'gm': {
      const override = setUserOverride(u.id, b);
      scheduleSync(true);
      return { ok: true, override };
    }
  }
  throw new AppError('Unknown action');
}

export function gmState() {
  return {
    games: GM_GAMES,
    global: getGlobal(),
    overrides: listOverrides(),
    crash: gmCrashStatus()
  };
}

export function gmSetGlobal(body) {
  const global = setGlobal(body);
  scheduleSync(true);
  return { ok: true, global };
}

export function gmCrash(body) {
  return gmCrashControl(body);
}

export function getSync() {
  return syncStatus();
}

export async function triggerSync() {
  return await syncNow();
}


export function getEconomySettings() {
  return {
    welcomeBonusEnabled: getSetting('welcome_bonus_enabled', '1') !== '0',
    welcomeBonusCoins: Number(getSetting('welcome_bonus_coins', '50')) || 50,
    dailyBonusEnabled: getSetting('daily_bonus_enabled', '1') !== '0',
    dailyBonusCoins: Number(getSetting('daily_bonus_coins', '10')) || 10,
    referralEnabled: getSetting('referral_enabled', '1') !== '0',
    referralBonusCoins: Number(getSetting('referral_bonus_coins', '50')) || 50,
    referralMode: getSetting('referral_mode', 'deposit'),
    telegramAdminId: getSetting('telegram_admin_id', '')
  };
}

export function saveEconomySettings(body = {}) {
  if (body.welcomeBonusEnabled !== undefined) setSetting('welcome_bonus_enabled', body.welcomeBonusEnabled ? '1' : '0');
  if (body.welcomeBonusCoins !== undefined) setSetting('welcome_bonus_coins', Math.max(0, Number(body.welcomeBonusCoins) || 0));
  if (body.dailyBonusEnabled !== undefined) setSetting('daily_bonus_enabled', body.dailyBonusEnabled ? '1' : '0');
  if (body.dailyBonusCoins !== undefined) setSetting('daily_bonus_coins', Math.max(0, Number(body.dailyBonusCoins) || 0));
  if (body.referralEnabled !== undefined) setSetting('referral_enabled', body.referralEnabled ? '1' : '0');
  if (body.referralBonusCoins !== undefined) setSetting('referral_bonus_coins', Math.max(0, Number(body.referralBonusCoins) || 0));
  if (body.referralMode !== undefined) setSetting('referral_mode', body.referralMode === 'manual' ? 'manual' : 'deposit');
  if (body.telegramAdminId !== undefined) setSetting('telegram_admin_id', String(body.telegramAdminId).trim());
  return getEconomySettings();
}

export function listReferrals(status = 'all') {
  const where = status && status !== 'all' ? 'WHERE r.status=?' : '';
  const sql = `
    SELECT r.*, u1.username AS referrer_name, u2.username AS referred_name
    FROM referrals r
    JOIN users u1 ON u1.id = r.referrer_id
    JOIN users u2 ON u2.id = r.referred_id
    ${where} ORDER BY r.id DESC LIMIT 150
  `;
  return where ? db.prepare(sql).all(status) : db.prepare(sql).all();
}

export function listWithdrawals(status = 'all') {
  const where = status && status !== 'all' ? 'WHERE w.status=?' : '';
  const sql = `SELECT w.*, u.username FROM withdrawals w JOIN users u ON u.id = w.user_id ${where} ORDER BY w.id DESC LIMIT 150`;
  return where ? db.prepare(sql).all(status) : db.prepare(sql).all();
}

export function listDeposits(status = 'all') {
  const where = status && status !== 'all' ? 'WHERE d.status=?' : '';
  const sql = `SELECT d.*, u.username FROM deposits d JOIN users u ON u.id = d.user_id ${where} ORDER BY d.id DESC LIMIT 150`;
  return where ? db.prepare(sql).all(status) : db.prepare(sql).all();
}

export function listPromos() {
  return db.prepare('SELECT * FROM promo_codes ORDER BY id DESC LIMIT 100').all();
}

export function createPromo(code, coins, maxUses = 50) {
  const c = String(code || '').trim().toUpperCase();
  if (!c || c.length < 3) throw new AppError('Promo code must be at least 3 characters');
  db.prepare('INSERT INTO promo_codes(code,coins,max_uses,used_count,active,created_at) VALUES (?,?,?,0,1,?)')
    .run(c, Math.max(1, Number(coins) || 10), Math.max(1, Number(maxUses) || 50), Date.now());
  scheduleSync(true);
  return listPromos();
}

export function toggleBanUser(userId, banned) {
  db.prepare('UPDATE users SET banned=? WHERE id=?').run(banned ? 1 : 0, Number(userId));
  scheduleSync(true);
  return { ok: true };
}

export function resetDailyTimer(userId) {
  db.prepare('UPDATE users SET last_daily=0 WHERE id=?').run(Number(userId));
  scheduleSync(true);
  return { ok: true };
}
