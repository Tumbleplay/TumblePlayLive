import { useState, useEffect } from 'react';
import { useApp, useRoute, Link } from './lib/store.jsx';
import { Sidebar, Topbar, Panel, BottomNav, AuthModal, Toasts } from './components/Layout.jsx';
import Lobby, { Casino } from './pages/Lobby.jsx';
import Sports, { EventPage, MySportsBets } from './pages/Sports.jsx';
import { Rewards, Vip, Leaderboard } from './pages/Rewards.jsx';
import Fairness from './pages/Fairness.jsx';
import { Account, Profile } from './pages/Account.jsx';
import Admin from './pages/Admin.jsx';
import BuyCoins from './pages/BuyCoins.jsx';
import Dice from './games/Dice.jsx';
import Limbo from './games/Limbo.jsx';
import Plinko from './games/Plinko.jsx';
import Keno from './games/Keno.jsx';
import Wheel from './games/Wheel.jsx';
import Mines from './games/Mines.jsx';
import HiLo from './games/HiLo.jsx';
import Blackjack from './games/Blackjack.jsx';
import Roulette from './games/Roulette.jsx';
import Crash from './games/Crash.jsx';

const GAMES = { dice: Dice, limbo: Limbo, plinko: Plinko, keno: Keno, wheel: Wheel, mines: Mines, hilo: HiLo, blackjack: Blackjack, roulette: Roulette, crash: Crash, aviator: Crash };
const TITLES = { '/': 'Lobby', '/casino': 'Casino', '/sports': 'Sports', '/buy': 'Wallet', '/wallet': 'Wallet', '/rewards': 'Rewards', '/vip': 'VIP club', '/leaderboard': 'Leaderboard', '/fairness': 'Fairness', '/account': 'My account', '/admin': 'Admin' };

function route(path) {
  const p = path.replace(/\/+$/, '') || '/';
  let m;
  if (p === '/') return <Lobby />;
  if (p === '/casino') return <Casino />;
  if ((m = p.match(/^\/casino\/(\w+)$/)) && GAMES[m[1]]) { const G = GAMES[m[1]]; return <G key={m[1]} />; }
  if (p === '/sports') return <Sports />;
  if (p === '/sports/my') return <MySportsBets />;
  if ((m = p.match(/^\/sports\/event\/(\d+)$/))) return <EventPage key={m[1]} id={m[1]} />;
  if ((m = p.match(/^\/sports\/(\w+)$/))) return <Sports sport={m[1]} />;
  if (p === '/buy' || p === '/wallet') return <BuyCoins />;
  if (p === '/rewards') return <Rewards />;
  if (p === '/vip') return <Vip />;
  if (p === '/leaderboard') return <Leaderboard />;
  if (p === '/fairness') return <Fairness />;
  if (p === '/account') return <Account />;
  if ((m = p.match(/^\/u\/([\w]+)$/))) return <Profile name={m[1]} />;
  if (p === '/admin') return <Admin />;
  return <div className="empty"><h2>Page not found</h2><p>That page doesn't exist. <Link to="/" style={{ color: 'var(--gold)' }}>Back to the lobby</Link></p></div>;
}

export default function App() {
  const path = useRoute();
  const { user } = useApp();
  const [menu, setMenu] = useState(false);
  const [slim, setSlim] = useState(() => { try { return innerWidth <= 1100 || localStorage.getItem('tumble.slim') === '1'; } catch { return false; } });
  const toggle = () => {
    if (innerWidth <= 860) return setMenu(m => !m);
    setSlim(v => { try { localStorage.setItem('tumble.slim', v ? '0' : '1'); } catch { /* storage off */ } return !v; });
  };
  useEffect(() => {
    const g = path.match(/^\/casino\/(\w+)/)?.[1];
    document.title = `${g ? g[0].toUpperCase() + g.slice(1) : TITLES[path] || 'Tumble'} · TumblePlay`;
    setMenu(false);
    if (innerWidth <= 1100) setSlim(true);
    scrollTo(0, 0);
  }, [path]);
  return (
    <div className={`app${slim ? ' slim' : ''}`}>
      <Sidebar open={menu} onNav={() => setMenu(false)} onToggle={toggle} />
      {menu && <div className="scrim" style={{ zIndex: 39 }} onClick={() => setMenu(false)} />}
      <div className="main">
        <Topbar />
        <main className="content" key={path}>{user === undefined ? <div className="empty">Loading…</div> : route(path)}</main>
      </div>
      <Panel />
      <BottomNav onMenu={() => setMenu(m => !m)} />
      <AuthModal />
      <Toasts />
    </div>
  );
}
