import { useState, useEffect } from 'react';
import { useApp, Link } from '../lib/store.jsx';
import { api } from '../lib/api.js';
import { fmt, fmtShort } from '../lib/format.js';
import { useCountdown, Coin, Seg } from '../components/common.jsx';

const GEM_COLORS = ['#A59FD0', '#D08B5B', '#C9D1E0', '#FFB627', '#7FD6E8', '#B98CFF', '#FF5C7A'];
const Gem = ({ i }) => <svg className="gem" viewBox="0 0 24 24"><path d="M6 3h12l4 6-10 12L2 9z" fill={GEM_COLORS[i]} /><path d="M2 9h20M8 3l4 18 4-18" stroke="rgba(0,0,0,.3)" strokeWidth="1.2" fill="none" /></svg>;

export function Rewards() {
  const { user, setUser, toast, setAuthOpen } = useApp();
  const daily = useCountdown(user?.dailyReadyAt), refill = useCountdown(user?.refillReadyAt);
  if (!user) return <div className="empty"><p>Log in to claim free coins.</p><button className="btn gold" onClick={() => setAuthOpen('register')}>Get 50 welcome coins</button></div>;
  const claim = async kind => { try { const r = await api(`/rewards/${kind}`, {}); setUser(r.me); toast(`+${fmt(r.claimed)} coins`, 'win'); } catch (e) { toast(e.message, 'error'); } };
  const canRefill = user.balance < user.refillBelow && refill.ready;
  return (
    <div>
      <div className="game-title"><h1>Rewards</h1><span className="muted">Everything here is free. Coins have no cash value.</span></div>
      <div className="grid-2">
        <div className="card"><h2 style={{ fontSize: 20 }}>Daily bonus</h2><p className="muted">Claim your +10 daily login bonus once every 24 hours.</p>
          <div className="reward" style={{ border: 0, padding: 0, background: 'none' }}><div className="amt"><Coin /> {user.vip.daily.toLocaleString()}</div></div>
          <button className="btn green" style={{ marginTop: 12 }} disabled={!daily.ready} onClick={() => claim('daily')}>{daily.ready ? 'Claim daily bonus' : `Ready in ${daily.text}`}</button></div>
        <div className="card"><h2 style={{ fontSize: 20 }}>Rakeback</h2><p className="muted">A share of every bet comes back to you: {(user.vip.rakebackRate * 100).toFixed(2)}% at {user.vip.name}.</p>
          <div className="reward" style={{ border: 0, padding: 0, background: 'none' }}><div className="amt"><Coin /> {fmt(user.rakeback)}</div></div>
          <button className="btn green" style={{ marginTop: 12 }} disabled={user.rakeback < 0.01} onClick={() => claim('rakeback')}>Claim rakeback</button></div>
        <div className="card"><h2 style={{ fontSize: 20 }}>Top up</h2><p className="muted">Invite friends from the Wallet page to earn +50 coins for every verified referral!</p>
          <button className="btn green" style={{ marginTop: 12 }} disabled={!canRefill} onClick={() => claim('refill')}>{user.balance >= user.refillBelow ? `Unlocks under ${user.refillBelow} coins` : refill.ready ? 'Top up to 1,000' : `Ready in ${refill.text}`}</button></div>
        <Link to="/vip" className="card" style={{ display: 'block' }}><h2 style={{ fontSize: 20 }}>VIP level: {user.vip.name}</h2>
          <div className="vip-bar" style={{ margin: '14px 0 8px' }}><i style={{ width: `${user.vip.progress * 100}%` }} /></div>
          <p className="muted" style={{ margin: 0 }}>{user.vip.next ? `Wager ${fmtShort(user.vip.next.at - user.wagered)} more to reach ${user.vip.next.name} and get ${user.vip.next.reward.toLocaleString()} coins.` : 'You are at the top level.'}</p></Link>
      </div>
    </div>
  );
}

