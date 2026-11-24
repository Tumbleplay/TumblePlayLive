import { useState, useEffect, useRef } from 'react';
import { fmt, fmtX, GAME_NAMES, reducedMotion } from '../lib/format.js';
import { useApp, Link } from '../lib/store.jsx';
import { sfx } from '../lib/sfx.js';

export const Avatar = ({ name = '?', hue = 250, size = 26 }) => (
  <span className="avatar" style={{ background: `hsl(${hue} 78% 66%)`, width: size, height: size, fontSize: Math.round(size * 0.46) }} aria-hidden="true">
    {name[0]?.toUpperCase()}
  </span>
);

export const UserChip = ({ name, hue }) => (
  <Link to={`/u/${encodeURIComponent(name)}`} className="user-chip">
    <Avatar name={name} hue={hue} />
    <span>{name}</span>
  </Link>
);

export const Coin = () => <span className="coin" aria-hidden="true" />;

export function RollingNumber({ value, format = fmt, duration = 420, className = '' }) {
  const [shown, setShown] = useState(Number(value) || 0);
  const curRef = useRef(Number(value) || 0);
  useEffect(() => {
    const target = Number(value) || 0;
    const from = curRef.current;
    if (Math.abs(target - from) < 0.001 || reducedMotion()) {
      curRef.current = target;
      setShown(target);
      return;
    }
    let raf;
    const t0 = performance.now();
    const step = now => {
      const p = Math.min(1, (now - t0) / duration);
      const ease = 1 - Math.pow(1 - p, 3);
      const v = from + (target - from) * ease;
      curRef.current = v;
      setShown(v);
      if (p < 1) raf = requestAnimationFrame(step);
      else { curRef.current = target; setShown(target); }
    };
    raf = requestAnimationFrame(step);
    return () => cancelAnimationFrame(raf);
  }, [value, duration]);
  return <span className={className}>{format(shown)}</span>;
}

export function Seg({ value, options, onChange, disabled }) {
  return (
    <div className="seg" role="group">
      {options.map(([v, label]) => (
        <button key={v} type="button" aria-pressed={value === v} disabled={disabled} onClick={() => { sfx.click(); onChange(v); }}>
          {label}
        </button>
      ))}
    </div>
  );
}

export function BetInput({ value, onChange, disabled, label = 'Bet amount' }) {
  const { user } = useApp();
  const [text, setText] = useState(String(value));
  useEffect(() => { if (Number(text) !== value) setText(value.toFixed(2)); }, [value]); // eslint-disable-line
  const set = v => {
    sfx.click();
    const n = Math.max(0, Math.round(v * 100) / 100);
    setText(n.toFixed(2));
    onChange(n);
  };
  return (
    <label className="field">
      <span>{label}<span>{fmt(value)}</span></span>
      <div className="betrow">
        <div className="amt">
          <input className="input" type="number" min="0" step="0.01" inputMode="decimal" disabled={disabled} value={text}
            onChange={e => { setText(e.target.value); onChange(Math.max(0, Number(e.target.value) || 0)); }}
            onBlur={() => setText((Number(text) || 0).toFixed(2))} />
          <Coin />
        </div>
        <button type="button" className="mini" disabled={disabled} onClick={() => set(value / 2)}>½</button>
        <button type="button" className="mini" disabled={disabled} onClick={() => set(Math.max(0.01, value * 2))}>2×</button>
        <button type="button" className="mini" disabled={disabled || !user} onClick={() => set(Math.floor((user?.balance || 0) * 100) / 100)}>Max</button>
      </div>
    </label>
  );
}

export function ProfitOnWin({ amount, multiplier }) {
  const p = Math.max(0, amount * (multiplier || 0) - amount);
  return (
    <div className="field">
      <span>Profit on win<span>{fmt(p)}</span></span>
      <div className="betrow">
        <div className="amt">
          <input className="input" readOnly tabIndex={-1} value={fmt(p)} />
          <Coin />
        </div>
      </div>
    </div>
  );
}

const SUITS = ['♠', '♥', '♦', '♣'], RANKS = ['A', '2', '3', '4', '5', '6', '7', '8', '9', '10', 'J', 'Q', 'K'];
export function PlayingCard({ card, hidden, small, mark }) {
  if (hidden || card == null) return <div className={`pcard back card3d-in${small ? ' sm' : ''}`} aria-label="Hidden card" />;
  const suit = Math.floor(card / 13), rank = RANKS[card % 13];
  const isRed = suit === 1 || suit === 2;
  return (
    <div className={`pcard card3d-flip${isRed ? ' red' : ''}${small ? ' sm' : ''}${mark ? ' ' + mark : ''}`}>
      <span className="card-shine" aria-hidden="true" />
      <div className="rk">{rank}<span>{SUITS[suit]}</span></div>
      <div className="st">{SUITS[suit]}</div>
    </div>
  );
}

const hhmm = t => (t ? new Date(t).toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' }) : '');
export function BetsTable({ rows, showUser = true, empty = 'No bets yet' }) {
  if (!rows.length) return <div className="empty">{empty}</div>;
  return (
    <table className="tbl">
      <thead><tr><th>Game</th>{showUser && <th>User</th>}<th className="hide-sm">Time</th><th className="r">Bet amount</th><th className="r">Multiplier</th><th className="r">Payout</th></tr></thead>
      <tbody>
        {rows.map(b => {
          const won = b.payout != null && b.payout > b.amount;
          return (
            <tr key={b.id} className={won ? 'row-win' : ''}>
              <td><span className="gname"><i style={{ background: `var(--g-${b.game}, var(--blue))` }} />{GAME_NAMES[b.game] || b.game}</span></td>
              {showUser && <td><UserChip name={b.username} hue={b.hue} /></td>}
              <td className="hide-sm muted">{hhmm(b.at)}</td>
              <td className="r">{fmt(b.amount)} <Coin /></td>
              <td className="r"><span className={`mult-chip${won ? ' w' : ''}`}>{fmtX(b.multiplier)}</span></td>
              <td className={`r ${b.payout == null ? 'muted' : won ? 'pos' : 'neg'}`}>
                {b.payout == null ? 'Open' : <>{won ? '+' : '-'}{fmt(Math.abs(b.payout - b.amount))} <Coin /></>}
              </td>
            </tr>
          );
        })}
      </tbody>
    </table>
  );
}

export function Modal({ onClose, children, label }) {
  useEffect(() => {
    const k = e => e.key === 'Escape' && onClose();
    addEventListener('keydown', k);
    return () => removeEventListener('keydown', k);
  }, [onClose]);
  return (
    <div className="veil" role="dialog" aria-modal="true" aria-label={label} onMouseDown={e => e.target === e.currentTarget && onClose()}>
      <div className="modal">{children}</div>
    </div>
  );
}

export function useCountdown(target) {
  const [now, setNow] = useState(Date.now());
  useEffect(() => { const t = setInterval(() => setNow(Date.now()), 1000); return () => clearInterval(t); }, []);
  const ms = Math.max(0, (target || 0) - now);
  const h = Math.floor(ms / 3.6e6), m = Math.floor(ms / 6e4) % 60, s = Math.floor(ms / 1000) % 60;
  return { ready: ms === 0, text: h ? `${h}h ${m}m` : m ? `${m}m ${s}s` : `${s}s` };
}
