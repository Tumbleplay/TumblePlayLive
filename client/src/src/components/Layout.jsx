import { useState, useEffect, useRef } from 'react';
import { useApp, Link, useRoute, useSocket } from '../lib/store.jsx';
import { api } from '../lib/api.js';
import { socket } from '../lib/socket.js';
import { fmt, fmtX } from '../lib/format.js';
import { I, Logo } from './icons.jsx';
import { Avatar, Coin, Modal, Seg, RollingNumber } from './common.jsx';
import { useSfx } from '../lib/sfx.js';

const GAMES = ['crash', 'dice', 'limbo', 'mines', 'plinko', 'keno', 'wheel', 'roulette', 'hilo', 'blackjack'];
const NAMES = { crash: 'Aviator', dice: 'Dice', limbo: 'Limbo', mines: 'Mines', plinko: 'Plinko', keno: 'Keno', wheel: 'Wheel', roulette: 'Roulette', hilo: 'HiLo', blackjack: 'Blackjack' };

export function Sidebar({ open, onNav, onToggle }) {
  const path = useRoute(), { user, slip } = useApp();
  const A = ({ to, icon, children, exact, extra }) => {
    const on = exact ? path === to : path === to || path.startsWith(to + '/');
    return <Link to={to} className={on ? 'on' : ''} onClick={onNav} title={children}>{icon}<span>{children}</span>{extra}</Link>;
  };
  const sports = path.startsWith('/sports');
  return (
    <aside className={`side${open ? ' open' : ''}`} aria-label="Main menu">
      <div className="side-top">
        <button className="burger" aria-label="Toggle menu" onClick={onToggle}><I.menu /></button>
        <div className="modes"><Link to="/casino" className={sports ? '' : 'on'} onClick={onNav}>Casino</Link><Link to="/sports" className={sports ? 'on' : ''} onClick={onNav}>Sports</Link></div>
      </div>
      <div className="side-body nav">
        <div className="nav-card">
          <A to="/" exact icon={<I.home />}>Lobby</A>
          <A to="/casino" exact icon={<I.casino />}>Casino</A>
          <A to="/sports" icon={<I.sports />} extra={slip.length ? <span className="count">{slip.length}</span> : null}>Sports</A>
        </div>
        <div className="nav-card">
          <div className="nav-group">TumblePlay Originals</div>
          {GAMES.map(g => <A key={g} to={`/casino/${g}`} icon={<span className="gdot"><i style={{ background: `var(--g-${g})` }} /></span>}>{NAMES[g]}</A>)}
        </div>
        <div className="nav-card">
          <A to="/buy" icon={<Coin />}>Wallet</A>
          <A to="/rewards" icon={<I.gift />}>Rewards</A>
          <A to="/vip" icon={<I.crown />}>VIP Club</A>
          <A to="/leaderboard" icon={<I.trophy />}>Leaderboard</A>
          <A to="/fairness" icon={<I.shield />}>Provably fair</A>
          {user && <A to="/account" icon={<I.user />}>My account</A>}
          {user?.role === 'admin' && <A to="/admin" icon={<I.cog />}>Admin</A>}
        </div>
      </div>
      <div className="side-foot">TumblePlay · Amazon Pay, Binance Pay &amp; Crypto Wallet.</div>
    </aside>
  );
}

