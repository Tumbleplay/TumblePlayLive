import fs from 'node:fs';
import path from 'node:path';
import Database from 'better-sqlite3';
import { DB_PATH } from './config.js';

const SUPABASE_URL = (process.env.SUPABASE_URL || '').trim().replace(/\/+$/, '');
const SUPABASE_KEY = (process.env.SUPABASE_SERVICE_KEY || process.env.SUPABASE_KEY || '').trim();
const SUPABASE_BUCKET = (process.env.SUPABASE_BUCKET || 'tumble-data').trim();
const SUPABASE_OBJECT = (process.env.SUPABASE_OBJECT || 'tumble.db').trim();
const SYNC_ENABLED = Boolean(SUPABASE_URL && SUPABASE_KEY && DB_PATH && DB_PATH !== ':memory:');

const syncMeta = {
  enabled: SYNC_ENABLED,
  bucket: SUPABASE_BUCKET,
  restoredOnBoot: false,
  lastSyncAt: null,
  lastError: null,
  syncing: false
};

function sbHeaders(extra = {}) {
  return {
    Authorization: `Bearer ${SUPABASE_KEY}`,
    apikey: SUPABASE_KEY,
    ...extra
  };
}

async function ensureBucket() {
  try {
    const res = await fetch(`${SUPABASE_URL}/storage/v1/bucket`, {
      method: 'POST',
      headers: sbHeaders({ 'Content-Type': 'application/json' }),
      body: JSON.stringify({ id: SUPABASE_BUCKET, name: SUPABASE_BUCKET, public: false }),
      signal: AbortSignal.timeout(10_000)
    });
    return res.ok || res.status === 409;
  } catch {
    return false;
  }
}

async function pullFromSupabase() {
  if (!SYNC_ENABLED) return;
  try {
    const dir = path.dirname(DB_PATH);
    if (dir && dir !== '.') fs.mkdirSync(dir, { recursive: true });
    const url = `${SUPABASE_URL}/storage/v1/object/${encodeURIComponent(SUPABASE_BUCKET)}/${SUPABASE_OBJECT}`;
    const res = await fetch(url, {
      method: 'GET',
      headers: sbHeaders(),
      signal: AbortSignal.timeout(15_000)
    });
    if (res.ok) {
      const buf = Buffer.from(await res.arrayBuffer());
      if (buf.length > 0) {
        for (const suf of ['-wal', '-shm']) {
          try { if (fs.existsSync(DB_PATH + suf)) fs.unlinkSync(DB_PATH + suf); } catch {}
        }
        fs.writeFileSync(DB_PATH, buf);
        syncMeta.restoredOnBoot = true;
        syncMeta.lastSyncAt = Date.now();
        console.log(`[supabase] Restored ${SUPABASE_OBJECT} (${buf.length} bytes)`);
      }
    } else if (res.status === 400 || res.status === 404) {
      console.log(`[supabase] No existing backup in ${SUPABASE_BUCKET}/${SUPABASE_OBJECT}; starting fresh`);
    } else {
      const txt = await res.text().catch(() => '');
      syncMeta.lastError = `Boot pull HTTP ${res.status}: ${txt.slice(0, 120)}`;
      console.error(`[supabase] ${syncMeta.lastError}`);
    }
  } catch (err) {
    syncMeta.lastError = `Boot pull failed: ${err.message}`;
    console.error(`[supabase] ${syncMeta.lastError}`);
  }
}

// Pull saved database from Supabase BEFORE SQLite opens it
await pullFromSupabase();

const dbDir = path.dirname(DB_PATH);
if (DB_PATH !== ':memory:' && dbDir && dbDir !== '.') {
  fs.mkdirSync(dbDir, { recursive: true });
}

export const db = new Database(DB_PATH);
db.pragma('journal_mode = WAL');
db.pragma('foreign_keys = ON');

