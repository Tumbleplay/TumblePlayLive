import crypto from 'node:crypto';
import { db } from './db.js';
import { AppError } from './util.js';
import { bytesToFloats } from '../shared/math.js';

export const sha256 = s => crypto.createHash('sha256').update(s).digest('hex');
export const randomHex = n => crypto.randomBytes(n).toString('hex');

export function floats(serverSeed, clientSeed, nonce, count) {
  const blocks = [];
  for (let cursor = 0; blocks.length * 8 < count; cursor++)
    blocks.push(crypto.createHmac('sha256', serverSeed).update(`${clientSeed}:${nonce}:${cursor}`).digest());
  return bytesToFloats(blocks, count);
}

function createSeed(userId, clientSeed) {
  const server = randomHex(32);
  const r = db.prepare('INSERT INTO seeds(user_id,server_seed,server_hash,client_seed,created_at) VALUES (?,?,?,?,?)')
    .run(userId, server, sha256(server), clientSeed, Date.now());
  return db.prepare('SELECT * FROM seeds WHERE id=?').get(r.lastInsertRowid);
}
export function activeSeed(userId) {
  return db.prepare('SELECT * FROM seeds WHERE user_id=? AND active=1').get(userId) || createSeed(userId, randomHex(8));
}
// Reserve the next nonce; returns the seed row with the nonce to use. Call inside a transaction.
export function draw(userId, count) {
  const s = activeSeed(userId);
  db.prepare('UPDATE seeds SET nonce=nonce+1 WHERE id=?').run(s.id);
  return { seedId: s.id, nonce: s.nonce, f: floats(s.server_seed, s.client_seed, s.nonce, count) };
}

export function rotate(userId, clientSeed) {
  if (db.prepare('SELECT 1 FROM mines_games WHERE user_id=?').get(userId) || db.prepare('SELECT 1 FROM game_states WHERE user_id=?').get(userId))
    throw new AppError('Finish your game in progress before rotating seeds');
  const cs = String(clientSeed || '').trim().slice(0, 64) || randomHex(8);
  return db.transaction(() => {
    db.prepare('UPDATE seeds SET active=0, revealed_at=? WHERE user_id=? AND active=1').run(Date.now(), userId);
    createSeed(userId, cs);
  })();
}

export function fairInfo(userId) {
  const a = activeSeed(userId);
  const prev = db.prepare('SELECT id, server_seed, server_hash, client_seed, nonce, revealed_at FROM seeds WHERE user_id=? AND active=0 ORDER BY id DESC LIMIT 10').all(userId);
  return {
    active: { id: a.id, serverHash: a.server_hash, clientSeed: a.client_seed, nonce: a.nonce },
    previous: prev.map(p => ({ id: p.id, serverSeed: p.server_seed, serverHash: p.server_hash, clientSeed: p.client_seed, bets: p.nonce, revealedAt: p.revealed_at }))
  };
}
