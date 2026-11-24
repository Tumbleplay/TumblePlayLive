import { db, tx, getSetting, scheduleSync } from './db.js';
import { move } from './wallet.js';
import { AppError } from './util.js';
import { CENTS, DAILY_COOLDOWN_MS } from './config.js';
import { toUser } from './bus.js';
import { VIP_LEVELS } from '../shared/math.js';

const fresh = id => db.prepare('SELECT * FROM users WHERE id=?').get(id);
const wait = ms => { const m = Math.ceil(ms / 60000); return m >= 60 ? `${Math.floor(m / 60)}h ${m % 60}m` : `${m}m`; };

export function claimDaily(user) {
  return tx(() => {
    if (getSetting('daily_bonus_enabled', '1') === '0') {
      throw new AppError('Daily login bonus is currently paused by Admin');
    }
    const u = fresh(user.id);
    const t = Date.now();
    const ready = (u.last_daily || 0) + DAILY_COOLDOWN_MS;
    if (t < ready) throw new AppError(`Your next daily bonus is ready in ${wait(ready - t)}`);
    const dailyCoins = Math.max(1, Number(getSetting('daily_bonus_coins', '10')) || 10);
    const amt = Math.round(dailyCoins * CENTS);
    const bal = move(u.id, amt, 'daily', `Daily Login Bonus (+${dailyCoins})`);
    db.prepare('UPDATE users SET last_daily=? WHERE id=?').run(t, u.id);
    toUser(u.id, 'balance', { balance: bal / CENTS });
    scheduleSync(true);
    return { claimed: dailyCoins, balance: bal / CENTS, nextReadyAt: t + DAILY_COOLDOWN_MS };
  })();
}

export function claimRefill() {
  throw new AppError('Free 1,000-coin refill is disabled. Claim your +10 Daily Bonus or invite friends for +50 Coins!');
}

export function claimRakeback(user) {
  return tx(() => {
    const u = fresh(user.id);
    if (u.rakeback < 1) throw new AppError('No rakeback to claim yet. It builds up as you play.');
    const bal = move(u.id, u.rakeback, 'rakeback', (VIP_LEVELS[u.vip_level] || VIP_LEVELS[0]).name);
    db.prepare('UPDATE users SET rakeback=0 WHERE id=?').run(u.id);
    toUser(u.id, 'balance', { balance: bal / CENTS });
    return { claimed: u.rakeback / CENTS };
  })();
}

/* ---------- Verified Referral System ---------- */
export function getMyReferrals(user) {
  const rows = db.prepare(`
    SELECT r.id, r.status, r.bonus_coins, r.created_at, r.verified_at, u.username
    FROM referrals r JOIN users u ON u.id = r.referred_id
    WHERE r.referrer_id=? ORDER BY r.id DESC LIMIT 100
  `).all(user.id);
  const verifiedCount = rows.filter(r => r.status === 'verified').length;
  const totalEarned = rows.filter(r => r.status === 'verified').reduce((s, r) => s + r.bonus_coins, 0);
  return {
    refCode: user.ref_code,
    bonusCoins: Number(getSetting('referral_bonus_coins', '50')) || 50,
    mode: getSetting('referral_mode', 'deposit'),
    verifiedCount,
    totalEarned,
    referrals: rows
  };
}

export function verifyReferralById(refId, adminName = 'system') {
  return tx(() => {
    const r = db.prepare('SELECT * FROM referrals WHERE id=?').get(refId);
    if (!r) throw new AppError('Referral record not found', 404);
    if (r.status !== 'pending') throw new AppError(`Referral is already ${r.status}`);
    const amt = Math.round(r.bonus_coins * CENTS);
    const bal = move(r.referrer_id, amt, 'referral', `Verified Referral #${r.id} (${adminName})`);
    db.prepare("UPDATE referrals SET status='verified', verified_at=? WHERE id=?").run(Date.now(), r.id);
    toUser(r.referrer_id, 'balance', { balance: bal / CENTS });
    scheduleSync(true);
    return { ok: true, referrerId: r.referrer_id, bonusCoins: r.bonus_coins };
  })();
}

export function rejectReferralById(refId) {
  const r = db.prepare('SELECT * FROM referrals WHERE id=?').get(refId);
  if (!r) throw new AppError('Referral record not found', 404);
  if (r.status !== 'pending') throw new AppError(`Referral is already ${r.status}`);
  db.prepare("UPDATE referrals SET status='rejected', verified_at=? WHERE id=?").run(Date.now(), r.id);
  scheduleSync(true);
  return { ok: true };
}

export function autoVerifyReferralOnDeposit(referredUserId) {
  if (getSetting('referral_enabled', '1') === '0') return null;
  if (getSetting('referral_mode', 'deposit') !== 'deposit') return null;
  const r = db.prepare("SELECT * FROM referrals WHERE referred_id=? AND status='pending'").get(referredUserId);
  if (!r || r.flagged_same_ip) return null;
  return verifyReferralById(r.id, 'auto-deposit-verified');
}

/* ---------- Admin Promo / Drop Codes ---------- */
export function claimPromoCode(user, rawCode) {
  return tx(() => {
    const code = String(rawCode || '').trim().toUpperCase();
    if (!code) throw new AppError('Enter a promo code');
    const p = db.prepare('SELECT * FROM promo_codes WHERE UPPER(code)=? AND active=1').get(code);
    if (!p) throw new AppError('Invalid or expired promo code');
    if (p.used_count >= p.max_uses) throw new AppError('This promo code has reached its claim limit');
    const already = db.prepare('SELECT 1 FROM promo_claims WHERE promo_id=? AND user_id=?').get(p.id, user.id);
    if (already) throw new AppError('You have already claimed this promo code');
    const amt = Math.round(p.coins * CENTS);
    const bal = move(user.id, amt, 'promo', `Promo Code: ${p.code}`);
    db.prepare('INSERT INTO promo_claims(promo_id,user_id,claimed_at) VALUES (?,?,?)').run(p.id, user.id, Date.now());
    db.prepare('UPDATE promo_codes SET used_count=used_count+1 WHERE id=?').run(p.id);
    toUser(user.id, 'balance', { balance: bal / CENTS });
    scheduleSync(true);
    return { claimed: p.coins, code: p.code, balance: bal / CENTS };
  })();
}