export function Topbar() {
  const { user, setAuthOpen, panel, setPanel, slip, logout } = useApp();
  const { muted, toggle: toggleSfx } = useSfx();
  const [menu, setMenu] = useState(false);
  const [flash, setFlash] = useState('');
  const [delta, setDelta] = useState(null);
  const prev = useRef(user?.balance);

  useEffect(() => {
    if (user && prev.current != null && user.balance !== prev.current) {
      const diff = user.balance - prev.current;
      setFlash(diff > 0 ? 'pos' : 'neg-flash');
      if (Math.abs(diff) >= 0.01) setDelta({ v: diff, k: Math.random() });
      const t1 = setTimeout(() => setFlash(''), 750);
      const t2 = setTimeout(() => setDelta(null), 1150);
      prev.current = user.balance;
      return () => { clearTimeout(t1); clearTimeout(t2); };
    }
    prev.current = user?.balance;
  }, [user?.balance]); // eslint-disable-line

  return (
    <header className="top">
      <div className="top-in">
        <Link to="/" className="brand"><Logo />TumblePlay</Link>
        <div className="top-mid">
          {user && (
            <div className="wallet-wrap">
              <div className="wallet">
                <span className="bal">
                  <b className={flash}><RollingNumber value={user.balance} duration={420} /></b>
                  <Coin />
                </span>
                <Link to="/buy" className="go"><I.wallet /><span>Wallet</span></Link>
              </div>
              {delta && (
                <span key={delta.k} className={`bal-delta ${delta.v > 0 ? 'up' : 'dn'}`}>
                  {delta.v > 0 ? '+' : ''}{fmt(delta.v)}
                </span>
              )}
            </div>
          )}
        </div>
        <div className="top-end">
          <button className={`icon-btn hide-sm${muted ? ' muted-btn' : ' sfx-on'}`} aria-label={muted ? 'Unmute audio' : 'Mute audio'} title={muted ? 'Sound FX Off' : 'Sound FX On'} onClick={toggleSfx}>
            <I.volume />
            {muted && <span className="mute-slash" />}
          </button>
          {user ? (
            <div style={{ position: 'relative' }}>
              <button className="icon-btn" aria-label="Account menu" aria-expanded={menu} onClick={() => setMenu(m => !m)}>
                <Avatar name={user.username} hue={user.hue} size={32} />
              </button>
              {menu && <>
                <div style={{ position: 'fixed', inset: 0, zIndex: 28 }} onClick={() => setMenu(false)} />
                <div className="card user-pop" style={{ position: 'absolute', right: 0, top: 48, width: 220, padding: 8, zIndex: 29 }}>
                  <div style={{ padding: '8px 10px 10px', borderBottom: '1px solid var(--line)', marginBottom: 6 }}>
                    <div style={{ fontWeight: 700 }}>{user.username}</div>
                    <div className="muted" style={{ fontSize: 12 }}>{user.vip.name}</div>
                  </div>
                  {[['/buy', 'Wallet'], ['/account', 'My account'], [`/u/${user.username}`, 'Public profile'], ['/sports/my', 'My sports bets'], ['/rewards', 'Rewards'], ['/vip', 'VIP Club'], ['/fairness', 'Provably fair']].map(([to, l]) => (
                    <Link key={to} to={to} className="nav-item" onClick={() => setMenu(false)} style={{ display: 'block', padding: '9px 10px', borderRadius: 6, fontWeight: 600 }}>{l}</Link>
                  ))}
                  <button className="btn ghost sm" style={{ width: '100%', marginTop: 6 }} onClick={() => { setMenu(false); logout(); }}><I.logout />Log out</button>
                </div>
              </>}
            </div>
          ) : user === null ? <>
            <button className="btn ghost sm" onClick={() => setAuthOpen('login')}>Sign in</button>
            <button className="btn blue sm" onClick={() => setAuthOpen('register')}>Register</button>
          </> : null}
          <button className="icon-btn" aria-label="Bet slip" aria-pressed={panel === 'slip'} onClick={() => setPanel(p => (p === 'slip' ? null : 'slip'))}>
            <I.ticket />{slip.length > 0 && <span className="dot">{slip.length}</span>}
          </button>
          <button className="icon-btn hide-sm" aria-label="Chat" aria-pressed={panel === 'chat'} onClick={() => setPanel(p => (p === 'chat' ? null : 'chat'))}>
            <I.chat />
          </button>
        </div>
      </div>
    </header>
  );
}

export function Panel() {
  const { panel, setPanel, slip } = useApp();
  if (!panel) return null;
  return <>
    {innerWidth <= 1100 && <div className="scrim" onClick={() => setPanel(null)} />}
    <aside className="panel" aria-label={panel === 'chat' ? 'Chat' : 'Bet slip'}>
      <div className="panel-head">
        <Seg value={panel} onChange={setPanel} options={[['chat', 'Chat'], ['slip', `Bet slip${slip.length ? ` (${slip.length})` : ''}`]]} />
        <button className="icon-btn" aria-label="Close panel" onClick={() => setPanel(null)}><I.x /></button>
      </div>
      {panel === 'chat' ? <Chat /> : <BetSlip />}
    </aside>
  </>;
}

