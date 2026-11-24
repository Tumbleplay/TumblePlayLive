import { useState, useEffect } from 'react';
import { useApp, Link, useSocket, navigate } from '../lib/store.jsx';
import { api } from '../lib/api.js';
import { fmt } from '../lib/format.js';
import { GLYPHS, TILE_BG, I } from '../components/icons.jsx';
import { BetsTable, useCountdown, Coin } from '../components/common.jsx';
import { EventRow } from './Sports.jsx';

// key, name, tagline, category
export const GAME_LIST = [
  ['crash', 'Aviator', 'Live multiplayer', 'multi'], ['dice', 'Dice', 'Roll over or under', 'instant'], ['mines', 'Mines', 'Find the gems', 'instant'],
  ['plinko', 'Plinko', 'Drop the ball', 'instant'], ['limbo', 'Limbo', 'Pick your target', 'instant'], ['keno', 'Keno', '10 from 40', 'instant'],
  ['wheel', 'Wheel', 'Spin to win', 'instant'], ['roulette', 'Roulette', 'Single zero', 'table'], ['hilo', 'HiLo', 'Higher or lower', 'table'], ['blackjack', 'Blackjack', 'Beat the dealer', 'table']
];

// Real counts: distinct players with a bet on each game in the last 15 minutes
export function usePlaying() {
  const [p, setP] = useState({});
  useEffect(() => {
    let on = true;
    const load = () => api('/stats/playing').then(r => on && setP(r)).catch(() => {});
    load(); const t = setInterval(load, 30000);
    return () => { on = false; clearInterval(t); };
  }, []);
  return p;
}

export function GameTile({ k, name, playing }) {
  return (
    <div className="tile-wrap">
      <Link to={`/casino/${k}`} className="tile" style={{ background: TILE_BG[k] }} aria-label={name}>
        <span className="glow" /><span className="art">{GLYPHS[k]}</span>
        <span className="name">{name}</span><span className="studio">TUMBLEPLAY ORIGINALS</span>
      </Link>
      {playing !== undefined && <span className={`playing${playing ? '' : ' idle'}`}>{playing ? `${playing} playing` : 'Be the first'}</span>}
    </div>
  );
}

export function GameGrid({ filter = () => true, row }) {
  const playing = usePlaying();
  const list = GAME_LIST.filter(filter);
  if (!list.length) return <div className="empty">No games match that search.</div>;
  return <div className={`games${row ? ' row' : ''}`}>{list.map(([k, name]) => <GameTile key={k} k={k} name={name} playing={playing[k] || 0} />)}</div>;
}

export function LiveBets() {
  const { user } = useApp();
  const [tab, setTab] = useState('all');
  const [rows, setRows] = useState([]);
  useEffect(() => {
    if (tab === 'mine') { if (user) api('/me/bets').then(r => setRows(r.slice(0, 10).map(b => ({ ...b, id: `${b.game}-${b.id}`, username: user.username, hue: user.hue })))); else setRows([]); }
    else api(`/bets/recent${tab === 'high' ? '?high=1' : ''}`).then(r => setRows(r.slice(0, 10)));
  }, [tab, user?.id]); // eslint-disable-line
  useSocket('bet', b => {
    if (tab === 'all' || (tab === 'high' && b.amount >= 1000) || (tab === 'mine' && user && b.username === user.username)) setRows(r => [b, ...r.filter(x => x.id !== b.id)].slice(0, 10));
  });
  const T = ({ v, children }) => <button aria-pressed={tab === v} onClick={() => setTab(v)}>{children}</button>;
  return <>
    <div className="feed-head">
      <div className="cats" role="group" aria-label="Bet feed"><T v="mine">My Bets</T><T v="all">All Bets</T><T v="high">High Rollers</T><button onClick={() => navigate('/leaderboard')}>Leaderboard</button></div>
    </div>
    <div className="feed"><BetsTable rows={rows} showUser={tab !== 'mine'} empty={tab === 'mine' && !user ? 'Sign in to see your bets' : 'Waiting for the first bet…'} /></div>
  </>;
}

