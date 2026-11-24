import http from 'node:http';
import path from 'node:path';
import fs from 'node:fs';
import express from 'express';
import cookieParser from 'cookie-parser';
import helmet from 'helmet';
import { Server } from 'socket.io';

import { PORT, IS_PROD, CENTS, REFILL_BELOW } from './config.js';
import { db, flushSync } from './db.js';
import { h, AppError } from './util.js';
import { bus } from './bus.js';
import * as auth from './auth.js';
import * as fair from './fair.js';
import * as casino from './games/casino.js';
import * as cards from './games/cards.js';
import * as crash from './games/crash.js';
import * as sports from './sports/engine.js';
import * as rewards from './rewards.js';
import * as social from './social.js';
import * as admin from './admin.js';
import * as payments from './payments.js';
import * as telegram from './telegram.js';
import { SPORTS } from './sports/models.js';
import * as M from '../shared/math.js';

const app = express();
app.set('trust proxy', 1);
app.use(helmet({
  contentSecurityPolicy: {
    directives: {
      defaultSrc: ["'self'"],
      scriptSrc: ["'self'", "'unsafe-inline'", 'https://telegram.org'],
      styleSrc: ["'self'", "'unsafe-inline'", 'https://fonts.googleapis.com'],
      fontSrc: ["'self'", 'https://fonts.gstatic.com'],
      imgSrc: ["'self'", 'data:', 'https://api.qrserver.com', 'https://quickchart.io'],
      connectSrc: ["'self'", 'ws:', 'wss:']
    }
  }
}));
app.use(express.json({ limit: '50kb' }));
app.use(cookieParser());
app.use(auth.loadUser);

const api = express.Router();

// Light per-user throttle on bets so autobet can't flood the server
const hits = new Map();
const throttle = (req, res, next) => {
  const k = req.user.id, t = Date.now(), arr = (hits.get(k) || []).filter(x => t - x < 1000);
  if (arr.length >= 12) return res.status(429).json({ error: 'Too many bets per second. Slow your autobet down.' });
  arr.push(t); hits.set(k, arr); next();
};
const U = auth.requireUser, A = [auth.requireUser, auth.requireAdmin];

/* ---------- auth & account (no 15-min lockout, forever sessions) ---------- */
api.post('/auth/register', h((req, res) => { const id = auth.register(req.body.username, req.body.password, { refCode: req.body.refCode, ip: req.ip }); auth.signSession(res, id); return me(id); }));
api.post('/auth/telegram', h((req, res) => { const id = auth.loginWithTelegram(req.body.initData, req.ip); auth.signSession(res, id); return me(id); }));
api.post('/auth/login', h((req, res) => { const id = auth.login(req.body.username, req.body.password); auth.signSession(res, id); return me(id); }));
api.post('/auth/logout', h((req, res) => { auth.clearSession(res); return { ok: true }; }));
const me = id => auth.publicUser(db.prepare('SELECT * FROM users WHERE id=?').get(id));
api.get('/me', h(req => (req.user ? me(req.user.id) : null)));
api.get('/me/bets', U, h(req => social.myCasinoBets(req.user, req.query.game)));
api.get('/me/ledger', U, h(req => social.myLedger(req.user)));

/* ---------- static config the UI needs ---------- */
api.get('/config', h(() => ({
  vip: M.VIP_LEVELS, refillBelow: REFILL_BELOW / CENTS,
  plinko: Object.fromEntries(M.PLINKO_ROWS.map(r => [r, Object.fromEntries(M.RISKS.map(k => [k, M.plinkoTable(r, k)]))])),
  keno: M.KENO,
  wheel: Object.fromEntries(M.WHEEL_SEGMENTS.map(s => [s, Object.fromEntries(M.RISKS.map(k => [k, M.wheelTable(s, k)]))])),
  sports: Object.fromEntries(Object.entries(SPORTS).map(([k, v]) => [k, v.name]))
})));

/* ---------- payments (UPI QR + Crypto) ---------- */
api.get('/payments/config', h(() => payments.publicPaymentConfig()));
api.get('/payments/my', U, h(req => payments.myDeposits(req.user)));
api.post('/payments/submit', U, h(req => payments.submitDeposit(req.user, req.body)));
api.get('/wallet/withdrawals', U, h(req => payments.myWithdrawals(req.user)));
api.post('/wallet/withdraw', U, h(req => payments.submitWithdrawal(req.user, req.body)));
api.post('/webhooks/nowpayments', h(req => payments.handleNowPaymentsWebhook(req)));

/* ---------- referrals & promo codes ---------- */
api.get('/referrals/my', U, h(req => rewards.getMyReferrals(req.user)));
api.post('/promos/claim', U, h(req => rewards.claimPromoCode(req.user, req.body.code)));

