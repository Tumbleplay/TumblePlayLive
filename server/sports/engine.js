import { db, tx } from '../db.js';
import { wager, settle, balanceOf } from '../wallet.js';
import { AppError, parseAmount } from '../util.js';
import { CENTS, MAX_BET, MAX_WIN, ODDS_API_KEY } from '../config.js';
import { toAll, toUser } from '../bus.js';
import { SPORTS, createModel, scoreAt, marketsFor, probabilities, settleMarket, toOdds } from './models.js';
import { importOddsApi } from './oddsapi.js';

const TEAMS = {
  football: ['Harbor City', 'Northgate United', 'Redwood FC', 'Kingsport Rovers', 'Lakeside Athletic', 'Ironbridge', 'Silverton Town', 'Westmoor', 'Port Aurora', 'Highfield Albion'],
  cricket: ['Monsoon Riders', 'Desert Hawks', 'Tidal Strikers', 'Summit Kings', 'Saffron Stars', 'Thunder Bay XI', 'Coral Coast', 'Ridge Royals'],
  basketball: ['Skyline Comets', 'Bayview Bolts', 'Granite Giants', 'Canyon Coyotes', 'Pier 9 Pilots', 'Cedar Falls Owls', 'Neon Knights', 'Delta Drift'],
  tennis: ['A. Moreau', 'K. Ivanova', 'L. Santos', 'J. Park', 'M. Okafor', 'R. Lindqvist', 'T. Nakamura', 'E. Costa', 'D. Mensah', 'S. Kowalski']
};
const LEAGUES = { football: 'Atlantic League', cricket: 'Coastal T20', basketball: 'Metro Hoops', tennis: 'Harbour Open' };
const UPCOMING_TARGET = 6;

const pick2 = list => { const a = Math.floor(Math.random() * list.length); let b = Math.floor(Math.random() * (list.length - 1)); if (b >= a) b++; return [list[a], list[b]]; };

function createDemoEvent(sport, startsAt) {
  const [home, away] = pick2(TEAMS[sport]), model = createModel(sport);
  return tx(() => {
    const id = db.prepare('INSERT INTO events(sport,league,home,away,starts_at,duration_ms,model) VALUES (?,?,?,?,?,?,?)')
      .run(sport, LEAGUES[sport], home, away, startsAt, SPORTS[sport].durationMs, JSON.stringify(model)).lastInsertRowid;
    for (const mk of marketsFor(sport, model)) {
      const mid = db.prepare('INSERT INTO markets(event_id,key,name,line) VALUES (?,?,?,?)').run(id, mk.key, mk.name, mk.line ?? null).lastInsertRowid;
      const P = probabilities(sport, model, 0, [0, 0], mk.line);
      for (const [k, label] of mk.sels)
        db.prepare('INSERT INTO selections(market_id,key,name,odds) VALUES (?,?,?,?)').run(mid, k, label.replace('HOME', home).replace('AWAY', away), toOdds(P[k]));
    }
    return id;
  })();
}

function topUpFixtures() {
  const t = Date.now();
  for (const sport of Object.keys(SPORTS)) {
    const up = db.prepare("SELECT COUNT(*) n, MAX(starts_at) last FROM events WHERE sport=? AND source='demo' AND status='upcoming'").get(sport);
    const anyDemo = db.prepare("SELECT 1 FROM events WHERE sport=? AND source='demo' LIMIT 1").get(sport);
    if (!anyDemo) { // first boot: one match already in play
      createDemoEvent(sport, t - SPORTS[sport].durationMs * (0.2 + Math.random() * 0.4));
    }
    let last = Math.max(up.last || 0, t);
    for (let i = up.n; i < UPCOMING_TARGET; i++) {
      last += (4 + Math.random() * 8) * 60_000;
      createDemoEvent(sport, Math.round(last));
    }
  }
}

const getMarkets = db.prepare('SELECT * FROM markets WHERE event_id=? ORDER BY id');
const getSels = db.prepare('SELECT * FROM selections WHERE market_id=? ORDER BY id');
const setOdds = db.prepare('UPDATE selections SET odds=? WHERE id=?');

// Advance live demo matches, refresh odds, finish and settle the ones that ended
function progressDemo() {
  const t = Date.now(), changed = [];
  const live = db.prepare("SELECT * FROM events WHERE source='demo' AND status IN ('upcoming','live') AND starts_at<=?").all(t);
  for (const e of live) {
    const m = JSON.parse(e.model), p = Math.min(1, (t - e.starts_at) / e.duration_ms);
    const [sh, sa] = p >= 1 ? finalScore(e.sport, m) : scoreAt(e.sport, m, p);
    if (p >= 1) { settleEvent(e.id, sh, sa); changed.push(e.id); continue; }
    tx(() => {
      db.prepare("UPDATE events SET status='live', score_home=?, score_away=? WHERE id=?").run(sh, sa, e.id);
      const locked = p > 0.95;
      for (const mk of getMarkets.all(e.id)) {
        if (mk.status === 'settled') continue;
        db.prepare('UPDATE markets SET status=? WHERE id=?').run(locked ? 'suspended' : 'open', mk.id);
        const P = probabilities(e.sport, m, p, [sh, sa], mk.line);
        for (const s of getSels.all(mk.id)) setOdds.run(toOdds(P[s.key] ?? 0), s.id);
      }
    })();
    changed.push(e.id);
  }
  if (changed.length) toAll('sports:update', { events: changed.map(eventDTO).filter(Boolean) });
}
const finalScore = (sport, m) => (sport === 'football' || sport === 'tennis' ? scoreAt(sport, m, 1) : m.final);