db.exec(`
CREATE TABLE IF NOT EXISTS users (
  id INTEGER PRIMARY KEY,
  username TEXT NOT NULL UNIQUE COLLATE NOCASE,
  pass_hash TEXT NOT NULL,
  role TEXT NOT NULL DEFAULT 'user',
  balance INTEGER NOT NULL,
  wagered INTEGER NOT NULL DEFAULT 0,
  profit INTEGER NOT NULL DEFAULT 0,
  bet_count INTEGER NOT NULL DEFAULT 0,
  vip_level INTEGER NOT NULL DEFAULT 0,
  rakeback INTEGER NOT NULL DEFAULT 0,
  last_daily INTEGER NOT NULL DEFAULT 0,
  last_refill INTEGER NOT NULL DEFAULT 0,
  banned INTEGER NOT NULL DEFAULT 0,
  muted_until INTEGER NOT NULL DEFAULT 0,
  hue INTEGER NOT NULL DEFAULT 250,
  created_at INTEGER NOT NULL
);
CREATE TABLE IF NOT EXISTS seeds (
  id INTEGER PRIMARY KEY,
  user_id INTEGER NOT NULL REFERENCES users(id),
  server_seed TEXT NOT NULL,
  server_hash TEXT NOT NULL,
  client_seed TEXT NOT NULL,
  nonce INTEGER NOT NULL DEFAULT 0,
  active INTEGER NOT NULL DEFAULT 1,
  created_at INTEGER NOT NULL,
  revealed_at INTEGER
);
CREATE INDEX IF NOT EXISTS seeds_user ON seeds(user_id, active);
CREATE TABLE IF NOT EXISTS ledger (
  id INTEGER PRIMARY KEY,
  user_id INTEGER NOT NULL REFERENCES users(id),
  kind TEXT NOT NULL,
  amount INTEGER NOT NULL,
  balance_after INTEGER NOT NULL,
  ref TEXT,
  created_at INTEGER NOT NULL
);
CREATE INDEX IF NOT EXISTS ledger_user ON ledger(user_id, id);
CREATE INDEX IF NOT EXISTS ledger_time ON ledger(created_at);
CREATE TABLE IF NOT EXISTS bets (
  id INTEGER PRIMARY KEY,
  user_id INTEGER NOT NULL REFERENCES users(id),
  game TEXT NOT NULL,
  amount INTEGER NOT NULL,
  multiplier REAL NOT NULL,
  payout INTEGER NOT NULL,
  seed_id INTEGER,
  nonce INTEGER,
  detail TEXT,
  created_at INTEGER NOT NULL
);
CREATE INDEX IF NOT EXISTS bets_user ON bets(user_id, id);
CREATE INDEX IF NOT EXISTS bets_time ON bets(created_at);
CREATE TABLE IF NOT EXISTS mines_games (
  user_id INTEGER PRIMARY KEY REFERENCES users(id),
  amount INTEGER NOT NULL,
  mines INTEGER NOT NULL,
  positions TEXT NOT NULL,
  revealed TEXT NOT NULL DEFAULT '[]',
  seed_id INTEGER NOT NULL,
  nonce INTEGER NOT NULL,
  created_at INTEGER NOT NULL
);
CREATE TABLE IF NOT EXISTS game_states (
  user_id INTEGER NOT NULL REFERENCES users(id),
  game TEXT NOT NULL,
  state TEXT NOT NULL,
  created_at INTEGER NOT NULL,
  PRIMARY KEY (user_id, game)
);
CREATE TABLE IF NOT EXISTS settings (key TEXT PRIMARY KEY, value TEXT NOT NULL);
CREATE TABLE IF NOT EXISTS gm_overrides (
  user_id INTEGER PRIMARY KEY REFERENCES users(id),
  mode TEXT NOT NULL DEFAULT 'normal',
  game TEXT NOT NULL DEFAULT 'all',
  remaining INTEGER NOT NULL DEFAULT -1,
  updated_at INTEGER NOT NULL
);
CREATE TABLE IF NOT EXISTS deposits (
  id INTEGER PRIMARY KEY,
  order_code TEXT NOT NULL UNIQUE,
  user_id INTEGER NOT NULL REFERENCES users(id),
  method TEXT NOT NULL,
  network TEXT,
  pay_amount REAL NOT NULL,
  pay_currency TEXT NOT NULL,
  coins INTEGER NOT NULL,
  reference TEXT NOT NULL UNIQUE COLLATE NOCASE,
  status TEXT NOT NULL DEFAULT 'pending',
  admin_note TEXT,
  reviewed_by TEXT,
  created_at INTEGER NOT NULL,
  reviewed_at INTEGER
);
CREATE INDEX IF NOT EXISTS deposits_user ON deposits(user_id, id);
CREATE INDEX IF NOT EXISTS deposits_status ON deposits(status, id);
CREATE TABLE IF NOT EXISTS crash_rounds (
  id INTEGER PRIMARY KEY,
  seed TEXT NOT NULL,
  hash TEXT NOT NULL,
  point REAL NOT NULL,
  started_at INTEGER,
  ended_at INTEGER
);
CREATE TABLE IF NOT EXISTS crash_bets (
  id INTEGER PRIMARY KEY,
  round_id INTEGER NOT NULL REFERENCES crash_rounds(id),
  user_id INTEGER NOT NULL REFERENCES users(id),
  amount INTEGER NOT NULL,
  auto_cashout REAL,
  cashed_at REAL,
  payout INTEGER NOT NULL DEFAULT 0,
  UNIQUE(round_id, user_id)
);
CREATE TABLE IF NOT EXISTS events (
  id INTEGER PRIMARY KEY,
  sport TEXT NOT NULL,
  league TEXT NOT NULL,
  home TEXT NOT NULL,
  away TEXT NOT NULL,
  starts_at INTEGER NOT NULL,
  duration_ms INTEGER NOT NULL,
  status TEXT NOT NULL DEFAULT 'upcoming',
  score_home REAL NOT NULL DEFAULT 0,
  score_away REAL NOT NULL DEFAULT 0,
  model TEXT,
  source TEXT NOT NULL DEFAULT 'demo',
  ext_id TEXT UNIQUE,
  settled_at INTEGER
);
CREATE INDEX IF NOT EXISTS events_status ON events(status, starts_at);
CREATE TABLE IF NOT EXISTS markets (
  id INTEGER PRIMARY KEY,
  event_id INTEGER NOT NULL REFERENCES events(id),
  key TEXT NOT NULL,
  name TEXT NOT NULL,
  line REAL,
  status TEXT NOT NULL DEFAULT 'open',
  UNIQUE(event_id, key)
);
CREATE TABLE IF NOT EXISTS selections (
  id INTEGER PRIMARY KEY,
  market_id INTEGER NOT NULL REFERENCES markets(id),
  key TEXT NOT NULL,
  name TEXT NOT NULL,
  odds REAL NOT NULL,
  result TEXT NOT NULL DEFAULT 'pending',
  UNIQUE(market_id, key)
);
CREATE TABLE IF NOT EXISTS sport_bets (
  id INTEGER PRIMARY KEY,
  user_id INTEGER NOT NULL REFERENCES users(id),
  amount INTEGER NOT NULL,
  odds REAL NOT NULL,
  status TEXT NOT NULL DEFAULT 'pending',
  payout INTEGER NOT NULL DEFAULT 0,
  created_at INTEGER NOT NULL,
  settled_at INTEGER
);
CREATE INDEX IF NOT EXISTS sport_bets_user ON sport_bets(user_id, id);
CREATE TABLE IF NOT EXISTS sport_legs (
  id INTEGER PRIMARY KEY,
  bet_id INTEGER NOT NULL REFERENCES sport_bets(id),
  selection_id INTEGER NOT NULL REFERENCES selections(id),
  event_id INTEGER NOT NULL REFERENCES events(id),
  odds REAL NOT NULL,
  result TEXT NOT NULL DEFAULT 'pending'
);
CREATE INDEX IF NOT EXISTS sport_legs_sel ON sport_legs(selection_id);
CREATE TABLE IF NOT EXISTS chat (
  id INTEGER PRIMARY KEY,
  user_id INTEGER NOT NULL REFERENCES users(id),
  text TEXT NOT NULL,
  deleted INTEGER NOT NULL DEFAULT 0,
  created_at INTEGER NOT NULL
);
`);

