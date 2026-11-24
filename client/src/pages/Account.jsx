import { useState, useEffect } from 'react';
import { useApp, Link } from '../lib/store.jsx';
import { api } from '../lib/api.js';
import { fmt, fmtX, fmtShort, GAME_NAMES, timeAgo } from '../lib/format.js';
import { Avatar, Coin } from '../components/common.jsx';

const KIND = { welcome: 'Welcome coins', daily: 'Daily bonus', refill: 'Top up', rakeback: 'Rakeback', vip_reward: 'VIP level-up', admin: 'Adjustment', bet: 'Bet', win: 'Win', sport_bet: 'Sports bet', sport_win: 'Sports win', refund: 'Refund' };

export function Account() {
  const { user, setAuthOpen } = useApp();
  const [tab, setTab] = useState('bets');
  const [rows, setRows] = useState(null);
  useEffect(() => { if (user) { setRows(null); api(tab === 'bets' ? '/me/bets' : '/me/ledger').then(setRows); } }, [tab, user?.id]); // eslint-disable-line
  if (!user) return <div className="empty"><button className="btn gold" onClick={() => setAuthOpen('login')}>Log in</button></div>;
  return (
    <div>
      <div className="game-title"><Avatar name={user.username} hue={user.hue} size={44} /><h1>{user.username}</h1><Link to={`/u/${user.username}`} className="btn sm ghost">Public profile</Link></div>
      <div className="grid-3" style={{ marginBottom: 18 }}>
        <div className="stat"><small>Balance</small><b><Coin /> {fmt(user.balance)}</b></div>
        <div className="stat"><small>Wagered</small><b>{fmtShort(user.wagered)}</b></div>
        <div className="stat"><small>Profit</small><b className={user.profit >= 0 ? 'pos' : 'bad'}>{user.profit >= 0 ? '+' : ''}{fmtShort(user.profit)}</b></div>
        <div className="stat"><small>Bets</small><b>{user.betCount.toLocaleString()}</b></div>
      </div>
      <div className="tabs-line" role="tablist">
        {[['bets', 'Casino bets'], ['ledger', 'Coin history']].map(([k, l]) => <button key={k} role="tab" aria-selected={tab === k} onClick={() => setTab(k)}>{l}</button>)}
        <Link to="/sports/my" style={{ padding: '10px 12px', color: 'var(--muted)', fontWeight: 600 }}>Sports bets</Link>
        <Link to="/fairness" style={{ padding: '10px 12px', color: 'var(--muted)', fontWeight: 600 }}>Seeds</Link>
      </div>
      <div className="feed">
        {rows === null ? <div className="empty">Loading…</div> : !rows.length ? <div className="empty">Nothing here yet.</div> : tab === 'bets' ? (
          <table className="tbl"><thead><tr><th>Game</th><th className="r">Bet</th><th className="r">Multiplier</th><th className="r">Profit</th><th className="r hide-sm">Nonce</th><th className="r hide-sm">When</th></tr></thead>
            <tbody>{rows.map(b => <tr key={b.id}><td>{GAME_NAMES[b.game]}</td><td className="r">{fmt(b.amount)}</td><td className="r">{fmtX(b.multiplier)}</td><td className={`r ${b.payout > b.amount ? 'pos' : 'neg'}`}>{b.payout > b.amount ? '+' : ''}{fmt(b.payout - b.amount)}</td><td className="r hide-sm">{b.nonce ?? (b.detail.round ? `Round ${b.detail.round}` : '–')}</td><td className="r hide-sm muted">{timeAgo(b.at)}</td></tr>)}</tbody></table>
        ) : (
          <table className="tbl"><thead><tr><th>What</th><th className="r">Amount</th><th className="r">Balance after</th><th className="r hide-sm">When</th></tr></thead>
            <tbody>{rows.map((l, i) => <tr key={i}><td>{KIND[l.kind] || l.kind}{l.ref && !['bet', 'win'].includes(l.kind) ? <span className="muted"> · {l.ref}</span> : l.ref ? <span className="muted"> · {GAME_NAMES[l.ref] || l.ref}</span> : ''}</td><td className={`r ${l.amount > 0 ? 'pos' : ''}`}>{l.amount > 0 ? '+' : ''}{fmt(l.amount)}</td><td className="r">{fmt(l.balance)}</td><td className="r hide-sm muted">{timeAgo(l.at)}</td></tr>)}</tbody></table>
        )}
      </div>
    </div>
  );
}

export function Profile({ name }) {
  const [p, setP] = useState(null), [err, setErr] = useState('');
  useEffect(() => { setP(null); setErr(''); api(`/users/${encodeURIComponent(name)}`).then(setP).catch(e => setErr(e.message)); }, [name]);
  if (err) return <div className="empty">{err}</div>;
  if (!p) return <div className="empty">Loading…</div>;
  return (
    <div>
      <div className="game-title"><Avatar name={p.username} hue={p.hue} size={52} /><div style={{ marginRight: 'auto' }}><h1>{p.username}</h1><span className="muted">{p.vip}{p.role === 'admin' ? ' · Staff' : ''} · joined {new Date(p.joined).toLocaleDateString()}</span></div></div>
      <div className="grid-3">
        <div className="stat"><small>Bets</small><b>{p.bets.toLocaleString()}</b></div>
        <div className="stat"><small>Wagered</small><b>{fmtShort(p.wagered)}</b></div>
        <div className="stat"><small>Profit</small><b className={p.profit >= 0 ? 'pos' : 'bad'}>{p.profit >= 0 ? '+' : ''}{fmtShort(p.profit)}</b></div>
        <div className="stat"><small>Favourite game</small><b>{p.favorite ? GAME_NAMES[p.favorite] : '–'}</b></div>
        <div className="stat"><small>Best multiplier</small><b>{p.best ? `${fmtX(p.best.multiplier)}` : '–'}</b>{p.best && <small>on {GAME_NAMES[p.best.game]}</small>}</div>
        <div className="stat"><small>Sports bets won</small><b>{p.sports.won} / {p.sports.bets}</b></div>
      </div>
    </div>
  );
}
