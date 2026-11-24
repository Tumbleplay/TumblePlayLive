import { CENTS } from './config.js';

export class AppError extends Error {
  constructor(message, status = 400) { super(message); this.status = status; }
}
export const now = () => Date.now();
export const toCents = v => Math.round(Number(v) * CENTS);
export const toCoins = c => c / CENTS;
export const floor2 = x => Math.floor(x * 100) / 100;

// Validate a coin amount from a request body; returns cents
export function parseAmount(v, { min = 1, max } = {}) {
  const n = Number(v);
  if (!Number.isFinite(n)) throw new AppError('Enter an amount in coins');
  const c = Math.round(n * CENTS);
  if (c < min) throw new AppError(`Minimum is ${(min / CENTS).toFixed(2)} coins`);
  if (max && c > max) throw new AppError(`Maximum is ${(max / CENTS).toLocaleString()} coins`);
  return c;
}
export function pickInt(v, lo, hi, name) {
  const n = Number(v);
  if (!Number.isInteger(n) || n < lo || n > hi) throw new AppError(`${name} must be between ${lo} and ${hi}`);
  return n;
}
export function pickOne(v, list, name) {
  if (!list.includes(v)) throw new AppError(`${name} must be one of ${list.join(', ')}`);
  return v;
}
// Express wrapper: sync or async handlers, errors become JSON
export const h = fn => async (req, res) => {
  try {
    const out = await fn(req, res);
    if (out !== undefined && !res.headersSent) res.json(out);
  } catch (e) {
    const status = e.status || 500;
    if (status === 500) console.error(e);
    res.status(status).json({ error: status === 500 ? 'Something went wrong on our side. Try again.' : e.message });
  }
};
