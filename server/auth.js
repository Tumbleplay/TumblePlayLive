import crypto from 'node:crypto';
import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';
import { db, scheduleSync, getSetting } from './db.js';
import { JWT_SECRET, IS_PROD, ADMIN_USERNAMES, CENTS, DAILY_COOLDOWN_MS, REFILL_COOLDOWN_MS, REFILL_BELOW, TELEGRAM_BOT_TOKEN } from './config.js';
import { AppError } from './util.js';
import { VIP_LEVELS } from '../shared/math.js';

function resolveJwtSecret() {
  if (process.env.JWT_SECRET) return process.env.JWT_SECRET;
  const row = db.prepare("SELECT value FROM settings WHERE key='jwt_secret'").get();
  if (row?.value) return row.value;
  const secret = JWT_SECRET || crypto.randomBytes(32).toString('hex');
  db.prepare("INSERT INTO settings(key,value) VALUES ('jwt_secret',?) ON CONFLICT(key) DO NOTHING").run(secret);
  scheduleSync(true);
  return secret;
}

const SECRET = resolveJwtSecret();
export const COOKIE = 'tumble_session';
const COOKIE_MAX_AGE = 400 * 24 * 3600 * 1000;
const cookieOpts = { httpOnly: true, sameSite: 'lax', secure: IS_PROD, maxAge: COOKIE_MAX_AGE, path: '/' };

export const signSession = (res, uid) => res.cookie(COOKIE, jwt.sign({ uid }, SECRET, { expiresIn: '10y' }), cookieOpts);
export const clearSession = res => res.clearCookie(COOKIE, { ...cookieOpts, maxAge: undefined });

function verifyToken(token) {
  if (!token) return null;
  try { return jwt.verify(token, SECRET); } catch { return null; }
}
export function userIdFromToken(token) {
  return verifyToken(token)?.uid ?? null;
}

export function makeRefCode() {
  return 'TP' + crypto.randomBytes(3).toString('hex').toUpperCase();
}

export function ensureRefCode(u) {
  if (u.ref_code) return u.ref_code;
  const code = makeRefCode();
  try {
    db.prepare('UPDATE users SET ref_code=? WHERE id=?').run(code, u.id);
    u.ref_code = code;
  } catch {}
  return u.ref_code || code;
}

function getWelcomeBonusCents() {
  if (getSetting('welcome_bonus_enabled', '1') === '0') return 0;
  const coins = Math.max(0, Number(getSetting('welcome_bonus_coins', '50')) || 50);
  return Math.round(coins * CENTS);
}

function recordReferralIfAny(newUserId, refCode, signupIp) {
  if (!refCode) return;
  if (getSetting('referral_enabled', '1') === '0') return;
  const referrer = db.prepare('SELECT id, signup_ip FROM users WHERE UPPER(ref_code)=UPPER(?)').get(String(refCode).trim());
  if (!referrer || referrer.id === newUserId) return;
  const sameIp = Boolean(signupIp && referrer.signup_ip && signupIp === referrer.signup_ip);
  const bonusCoins = Math.max(0, Number(getSetting('referral_bonus_coins', '50')) || 50);
  db.prepare('UPDATE users SET referred_by=? WHERE id=?').run(referrer.id, newUserId);
  db.prepare(`
    INSERT OR IGNORE INTO referrals(referrer_id, referred_id, status, bonus_coins, signup_ip, flagged_same_ip, created_at)
    VALUES (?, ?, 'pending', ?, ?, ?, ?)
  `).run(referrer.id, newUserId, bonusCoins, signupIp || '', sameIp ? 1 : 0, Date.now());
}

export function register(username, password, opts = {}) {
  const name = String(username || '').trim();
  if (!/^[A-Za-z0-9_]{3,20}$/.test(name)) throw new AppError('Usernames are 3–20 letters, numbers or underscores');
  if (String(password || '').length < 4) throw new AppError('Passwords need at least 4 characters');
  if (db.prepare('SELECT 1 FROM users WHERE LOWER(username)=LOWER(?)').get(name)) throw new AppError('That username is taken');

  const first = !db.prepare('SELECT 1 FROM users LIMIT 1').get();
  const role = first || ADMIN_USERNAMES.includes(name.toLowerCase()) ? 'admin' : 'user';
  const startCents = getWelcomeBonusCents();
  const hue = Math.floor(Math.random() * 360);
  const refCode = makeRefCode();
  const ip = String(opts.ip || '').slice(0, 64);
  const now = Date.now();

  const id = db.transaction(() => {
    const r = db.prepare(`
      INSERT INTO users(username, pass_hash, role, balance, hue, created_at, ref_code, signup_ip)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?)
    `).run(name, bcrypt.hashSync(password, 10), role, startCents, hue, now, refCode, ip);
    const uid = Number(r.lastInsertRowid);
    if (startCents > 0) {
      db.prepare('INSERT INTO ledger(user_id,kind,amount,balance_after,ref,created_at) VALUES (?,?,?,?,?,?)')
        .run(uid, 'welcome', startCents, startCents, 'Welcome Bonus', now);
    }
    recordReferralIfAny(uid, opts.refCode, ip);
    return uid;
  })();
  scheduleSync(true);
  return id;
}

export function login(username, password) {
  const u = db.prepare('SELECT id, pass_hash, banned FROM users WHERE LOWER(username)=LOWER(?)').get(String(username || '').trim());
  if (!u || !bcrypt.compareSync(String(password || ''), u.pass_hash)) throw new AppError('Username or password is wrong', 401);
  if (u.banned) throw new AppError('This account is suspended', 403);
  return u.id;
}