/* ---------- promo banners (original art) ---------- */
const PromoArt = {
  daily: <svg viewBox="0 0 120 120"><defs><linearGradient id="pa1" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stopColor="#FFE58A" /><stop offset="1" stopColor="#FFAA00" /></linearGradient></defs>
    {[[28, 84, 22], [62, 88, 24], [92, 80, 18]].map(([x, y, r], i) => <g key={i}><ellipse cx={x} cy={y + 6} rx={r} ry={r * .45} fill="#B86E00" /><ellipse cx={x} cy={y} rx={r} ry={r * .45} fill="url(#pa1)" stroke="#fff" strokeWidth="2" /></g>)}
    <rect x="36" y="22" width="48" height="40" rx="6" fill="#1475E1" stroke="#fff" strokeWidth="3" /><rect x="56" y="22" width="8" height="40" fill="#fff" /><path d="M60 22c-10-14-24-8-16 0zM60 22c10-14 24-8 16 0z" fill="#fff" /></svg>,
  vip: <svg viewBox="0 0 120 120"><defs><linearGradient id="pa2" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stopColor="#FFFFFF" /><stop offset="1" stopColor="#7FC1FF" /></linearGradient></defs>
    <path d="M18 44l20 16 22-32 22 32 20-16-10 52H28z" fill="url(#pa2)" stroke="#fff" strokeWidth="3" strokeLinejoin="round" /><circle cx="60" cy="72" r="9" fill="#1475E1" /><circle cx="38" cy="78" r="5" fill="#FF3D7F" /><circle cx="82" cy="78" r="5" fill="#00E701" /></svg>,
  race: <svg viewBox="0 0 120 120"><path d="M38 24h44v20a22 22 0 0 1-44 0z" fill="#FFD23F" stroke="#fff" strokeWidth="3" /><path d="M38 30H24a12 12 0 0 0 14 16M82 30h14a12 12 0 0 1-14 16" stroke="#fff" strokeWidth="4" fill="none" /><rect x="54" y="64" width="12" height="14" fill="#FFB300" /><rect x="40" y="78" width="40" height="12" rx="3" fill="#fff" />
    <g transform="translate(14 96)">{[0, 1, 2, 3, 4, 5].map(i => <rect key={i} x={i * 16} y="0" width="8" height="8" fill="#fff" />)}{[0, 1, 2, 3, 4, 5].map(i => <rect key={i} x={i * 16 + 8} y="8" width="8" height="8" fill="#fff" />)}</g></svg>
};
function Promos() {
  const { user, setAuthOpen } = useApp();
  const items = [
    ['daily', 'linear-gradient(150deg,#1E6FE0,#0B3E9A)', 'Free', 'Daily coins', user ? 'Claim your daily bonus and rakeback' : 'Get 50 welcome coins when you join', user ? '/rewards' : null],
    ['vip', 'linear-gradient(150deg,#2B4C66,#13293A)', 'Tumble', 'VIP Club', 'Climb 7 levels for bigger daily bonuses', '/vip'],
    ['race', 'linear-gradient(150deg,#E85A1B,#9C2A0B)', 'Weekly', 'Leaderboard race', 'Top profit this week takes the podium', '/leaderboard']
  ];
  return <div className="promos">{items.map(([k, bg, tag, h, p, to]) => (
    <button key={k} className="promo" onClick={() => (to ? navigate(to) : setAuthOpen('register'))}>
      <span className="art" style={{ background: bg }}>{PromoArt[k]}</span>
      <span className="txt"><span className={`tag${tag === 'Free' ? ' free' : ''}`}>{tag}</span><h3>{h}</h3><p>{p}</p></span>
    </button>
  ))}</div>;
}