let syncTimer = null;
let inFlight = null;
let dirty = false;

export async function syncNow() {
  if (!SYNC_ENABLED) return { ...syncMeta };
  if (inFlight) {
    dirty = true;
    return inFlight;
  }
  dirty = false;
  syncMeta.syncing = true;
  const tmpPath = `${DB_PATH}.sync.tmp`;

  inFlight = (async () => {
    try {
      await db.backup(tmpPath);
      const buf = fs.readFileSync(tmpPath);
      const url = `${SUPABASE_URL}/storage/v1/object/${encodeURIComponent(SUPABASE_BUCKET)}/${SUPABASE_OBJECT}`;
      const upload = () => fetch(url, {
        method: 'POST',
        headers: sbHeaders({
          'Content-Type': 'application/octet-stream',
          'x-upsert': 'true'
        }),
        body: buf,
        signal: AbortSignal.timeout(15_000)
      });

      let res = await upload();
      if (res.status === 400 || res.status === 404) {
        const created = await ensureBucket();
        if (created) res = await upload();
      }

      if (!res.ok) {
        const txt = await res.text().catch(() => '');
        throw new Error(`HTTP ${res.status}: ${txt.slice(0, 120)}`);
      }
      syncMeta.lastSyncAt = Date.now();
      syncMeta.lastError = null;
    } catch (err) {
      syncMeta.lastError = err.message;
      console.error('[supabase] Sync error:', err.message);
    } finally {
      try { if (fs.existsSync(tmpPath)) fs.unlinkSync(tmpPath); } catch {}
      syncMeta.syncing = false;
      inFlight = null;
      if (dirty) scheduleSync(false);
    }
    return { ...syncMeta };
  })();

  return inFlight;
}

