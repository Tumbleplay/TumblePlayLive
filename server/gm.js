import { db } from './db.js';
import { AppError } from './util.js';

export const GM_GAMES = ['mines', 'dice', 'limbo', 'plinko', 'keno', 'wheel', 'roulette', 'crash', 'hilo', 'blackjack'];
const VALID_MODES = ['normal', 'loss', 'win'];
const DEFAULT_GLOBAL = { mode: 'normal', games: ['all'], crashNextPoint: null };

const getSetting = db.prepare('SELECT value FROM settings WHERE key=?');
const putSetting = db.prepare('INSERT INTO settings(key,value) VALUES (?,?) ON CONFLICT(key) DO UPDATE SET value=excluded.value');
const getUserRow = db.prepare('SELECT * FROM gm_overrides WHERE user_id=?');
const putUserRow = db.prepare(`
  INSERT INTO gm_overrides(user_id,mode,game,remaining,updated_at)
  VALUES (?,?,?,?,?)
  ON CONFLICT(user_id) DO UPDATE SET
    mode=excluded.mode, game=excluded.game, remaining=excluded.remaining, updated_at=excluded.updated_at
`);
const delUserRow = db.prepare('DELETE FROM gm_overrides WHERE user_id=?');

export function getGlobal() {
  const r = getSetting.get('gm_global');
  if (!r) return { ...DEFAULT_GLOBAL };
  try {
    const parsed = JSON.parse(r.value);
    return {
      mode: VALID_MODES.includes(parsed.mode) ? parsed.mode : 'normal',
      games: Array.isArray(parsed.games) && parsed.games.length ? parsed.games : ['all'],
      crashNextPoint: parsed.crashNextPoint != null ? Number(parsed.crashNextPoint) : null
    };
  } catch {
    return { ...DEFAULT_GLOBAL };
  }
}

export function setGlobal(patch) {
  const cur = getGlobal();
  const mode = patch.mode !== undefined ? (VALID_MODES.includes(patch.mode) ? patch.mode : null) : cur.mode;
  if (!mode) throw new AppError('Invalid mode (use normal, loss, or win)');

  let games = cur.games;
  if (patch.games !== undefined) {
    if (!Array.isArray(patch.games) || !patch.games.length) {
      games = ['all'];
    } else if (patch.games.includes('all')) {
      games = ['all'];
    } else {
      games = [...new Set(patch.games.filter(g => GM_GAMES.includes(g)))];
      if (!games.length) games = ['all'];
    }
  }

  let crashNextPoint = cur.crashNextPoint;
  if (patch.crashNextPoint !== undefined) {
    if (patch.crashNextPoint === null || patch.crashNextPoint === '') {
      crashNextPoint = null;
    } else {
      const pt = Math.floor(Number(patch.crashNextPoint) * 100) / 100;
      if (!(pt >= 1 && pt <= 1e6)) throw new AppError('Crash point must be between 1.00 and 1,000,000');
      crashNextPoint = pt;
    }
  }

  const next = { mode, games, crashNextPoint };
  putSetting.run('gm_global', JSON.stringify(next));
  return next;
}

export function takeCrashOverride() {
  const cur = getGlobal();
  if (cur.crashNextPoint == null) return null;
  const pt = cur.crashNextPoint;
  setGlobal({ crashNextPoint: null });
  return pt;
}

export function setUserOverride(userId, { mode = 'normal', game = 'all', remaining = 1 }) {
  if (!VALID_MODES.includes(mode)) throw new AppError('Invalid mode');
  if (game !== 'all' && !GM_GAMES.includes(game)) throw new AppError('Invalid game');
  if (mode === 'normal') {
    delUserRow.run(Number(userId));
    return { userId: Number(userId), mode: 'normal', game: 'all', remaining: 0 };
  }
  const rem = Number(remaining);
  const cleanRem = rem === -1 ? -1 : Math.max(1, Math.min(1000, Math.floor(rem || 1)));
  putUserRow.run(Number(userId), mode, game, cleanRem, Date.now());
  return { userId: Number(userId), mode, game, remaining: cleanRem };
}

export function listOverrides() {
  return db.prepare(`
    SELECT o.user_id AS userId, u.username, o.mode, o.game, o.remaining, o.updated_at AS updatedAt
    FROM gm_overrides o
    JOIN users u ON u.id = o.user_id
    WHERE o.mode != 'normal'
    ORDER BY o.updated_at DESC
  `).all();
}

export function peekRule(userId, game) {
  const u = getUserRow.get(userId);
  if (u && u.mode !== 'normal' && (u.game === 'all' || u.game === game)) {
    return u.mode;
  }
  const g = getGlobal();
  if (g.mode !== 'normal' && (g.games.includes('all') || g.games.includes(game))) {
    return g.mode;
  }
  return 'normal';
}

export function consumeRule(userId, game) {
  const u = getUserRow.get(userId);
  if (u && u.mode !== 'normal' && (u.game === 'all' || u.game === game)) {
    const mode = u.mode;
    if (u.remaining > 0) {
      const nextRem = u.remaining - 1;
      if (nextRem <= 0) delUserRow.run(userId);
      else db.prepare('UPDATE gm_overrides SET remaining=?, updated_at=? WHERE user_id=?').run(nextRem, Date.now(), userId);
    }
    return mode;
  }
  const g = getGlobal();
  if (g.mode !== 'normal' && (g.games.includes('all') || g.games.includes(game))) {
    return g.mode;
  }
  return 'normal';
}
