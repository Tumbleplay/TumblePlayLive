import fs from 'node:fs';
import path from 'node:path';

export const IS_PROD = process.env.NODE_ENV === 'production';
export const PORT = Number(process.env.PORT) || 3000;
export const JWT_SECRET = process.env.JWT_SECRET || (IS_PROD ? '' : 'dev-only-secret-change-me');
if (!JWT_SECRET) throw new Error('JWT_SECRET must be set in production');

export const DB_PATH = process.env.DB_PATH || path.resolve('data/tumble.db');
fs.mkdirSync(path.dirname(DB_PATH), { recursive: true });

export const ODDS_API_KEY = process.env.ODDS_API_KEY || '';
export const ADMIN_USERNAMES = (process.env.ADMIN_USERNAMES || '').split(',').map(s => s.trim().toLowerCase()).filter(Boolean);

// Telegram Bot & Mini App (Set in Render/Northflank Environment Variables — NEVER commit tokens to GitHub)
export const TELEGRAM_BOT_TOKEN = (process.env.TELEGRAM_BOT_TOKEN || '').trim();
export const TELEGRAM_ADMIN_ID = (process.env.TELEGRAM_ADMIN_ID || '').trim();
export const WEBAPP_URL = (process.env.WEBAPP_URL || 'https://tumbleplay.onrender.com').trim().replace(/\/+$/, '');
export const TG_CHANNEL_URL = (process.env.TG_CHANNEL_URL || 'https://t.me/TumblePlayBot').trim();

// Optional NOWPayments API
export const NOWPAYMENTS_API_KEY = (process.env.NOWPAYMENTS_API_KEY || '').trim();
export const NOWPAYMENTS_IPN_SECRET = (process.env.NOWPAYMENTS_IPN_SECRET || '').trim();

// Money is stored as integer cents of a coin to avoid float drift
export const CENTS = 100;
export const START_BALANCE = 50 * CENTS;      // Strictly 50 coins welcome bonus only
export const DAILY_BONUS_DEFAULT = 10;        // 10 coins once every 24 hours
export const REFERRAL_BONUS_DEFAULT = 50;     // 50 coins per verified referral
export const REFILL_BELOW = 0;                // Disabled old 1000-coin free refills
export const REFILL_TO = 0;
export const REFILL_COOLDOWN_MS = 24 * 60 * 60 * 1000;
export const DAILY_COOLDOWN_MS = 24 * 60 * 60 * 1000;
export const MAX_BET = 1_000_000 * CENTS;
export const MAX_WIN = 100_000_000 * CENTS;