/* ---------- v3 Super-Admin controls ---------- */
api.get('/admin/v3/economy', ...A, h(() => admin.getEconomySettings()));
api.post('/admin/v3/economy', ...A, h(req => admin.saveEconomySettings(req.body)));
api.get('/admin/v3/wallet-settings', ...A, h(() => payments.getWalletSettings()));
api.post('/admin/v3/wallet-settings', ...A, h(req => payments.saveWalletSettings(req.body)));
api.get('/admin/v3/deposits', ...A, h(req => admin.listDeposits(req.query.status)));
api.post('/admin/v3/deposits/:id/approve', ...A, h(req => payments.approveDeposit(Number(req.params.id), req.user.username, req.body.coins)));
api.post('/admin/v3/deposits/:id/reject', ...A, h(req => payments.rejectDeposit(Number(req.params.id), req.user.username, req.body.note)));
api.get('/admin/v3/withdrawals', ...A, h(req => admin.listWithdrawals(req.query.status)));
api.post('/admin/v3/withdrawals/:id/approve', ...A, h(req => payments.approveWithdrawal(Number(req.params.id), req.user.username, req.body.payoutRef)));
api.post('/admin/v3/withdrawals/:id/reject', ...A, h(req => payments.rejectWithdrawal(Number(req.params.id), req.user.username, req.body.note)));
api.get('/admin/v3/referrals', ...A, h(req => admin.listReferrals(req.query.status)));
api.post('/admin/v3/referrals/:id/verify', ...A, h(req => rewards.verifyReferralById(Number(req.params.id), req.user.username)));
api.post('/admin/v3/referrals/:id/reject', ...A, h(req => rewards.rejectReferralById(Number(req.params.id))));
api.get('/admin/v3/promos', ...A, h(() => admin.listPromos()));
api.post('/admin/v3/promos', ...A, h(req => admin.createPromo(req.body.code, req.body.coins, req.body.maxUses)));
api.post('/admin/v3/users/:id/ban', ...A, h(req => admin.toggleBanUser(req.params.id, req.body.banned)));
api.post('/admin/v3/users/:id/reset-daily', ...A, h(req => admin.resetDailyTimer(req.params.id)));

/* ---------- casino ---------- */
api.post('/casino/roulette/bet', U, throttle, h(req => casino.playRoulette(req.user, req.body)));
api.get('/casino/mines', U, h(req => casino.minesActive(req.user)));
api.post('/casino/mines/start', U, throttle, h(req => casino.minesStart(req.user, req.body)));
api.post('/casino/mines/reveal', U, throttle, h(req => casino.minesReveal(req.user, req.body)));
api.post('/casino/mines/cashout', U, h(req => casino.minesCashout(req.user)));
api.get('/casino/hilo', U, h(req => cards.hiloActive(req.user)));
api.post('/casino/hilo/start', U, throttle, h(req => cards.hiloStart(req.user, req.body)));
api.post('/casino/hilo/guess', U, throttle, h(req => cards.hiloGuess(req.user, req.body)));
api.post('/casino/hilo/cashout', U, h(req => cards.hiloCashout(req.user)));
api.get('/casino/blackjack', U, h(req => cards.bjActive(req.user)));
api.post('/casino/blackjack/start', U, throttle, h(req => cards.bjStart(req.user, req.body)));
api.post('/casino/blackjack/action', U, throttle, h(req => cards.bjAction(req.user, req.body)));
api.post('/casino/:game/bet', U, throttle, h(req => casino.playInstant(req.user, req.params.game, req.body)));

api.get('/crash', h(() => crash.crashState()));
api.post('/crash/bet', U, throttle, h(req => crash.crashBet(req.user, req.body)));
api.post('/crash/cashout', U, h(req => crash.crashCashout(req.user)));
api.get('/crash/rounds', h(() => db.prepare('SELECT id, hash, point, seed, started_at FROM crash_rounds WHERE ended_at IS NOT NULL ORDER BY id DESC LIMIT 50').all()));

/* ---------- fairness ---------- */
api.get('/fair', U, h(req => fair.fairInfo(req.user.id)));
api.post('/fair/rotate', U, h(req => { fair.rotate(req.user.id, req.body.clientSeed); return fair.fairInfo(req.user.id); }));

/* ---------- sports ---------- */
api.get('/sports/events', h(req => sports.listEvents({ sport: req.query.sport || undefined, status: req.query.status || undefined })));
api.get('/sports/events/:id', h(req => sports.eventDTO(Number(req.params.id)) || (() => { throw new AppError('Match not found', 404); })()));
api.post('/sports/bet', U, throttle, h(req => sports.placeSportBet(req.user, req.body)));
api.get('/sports/my', U, h(req => sports.myBets(req.user, req.query.status)));

/* ---------- rewards ---------- */
api.post('/rewards/daily', U, h(req => ({ ...rewards.claimDaily(req.user), me: me(req.user.id) })));
api.post('/rewards/refill', U, h(req => ({ ...rewards.claimRefill(req.user), me: me(req.user.id) })));
api.post('/rewards/rakeback', U, h(req => ({ ...rewards.claimRakeback(req.user), me: me(req.user.id) })));

