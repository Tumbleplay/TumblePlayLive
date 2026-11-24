// Pure game math shared by the server (to play) and the browser (to verify).
// Every function takes floats in [0,1) produced from HMAC-SHA256(serverSeed, `${clientSeed}:${nonce}:${cursor}`).

export const EDGE = 0.99; // 1% house edge on every casino game

export const FLOATS_NEEDED = { dice: 1, limbo: 1, mines: 24, plinko: 16, keno: 10, wheel: 1, roulette: 1, hilo: 52, blackjack: 52 };

// 4 bytes -> one float; 8 floats per 32-byte HMAC block
export function bytesToFloats(blocks, count) {
  const out = [];
  for (const b of blocks) {
    for (let i = 0; i < 32 && out.length < count; i += 4)
      out.push(b[i] / 256 + b[i + 1] / 65536 + b[i + 2] / 16777216 + b[i + 3] / 4294967296);
  }
  return out;
}

export const diceRoll = f => Math.floor(f[0] * 10001) / 100; // 0.00 – 100.00
export const diceMultiplier = chance => Math.floor((99 / chance) * 10000) / 10000;

// Limbo and Crash: P(result >= x) = 0.99 / x
export const crashPoint = f => Math.min(1e6, Math.max(1, Math.floor((EDGE / (1 - f[0])) * 100) / 100));

export function minesPositions(f, count) { // Fisher-Yates over 25 tiles
  const t = [...Array(25).keys()];
  for (let i = 24; i >= 1; i--) {
    const j = Math.floor(f[24 - i] * (i + 1));
    [t[i], t[j]] = [t[j], t[i]];
  }
  return t.slice(0, count).sort((a, b) => a - b);
}
export function minesMultiplier(mines, gems) {
  if (!gems) return 1;
  let m = EDGE;
  for (let i = 0; i < gems; i++) m *= (25 - i) / (25 - mines - i);
  return Math.floor(m * 100) / 100;
}

const PLINKO_HALF = { // centre-out halves, mirrored; each ≈ 99% RTP
  8: { low: [5.6, 2.1, 1.1, 1, 0.5], medium: [13, 3, 1.3, 0.7, 0.4], high: [29, 4, 1.5, 0.3, 0.2] },
  12: { low: [10, 3, 1.6, 1.4, 1.1, 1, 0.5], medium: [33, 11, 4, 2, 1.1, 0.6, 0.3], high: [170, 24, 8.1, 2, 0.7, 0.2, 0.2] },
  16: { low: [16, 9, 2, 1.4, 1.4, 1.2, 1.1, 1, 0.5], medium: [110, 41, 10, 5, 3, 1.5, 1, 0.5, 0.3], high: [1000, 130, 26, 9, 4, 2, 0.2, 0.2, 0.2] }
};
export const PLINKO_ROWS = [8, 12, 16];
export const RISKS = ['low', 'medium', 'high'];
export const plinkoTable = (rows, risk) => { const h = PLINKO_HALF[rows][risk]; return h.concat(h.slice(0, -1).reverse()); };
export const plinkoPath = (f, rows) => f.slice(0, rows).map(x => (x < 0.5 ? 0 : 1)); // 0 left, 1 right
export const plinkoBucket = path => path.reduce((a, c) => a + c, 0);

// Keno: 40 numbers, 10 drawn, player picks 1–10. Table[risk][picks][hits]
export const KENO = {
  low: {
    1: [0, 3.96],
    2: [0, 2, 3.5],
    3: [0, 1.4, 2.4, 4],
    4: [0, 1.06, 1.8, 3.1, 5.2],
    5: [0, 0, 2.2, 3.8, 6.4, 11],
    6: [0, 0, 1.61, 2.7, 4.7, 7.9, 13],
    7: [0, 0, 1.23, 2.1, 3.5, 6, 10, 17],
    8: [0, 0, 0.97, 1.65, 2.8, 4.8, 8.1, 14, 23],
    9: [0, 0, 0, 1.85, 3.1, 5.3, 9.1, 15, 26, 45],
    10: [0, 0, 0, 1.42, 2.4, 4.1, 7, 12, 20, 34, 58]
  },
  medium: {
    1: [0, 3.96],
    2: [0, 1.85, 4.8],
    3: [0, 1.13, 2.9, 7.6],
    4: [0, 0, 3, 7.7, 20],
    5: [0, 0, 1.79, 4.6, 12, 31],
    6: [0, 0, 0, 4.8, 13, 33, 85],
    7: [0, 0, 0, 2.9, 7.5, 20, 51, 130],
    8: [0, 0, 0, 0, 8.3, 22, 56, 150, 380],
    9: [0, 0, 0, 0, 4.9, 13, 33, 87, 230, 590],
    10: [0, 0, 0, 0, 3.2, 8.2, 21, 56, 140, 380, 980]
  },
  high: {
    1: [0, 3.96],
    2: [0, 1.58, 6.6],
    3: [0, 0, 5.3, 22],
    4: [0, 0, 2.3, 9.8, 41],
    5: [0, 0, 0, 7.8, 33, 140],
    6: [0, 0, 0, 0, 30, 130, 530],
    7: [0, 0, 0, 0, 13, 53, 220, 940],
    8: [0, 0, 0, 0, 0, 51, 210, 900, 3800],
    9: [0, 0, 0, 0, 0, 23, 98, 410, 1700, 7300],
    10: [0, 0, 0, 0, 0, 0, 100, 420, 1800, 7400, 31100]
  }
};
export function kenoDraw(f) {
  const pool = Array.from({ length: 40 }, (_, i) => i + 1), out = [];
  for (let i = 0; i < 10; i++) out.push(pool.splice(Math.floor(f[i] * (40 - i)), 1)[0]);
  return out;
}

