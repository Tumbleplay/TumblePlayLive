import fs from 'node:fs';
const DB = '/tmp/tumble-sports.db';
for (const f of [DB, DB + '-wal', DB + '-shm']) fs.rmSync(f, { force: true });
process.env.DB_PATH = DB;
const { db } = await import('../server/db.js');
const auth = await import('../server/auth.js');
const S = await import('../server/sports/engine.js');
let fails = 0;
const ok = (c, m) => { console.log(`${c ? 'ok  ' : 'FAIL'} ${m}`); if (!c) fails++; };
const uid = auth.register('punter', 'password123');
const user = () => db.prepare('SELECT * FROM users WHERE id=?').get(uid);

const mk = (home, away, sport = 'football') => S.adminCreateEvent({ sport, home, away, startsAt: new Date(Date.now() + 3600e3).toISOString(), markets: [
  { key: '1x2', name: 'Match result', selections: [{ key: 'home', name: home, odds: 2 }, { key: 'draw', name: 'Draw', odds: 3 }, { key: 'away', name: away, odds: 4 }] },
  { key: 'totals', name: 'Total', line: 2.5, selections: [{ key: 'over', name: 'Over 2.5', odds: 1.9 }, { key: 'under', name: 'Under 2.5', odds: 1.9 }] }] });
const e1 = mk('A', 'B'), e2 = mk('C', 'D'), e3 = mk('E', 'F');
const sel = (e, mkey, key) => db.prepare('SELECT s.* FROM selections s JOIN markets m ON m.id=s.market_id WHERE m.event_id=? AND m.key=? AND s.key=?').get(e, mkey, key);

const start = user().balance;
S.placeSportBet(user(), { amount: 10, legs: [{ selectionId: sel(e1, '1x2', 'home').id }] });                         // single, will win at 2.0
S.placeSportBet(user(), { amount: 10, legs: [{ selectionId: sel(e1, 'totals', 'over').id }, { selectionId: sel(e2, '1x2', 'away').id }] }); // multi, leg 2 loses
S.placeSportBet(user(), { amount: 10, legs: [{ selectionId: sel(e1, '1x2', 'home').id }, { selectionId: sel(e3, '1x2', 'draw').id }] });    // multi, e3 cancelled -> void leg
ok(user().balance === start - 3000, 'three stakes taken');
let t = false; try { S.placeSportBet(user(), { amount: 10, legs: [{ selectionId: sel(e1, '1x2', 'home').id }, { selectionId: sel(e1, 'totals', 'over').id }] }); } catch { t = true; }
ok(t, 'two picks from one match are refused');
t = false; try { S.placeSportBet(user(), { amount: 10, legs: [{ selectionId: sel(e2, '1x2', 'home').id, odds: 2.5 }] }); } catch (e) { t = e.status === 409; }
ok(t, 'stale odds are refused with 409');

S.settleEvent(e1, 2, 1);           // home wins, 3 goals -> over wins
ok(user().balance === start - 3000 + 2000, 'single paid 20.00 at 2.0');
S.settleEvent(e2, 1, 1);           // draw -> away loses
S.settleEvent(e3, 0, 0, { cancel: true });
const bets = db.prepare('SELECT status, payout FROM sport_bets ORDER BY id').all();
ok(bets[0].status === 'won' && bets[1].status === 'lost', 'single won, losing multi lost');
ok(bets[2].status === 'won' && bets[2].payout === 2000, 'multi with a cancelled leg pays the remaining odds (10 × 2.0)');
ok(user().balance === start - 3000 + 4000, 'balance after settlement is right');
const last = db.prepare('SELECT balance_after FROM ledger WHERE user_id=? ORDER BY id DESC LIMIT 1').get(uid);
ok(last.balance_after === user().balance, 'ledger tail matches balance');
console.log(fails ? `\n${fails} failed` : '\nAll sports checks passed'); process.exit(fails ? 1 : 0);