function Chat() {
  const { user, online, toast, setAuthOpen } = useApp();
  const [msgs, setMsgs] = useState([]);
  const [text, setText] = useState('');
  const box = useRef(null);
  useEffect(() => { api('/chat').then(setMsgs); }, []);
  useSocket('chat:msg', m => setMsgs(x => [...x.slice(-99), m]));
  useSocket('chat:delete', ({ id }) => setMsgs(x => x.filter(m => m.id !== id)));
  useEffect(() => { box.current?.scrollTo(0, 1e9); }, [msgs]);
  const send = e => {
    e.preventDefault();
    if (!user) return setAuthOpen('login');
    if (!text.trim()) return;
    socket.emit('chat:send', text, r => (r?.error ? toast(r.error, 'error') : setText('')));
  };
  const del = id => api(`/admin/chat/${id}/delete`, {}).catch(e => toast(e.message, 'error'));
  return <>
    <div className="online">{online} online</div>
    <div className="chat" ref={box}>
      {!msgs.length && <div className="empty">No messages yet. Say hi.</div>}
      {msgs.map(m => (
        <div className="msg" key={m.id}>
          <Avatar name={m.username} hue={m.hue} />
          <div style={{ minWidth: 0 }}>
            <div>
              <Link to={`/u/${encodeURIComponent(m.username)}`} className="who">{m.username}</Link>
              {m.role === 'admin' ? <span className="vip-tag" style={{ background: 'var(--blue)', color: '#fff' }}>Staff</span> : <span className="vip-tag">{m.vip}</span>}
              {user?.role === 'admin' && <button className="admin-del" onClick={() => del(m.id)}>Delete</button>}
            </div>
            <div className="txt">{m.text}</div>
          </div>
        </div>
      ))}
    </div>
    <form className="chat-form" onSubmit={send}>
      <input className="input" value={text} maxLength={240} onChange={e => setText(e.target.value)} placeholder={user ? 'Say something' : 'Log in to chat'} aria-label="Message" />
      <button className="btn blue sm">Send</button>
    </form>
  </>;
}

function BetSlip() {
  const { slip, setSlip, user, requireUser, setBalance, toast } = useApp();
  const [stake, setStake] = useState(10);
  const [busy, setBusy] = useState(false);
  const [live, setLive] = useState({});
  useSocket('sports:update', ({ events }) => {
    const m = {};
    for (const e of events) for (const mk of e.markets) for (const s of mk.selections) m[s.id] = mk.status === 'open' && ['upcoming', 'live'].includes(e.status) ? s.odds : 0;
    setLive(l => ({ ...l, ...m }));
  });
  const legs = slip.map(l => ({ ...l, now: live[l.selectionId] ?? l.odds }));
  const odds = Math.round(legs.reduce((o, l) => o * (l.now || 1), 1) * 100) / 100;
  const changed = legs.some(l => l.now !== l.odds);
  const closed = legs.some(l => !l.now);
  const place = async () => {
    if (!requireUser()) return;
    if (changed) { setSlip(legs.map(l => ({ ...l, odds: l.now }))); return toast('Odds updated. Check your slip and place again.'); }
    setBusy(true);
    try {
      const r = await api('/sports/bet', { amount: stake, legs: legs.map(l => ({ selectionId: l.selectionId, odds: l.odds })) });
      setBalance(r.balance); setSlip([]); toast(`Bet placed at ${fmtX(r.odds)}`, 'win');
    } catch (e) { toast(e.message, 'error'); } finally { setBusy(false); }
  };
  if (!slip.length) return <div className="slip"><div className="empty" style={{ paddingTop: 50 }}>Your slip is empty.<br />Tap any odds on the Sports page to add a pick.</div>
    <Link to="/sports" className="btn ghost" style={{ alignSelf: 'center' }}>Browse matches</Link></div>;
  return <>
    <div className="slip">
      <div className="kv"><span>{legs.length === 1 ? 'Single' : `Multi of ${legs.length}`}</span><button className="btn sm ghost" onClick={() => setSlip([])}>Clear all</button></div>
      {legs.map(l => (
        <div className={`leg${l.now !== l.odds || !l.now ? ' stale' : ''}`} key={l.selectionId}>
          <div className="leg-top"><b>{l.name}</b><span className="lo">{l.now ? l.now.toFixed(2) : 'Closed'}</span>
            <button className="x" aria-label={`Remove ${l.name}`} onClick={() => setSlip(s => s.filter(x => x.selectionId !== l.selectionId))}>×</button></div>
          <small>{l.market}</small><small>{l.match}</small>
        </div>
      ))}
    </div>
    <div className="slip-foot">
      <label className="field"><span>Stake</span><input className="input" type="number" min="0.01" step="0.01" value={stake} onChange={e => setStake(Number(e.target.value))} inputMode="decimal" /></label>
      <div className="kv">Total odds <b>{fmtX(odds)}</b></div>
      <div className="kv">Potential return <b><Coin /> {fmt(stake * odds)}</b></div>
      <button className="btn gold big" disabled={busy || closed || !(stake > 0)} onClick={place}>
        {closed ? 'Remove closed picks' : changed ? 'Accept new odds' : user ? `Place bet ${fmt(stake)}` : 'Sign up to bet'}</button>
    </div>
  </>;
}