// Telegram WebApp initData HMAC verification + instant auto-login
export function loginWithTelegram(initData, ip = '') {
  if (!TELEGRAM_BOT_TOKEN) throw new AppError('Telegram Mini App login is not configured on the server yet', 503);
  const params = new URLSearchParams(String(initData || ''));
  const hash = params.get('hash');
  if (!hash) throw new AppError('Missing Telegram auth hash', 401);
  params.delete('hash');
  const dataCheckString = [...params.entries()].sort(([a], [b]) => a.localeCompare(b)).map(([k, v]) => `${k}=${v}`).join('\n');
  const secretKey = crypto.createHmac('sha256', 'WebAppData').update(TELEGRAM_BOT_TOKEN).digest();
  const expected = crypto.createHmac('sha256', secretKey).update(dataCheckString).digest('hex');
  if (expected !== hash) throw new AppError('Invalid Telegram authentication signature', 401);

  const tgUser = JSON.parse(params.get('user') || '{}');
  if (!tgUser.id) throw new AppError('Missing Telegram user payload', 400);
  const tgId = String(tgUser.id);
  const existing = db.prepare('SELECT * FROM users WHERE tg_id=?').get(tgId);
  if (existing) {
    if (existing.banned) throw new AppError('This account is suspended', 403);
    return existing.id;
  }

  let baseName = (tgUser.username || `tg_${tgId}`).replace(/[^a-zA-Z0-9_]/g, '').slice(0, 16) || `tg_${tgId.slice(-6)}`;
  let finalName = baseName;
  let suffix = 1;
  while (db.prepare('SELECT 1 FROM users WHERE LOWER(username)=LOWER(?)').get(finalName)) {
    finalName = `${baseName.slice(0, 14)}${suffix++}`;
  }

  const first = !db.prepare('SELECT 1 FROM users LIMIT 1').get();
  const role = first || ADMIN_USERNAMES.includes(finalName.toLowerCase()) ? 'admin' : 'user';
  const startCents = getWelcomeBonusCents();
  const hue = Math.floor(Math.random() * 360);
  const refCode = makeRefCode();
  const now = Date.now();
  const randPass = crypto.randomBytes(16).toString('hex');

  const id = db.transaction(() => {
    const r = db.prepare(`
      INSERT INTO users(username, pass_hash, role, balance, hue, created_at, ref_code, signup_ip, tg_id, tg_username)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).run(finalName, bcrypt.hashSync(randPass, 8), role, startCents, hue, now, refCode, String(ip).slice(0, 64), tgId, tgUser.username || '');
    const uid = Number(r.lastInsertRowid);
    if (startCents > 0) {
      db.prepare('INSERT INTO ledger(user_id,kind,amount,balance_after,ref,created_at) VALUES (?,?,?,?,?,?)')
        .run(uid, 'welcome', startCents, startCents, 'Welcome Bonus', now);
    }
    const startParam = params.get('start_param') || '';
    if (startParam) recordReferralIfAny(uid, startParam, ip);
    return uid;
  })();
  scheduleSync(true);
  return id;
}

export function loadUser(req, res, next) {
  const decoded = verifyToken(req.cookies?.[COOKIE]);
  const uid = decoded?.uid ?? null;
  req.user = uid ? db.prepare('SELECT * FROM users WHERE id=?').get(uid) : null;
  if (req.user?.banned) req.user = null;
  if (req.user && decoded?.iat && (Math.floor(Date.now() / 1000) - decoded.iat > 86400)) {
    signSession(res, req.user.id);
  }
  next();
}

export function requireUser(req, res, next) {
  if (!req.user) return res.status(401).json({ error: 'Log in to play' });
  next();
}

export function requireAdmin(req, res, next) {
  if (req.user?.role !== 'admin') return res.status(403).json({ error: 'Admins only' });
  next();
}

export function publicUser(u) {
  if (!u) return null;
  const refCode = ensureRefCode(u);
  const lvl = VIP_LEVELS[u.vip_level] || VIP_LEVELS[0];
  const next = VIP_LEVELS[(u.vip_level || 0) + 1];
  const w = (u.wagered || 0) / CENTS;
  const dailyCoins = Number(getSetting('daily_bonus_coins', '10')) || 10;
  const dailyReadyAt = (u.last_daily || 0) + DAILY_COOLDOWN_MS;
  return {
    id: u.id, username: u.username, role: u.role, hue: u.hue ?? 210, createdAt: u.created_at,
    balance: u.balance / CENTS, wagered: w, profit: (u.profit || 0) / CENTS, betCount: u.bet_count || 0,
    rakeback: (u.rakeback || 0) / CENTS,
    refCode,
    tgUsername: u.tg_username || null,
    dailyCoins,
    dailyReadyAt,
    dailyReady: Date.now() >= dailyReadyAt,
    refillReadyAt: (u.last_refill || 0) + REFILL_COOLDOWN_MS,
    refillBelow: REFILL_BELOW / CENTS,
    vip: {
      level: u.vip_level || 0, name: lvl.name, daily: dailyCoins, rakebackRate: lvl.rakeback,
      next: next ? { name: next.name, at: next.min, reward: next.reward } : null,
      progress: next ? Math.min(1, (w - lvl.min) / (next.min - lvl.min)) : 1
    }
  };
}
