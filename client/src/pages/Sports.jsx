import { useState, useEffect, useRef, useCallback } from 'react';
import { useApp, Link, useSocket, navigate } from '../lib/store.jsx';
import { api } from '../lib/api.js';
import { fmt, fmtX, clock, dayLabel } from '../lib/format.js';
import { Seg, Coin } from '../components/common.jsx';

const SPORT_ICON = { football: '⚽', cricket: '🏏', basketball: '🏀', tennis: '🎾' };

// Keep a live list of events in sync with socket updates
function useEvents(params) {
  const [events, setEvents] = useState(null);
  const q = new URLSearchParams(params).toString();
  const load = useCallback(() => api(`/sports/events?${q}`).then(setEvents), [q]);
  useEffect(() => { load(); const t = setInterval(load, 30000); return () => clearInterval(t); }, [load]);
  useSocket('sports:update', ({ events: upd }) => setEvents(list => {
    if (!list) return list;
    const map = new Map(upd.map(e => [e.id, e]));
    return list.map(e => map.get(e.id) || e).filter(e => ['upcoming', 'live'].includes(e.status));
  }));
  return events;
}

// Remembers previous odds so a price move can flash up or down
function useMoves() {
  const prev = useRef({}), [moves, setMoves] = useState({});
  const track = useCallback(events => {
    const m = {};
    for (const e of events || []) for (const mk of e.markets) for (const s of mk.selections) {
      const p = prev.current[s.id];
      if (p && s.odds && p !== s.odds) m[s.id] = s.odds > p ? 'up' : 'down';
      prev.current[s.id] = s.odds;
    }
    if (Object.keys(m).length) { setMoves(x => ({ ...x, ...m })); setTimeout(() => setMoves(x => { const n = { ...x }; for (const k in m) delete n[k]; return n; }), 2500); }
  }, []);
  return [moves, track];
}

export function OddButton({ e, mk, s, move, compact }) {
  const { slip, toggleSlip } = useApp();
  const on = slip.some(x => x.selectionId === s.id);
  const open = mk.status === 'open' && s.odds > 0 && ['upcoming', 'live'].includes(e.status);
  return (
    <button className={`odd${on ? ' on' : ''}${move ? ' ' + move : ''}`} disabled={!open}
      onClick={() => toggleSlip({ selectionId: s.id, odds: s.odds, name: s.name, market: mk.name, match: `${e.home} vs ${e.away}`, eventId: e.id })}
      aria-pressed={on} aria-label={`${s.name} at ${s.odds}`}>
      {!compact && <small>{s.name === e.home ? '1' : s.name === e.away ? '2' : s.name}</small>}
      <b>{open ? s.odds.toFixed(2) : '–'}</b>
    </button>
  );
}

function StatusLine({ e }) {
  if (e.status === 'live') return <><span className="pill live">Live</span>{e.progress != null && <span>{Math.round(e.progress * 100)}% played</span>}</>;
  return <span>{dayLabel(e.startsAt)} {clock(e.startsAt)}</span>;
}

export function EventRow({ e, moves }) {
  const mk = e.markets[0];
  return (
    <div className="ev">
      <Link to={`/sports/event/${e.id}`} className="ev-teams">
        <div className="ev-meta"><span>{SPORT_ICON[e.sport]} {e.league}</span><StatusLine e={e} /></div>
        <div className="ev-team"><span>{e.home}</span>{e.status === 'live' && <span className="sc">{e.score[0]}</span>}</div>
        <div className="ev-team"><span>{e.away}</span>{e.status === 'live' && <span className="sc">{e.score[1]}</span>}</div>
        {e.status === 'live' && e.progress != null && <div className="progress"><i style={{ width: `${e.progress * 100}%` }} /></div>}
      </Link>
      <div>
        {mk && <div className="odds-row">{mk.selections.map(s => <OddButton key={s.id} e={e} mk={mk} s={s} move={moves[s.id]} />)}</div>}
        {e.markets.length > 1 && <Link to={`/sports/event/${e.id}`} className="more-mk" style={{ display: 'block', textAlign: 'right', marginTop: 6 }}>+{e.markets.length - 1} more markets</Link>}
      </div>
    </div>
  );
}

export default function Sports({ sport }) {
  const { config } = useApp();
  const [status, setStatus] = useState('');
  const all = useEvents({});
  const [moves, track] = useMoves();
  useEffect(() => { track(all); }, [all, track]);
  const list = (all || []).filter(e => (!sport || e.sport === sport) && (!status || e.status === status));
  const count = s => (all || []).filter(e => !s || e.sport === s).length;
  const sports = config ? Object.entries(config.sports) : [];
  return (
    <div>
      <div className="game-title"><h1>Sports</h1><Link to="/sports/my" className="btn sm ghost">My bets</Link></div>
      <div className="sport-tabs" role="group" aria-label="Sport">
        <button aria-pressed={!sport} onClick={() => navigate('/sports')}>All <i>{count()}</i></button>
        {sports.map(([k, name]) => <button key={k} aria-pressed={sport === k} onClick={() => navigate(`/sports/${k}`)}>{SPORT_ICON[k]} {name} <i>{count(k)}</i></button>)}
      </div>
      <div style={{ margin: '14px 0', maxWidth: 360 }}><Seg value={status} onChange={setStatus} options={[['', 'All matches'], ['live', 'Live now'], ['upcoming', 'Upcoming']]} /></div>
      {all === null ? <div className="empty">Loading matches…</div>
        : !list.length ? <div className="empty">No {status === 'live' ? 'live ' : ''}matches here right now. New ones are added every few minutes.</div>
          : <div className="ev-list">{list.map(e => <EventRow key={e.id} e={e} moves={moves} />)}</div>}
      <p className="muted" style={{ fontSize: 13, marginTop: 18 }}>Demo matches play out in about 10 minutes so you can follow a game from kickoff to result. Odds update live and bets settle automatically.</p>
    </div>
  );
}