export function BottomNav({ onMenu }) {
  const { panel, setPanel } = useApp(), path = useRoute();
  return (
    <nav className="bottom-nav" aria-label="Quick menu">
      <button onClick={onMenu}><I.menu />Menu</button>
      <Link to="/casino" className={path.startsWith('/casino') ? 'on' : ''}><I.casino />Casino</Link>
      <Link to="/buy" className={path === '/buy' || path === '/wallet' ? 'on' : ''}><Coin />Wallet</Link>
      <Link to="/sports" className={path.startsWith('/sports') ? 'on' : ''}><I.sports />Sports</Link>
      <button className={panel === 'chat' ? 'on' : ''} onClick={() => setPanel(p => (p === 'chat' ? null : 'chat'))}><I.chat />Chat</button>
    </nav>
  );
}

export function AuthModal() {
  const { authOpen, setAuthOpen, login } = useApp();
  const [u, setU] = useState(''), [p, setP] = useState(''), [err, setErr] = useState(''), [busy, setBusy] = useState(false);
  if (!authOpen) return null;
  const reg = authOpen === 'register';
  const submit = async e => {
    e.preventDefault(); setBusy(true); setErr('');
    try { await login(authOpen, u, p); setU(''); setP(''); } catch (x) { setErr(x.message); } finally { setBusy(false); }
  };
  return (
    <Modal onClose={() => setAuthOpen(null)} label={reg ? 'Sign up' : 'Log in'}>
      <button className="btn icon ghost x" aria-label="Close" onClick={() => setAuthOpen(null)}><I.x /></button>
      <h2>{reg ? 'Create an account' : 'Sign in'}</h2>
      <p className="muted" style={{ margin: 0 }}>{reg ? 'Get 50 welcome coins, +10 daily bonus, and +50 per verified referral.' : 'Log in to pick up right where you left off.'}</p>
      <form onSubmit={submit}>
        <label className="field"><span>Username</span><input className="input" autoComplete="username" value={u} onChange={e => setU(e.target.value)} required minLength={3} maxLength={16} autoFocus /></label>
        <label className="field"><span>Password</span><input className="input" type="password" autoComplete={reg ? 'new-password' : 'current-password'} value={p} onChange={e => setP(e.target.value)} required minLength={reg ? 4 : 1} /></label>
        <div className="form-error" role="alert">{err}</div>
        <button className="btn gold big" disabled={busy}>{reg ? 'Create account' : 'Log in'}</button>
      </form>
      <div className="switch">{reg ? 'Already have an account? ' : 'New here? '}<button onClick={() => { setErr(''); setAuthOpen(reg ? 'login' : 'register'); }}>{reg ? 'Log in' : 'Create an account'}</button></div>
    </Modal>
  );
}

export function Toasts() {
  const { toasts } = useApp();
  return <div className="toasts" role="status" aria-live="polite">{toasts.map(t => <div key={t.id} className={`toast ${t.kind}`}>{t.text}</div>)}</div>;
}