function RewardCards() {
  const { user, setUser, toast } = useApp();
  const daily = useCountdown(user.dailyReadyAt), refill = useCountdown(user.refillReadyAt);
  const claim = async kind => {
    try { const r = await api(`/rewards/${kind}`, {}); setUser(r.me); toast(`+${fmt(r.claimed)} coins`, 'win'); } catch (e) { toast(e.message, 'error'); }
  };
  const canRefill = user.balance < user.refillBelow && refill.ready;
  return (
    <div className="rewards-strip">
      <div className="reward"><h3>Daily bonus</h3><div className="amt">{user.vip.daily.toLocaleString()} <Coin /></div><span className="muted">{daily.ready ? 'Ready to claim' : `Next in ${daily.text}`}</span><button className="btn green sm" disabled={!daily.ready} onClick={() => claim('daily')}>Claim</button></div>
      <div className="reward"><h3>Rakeback</h3><div className="amt">{fmt(user.rakeback)} <Coin /></div><span className="muted">Builds up on every bet</span><button className="btn green sm" disabled={user.rakeback < 0.01} onClick={() => claim('rakeback')}>Claim</button></div>
      <div className="reward"><h3>Top up</h3><div className="amt">Back to 1,000</div><span className="muted">{user.balance >= user.refillBelow ? `Unlocks under ${user.refillBelow} coins` : refill.ready ? 'Ready to claim' : `Next in ${refill.text}`}</span><button className="btn green sm" disabled={!canRefill} onClick={() => claim('refill')}>Top up</button></div>
      <Link to="/vip" className="reward"><h3>{user.vip.name}</h3><div className="vip-bar" style={{ margin: '10px 0 4px' }}><i style={{ width: `${user.vip.progress * 100}%` }} /></div>
        <span className="muted">{user.vip.next ? `${Math.round(user.vip.progress * 100)}% to ${user.vip.next.name}` : 'Top level reached'}</span></Link>
    </div>
  );
}

const CATS = [['lobby', 'Lobby', 'casino'], ['originals', 'Tumble Originals', 'fire'], ['multi', 'Multiplayer', 'users'], ['instant', 'Instant wins', 'bolt'], ['table', 'Table games', 'cards']];
function Browse({ start = 'lobby' }) {
  const [q, setQ] = useState('');
  const [cat, setCat] = useState(start);
  useEffect(() => {
    const k = e => { if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'k') { e.preventDefault(); document.getElementById('game-search')?.focus(); } };
    addEventListener('keydown', k); return () => removeEventListener('keydown', k);
  }, []);
  const term = q.trim().toLowerCase();
  const match = g => (!term || g[1].toLowerCase().includes(term) || g[2].toLowerCase().includes(term)) && (['lobby', 'originals'].includes(cat) || g[3] === cat);
  return <>
    <label className="search"><I.search /><input id="game-search" value={q} onChange={e => setQ(e.target.value)} placeholder="Search your game" aria-label="Search games" /><kbd className="hide-sm">Ctrl + K</kbd></label>
    <div className="cats" role="group" aria-label="Game categories">{CATS.map(([k, l, ic]) => { const Ic = I[ic]; return <button key={k} aria-pressed={cat === k} onClick={() => setCat(k)}><Ic />{l}</button>; })}</div>
    <div className="section-head"><h2><I.fire />{term ? 'Search results' : CATS.find(c => c[0] === cat)[1] === 'Lobby' ? 'Tumble Originals' : CATS.find(c => c[0] === cat)[1]}</h2>{!term && cat === 'lobby' && <Link to="/casino">View all</Link>}</div>
    <GameGrid filter={match} row={cat === 'lobby' && !term} />
  </>;
}

export default function Lobby() {
  const { user } = useApp();
  const [live, setLive] = useState([]);
  useEffect(() => { api('/sports/events?status=live').then(r => setLive(r.slice(0, 4))); }, []);
  useSocket('sports:update', ({ events }) => setLive(l => l.map(e => events.find(x => x.id === e.id) || e).filter(e => e.status === 'live')));
  return (
    <div>
      <Promos />
      {user && <RewardCards />}
      <Browse />
      {live.length > 0 && <>
        <div className="section-head"><h2><I.live />Live sports</h2><Link to="/sports">View all</Link></div>
        <div className="ev-list">{live.map(e => <EventRow key={e.id} e={e} moves={{}} />)}</div>
      </>}
      <LiveBets />
    </div>
  );
}

export function Casino() {
  return <div><Promos /><Browse start="originals" /><LiveBets /></div>;
}
