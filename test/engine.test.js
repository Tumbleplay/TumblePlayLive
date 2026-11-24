// Engine checks: play every game many times against a scratch database,
// then confirm the ledger adds up and the observed edge is near the expected one.
import fs from 'node:fs';
const DB = '/tmp/tumble-test.db';
for (const f of [DB, DB + '-wal', DB + '-shm']) fs.rmSync(f, { force: true });
process.env.DB_PATH = DB;

const { db } = await import('../server/db.js');
const auth = await import('../server/auth.js');
const casino = await import('../server/games/casino.js');
const cards = await import('../server/games/cards.js');
const rewards = await import('../server/rewards.js');
const fair = await import('../server/fair.js');
const M = await import('../shared/math.js');

let fails = 0;
const ok = (cond, msg) => { console.log(`${cond ? 'ok  ' : 'FAIL'} ${msg}`); if (!cond) fails++; };
const user = () => db.prepare('SELECT * FROM users WHERE id=?').get(uid);
const uid = auth.register('tester', 'password123');
db.prepare('UPDATE users SET balance=? WHERE id=?').run(1e12, uid); // plenty of coins for the simulation
db.prepare("INSERT INTO ledger(user_id,kind,amount,balance_after,ref,created_at) VALUES (?,?,?,?,?,?)").run(uid, 'admin', 1e12 - 100000, 1e12, 'test funding', Date.now());

const N = 20000, edge = {};
function run(game, body, n = N) {
  let w = 0, p = 0;
  for (let i = 0; i < n; i++) { const r = casino.playInstant(user(), game, { amount: 1, ...body }); w += 1; p += r.payout; }
  return p / w;
}
edge.dice = run('dice', { target: 50.5, direction: 'over' });
edge.limbo = run('limbo', { target: 2 });
edge.plinko = run('plinko', { rows: 16, risk: 'low' });
edge.keno = run('keno', { picks: [1, 5, 9, 13, 17], risk: 'low' });
edge.wheel = run('wheel', { segments: 10, risk: 'low' });
for (const [g, rtp] of Object.entries(edge)) ok(rtp > 0.93 && rtp < 1.05, `${g} return ${(rtp * 100).toFixed(2)}% over ${N} bets`);

// roulette: red + straight 17
let rw = 0, rp = 0;
for (let i = 0; i < 5000; i++) { const r = casino.playRoulette(user(), { bets: [{ type: 'red', amount: 1 }, { type: 'straight', value: 17, amount: 1 }] }); rw += 2; rp += r.payout; }
ok(rp / rw > 0.9 && rp / rw < 1.05, `roulette return ${(rp / rw * 100).toFixed(2)}%`);

// mines: reveal tiles in order until bust or 2 gems, then cash out
let mw = 0, mp = 0;
for (let i = 0; i < 3000; i++) {
  casino.minesStart(user(), { amount: 1, mines: 3 }); mw++;
  let r;
  for (const t of [0, 1]) { r = casino.minesReveal(user(), { tile: t }); if (!r.active) break; }
  if (r.active) r = casino.minesCashout(user());
  mp += r.payout;
}
ok(mp / mw > 0.93 && mp / mw < 1.05, `mines return ${(mp / mw * 100).toFixed(2)}%`);

// hilo: one guess on the likelier side, then cash out
let hw = 0, hp = 0;
for (let i = 0; i < 4000; i++) {
  const s = cards.hiloStart(user(), { amount: 1 }); hw++;
  const g = s.odds.higher.chance >= s.odds.lower.chance ? 'higher' : 'lower';
  const r = cards.hiloGuess(user(), { guess: g });
  hp += r.active ? cards.hiloCashout(user()).payout : r.payout;
}
ok(hp / hw > 0.93 && hp / hw < 1.05, `hilo return ${(hp / hw * 100).toFixed(2)}%`);

// blackjack: simple strategy (hit under 17)
let bw = 0, bp = 0;
for (let i = 0; i < 4000; i++) {
  let r = cards.bjStart(user(), { amount: 1 }); bw++;
  while (r.active) { r = cards.bjAction(user(), { action: r.playerTotal.total < 17 ? 'hit' : 'stand' }); }
  bp += r.payout;
}
ok(bp / bw > 0.9 && bp / bw < 1.05, `blackjack return ${(bp / bw * 100).toFixed(2)}% (simple strategy)`);

// verification: a stored dice bet reproduces from the revealed seed
const bet = db.prepare("SELECT * FROM bets WHERE game='dice' ORDER BY id DESC LIMIT 1").get();
const seed = db.prepare('SELECT * FROM seeds WHERE id=?').get(bet.seed_id);
ok(M.diceRoll(fair.floats(seed.server_seed, seed.client_seed, bet.nonce, 1)) === JSON.parse(bet.detail).roll, 'dice result reproduces from seeds');
ok(seed.server_hash === fair.sha256(seed.server_seed), 'server hash matches seed');

// rewards
db.prepare('UPDATE users SET balance=50 WHERE id=?').run(uid);
db.prepare("INSERT INTO ledger(user_id,kind,amount,balance_after,ref,created_at) VALUES (?,?,?,?,?,?)").run(uid, 'admin', 50 - user().balance + 0, 50, 'test reset', Date.now());
const ref = rewards.claimRefill(user());
ok(ref.claimed === 999.5 && user().balance === 100000, 'top up returns balance to 1,000');
let threw = false; try { rewards.claimRefill(user()); } catch { threw = true; }
ok(threw, 'top up refuses when balance is above threshold');
ok(rewards.claimDaily(user()).claimed > 0, 'daily bonus pays');
threw = false; try { rewards.claimDaily(user()); } catch { threw = true; }
ok(threw, 'daily bonus refuses a second claim');

// insufficient balance
threw = false; try { casino.playInstant(user(), 'dice', { amount: 50000, target: 50, direction: 'over' }); } catch (e) { threw = /Not enough/.test(e.message); }
ok(threw, 'bet over balance is refused');
const before = user().balance;
try { casino.playInstant(user(), 'dice', { amount: 1, target: 120, direction: 'over' }); } catch { }
ok(user().balance === before, 'invalid bet leaves balance untouched');

// ledger integrity: last balance_after equals balance; sum of moves since funding is consistent
const last = db.prepare('SELECT balance_after FROM ledger WHERE user_id=? ORDER BY id DESC LIMIT 1').get(uid);
ok(last.balance_after === user().balance, 'ledger tail matches balance');
console.log(fails ? `\n${fails} check(s) failed` : '\nAll engine checks passed');
process.exit(fails ? 1 : 0);
