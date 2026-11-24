import { db, tx } from '../db.js';
import { draw } from '../fair.js';
import { wager, settle, balanceOf } from '../wallet.js';
import { AppError, parseAmount, pickOne } from '../util.js';
import { CENTS, MAX_BET, MAX_WIN } from '../config.js';
import { recordBet, announce } from './casino.js';
import { peekRule, consumeRule } from '../gm.js';
import * as M from '../../shared/math.js';

const getState = db.prepare('SELECT state FROM game_states WHERE user_id=? AND game=?');
const putState = db.prepare('INSERT INTO game_states(user_id,game,state,created_at) VALUES (?,?,?,?) ON CONFLICT(user_id,game) DO UPDATE SET state=excluded.state');
const delState = db.prepare('DELETE FROM game_states WHERE user_id=? AND game=?');
const load = (uid, game) => { const r = getState.get(uid, game); return r ? JSON.parse(r.state) : null; };
const save = (uid, game, s) => putState.run(uid, game, JSON.stringify(s), Date.now());

const ALL_CARDS = Array.from({ length: 52 }, (_, i) => M.cardFrom((i + 0.5) / 52));
const pickRand = arr => arr[Math.floor(Math.random() * arr.length)];

function begin(user, game, amount) {
  return tx(() => {
    wager(user.id, amount, 'bet', game);
    const { seedId, nonce, f } = draw(user.id, 52);
    return { seedId, nonce, deck: f.map(M.cardFrom) };
  })();
}
function finish(user, game, s, stake, multiplier, detail) {
  const payout = Math.min(MAX_WIN, Math.floor(s.amount * multiplier));
  const betId = tx(() => {
    delState.run(user.id, game);
    settle(user.id, payout, stake, 'win', game);
    return recordBet(user, game, stake, Math.round((payout / stake) * 10000) / 10000, payout, s.seedId, s.nonce, detail);
  })();
  announce(user, game, betId, stake, Math.round((payout / stake) * 100) / 100, payout);
  return payout;
}

/* ---------------- HiLo ---------------- */
const hiloView = (s, extra = {}) => ({
  active: true, amount: s.amount / CENTS, cards: s.cards, multiplier: Math.floor(s.multiplier * 100) / 100,
  guesses: s.guesses, nonce: s.nonce,
  odds: (() => { const r = M.cardRank(s.cards.at(-1)); return { higher: { chance: M.hiloChance(r, 'higher'), multiplier: M.hiloStep(r, 'higher') }, lower: { chance: M.hiloChance(r, 'lower'), multiplier: M.hiloStep(r, 'lower') } }; })(),
  ...extra
});
export const hiloActive = user => { const s = load(user.id, 'hilo'); return s ? hiloView(s) : { active: false }; };
export function hiloStart(user, body) {
  if (load(user.id, 'hilo')) throw new AppError('Finish your current HiLo game first');
  const amount = parseAmount(body.amount, { max: MAX_BET });
  const { seedId, nonce, deck } = begin(user, 'hilo', amount);
  const s = { amount, seedId, nonce, deck, pos: 1, cards: [deck[0]], multiplier: 1, guesses: [] };
  save(user.id, 'hilo', s);
  return { ...hiloView(s), balance: balanceOf(user.id) / CENTS };
}
export function hiloGuess(user, body) {
  const s = load(user.id, 'hilo');
  if (!s) throw new AppError('Start a HiLo game first');
  const guess = pickOne(body.guess, ['higher', 'lower', 'skip'], 'Guess');
  if (s.pos >= 52) throw new AppError('No cards left in this game. Cash out to finish.');
  const cur = s.cards.at(-1);
  let next = s.deck[s.pos++];

  if (guess === 'skip') {
    s.cards.push(next);
    s.guesses.push('skip');
    save(user.id, 'hilo', s);
    return hiloView(s);
  }

  const r = M.cardRank(cur);
  const mode = peekRule(user.id, 'hilo');
  if (mode === 'loss') {
    const losers = ALL_CARDS.filter(c => !M.hiloWins(r, M.cardRank(c), guess));
    if (losers.length) next = pickRand(losers);
  } else if (mode === 'win') {
    const winners = ALL_CARDS.filter(c => M.hiloWins(r, M.cardRank(c), guess));
    if (winners.length) next = pickRand(winners);
  }

  s.cards.push(next);
  const win = M.hiloWins(r, M.cardRank(next), guess);
  s.guesses.push(win ? guess : `${guess}-lost`);
  if (!win) {
    if (mode === 'loss') consumeRule(user.id, 'hilo');
    const payout = finish(user, 'hilo', s, s.amount, 0, { cards: s.cards, guesses: s.guesses });
    return { active: false, won: false, cards: s.cards, guesses: s.guesses, multiplier: 0, payout: payout / CENTS, nonce: s.nonce, balance: balanceOf(user.id) / CENTS };
  }
  s.multiplier *= M.hiloStep(r, guess);
  save(user.id, 'hilo', s);
  return hiloView(s);
}
export function hiloCashout(user) {
  const s = load(user.id, 'hilo');
  if (!s) throw new AppError('No HiLo game in progress');
  if (!s.guesses.some(g => g === 'higher' || g === 'lower')) throw new AppError('Make at least one correct guess before cashing out');
  if (peekRule(user.id, 'hilo') === 'win') consumeRule(user.id, 'hilo');
  const m = Math.floor(s.multiplier * 100) / 100;
  const payout = finish(user, 'hilo', s, s.amount, m, { cards: s.cards, guesses: s.guesses });
  return { active: false, won: true, cards: s.cards, guesses: s.guesses, multiplier: m, payout: payout / CENTS, nonce: s.nonce, balance: balanceOf(user.id) / CENTS };
}

