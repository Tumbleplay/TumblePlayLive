import { useState, useEffect } from 'react';
import { useApp } from '../lib/store.jsx';
import { api } from '../lib/api.js';
import { fmtX } from '../lib/format.js';
import * as M from '@shared/math.js';

const enc = new TextEncoder();
const hex = buf => [...new Uint8Array(buf)].map(b => b.toString(16).padStart(2, '0')).join('');
async function sha256(s) { return hex(await crypto.subtle.digest('SHA-256', enc.encode(s))); }
async function floats(server, client, nonce, count) {
  const key = await crypto.subtle.importKey('raw', enc.encode(server), { name: 'HMAC', hash: 'SHA-256' }, false, ['sign']);
  const blocks = [];
  for (let c = 0; blocks.length * 8 < count; c++) blocks.push(new Uint8Array(await crypto.subtle.sign('HMAC', key, enc.encode(`${client}:${nonce}:${c}`))));
  return M.bytesToFloats(blocks, count);
}
const RANKS = ['A', '2', '3', '4', '5', '6', '7', '8', '9', '10', 'J', 'Q', 'K'], SUITS = ['♠', '♥', '♦', '♣'];
const cardName = c => RANKS[c % 13] + SUITS[Math.floor(c / 13)];

async function verify(v) {
  const { game } = v;
  if (game === 'crash') {
    const f = await floats(v.server, M.CRASH_SALT, 0, 1);
    return `Crash point: ${fmtX(M.crashPoint(f))}`;
  }
  const n = Number(v.nonce) || 0, f = await floats(v.server, v.client, n, M.FLOATS_NEEDED[game]);
  switch (game) {
    case 'dice': return `Roll: ${M.diceRoll(f).toFixed(2)}`;
    case 'limbo': return `Result: ${fmtX(M.crashPoint(f))}`;
    case 'plinko': { const p = M.plinkoPath(f, Number(v.rows)); return `Path: ${p.map(x => (x ? 'R' : 'L')).join(' ')}\nLanded in slot ${M.plinkoBucket(p) + 1} of ${Number(v.rows) + 1}`; }
    case 'keno': return `Drawn: ${M.kenoDraw(f).join(', ')}`;
    case 'wheel': return `Landed on segment ${M.wheelIndex(f, Number(v.segments)) + 1} of ${v.segments}`;
    case 'roulette': return `Number: ${M.rouletteNumber(f)}`;
    case 'mines': return `Mines on tiles: ${M.minesPositions(f, Number(v.mines)).map(i => i + 1).join(', ')}\nTiles are numbered 1 to 25, left to right, top to bottom.`;
    case 'hilo': return `Cards in order: ${f.slice(0, 16).map(x => cardName(M.cardFrom(x))).join(' ')} …`;
    case 'blackjack': { const d = f.map(M.cardFrom); return `You: ${cardName(d[0])} ${cardName(d[2])}\nDealer: ${cardName(d[1])} ${cardName(d[3])}\nNext cards: ${d.slice(4, 14).map(cardName).join(' ')} …`; }
  }
  return '';
}