export function Vip() {
  const { user, config } = useApp();
  if (!config) return null;
  return (
    <div>
      <div className="game-title"><h1>VIP club</h1><span className="muted">Levels are earned by playing. Higher levels mean bigger daily bonuses and more rakeback.</span></div>
      {user && <div className="card" style={{ marginBottom: 16 }}>
        <div className="kv"><b style={{ fontSize: 22 }}>{user.vip.name}</b><span>Wagered <b>{fmtShort(user.wagered)}</b></span></div>
        <div className="vip-bar" style={{ margin: '12px 0 8px' }}><i style={{ width: `${user.vip.progress * 100}%` }} /></div>
        <div className="muted">{user.vip.next ? `${fmtShort(user.vip.next.at - user.wagered)} to ${user.vip.next.name}` : 'Top level reached'}</div>
      </div>}
      <div className="ladder">
        <div className="rung" style={{ background: 'none', border: 0, padding: '0 14px', color: 'var(--muted)', fontSize: 13 }}><span /><span>Level</span><span className="opt">Unlock bonus</span><span className="opt">Daily bonus</span><span>Rakeback</span></div>
        {config.vip.map((l, i) => (
          <div key={l.name} className={`rung${user?.vip.level === i ? ' on' : ''}`}>
            <Gem i={i} /><span><b>{l.name}</b><br /><small className="muted">Wager {fmtShort(l.min)}</small></span>
            <span className="opt">{l.reward ? l.reward.toLocaleString() : '–'}</span><span className="opt">{l.daily.toLocaleString()}</span><span>{(l.rakeback * 100).toFixed(2)}%</span>
          </div>
        ))}
      </div>
    </div>
  );
}

export function Leaderboard() {
  const [period, setPeriod] = useState('week'), [metric, setMetric] = useState('profit'), [rows, setRows] = useState(null);
  useEffect(() => { setRows(null); api(`/leaderboard?period=${period}&metric=${metric}`).then(setRows); }, [period, metric]);
  const val = v => (metric === 'multiplier' ? `${Math.round(v).toLocaleString()}×` : fmtShort(v));
  const top = rows?.slice(0, 3) || [];
  return (
    <div>
      <div className="game-title"><h1>Leaderboard</h1></div>
      <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap', marginBottom: 16 }}>
        <div style={{ minWidth: 260 }}><Seg value={metric} onChange={setMetric} options={[['profit', 'Profit'], ['wagered', 'Wagered'], ['multiplier', 'Biggest multiplier']]} /></div>
        <div style={{ minWidth: 220 }}><Seg value={period} onChange={setPeriod} options={[['day', 'Today'], ['week', 'This week'], ['all', 'All time']]} /></div>
      </div>
      {rows === null ? <div className="empty">Loading…</div> : !rows.length ? <div className="empty">Nobody on the board yet. Play a few rounds to take first place.</div> : <>
        <div className="podium">{[1, 0, 2].map(i => top[i] && (
          <div key={i} className={`p${i === 0 ? ' first' : ''}`}><span className="place">{i + 1}</span><Link to={`/u/${top[i].username}`}><b>{top[i].username}</b></Link><span className="muted">{val(top[i].value)}</span></div>
        ))}</div>
        <div className="feed"><table className="tbl"><thead><tr><th>#</th><th>Player</th><th className="hide-sm">VIP</th><th className="r">{metric === 'multiplier' ? 'Multiplier' : metric === 'profit' ? 'Profit' : 'Wagered'}</th></tr></thead>
          <tbody>{rows.map(r => <tr key={r.username}><td>{r.rank}</td><td><Link to={`/u/${r.username}`}>{r.username}</Link></td><td className="hide-sm"><span className="vip-tag">{r.vip}</span></td><td className={`r ${metric === 'profit' && r.value < 0 ? 'bad' : ''}`}>{val(r.value)}{r.game ? <span className="muted"> · {r.game}</span> : ''}</td></tr>)}</tbody></table></div>
      </>}
    </div>
  );
}