export function EventPage({ id }) {
  const [e, setE] = useState(null), [err, setErr] = useState('');
  const [moves, track] = useMoves();
  useEffect(() => { api(`/sports/events/${id}`).then(x => { setE(x); track([x]); }).catch(x => setErr(x.message)); }, [id, track]);
  useSocket('sports:update', ({ events }) => { const x = events.find(v => v.id === Number(id)); if (x) { setE(x); track([x]); } });
  if (err) return <div className="empty">{err}. <Link to="/sports">Back to sports</Link></div>;
  if (!e) return <div className="empty">Loading…</div>;
  const closed = ['settled', 'cancelled'].includes(e.status);
  return (
    <div>
      <Link to={`/sports/${e.sport}`} className="muted" style={{ fontSize: 14 }}>← {e.league}</Link>
      <div className="scoreboard" style={{ marginTop: 10 }}>
        <h2>{e.home}</h2>
        <div>
          {e.status === 'upcoming' ? <><div className="score" style={{ fontSize: 28 }}>{clock(e.startsAt)}</div><div className="muted">{dayLabel(e.startsAt)}</div></>
            : <><div className="score">{e.score[0]} – {e.score[1]}</div><div>{e.status === 'live' ? <span className="pill live">Live{e.progress != null ? ` · ${Math.round(e.progress * 100)}%` : ''}</span> : <span className="pill">{e.status === 'cancelled' ? 'Cancelled' : 'Full time'}</span>}</div></>}
        </div>
        <h2>{e.away}</h2>
      </div>
      {e.markets.map(mk => (
        <div className="market" key={mk.id}>
          <h3>{mk.name}{mk.status === 'suspended' && <span className="pill">Suspended</span>}</h3>
          <div className="odds-row">{mk.selections.map(s => closed
            ? <div key={s.id} className={`odd ${s.result === 'won' ? 'on' : ''}`}><small>{s.name}</small><b>{s.result === 'won' ? 'Won' : s.result === 'void' ? 'Void' : 'Lost'}</b></div>
            : <OddButton key={s.id} e={e} mk={mk} s={s} move={moves[s.id]} />)}</div>
        </div>
      ))}
    </div>
  );
}

export function MySportsBets() {
  const { user, setAuthOpen } = useApp();
  const [tab, setTab] = useState('open');
  const [rows, setRows] = useState(null);
  const load = useCallback(() => { if (user) api(`/sports/my?status=${tab}`).then(setRows); }, [tab, user]);
  useEffect(() => { load(); }, [load]);
  useSocket('sports:update', () => { if (tab === 'open') load(); });
  if (!user) return <div className="empty"><button className="btn gold" onClick={() => setAuthOpen('login')}>Log in to see your bets</button></div>;
  const tone = { won: 'w', lost: 'l', void: '', pending: '' };
  return (
    <div>
      <div className="game-title"><h1>My sports bets</h1><Link to="/sports" className="btn sm ghost">All matches</Link></div>
      <div style={{ maxWidth: 260, marginBottom: 14 }}><Seg value={tab} onChange={setTab} options={[['open', 'Open'], ['settled', 'Settled']]} /></div>
      {rows === null ? <div className="empty">Loading…</div> : !rows.length ? <div className="empty">{tab === 'open' ? 'No open bets. Pick some odds on the Sports page.' : 'No settled bets yet.'}</div> :
        <div className="ev-list">{rows.map(b => (
          <div className="card" key={b.id} style={{ padding: 16 }}>
            <div className="kv" style={{ marginBottom: 8 }}>
              <span>{b.legs.length === 1 ? 'Single' : `Multi of ${b.legs.length}`} · {new Date(b.createdAt).toLocaleString()}</span>
              <span className={`pill ${tone[b.status]}`}>{{ pending: 'Open', won: 'Won', lost: 'Lost', void: 'Void' }[b.status]}</span>
            </div>
            {b.legs.map((l, i) => (
              <div key={i} style={{ padding: '8px 0', borderTop: i ? '1px solid var(--line)' : 0 }}>
                <div className="kv"><b>{l.selection}</b><b>{l.odds.toFixed(2)}</b></div>
                <div className="muted" style={{ fontSize: 13 }}>{l.market} · {l.match}{l.eventStatus !== 'upcoming' ? ` · ${l.score[0]}–${l.score[1]}` : ''}{l.result !== 'pending' ? ` · ${l.result}` : ''}</div>
              </div>
            ))}
            <div className="kv" style={{ marginTop: 8 }}><span>Stake <b><Coin /> {fmt(b.amount)}</b> at {fmtX(b.odds)}</span>
              <span>{b.status === 'pending' ? <>To return <b>{fmt(b.amount * b.odds)}</b></> : <>Paid <b className={b.payout ? 'pos' : ''}>{fmt(b.payout)}</b></>}</span></div>
          </div>
        ))}</div>}
    </div>
  );
}