// Settle every market of an event from its final score, then every bet that touches it
export function settleEvent(eventId, sh, sa, { cancel = false } = {}) {
  const touched = new Set();
  tx(() => {
    db.prepare("UPDATE events SET status=?, score_home=?, score_away=?, settled_at=? WHERE id=?").run(cancel ? 'cancelled' : 'settled', sh, sa, Date.now(), eventId);
    for (const mk of getMarkets.all(eventId)) {
      const res = cancel ? {} : settleMarket(mk.key, mk.line, sh, sa);
      db.prepare("UPDATE markets SET status='settled' WHERE id=?").run(mk.id);
      for (const s of getSels.all(mk.id)) {
        const r = cancel ? 'void' : res[s.key] || 'void';
        db.prepare('UPDATE selections SET result=? WHERE id=?').run(r, s.id);
        db.prepare("UPDATE sport_legs SET result=? WHERE selection_id=? AND result='pending'").run(r, s.id);
      }
    }
    for (const { bet_id } of db.prepare("SELECT DISTINCT l.bet_id FROM sport_legs l JOIN sport_bets b ON b.id=l.bet_id WHERE l.event_id=? AND b.status='pending'").all(eventId)) {
      const r = settleBet(bet_id); if (r) touched.add(r);
    }
  })();
  for (const uid of touched) toUser(uid, 'balance', { balance: balanceOf(uid) / CENTS });
  toAll('sports:update', { events: [eventDTO(eventId)].filter(Boolean) });
}
function settleBet(betId) {
  const b = db.prepare('SELECT * FROM sport_bets WHERE id=?').get(betId);
  const legs = db.prepare('SELECT * FROM sport_legs WHERE bet_id=?').all(betId);
  if (legs.some(l => l.result === 'lost')) {
    db.prepare("UPDATE sport_bets SET status='lost', settled_at=? WHERE id=?").run(Date.now(), betId);
    settle(b.user_id, 0, b.amount, 'sport_win', `sport bet ${betId}`);
  } else if (legs.every(l => l.result !== 'pending')) {
    const odds = legs.reduce((o, l) => o * (l.result === 'won' ? l.odds : 1), 1);
    const allVoid = legs.every(l => l.result === 'void');
    const payout = Math.min(MAX_WIN, Math.floor(b.amount * odds));
    db.prepare('UPDATE sport_bets SET status=?, payout=?, settled_at=? WHERE id=?').run(allVoid ? 'void' : 'won', payout, Date.now(), betId);
    settle(b.user_id, payout, b.amount, allVoid ? 'refund' : 'sport_win', `sport bet ${betId}`);
    if (!allVoid) queueMicrotask(() => toUser(b.user_id, 'sports:won', { betId, payout: payout / CENTS }));
  } else return null;
  return b.user_id;
}

/* ---------- read models ---------- */
export function eventDTO(idOrRow) {
  const e = typeof idOrRow === 'object' ? idOrRow : db.prepare('SELECT * FROM events WHERE id=?').get(idOrRow);
  if (!e) return null;
  const progress = e.status === 'live' && e.source === 'demo' ? Math.min(1, (Date.now() - e.starts_at) / e.duration_ms) : null;
  return {
    id: e.id, sport: e.sport, league: e.league, home: e.home, away: e.away, startsAt: e.starts_at, status: e.status,
    score: [e.score_home, e.score_away], progress, source: e.source,
    markets: getMarkets.all(e.id).map(mk => ({
      id: mk.id, key: mk.key, name: mk.name, line: mk.line, status: mk.status,
      selections: getSels.all(mk.id).map(s => ({ id: s.id, key: s.key, name: s.name, odds: s.odds, result: s.result }))
    }))
  };
}
export function listEvents({ sport, status } = {}) {
  const where = ["status IN ('upcoming','live')"], args = [];
  if (sport) { where.push('sport=?'); args.push(sport); }
  if (status) { where[0] = 'status=?'; args.unshift(status); }
  return db.prepare(`SELECT * FROM events WHERE ${where.join(' AND ')} ORDER BY CASE status WHEN 'live' THEN 0 ELSE 1 END, starts_at LIMIT 120`).all(...args).map(eventDTO);
}

