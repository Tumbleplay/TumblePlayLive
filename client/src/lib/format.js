export const fmt = n => (Number(n) || 0).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
export const fmtShort = n => {
  const a = Math.abs(n);
  if (a >= 1e9) return (n / 1e9).toFixed(2) + 'B';
  if (a >= 1e6) return (n / 1e6).toFixed(2) + 'M';
  if (a >= 1e4) return (n / 1e3).toFixed(1) + 'K';
  return fmt(n);
};
export const fmtX = m => (m == null ? '–' : (m >= 1000 ? Math.round(m).toLocaleString('en-US') : Number(m).toFixed(2)) + '×');
export const r2 = n => Math.round(n * 100) / 100;
export const timeAgo = t => { const s = Math.max(1, Math.round((Date.now() - t) / 1000)); return s < 60 ? `${s}s ago` : s < 3600 ? `${Math.round(s / 60)}m ago` : s < 86400 ? `${Math.round(s / 3600)}h ago` : `${Math.round(s / 86400)}d ago`; };
export const clock = t => new Date(t).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
export const dayLabel = t => {
  const d = new Date(t), today = new Date(); const tm = new Date(); tm.setDate(today.getDate() + 1);
  if (d.toDateString() === today.toDateString()) return 'Today';
  if (d.toDateString() === tm.toDateString()) return 'Tomorrow';
  return d.toLocaleDateString([], { weekday: 'short', day: 'numeric', month: 'short' });
};
export const GAME_NAMES = { dice: 'Dice', limbo: 'Limbo', mines: 'Mines', plinko: 'Plinko', keno: 'Keno', wheel: 'Wheel', roulette: 'Roulette', hilo: 'HiLo', blackjack: 'Blackjack', crash: 'Aviator', sports: 'Sports' };
export const reducedMotion = () => matchMedia('(prefers-reduced-motion: reduce)').matches;
