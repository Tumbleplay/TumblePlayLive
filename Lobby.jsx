import { useState, useEffect, useRef } from 'react';
import { useApp, Link, useSocket, navigate } from '../lib/store.jsx';
import { api } from '../lib/api.js';
import { fmt } from '../lib/format.js';
import { GLYPHS, TILE_BG, I } from '../components/icons.jsx';
import { BetsTable, useCountdown, Coin } from '../components/common.jsx';
import { EventRow } from './Sports.jsx';

export const GAME_LIST = [
  ['crash', 'Aviator', 'Live multiplayer', 'multi'], ['dice', 'Dice', 'Roll over or under', 'instant'], ['mines', 'Mines', 'Find the gems', 'instant'],
  ['plinko', 'Plinko', 'Drop the ball', 'instant'], ['limbo', 'Limbo', 'Pick your target', 'instant'], ['keno', 'Keno', '10 from 40', 'instant'],
  ['wheel', 'Wheel', 'Spin to win', 'instant'], ['roulette', 'Roulette', 'Single zero', 'table'], ['hilo', 'HiLo', 'Higher or lower', 'table'], ['blackjack', 'Blackjack', 'Beat the dealer', 'table']
];

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
  const ref = useRef(null);
  const onMove = e => {
    const el = ref.current;
    if (!el || innerWidth <= 860) return;
    const r = el.getBoundingClientRect();
    const x = (e.clientX - r.left) / r.width;
    const y = (e.clientY - r.top) / r.height;
    el.style.setProperty('--rx', `${(0.5 - y) * 14}deg`);
    el.style.setProperty('--ry', `${(x - 0.5) * 16}deg`);
    el.style.setProperty('--mx', `${x * 100}%`);
    el.style.setProperty('--my', `${y * 100}%`);
  };
  const onLeave = () => {
    const el = ref.current;
    if (!el) return;
    el.style.setProperty('--rx', '0deg');
    el.style.setProperty('--ry', '0deg');
  };

  return (
    <div className="tile-wrap">
      <Link ref={ref} to={`/casino/${k}`} className="tile tile-3d" style={{ background: TILE_BG[k] }} aria-label={name} onMouseMove={onMove} onMouseLeave={onLeave}>
        <span className="glow" />
        <span className="tile-spot" aria-hidden="true" />
        <span className="art">{GLYPHS[k]}</span>
        <span className="name">{name}</span>
        <span className="studio">TUMBLEPLAY ORIGINALS</span>
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

const PromoArt = {
  daily: <svg viewBox="0 0 120 120">{[[28, 84, 22], [62, 88, 24], [92, 80, 18]].map(([x, y, r], i) => <g key={i}><ellipse cx={x} cy={y} rx={r} ry={r * 0.45} fill="#C77800" /><ellipse cx={x} cy={y - 6} rx={r} ry={r * 0.45} fill="#FFC24B" /><ellipse cx={x} cy={y - 6} rx={r * 0.72} ry={r * 0.3} fill="#FFE694" /></g>)}<path d="M58 18l8 16 18 3-13 12 3 18-16-8-16 8 3-18-13-12 18-3z" fill="#00E701" /></svg>,
  vip: <svg viewBox="0 0 120 120"><path d="M18 82L10 38l28 18 22-30 22 30 28-18-8 44z" fill="#FFC24B" /><rect x="18" y="84" width="84" height="14" rx="5" fill="#D98A00" /><circle cx="60" cy="58" r="9" fill="#00E701" /><circle cx="34" cy="64" r="6" fill="#4DA3FF" /><circle cx="86" cy="64" r="6" fill="#4DA3FF" /></svg>,
  race: <svg viewBox="0 0 120 120"><path d="M32 24h56v24c0 18-12 30-28 30S32 66 32 48z" fill="#FFE08A" /><path d="M32 30H16c0 14 6 22 16 24M88 30h16c0 14-6 22-16 24" stroke="#FFC24B" strokeWidth="7" fill="none" strokeLinecap="round" /><rect x="52" y="76" width="16" height="16" fill="#FFC24B" /><rect x="36" y="90" width="48" height="12" rx="4" fill="#D98A00" /></svg>
};

function Promos() {
  const { user, setAuthOpen } = useApp();
  const items = [
    ['daily', 'linear-gradient(150deg,#1E6FE0,#0B3E9A)', 'Free', 'Daily coins', user ? 'Claim your +10 daily login bonus & promo drops' : 'Get 50 welcome coins when you join', user ? '/buy' : null],
    ['vip', 'linear-gradient(150deg,#2B4C66,#13293A)', 'TumblePlay', 'VIP Club', 'Climb 7 levels for bigger rakeback & perks', '/vip'],
    ['race', 'linear-gradient(150deg,#E85A1B,#9C2A0B)', 'Weekly', 'Leaderboard race', 'Top profit this week takes the podium', '/leaderboard']
  ];
  return <div className="promos">{items.map(([k, bg, tag, h, p, to]) => (
    <button key={k} className="promo" onClick={() => (to ? navigate(to) : setAuthOpen('register'))}>
      <div className="art" style={{ background: bg }}>{PromoArt[k]}</div>
      <div className="txt"><span className={`tag${tag === 'Free' ? ' free' : ''}`}>{tag}</span><h3>{h}</h3><p>{p}</p></div>
    </button>
  ))}</div>;
}

function RewardCards() {
  const { user, setUser, toast } = useApp();
  const daily = useCountdown(user.dailyReadyAt);
  const claim = async kind => {
    try { const r = await api(`/rewards/${kind}`, {}); setUser(r.me); toast(`+${fmt(r.claimed)} coins`, 'win'); }
    catch (e) { toast(e.message, 'error'); }
  };
  return (
    <div className="rewards-strip">
      <div className="reward"><h3>Daily bonus</h3><div className="amt"><Coin /> {user.vip.daily.toLocaleString()}</div><span className="muted" style={{ fontSize: 13 }}>{daily.ready ? 'Ready to claim' : `Next in ${daily.text}`}</span><button className="btn green sm" disabled={!daily.ready} onClick={() => claim('daily')}>Claim</button></div>
      <div className="reward"><h3>Rakeback</h3><div className="amt"><Coin /> {fmt(user.rakeback)}</div><span className="muted" style={{ fontSize: 13 }}>Builds up on every bet</span><button className="btn green sm" disabled={user.rakeback < 0.01} onClick={() => claim('rakeback')}>Claim</button></div>
      <div className="reward"><h3>Refer &amp; Earn</h3><div className="amt"><Coin /> +50</div><span className="muted" style={{ fontSize: 13 }}>Per verified friend invite</span><Link to="/buy" className="btn blue sm">Get link</Link></div>
      <Link to="/vip" className="reward"><h3>VIP level</h3><div className="amt">{user.vip.name}</div><div className="vip-bar"><i style={{ width: `${user.vip.progress * 100}%` }} /></div><span className="muted" style={{ fontSize: 13 }}>{user.vip.next ? `${Math.round(user.vip.progress * 100)}% to ${user.vip.next.name}` : 'Top level reached'}</span></Link>
    </div>
  );
}

const CATS = [['lobby', 'Lobby', 'casino'], ['originals', 'TumblePlay Originals', 'fire'], ['multi', 'Multiplayer', 'users'], ['instant', 'Instant wins', 'bolt'], ['table', 'Table games', 'cards']];
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
    <div className="search"><I.search /><input id="game-search" value={q} onChange={e => setQ(e.target.value)} placeholder="Search your game" aria-label="Search games" /><kbd className="hide-sm">Ctrl + K</kbd></div>
    <div className="cats" role="group" aria-label="Game categories">{CATS.map(([k, l, ic]) => { const Ic = I[ic]; return <button key={k} aria-pressed={cat === k} onClick={() => setCat(k)}><Ic />{l}</button>; })}</div>
    <div className="section-head"><h2><I.fire />{term ? 'Search results' : CATS.find(c => c[0] === cat)[1] === 'Lobby' ? 'TumblePlay Originals' : CATS.find(c => c[0] === cat)[1]}</h2>{!term && cat === 'lobby' && <Link to="/casino">View all</Link>}</div>
    <GameGrid filter={match} />
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
      <Browse start="lobby" />
      {live.length > 0 && <>
        <div className="section-head"><h2><span className="pill live">Live</span>Live sports</h2><Link to="/sports">View all</Link></div>
        <div className="ev-list">{live.map(e => <EventRow key={e.id} e={e} moves={{}} />)}</div>
      </>}
      <LiveBets />
    </div>
  );
}

export function Casino() { return <div><Browse start="originals" /><LiveBets /></div>; }