/* ---------- placing bets ---------- */
export function placeSportBet(user, body) {
  const legsIn = Array.isArray(body.legs) ? body.legs : [];
  if (!legsIn.length || legsIn.length > 12) throw new AppError('Add 1 to 12 selections to your slip');
  const amount = parseAmount(body.amount, { max: MAX_BET });
  const out = tx(() => {
    const legs = legsIn.map(l => {
      const s = db.prepare('SELECT s.*, m.status mstatus, m.event_id, e.status estatus, e.home, e.away FROM selections s JOIN markets m ON m.id=s.market_id JOIN events e ON e.id=m.event_id WHERE s.id=?').get(Number(l.selectionId));
      if (!s) throw new AppError('A selection on your slip no longer exists');
      if (s.mstatus !== 'open' || !['upcoming', 'live'].includes(s.estatus) || !s.odds) throw new AppError(`${s.name} is suspended right now`);
      if (l.odds && s.odds < Number(l.odds) - 1e-9) throw new AppError(`Odds changed for ${s.name}: now ${s.odds.toFixed(2)}. Review your slip.`, 409);
      return s;
    });
    if (new Set(legs.map(l => l.event_id)).size !== legs.length) throw new AppError('A multi can only have one selection per match');
    const odds = Math.round(legs.reduce((o, l) => o * l.odds, 1) * 100) / 100;
    if (odds > 10000) throw new AppError('Combined odds are capped at 10,000');
    wager(user.id, amount, 'sport_bet', 'sports');
    const betId = db.prepare('INSERT INTO sport_bets(user_id,amount,odds,created_at) VALUES (?,?,?,?)').run(user.id, amount, odds, Date.now()).lastInsertRowid;
    for (const l of legs) db.prepare('INSERT INTO sport_legs(bet_id,selection_id,event_id,odds) VALUES (?,?,?,?)').run(betId, l.id, l.event_id, l.odds);
    return { betId, odds };
  })();
  toAll('bet', { id: `sport-${out.betId}`, game: 'sports', username: user.username, hue: user.hue, amount: amount / CENTS, multiplier: out.odds, payout: null, at: Date.now() });
  return { ...out, balance: balanceOf(user.id) / CENTS };
}

export function myBets(user, status) {
  const rows = db.prepare(`SELECT * FROM sport_bets WHERE user_id=? ${status === 'open' ? "AND status='pending'" : status === 'settled' ? "AND status!='pending'" : ''} ORDER BY id DESC LIMIT 50`).all(user.id);
  return rows.map(b => ({
    id: b.id, amount: b.amount / CENTS, odds: b.odds, status: b.status, payout: b.payout / CENTS, createdAt: b.created_at,
    legs: db.prepare('SELECT l.odds, l.result, s.name sel, m.name market, e.home, e.away, e.status estatus, e.score_home, e.score_away, e.sport FROM sport_legs l JOIN selections s ON s.id=l.selection_id JOIN markets m ON m.id=s.market_id JOIN events e ON e.id=l.event_id WHERE l.bet_id=?').all(b.id)
      .map(l => ({ selection: l.sel, market: l.market, match: `${l.home} vs ${l.away}`, sport: l.sport, odds: l.odds, result: l.result, eventStatus: l.estatus, score: [l.score_home, l.score_away] }))
  }));
}

/* ---------- admin-created matches ---------- */
export function adminCreateEvent(b) {
  const sport = String(b.sport);
  if (!SPORTS[sport]) throw new AppError('Unknown sport');
  const home = String(b.home || '').trim().slice(0, 40), away = String(b.away || '').trim().slice(0, 40);
  if (!home || !away) throw new AppError('Enter both team names');
  const startsAt = Number(new Date(b.startsAt));
  if (!startsAt) throw new AppError('Pick a start time');
  const markets = Array.isArray(b.markets) ? b.markets : [];
  return tx(() => {
    const id = db.prepare("INSERT INTO events(sport,league,home,away,starts_at,duration_ms,source) VALUES (?,?,?,?,?,?,'manual')")
      .run(sport, String(b.league || 'Featured').slice(0, 40), home, away, startsAt, 2 * 3600_000).lastInsertRowid;
    for (const mk of markets) {
      const mid = db.prepare('INSERT INTO markets(event_id,key,name,line) VALUES (?,?,?,?)').run(id, mk.key, mk.name, mk.line ?? null).lastInsertRowid;
      for (const s of mk.selections) db.prepare('INSERT INTO selections(market_id,key,name,odds) VALUES (?,?,?,?)').run(mid, s.key, s.name, Number(s.odds));
    }
    return id;
  })();
}

// Manual and imported matches: lock betting once they start
function lockStarted() {
  const r = db.prepare("UPDATE events SET status='live' WHERE source!='demo' AND status='upcoming' AND starts_at<=?").run(Date.now());
  if (r.changes) db.prepare("UPDATE markets SET status='suspended' WHERE status='open' AND event_id IN (SELECT id FROM events WHERE source!='demo' AND status='live')").run();
}

export function startSports() {
  const loop = () => { try { topUpFixtures(); progressDemo(); lockStarted(); } catch (e) { console.error('sports loop', e); } };
  loop(); setInterval(loop, 5000);
  if (ODDS_API_KEY) {
    const run = () => importOddsApi({ settleEvent }).catch(e => console.error('odds api', e.message));
    run(); setInterval(run, 15 * 60_000);
  }
}
