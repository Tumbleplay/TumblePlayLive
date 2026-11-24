// Optional: real fixtures, odds and results from the-odds-api.com (set ODDS_API_KEY).
// Free plans have a monthly request quota, so this runs every 15 minutes on a few sports only.
import { db, tx } from '../db.js';
import { ODDS_API_KEY } from '../config.js';

const BASE = 'https://api.the-odds-api.com/v4';
const GROUPS = { Soccer: 'football', Basketball: 'basketball', Cricket: 'cricket', Tennis: 'tennis' };
const MAX_SPORTS = Number(process.env.ODDS_API_MAX_SPORTS) || 4;

async function get(path, params = {}) {
  const u = new URL(BASE + path);
  u.search = new URLSearchParams({ apiKey: ODDS_API_KEY, ...params });
  const r = await fetch(u);
  if (!r.ok) throw new Error(`${r.status} ${await r.text()}`);
  return r.json();
}

export async function importOddsApi({ settleEvent }) {
  const sports = (await get('/sports')).filter(s => s.active && GROUPS[s.group] && !s.has_outrights).slice(0, MAX_SPORTS);
  for (const s of sports) {
    const games = await get(`/sports/${s.key}/odds`, { regions: 'eu', markets: 'h2h,totals', oddsFormat: 'decimal' });
    for (const g of games) upsertGame(GROUPS[s.group], s.title, g);
    const scores = await get(`/sports/${s.key}/scores`, { daysFrom: 3 });
    for (const sc of scores) {
      if (!sc.completed || !sc.scores) continue;
      const e = db.prepare("SELECT id, home, away FROM events WHERE ext_id=? AND status NOT IN ('settled','cancelled')").get(sc.id);
      if (!e) continue;
      const val = name => Number(sc.scores.find(x => x.name === name)?.score);
      const sh = val(e.home), sa = val(e.away);
      if (Number.isFinite(sh) && Number.isFinite(sa)) settleEvent(e.id, sh, sa);
    }
  }
}

function upsertGame(sport, league, g) {
  const book = g.bookmakers?.[0];
  if (!book) return;
  const startsAt = Date.parse(g.commence_time);
  tx(() => {
    let e = db.prepare('SELECT id, status FROM events WHERE ext_id=?').get(g.id);
    if (!e) {
      const id = db.prepare("INSERT INTO events(sport,league,home,away,starts_at,duration_ms,source,ext_id) VALUES (?,?,?,?,?,?,'oddsapi',?)")
        .run(sport, league, g.home_team, g.away_team, startsAt, 2 * 3600_000, g.id).lastInsertRowid;
      e = { id, status: 'upcoming' };
    }
    if (e.status !== 'upcoming') return;
    for (const mk of book.markets) {
      const isTotals = mk.key === 'totals';
      const key = isTotals ? 'totals' : mk.outcomes.length === 3 ? '1x2' : 'ml';
      const line = isTotals ? mk.outcomes[0]?.point : null;
      const name = isTotals ? 'Total' : key === '1x2' ? 'Match result' : 'Match winner';
      db.prepare('INSERT INTO markets(event_id,key,name,line) VALUES (?,?,?,?) ON CONFLICT(event_id,key) DO UPDATE SET line=excluded.line').run(e.id, key, name, line);
      const mid = db.prepare('SELECT id FROM markets WHERE event_id=? AND key=?').get(e.id, key).id;
      for (const o of mk.outcomes) {
        const k = isTotals ? o.name.toLowerCase() : o.name === g.home_team ? 'home' : o.name === g.away_team ? 'away' : 'draw';
        const label = isTotals ? `${o.name} ${o.point}` : o.name;
        db.prepare('INSERT INTO selections(market_id,key,name,odds) VALUES (?,?,?,?) ON CONFLICT(market_id,key) DO UPDATE SET odds=excluded.odds, name=excluded.name').run(mid, k, label, o.price);
      }
    }
  })();
}