export function scheduleSync(urgent = false) {
  if (!SYNC_ENABLED) return;
  dirty = true;
  if (syncTimer) {
    if (!urgent) return;
    clearTimeout(syncTimer);
  }
  syncTimer = setTimeout(() => {
    syncTimer = null;
    syncNow();
  }, urgent ? 300 : 4000);
  syncTimer.unref?.();
}

export function syncStatus() {
  return { ...syncMeta };
}

export async function flushSync() {
  if (syncTimer) { clearTimeout(syncTimer); syncTimer = null; }
  if (SYNC_ENABLED) await syncNow();
}

// Safety periodic sync if changes accumulated
if (SYNC_ENABLED) {
  const periodic = setInterval(() => { if (dirty && !inFlight) syncNow(); }, 60_000);
  periodic.unref?.();
}

export const tx = fn => {
  const runner = db.transaction(fn);
  return (...args) => {
    const res = runner(...args);
    scheduleSync(false);
    return res;
  };
};


// --- TumblePlay v3 Safe Migrations (Preserves all existing users, history & Supabase sync) ---
db.exec(`
CREATE TABLE IF NOT EXISTS withdrawals (
  id INTEGER PRIMARY KEY,
  order_code TEXT NOT NULL UNIQUE,
  user_id INTEGER NOT NULL REFERENCES users(id),
  method TEXT NOT NULL DEFAULT 'amazon_gc',
  network TEXT,
  destination TEXT NOT NULL,
  inr_amount REAL NOT NULL,
  crypto_amount REAL,
  coins INTEGER NOT NULL,
  status TEXT NOT NULL DEFAULT 'pending',
  payout_ref TEXT,
  admin_note TEXT,
  reviewed_by TEXT,
  created_at INTEGER NOT NULL,
  reviewed_at INTEGER
);
CREATE INDEX IF NOT EXISTS withdrawals_user ON withdrawals(user_id, id);
CREATE INDEX IF NOT EXISTS withdrawals_status ON withdrawals(status, id);

CREATE TABLE IF NOT EXISTS referrals (
  id INTEGER PRIMARY KEY,
  referrer_id INTEGER NOT NULL REFERENCES users(id),
  referred_id INTEGER NOT NULL UNIQUE REFERENCES users(id),
  status TEXT NOT NULL DEFAULT 'pending',
  bonus_coins INTEGER NOT NULL DEFAULT 50,
  signup_ip TEXT,
  flagged_same_ip INTEGER NOT NULL DEFAULT 0,
  created_at INTEGER NOT NULL,
  verified_at INTEGER
);
CREATE INDEX IF NOT EXISTS referrals_referrer ON referrals(referrer_id, id);
CREATE INDEX IF NOT EXISTS referrals_status ON referrals(status, id);

CREATE TABLE IF NOT EXISTS promo_codes (
  id INTEGER PRIMARY KEY,
  code TEXT NOT NULL UNIQUE COLLATE NOCASE,
  coins INTEGER NOT NULL,
  max_uses INTEGER NOT NULL DEFAULT 50,
  used_count INTEGER NOT NULL DEFAULT 0,
  active INTEGER NOT NULL DEFAULT 1,
  created_at INTEGER NOT NULL
);

CREATE TABLE IF NOT EXISTS promo_claims (
  id INTEGER PRIMARY KEY,
  promo_id INTEGER NOT NULL REFERENCES promo_codes(id),
  user_id INTEGER NOT NULL REFERENCES users(id),
  claimed_at INTEGER NOT NULL,
  UNIQUE(promo_id, user_id)
);
`);

for (const col of [
  'ref_code TEXT',
  'referred_by INTEGER',
  'signup_ip TEXT',
  'tg_id TEXT',
  'tg_username TEXT'
]) {
  try { db.exec(`ALTER TABLE users ADD COLUMN ${col}`); } catch {}
}
try { db.exec('CREATE UNIQUE INDEX IF NOT EXISTS users_ref_code ON users(ref_code) WHERE ref_code IS NOT NULL'); } catch {}
try { db.exec('CREATE UNIQUE INDEX IF NOT EXISTS users_tg_id ON users(tg_id) WHERE tg_id IS NOT NULL'); } catch {}

export function getSetting(key, fallback = '') {
  const row = db.prepare('SELECT value FROM settings WHERE key=?').get(key);
  return row ? row.value : fallback;
}
export function setSetting(key, value) {
  db.prepare('INSERT INTO settings(key,value) VALUES (?,?) ON CONFLICT(key) DO UPDATE SET value=excluded.value').run(key, String(value));
  scheduleSync();
}