/* ---------- social ---------- */
api.get('/bets/recent', h(req => social.recentBets(30, req.query.high ? 1000 : 0)));
api.get('/stats/playing', h(() => social.playingNow()));
api.get('/leaderboard', h(req => social.leaderboard(req.query.period, req.query.metric)));
api.get('/users/:username', h(req => social.profile(req.params.username)));
api.get('/chat', h(() => social.chatHistory()));

/* ---------- admin ---------- */
api.get('/admin/stats', ...A, h(() => admin.stats()));
api.get('/admin/gm', ...A, h(() => admin.gmState()));
api.post('/admin/gm/global', ...A, h(req => admin.gmSetGlobal(req.body)));
api.post('/admin/gm/crash', ...A, h(req => admin.gmCrash(req.body)));
api.get('/admin/deposits', ...A, h(req => payments.adminListDeposits(req.query.status)));
api.get('/admin/deposits/config', ...A, h(() => payments.getPaymentConfig()));
api.post('/admin/deposits/config', ...A, h(req => payments.savePaymentConfig(req.body)));
api.post('/admin/deposits/:id/review', ...A, h(req => payments.reviewDeposit(req.user, req.params.id, req.body)));
api.get('/admin/sync', ...A, h(() => admin.getSync()));
api.post('/admin/sync', ...A, h(async () => await admin.triggerSync()));
api.get('/admin/users', ...A, h(req => admin.users(req.query.q)));
api.post('/admin/users/:id', ...A, h(req => admin.act(req.user, req.params.id, req.body)));
api.post('/admin/chat/:id/delete', ...A, h(req => { social.deleteChat(Number(req.params.id)); return { ok: true }; }));
api.get('/admin/events', ...A, h(() => db.prepare("SELECT id, sport, league, home, away, starts_at, status, source FROM events WHERE source!='demo' ORDER BY starts_at DESC LIMIT 100").all()));
api.post('/admin/events', ...A, h(req => ({ id: sports.adminCreateEvent(req.body) })));
api.post('/admin/events/:id/settle', ...A, h(req => {
  const e = db.prepare('SELECT * FROM events WHERE id=?').get(Number(req.params.id));
  if (!e) throw new AppError('Match not found', 404);
  if (['settled', 'cancelled'].includes(e.status)) throw new AppError('This match is already closed');
  if (req.body.cancel) sports.settleEvent(e.id, 0, 0, { cancel: true });
  else {
    const sh = Number(req.body.home), sa = Number(req.body.away);
    if (!Number.isFinite(sh) || !Number.isFinite(sa) || sh < 0 || sa < 0) throw new AppError('Enter both final scores');
    sports.settleEvent(e.id, sh, sa);
  }
  return { ok: true };
}));

app.use('/api', api);
app.use('/api', (req, res) => res.status(404).json({ error: 'Not found' }));

/* ---------- web app ---------- */
const dist = path.resolve('client/dist');
if (fs.existsSync(dist)) {
  app.use(express.static(dist, { index: false, maxAge: IS_PROD ? '1h' : 0 }));
  app.get(/^\/(?!api|socket\.io).*/, (req, res) => res.sendFile(path.join(dist, 'index.html')));
} else {
  app.get('/', (req, res) => res.send('Build the web app first: npm run build'));
}

/* ---------- realtime ---------- */
const server = http.createServer(app);
const io = new Server(server, { cors: IS_PROD ? undefined : { origin: true, credentials: true } });
const cookieOf = (hdr = '', name) => decodeURIComponent((hdr.split(/;\s*/).find(c => c.startsWith(name + '=')) || '').slice(name.length + 1));
io.on('connection', socket => {
  const uid = auth.userIdFromToken(cookieOf(socket.handshake.headers.cookie, auth.COOKIE));
  const user = uid ? db.prepare('SELECT id, username, banned FROM users WHERE id=?').get(uid) : null;
  if (user && !user.banned) socket.join(`u:${user.id}`);
  socket.emit('hello', { online: io.engine.clientsCount, chat: social.chatHistory(), crash: crash.crashState(), bets: social.recentBets(20) });
  socket.on('chat:send', (text, ack) => {
    try {
      if (!user) throw new AppError('Log in to chat', 401);
      social.sendChat(user, text); ack?.({ ok: true });
    } catch (e) { ack?.({ error: e.message }); }
  });
});
bus.on('all', (event, data) => io.emit(event, data));
bus.on('user', (uid, event, data) => io.to(`u:${uid}`).emit(event, data));
setInterval(() => io.emit('online', io.engine.clientsCount), 15_000);

social.loadChat();
crash.startCrash();
sports.startSports();
telegram.startBot();
server.listen(PORT, () => console.log(`Tumble running on http://localhost:${PORT}`));

// Flush SQLite snapshot to Supabase before Render sleeps or restarts
let shuttingDown = false;
async function shutdown(sig) {
  if (shuttingDown) return;
  shuttingDown = true;
  console.log(`[shutdown] Received ${sig}, syncing database to Supabase...`);
  try { await flushSync(); } catch {}
  try { server.close(); } catch {}
  process.exit(0);
}
process.on('SIGTERM', () => shutdown('SIGTERM'));
process.on('SIGINT', () => shutdown('SIGINT'));