// Wheel: 10-segment patterns repeated to fill 10–50 segments, each ≈ 99% RTP
const WHEEL_PATTERN = {
  low: [1.5, 1.2, 1.2, 1.2, 0, 1.2, 1.2, 1.2, 1.2, 0],
  medium: [0, 1.9, 0, 1.5, 0, 2, 0, 1.5, 0, 3]
};
export const WHEEL_SEGMENTS = [10, 20, 30, 40, 50];
export function wheelTable(segments, risk) {
  if (risk === 'high') return Array.from({ length: segments }, (_, i) => (i === 0 ? +(EDGE * segments).toFixed(2) : 0));
  return Array.from({ length: segments }, (_, i) => WHEEL_PATTERN[risk][i % 10]);
}
export const wheelIndex = (f, segments) => Math.floor(f[0] * segments);

// Crash rounds: one public seed per round, published as SHA-256 before the round
export const CRASH_SALT = 'tumble-crash-v1';
export const CRASH_GROWTH = 0.00009; // multiplier = e^(k · ms)
export const crashAt = ms => Math.exp(CRASH_GROWTH * ms);
export const crashTimeFor = m => Math.log(m) / CRASH_GROWTH;

export const VIP_LEVELS = [
  { name: 'Rookie', min: 0, reward: 0, daily: 250, rakeback: 0.0005 },
  { name: 'Bronze', min: 10_000, reward: 500, daily: 400, rakeback: 0.001 },
  { name: 'Silver', min: 50_000, reward: 2_000, daily: 750, rakeback: 0.0015 },
  { name: 'Gold', min: 250_000, reward: 8_000, daily: 1_500, rakeback: 0.002 },
  { name: 'Platinum', min: 1_000_000, reward: 25_000, daily: 3_000, rakeback: 0.003 },
  { name: 'Diamond', min: 5_000_000, reward: 100_000, daily: 7_500, rakeback: 0.004 },
  { name: 'Obsidian', min: 25_000_000, reward: 400_000, daily: 20_000, rakeback: 0.005 }
]; // min/reward/daily in coins; rakeback = share of wagered returned
export const vipIndexFor = wageredCoins => { let i = 0; VIP_LEVELS.forEach((l, k) => { if (wageredCoins >= l.min) i = k; }); return i; };

// Roulette: single-zero wheel, standard payouts (2.7% house edge, like any European table)
export const ROULETTE_RED = [1, 3, 5, 7, 9, 12, 14, 16, 18, 19, 21, 23, 25, 27, 30, 32, 34, 36];
export const rouletteNumber = f => Math.floor(f[0] * 37);
export const ROULETTE_BETS = { // type -> [payout multiplier incl. stake, does number n win?]
  straight: [36, (n, v) => n === v],
  red: [2, n => ROULETTE_RED.includes(n)],
  black: [2, n => n > 0 && !ROULETTE_RED.includes(n)],
  odd: [2, n => n > 0 && n % 2 === 1],
  even: [2, n => n > 0 && n % 2 === 0],
  low: [2, n => n >= 1 && n <= 18],
  high: [2, n => n >= 19],
  dozen: [3, (n, v) => n > 0 && Math.ceil(n / 12) === v],   // v = 1..3
  column: [3, (n, v) => n > 0 && ((n - 1) % 3) + 1 === v]   // v = 1..3 (1 = 1,4,7…)
};

// Cards: one float -> one card from an endless shuffled deck. index 0–51; rank 1 (A) … 13 (K)
export const cardFrom = x => Math.floor(x * 52);
export const cardRank = c => (c % 13) + 1;
export const cardSuit = c => Math.floor(c / 13); // 0 ♠ 1 ♥ 2 ♦ 3 ♣

// HiLo: "higher" means same or higher (strictly higher on an Ace); "lower" mirrors it (strictly lower on a King)
export function hiloChance(rank, guess) {
  if (guess === 'higher') return rank === 1 ? 12 / 13 : (14 - rank) / 13;
  return rank === 13 ? 12 / 13 : rank / 13;
}
export function hiloWins(rank, next, guess) {
  if (guess === 'higher') return rank === 1 ? next > rank : next >= rank;
  return rank === 13 ? next < rank : next <= rank;
}
export const hiloStep = (rank, guess) => EDGE / hiloChance(rank, guess);

// Blackjack: endless deck, dealer stands on all 17s, blackjack pays 3:2
export const bjValue = c => Math.min(10, cardRank(c));
export function bjTotal(cards) {
  let t = 0, aces = 0;
  for (const c of cards) { const v = bjValue(c); t += v === 1 ? 11 : v; if (v === 1) aces++; }
  while (t > 21 && aces) { t -= 10; aces--; }
  return { total: t, soft: aces > 0 };
}
export const isBlackjack = cards => cards.length === 2 && bjTotal(cards).total === 21;
