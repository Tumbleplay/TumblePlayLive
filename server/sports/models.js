// Probability models for demo matches and generic settlement rules.
const MARGIN = 1.06; // bookmaker overround on demo odds

export const toOdds = p => (p < 0.012 ? 0 : Math.max(1.01, Math.floor((1 / (p * MARGIN)) * 100) / 100)); // 0 = suspended

function poisson(l, k) { let p = Math.exp(-l); for (let i = 1; i <= k; i++) p *= l / i; return p; }
function samplePoisson(l) { let k = 0, p = Math.exp(-l), s = p, u = Math.random(); while (u > s && k < 20) { k++; p *= l / k; s += p; } return k; }
function sampleNormal(m, sd) { return m + sd * Math.sqrt(-2 * Math.log(1 - Math.random())) * Math.cos(2 * Math.PI * Math.random()); }
function phi(x) { // standard normal CDF
  const t = 1 / (1 + 0.2316419 * Math.abs(x)), d = 0.3989423 * Math.exp(-x * x / 2);
  const p = d * t * (0.3193815 + t * (-0.3565638 + t * (1.781478 + t * (-1.821256 + t * 1.330274))));
  return x > 0 ? 1 - p : p;
}

export const SPORTS = {
  football: { name: 'Football', durationMs: 12 * 60_000 },
  cricket: { name: 'Cricket', durationMs: 12 * 60_000 },
  basketball: { name: 'Basketball', durationMs: 10 * 60_000 },
  tennis: { name: 'Tennis', durationMs: 9 * 60_000 }
};

// Build a hidden model + predetermined result for a new demo match
export function createModel(sport) {
  const r = () => 0.75 + Math.random() * 0.6; // team strength
  if (sport === 'football') {
    const lh = 1.45 * r(), la = 1.15 * r();
    const goals = [];
    for (let i = samplePoisson(lh); i--;) goals.push({ t: Math.random(), side: 'h' });
    for (let i = samplePoisson(la); i--;) goals.push({ t: Math.random(), side: 'a' });
    return { lh, la, goals: goals.sort((a, b) => a.t - b.t) };
  }
  if (sport === 'tennis') {
    const q = 0.25 + Math.random() * 0.5, sets = [];
    let h = 0, a = 0;
    while (h < 2 && a < 2) { const w = Math.random() < q ? 'h' : 'a'; sets.push(w); w === 'h' ? h++ : a++; }
    return { q, sets };
  }
  const base = sport === 'cricket' ? { m: 165, sd: 22 } : { m: 108, sd: 11 };
  const mh = base.m * (0.9 + Math.random() * 0.2), ma = base.m * (0.9 + Math.random() * 0.2);
  let fh, fa;
  do { fh = Math.max(0, Math.round(sampleNormal(mh, base.sd))); fa = Math.max(0, Math.round(sampleNormal(ma, base.sd))); } while (fh === fa);
  return { mh, ma, sd: base.sd, final: [fh, fa] };
}

// Score at match progress p (0..1)
export function scoreAt(sport, m, p) {
  if (sport === 'football') return m.goals.reduce((s, g) => (g.t <= p ? (g.side === 'h' ? [s[0] + 1, s[1]] : [s[0], s[1] + 1]) : s), [0, 0]);
  if (sport === 'tennis') {
    const done = Math.min(m.sets.length, Math.floor(p * m.sets.length + 1e-9));
    return m.sets.slice(0, done).reduce((s, w) => (w === 'h' ? [s[0] + 1, s[1]] : [s[0], s[1] + 1]), [0, 0]);
  }
  return [Math.round(m.final[0] * p), Math.round(m.final[1] * p)];
}

// Market definitions for a sport (line chosen from the model)
export function marketsFor(sport, m) {
  if (sport === 'football') return [
    { key: '1x2', name: 'Match result', sels: [['home', 'HOME'], ['draw', 'Draw'], ['away', 'AWAY']] },
    { key: 'totals', name: 'Total goals', line: 2.5, sels: [['over', 'Over 2.5'], ['under', 'Under 2.5']] },
    { key: 'btts', name: 'Both teams to score', sels: [['yes', 'Yes'], ['no', 'No']] }
  ];
  if (sport === 'tennis') return [
    { key: 'ml', name: 'Match winner', sels: [['home', 'HOME'], ['away', 'AWAY']] },
    { key: 'sets', name: 'Total sets', line: 2.5, sels: [['over', 'Over 2.5'], ['under', 'Under 2.5']] }
  ];
  const line = Math.round(m.mh + m.ma) + 0.5;
  return [
    { key: 'ml', name: 'Match winner', sels: [['home', 'HOME'], ['away', 'AWAY']] },
    { key: 'totals', name: sport === 'cricket' ? 'Total runs' : 'Total points', line, sels: [['over', `Over ${line}`], ['under', `Under ${line}`]] }
  ];
}

// Fair probabilities for each selection given progress and current score
export function probabilities(sport, m, p, [sh, sa], line) {
  const rem = Math.max(0, 1 - p);
  if (sport === 'football') {
    const lh = m.lh * rem, la = m.la * rem, P = { home: 0, draw: 0, away: 0, over: 0, under: 0, yes: 0, no: 0 };
    for (let i = 0; i <= 10; i++) for (let j = 0; j <= 10; j++) {
      const pr = poisson(lh, i) * poisson(la, j), h = sh + i, a = sa + j;
      P[h > a ? 'home' : h < a ? 'away' : 'draw'] += pr;
      P[h + a > 2.5 ? 'over' : 'under'] += pr;
      P[h > 0 && a > 0 ? 'yes' : 'no'] += pr;
    }
    return P;
  }
  if (sport === 'tennis') {
    const q = m.q, win = (a, b) => (a === 2 ? 1 : b === 2 ? 0 : q * win(a + 1, b) + (1 - q) * win(a, b + 1));
    const three = (a, b) => (a === 2 || b === 2 ? (a + b === 3 ? 1 : 0) : q * three(a + 1, b) + (1 - q) * three(a, b + 1));
    const ph = win(sh, sa), po = three(sh, sa);
    return { home: ph, away: 1 - ph, over: po, under: 1 - po };
  }
  const mean = m.mh * rem - m.ma * rem + (sh - sa), sdD = Math.sqrt(2 * m.sd * m.sd * rem) || 1e-6;
  const tot = sh + sa + (m.mh + m.ma) * rem, sdT = sdD;
  const ph = phi(mean / sdD), po = 1 - phi((line - tot) / sdT);
  return { home: ph, away: 1 - ph, over: po, under: 1 - po };
}

// Settle one market from a final score. Returns { selectionKey: 'won'|'lost'|'void' }
export function settleMarket(key, line, sh, sa) {
  const W = c => (c ? 'won' : 'lost');
  switch (key) {
    case '1x2': return { home: W(sh > sa), draw: W(sh === sa), away: W(sh < sa) };
    case 'ml': return sh === sa ? { home: 'void', away: 'void' } : { home: W(sh > sa), away: W(sh < sa) };
    case 'totals': case 'sets': return sh + sa === line ? { over: 'void', under: 'void' } : { over: W(sh + sa > line), under: W(sh + sa < line) };
    case 'btts': return { yes: W(sh > 0 && sa > 0), no: W(!(sh > 0 && sa > 0)) };
  }
  return {};
}