export default function Fairness() {
  const { user, toast } = useApp();
  const [info, setInfo] = useState(null);
  const [client, setClient] = useState('');
  const [v, setV] = useState({ game: 'dice', server: '', client: '', nonce: 0, rows: 12, segments: 30, mines: 3 });
  const [out, setOut] = useState('');
  useEffect(() => { if (user) api('/fair').then(i => { setInfo(i); setClient(i.active.clientSeed); }); }, [user?.id]); // eslint-disable-line
  const rotate = async () => {
    try { const i = await api('/fair/rotate', { clientSeed: client }); setInfo(i); setClient(i.active.clientSeed); const p = i.previous[0]; if (p) setV(x => ({ ...x, server: p.serverSeed, client: p.clientSeed })); toast('Seeds rotated. Your previous server seed is now revealed.'); }
    catch (e) { toast(e.message, 'error'); }
  };
  const run = async e => {
    e.preventDefault();
    if (!v.server || (v.game !== 'crash' && !v.client)) return setOut('Enter the server seed and client seed.');
    setOut(`${await verify(v)}\nSHA-256 of the server seed: ${await sha256(v.server)}`);
  };
  const set = k => e => setV(x => ({ ...x, [k]: e.target.value }));
  return (
    <div>
      <div className="game-title"><h1>Fairness</h1></div>
      <div className="grid-2">
        <div className="card prose">
          <h2 style={{ fontSize: 20, marginBottom: 10 }}>How results are made</h2>
          <p>Before you bet, we show you a SHA-256 hash of a secret server seed. Every result comes from HMAC-SHA256 of that server seed, your client seed and a nonce that counts your bets.</p>
          <p>Because we committed to the server seed first, we can't change results after you bet. When you rotate seeds, the old server seed is revealed so you can check every bet you made with it, right here.</p>
          <p>Crash rounds are shared, so each round has its own seed. Its hash is shown before the round starts and the seed is shown when it ends.</p>
        </div>
        {user && info ? <div className="card">
          <h2 style={{ fontSize: 20, marginBottom: 12 }}>Your seeds</h2>
          <label className="field" style={{ marginBottom: 10 }}><span>Client seed (yours to change)</span><input className="input" value={client} maxLength={64} onChange={e => setClient(e.target.value)} /></label>
          <label className="field" style={{ marginBottom: 10 }}><span>Server seed hash</span><div className="out mono">{info.active.serverHash}</div></label>
          <div className="kv" style={{ marginBottom: 12 }}>Bets on this pair <b>{info.active.nonce}</b></div>
          <button className="btn gold" style={{ width: '100%' }} onClick={rotate}>Rotate seeds</button>
          {info.previous.length > 0 && <>
            <h3 style={{ fontSize: 15, margin: '18px 0 8px' }}>Revealed seeds</h3>
            {info.previous.slice(0, 3).map(p => (
              <div key={p.id} className="out mono" style={{ marginBottom: 8, cursor: 'pointer' }} onClick={() => setV(x => ({ ...x, server: p.serverSeed, client: p.clientSeed }))} title="Use these seeds below">
                Server: {p.serverSeed}{'\n'}Client: {p.clientSeed}{'\n'}Nonces 0 to {Math.max(0, p.bets - 1)}
              </div>
            ))}
          </>}
        </div> : <div className="card"><p className="muted">Log in to see and rotate your seeds.</p></div>}
      </div>
      <form className="card" style={{ marginTop: 14, display: 'flex', flexDirection: 'column', gap: 12 }} onSubmit={run}>
        <h2 style={{ fontSize: 20 }}>Check a result</h2>
        <div className="row2">
          <label className="field"><span>Game</span><select className="input" value={v.game} onChange={set('game')}>{['dice', 'limbo', 'mines', 'plinko', 'keno', 'wheel', 'roulette', 'hilo', 'blackjack', 'crash'].map(g => <option key={g} value={g}>{g[0].toUpperCase() + g.slice(1)}</option>)}</select></label>
          {v.game !== 'crash' && <label className="field"><span>Nonce</span><input className="input" type="number" min="0" value={v.nonce} onChange={set('nonce')} /></label>}
        </div>
        <label className="field"><span>{v.game === 'crash' ? 'Round seed' : 'Server seed'}</span><input className="input mono" value={v.server} onChange={set('server')} /></label>
        {v.game !== 'crash' && <label className="field"><span>Client seed</span><input className="input mono" value={v.client} onChange={set('client')} /></label>}
        {v.game === 'plinko' && <label className="field"><span>Rows</span><select className="input" value={v.rows} onChange={set('rows')}>{[8, 12, 16].map(r => <option key={r}>{r}</option>)}</select></label>}
        {v.game === 'wheel' && <label className="field"><span>Segments</span><select className="input" value={v.segments} onChange={set('segments')}>{[10, 20, 30, 40, 50].map(r => <option key={r}>{r}</option>)}</select></label>}
        {v.game === 'mines' && <label className="field"><span>Mines</span><input className="input" type="number" min="1" max="24" value={v.mines} onChange={set('mines')} /></label>}
        <button className="btn gold">Check result</button>
        {out && <div className="out">{out}</div>}
      </form>
    </div>
  );
}