/* ---------------- Blackjack ---------------- */
const bjView = (s, done = null) => {
  const showHole = !!done;
  const dealer = showHole ? s.dealer : [s.dealer[0]];
  return {
    active: !done, amount: s.amount / CENTS, doubled: s.doubled, nonce: s.nonce,
    player: s.player, playerTotal: M.bjTotal(s.player),
    dealer, dealerTotal: M.bjTotal(dealer), holeHidden: !showHole,
    canDouble: !done && s.player.length === 2 && !s.doubled,
    ...(done || {})
  };
};
export const bjActive = user => { const s = load(user.id, 'blackjack'); return s ? bjView(s) : { active: false }; };

function bjEnd(user, s, outcome) {
  const mode = peekRule(user.id, 'blackjack');
  if ((mode === 'loss' && outcome === 'lose') || (mode === 'win' && (outcome === 'win' || outcome === 'blackjack'))) {
    consumeRule(user.id, 'blackjack');
  }
  const stake = s.amount * (s.doubled ? 2 : 1);
  const mult = { blackjack: 2.5, win: 2, push: 1, lose: 0 }[outcome] * (s.doubled ? 2 : 1);
  const payout = finish(user, 'blackjack', s, stake, mult, { player: s.player, dealer: s.dealer, outcome, doubled: s.doubled });
  return { ...bjView(s, { outcome, payout: payout / CENTS }), balance: balanceOf(user.id) / CENTS };
}

function dealerPlays(s, mode, playerTotal) {
  if (mode === 'loss') {
    const hand = [s.dealer[0]];
    for (let step = 0; step < 8 && M.bjTotal(hand).total < 17; step++) {
      const beatNow = ALL_CARDS.filter(c => {
        const t = M.bjTotal([...hand, c]).total;
        return t >= 17 && t <= 21 && t > playerTotal;
      });
      if (beatNow.length) { hand.push(pickRand(beatNow)); break; }
      const push21 = playerTotal === 21 ? ALL_CARDS.filter(c => M.bjTotal([...hand, c]).total === 21) : [];
      if (push21.length) { hand.push(pickRand(push21)); break; }
      const setup = ALL_CARDS.filter(c => {
        const t = M.bjTotal([...hand, c]).total;
        return t >= 11 && t <= 16;
      });
      const safe = ALL_CARDS.filter(c => M.bjTotal([...hand, c]).total <= 16);
      hand.push(setup.length ? pickRand(setup) : safe.length ? pickRand(safe) : s.deck[s.pos++]);
    }
    while (M.bjTotal(hand).total < 17) hand.push(s.deck[s.pos++]);
    s.dealer = hand;
    return;
  }

  if (mode === 'win') {
    const hand = [s.dealer[0]];
    for (let step = 0; step < 8 && M.bjTotal(hand).total < 17; step++) {
      const bustNow = ALL_CARDS.filter(c => M.bjTotal([...hand, c]).total > 21);
      if (bustNow.length) { hand.push(pickRand(bustNow)); break; }
      const loseStand = ALL_CARDS.filter(c => {
        const t = M.bjTotal([...hand, c]).total;
        return t >= 17 && t < playerTotal;
      });
      if (loseStand.length) { hand.push(pickRand(loseStand)); break; }
      const stiff = ALL_CARDS.filter(c => {
        const t = M.bjTotal([...hand, c]).total;
        return t >= 12 && t <= 16;
      });
      hand.push(stiff.length ? pickRand(stiff) : s.deck[s.pos++]);
    }
    while (M.bjTotal(hand).total < 17) hand.push(s.deck[s.pos++]);
    s.dealer = hand;
    return;
  }

  while (M.bjTotal(s.dealer).total < 17) s.dealer.push(s.deck[s.pos++]);
}

