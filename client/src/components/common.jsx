import { useState, useEffect } from 'react';
import { fmt, fmtX, GAME_NAMES } from '../lib/format.js';
import { useApp, Link } from '../lib/store.jsx';

export const Avatar = ({ name = '?', hue = 250, size = 26 }) => (
  <span className="avatar" style={{ width: size, height: size, background: `hsl(${hue} 75% 70%)`, fontSize: size * .45 }}>{name[0]?.toUpperCase()}</span>
);
export const UserChip = ({ name, hue }) => (
  <Link to={`/u/${name}`} className="user-chip"><Avatar name={name} hue={hue} /><span>{name}</span></Link>
);
export const Coin = () => <span className="coin" aria-hidden="true" />;

export function Seg({ value, options, onChange, disabled }) {
  return <div className="seg" role="group">{options.map(([v, label]) =>
    <button type="button" key={v} aria-pressed={value === v} disabled={disabled} onClick={() => onChange(v)}>{label}</button>)}</div>;
}

// Bet amount with ½ / 2× / max; keeps a free-typing string and reports the parsed number
export function BetInput({ value, onChange, disabled, label = 'Bet amount' }) {
  const { user } = useApp();
  const [text, setText] = useState(String(value));
  useEffect(() => { if (Number(text) !== value) setText(value.toFixed(2)); }, [value]); // eslint-disable-line
  const set = v => { const n = Math.max(0, Math.round(v * 100) / 100); setText(n.toFixed(2)); onChange(n); };
  return (
    <label className="field"><span>{label}<span>{fmt(value)}</span></span>
      <div className="betrow">
        <div className="amt">
          <input className="input" type="number" min="0" step="0.01" inputMode="decimal" value={text} disabled={disabled} aria-label={label}
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

// Read-only "profit on win" box shown under the bet amount, like the big game sites
export function ProfitOnWin({ amount, multiplier }) {
  const p = Math.max(0, amount * (multiplier || 0) - amount);
  return <label className="field"><span>Profit on win<span>{fmt(p)}</span></span>
    <div className="betrow"><div className="amt"><input className="input" readOnly value={p.toFixed(2)} aria-label="Profit on win" /><Coin /></div></div></label>;
}

const SUITS = ['♠', '♥', '♦', '♣'], RANKS = ['A', '2', '3', '4', '5', '6', '7', '8', '9', '10', 'J', 'Q', 'K'];
export function PlayingCard({ card, hidden, small, mark }) {
  if (hidden || card == null) return <div className={`pcard back${small ? ' sm' : ''}`} aria-label="Face-down card" />;
  const suit = Math.floor(card / 13), rank = RANKS[card % 13];
  return (
    <div className={`pcard${suit === 1 || suit === 2 ? ' red' : ''}${small ? ' sm' : ''}${mark ? ' ' + mark : ''}`} aria-label={`${rank} of ${['spades', 'hearts', 'diamonds', 'clubs'][suit]}`}>
      <span className="rk">{rank}<br /><small style={{ fontSize: '.7em' }}>{SUITS[suit]}</small></span><span className="st">{SUITS[suit]}</span>
    </div>
  );
}

const hhmm = t => (t ? new Date(t).toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' }) : '');
export function BetsTable({ rows, showUser = true, empty = 'No bets yet' }) {
  if (!rows.length) return <div className="empty">{empty}</div>;
  return (
    <table className="tbl">
      <thead><tr><th>Game</th>{showUser && <th className="hide-sm">User</th>}<th className="hide-sm">Time</th><th className="r hide-sm">Bet amount</th><th className="r">Multiplier</th><th className="r">Payout</th></tr></thead>
      <tbody>{rows.map(b => {
        const won = b.payout != null && b.payout > b.amount;
        return (
          <tr key={b.id}>
            <td><Link className="gname" to={b.game === 'sports' ? '/sports' : `/casino/${b.game}`}><i style={{ background: `var(--g-${b.game}, var(--sky))` }} />{GAME_NAMES[b.game] || b.game}</Link></td>
            {showUser && <td className="hide-sm"><UserChip name={b.username} hue={b.hue} /></td>}
            <td className="hide-sm muted">{hhmm(b.at)}</td>
            <td className="r hide-sm">{fmt(b.amount)} <Coin /></td>
            <td className="r muted">{fmtX(b.multiplier)}</td>
            <td className={`r ${b.payout == null ? 'muted' : won ? 'pos' : 'neg'}`}>{b.payout == null ? 'Open' : <>{won ? '+' : '-'}{fmt(Math.abs(b.payout - b.amount))} <Coin /></>}</td>
          </tr>
        );
      })}</tbody>
    </table>
  );
}

export function Modal({ onClose, children, label }) {
  useEffect(() => { const k = e => e.key === 'Escape' && onClose(); addEventListener('keydown', k); return () => removeEventListener('keydown', k); }, [onClose]);
  return <div className="veil" onMouseDown={e => e.target === e.currentTarget && onClose()}><div className="modal" role="dialog" aria-modal="true" aria-label={label}>{children}</div></div>;
}

export function useCountdown(target) {
  const [now, setNow] = useState(Date.now());
  useEffect(() => { const t = setInterval(() => setNow(Date.now()), 1000); return () => clearInterval(t); }, []);
  const ms = Math.max(0, (target || 0) - now);
  const h = Math.floor(ms / 3.6e6), m = Math.floor(ms / 6e4) % 60, s = Math.floor(ms / 1000) % 60;
  return { ready: ms === 0, text: h ? `${h}h ${m}m` : m ? `${m}m ${s}s` : `${s}s` };
}