function compare(user, s) {
  const p = M.bjTotal(s.player).total;
  if (p > 21) return bjEnd(user, s, 'lose');
  const mode = peekRule(user.id, 'blackjack');
  dealerPlays(s, mode, p);
  const d = M.bjTotal(s.dealer).total;
  return bjEnd(user, s, d > 21 || p > d ? 'win' : p === d ? 'push' : 'lose');
}

export function bjStart(user, body) {
  if (load(user.id, 'blackjack')) throw new AppError('Finish your current hand first');
  const amount = parseAmount(body.amount, { max: MAX_BET });
  const { seedId, nonce, deck } = begin(user, 'blackjack', amount);
  const s = { amount, seedId, nonce, deck, pos: 4, player: [deck[0], deck[2]], dealer: [deck[1], deck[3]], doubled: false };

  const mode = peekRule(user.id, 'blackjack');
  if (mode === 'loss' && M.isBlackjack(s.player)) {
    const nonBj = ALL_CARDS.filter(c => !M.isBlackjack([s.player[0], c]) && M.bjTotal([s.player[0], c]).total <= 16);
    if (nonBj.length) s.player[1] = pickRand(nonBj);
  }
  if (mode === 'win' && M.isBlackjack(s.dealer)) {
    const nonBj = ALL_CARDS.filter(c => !M.isBlackjack([s.dealer[0], c]));
    if (nonBj.length) s.dealer[1] = pickRand(nonBj);
  }

  const pb = M.isBlackjack(s.player), db_ = M.isBlackjack(s.dealer);
  if (pb || db_) return bjEnd(user, s, pb && db_ ? 'push' : pb ? 'blackjack' : 'lose');
  save(user.id, 'blackjack', s);
  return { ...bjView(s), balance: balanceOf(user.id) / CENTS };
}

function pickPlayerDraw(s, mode) {
  if (mode === 'loss') {
    const bust = ALL_CARDS.filter(c => M.bjTotal([...s.player, c]).total > 21);
    if (bust.length) return pickRand(bust);
  }
  if (mode === 'win') {
    const ideal = ALL_CARDS.filter(c => {
      const t = M.bjTotal([...s.player, c]).total;
      return t >= 19 && t <= 21;
    });
    if (ideal.length) return pickRand(ideal);
    const safe = ALL_CARDS.filter(c => M.bjTotal([...s.player, c]).total <= 21);
    if (safe.length) return pickRand(safe);
  }
  return s.deck[s.pos++];
}

export function bjAction(user, body) {
  const s = load(user.id, 'blackjack');
  if (!s) throw new AppError('Deal a hand first');
  const action = pickOne(body.action, ['hit', 'stand', 'double'], 'Action');
  const mode = peekRule(user.id, 'blackjack');

  if (action === 'double') {
    if (s.player.length !== 2 || s.doubled) throw new AppError('You can only double on your first two cards');
    tx(() => wager(user.id, s.amount, 'bet', 'blackjack double'))();
    s.doubled = true;
    s.player.push(pickPlayerDraw(s, mode));
    return compare(user, s);
  }
  if (action === 'hit') {
    s.player.push(pickPlayerDraw(s, mode));
    const t = M.bjTotal(s.player).total;
    if (t > 21) return bjEnd(user, s, 'lose');
    if (t === 21) return compare(user, s);
    save(user.id, 'blackjack', s);
    return { ...bjView(s), balance: balanceOf(user.id) / CENTS };
  }
  return compare(user, s);
}
