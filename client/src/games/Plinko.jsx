import { useState, useCallback, useRef, useEffect } from 'react';
import { GameShell, useAutobet, PlayButton, useBetCall } from './shell.jsx';
import { BetInput, Seg } from '../components/common.jsx';
import { useApp } from '../lib/store.jsx';
import { reducedMotion } from '../lib/format.js';

function bucketColor(i, R) {
  const d = Math.abs(i - R / 2) / (R / 2);
  const lerp = (a, b, t) => a.map((v, k) => Math.round(v + (b[k] - v) * t));
  const c = d < 0.5 ? lerp([255, 192, 0], [255, 120, 20], d / 0.5) : lerp([255, 120, 20], [255, 0, 63], (d - 0.5) / 0.5);
  return [`rgb(${c})`, `rgb(${c.map(v => Math.round(v * 0.62))})`];
}

export default function Plinko() {
  const { config } = useApp();
  const [bet, setBet] = useState(1);
  const [risk, setRisk] = useState('medium');
  const [rows, setRows] = useState(12);
  const [inFlight, setInFlight] = useState(0);
  const call = useBetCall();
  const cv = useRef(null);
  const S = useRef({ balls: [], flash: {}, raf: 0, W: 0, H: 0 });
  const table = config?.plinko?.[rows]?.[risk] || [];
  const tableRef = useRef(table); tableRef.current = table;
  const rowsRef = useRef(rows); rowsRef.current = rows;

  const geo = () => {
    const { W, H } = S.current, R = rowsRef.current, top = 34, bottomPad = 58;
    const gap = Math.min((W - 24) / (R + 2), (H - top - bottomPad) / (R + 0.6));
    return { R, gap, top, cx: W / 2, rowH: gap * 0.92 };
  };
  const paint = useCallback((now = performance.now()) => {
    const c = cv.current; if (!c) return;
    const ctx = c.getContext('2d'), { W, H, balls, flash } = S.current;
    ctx.clearRect(0, 0, W, H);
    const { R, gap, top, cx, rowH } = geo(), t = tableRef.current;
    ctx.fillStyle = '#FFFFFF';
    for (let i = 0; i < R; i++) for (let j = 0; j < i + 3; j++) { ctx.beginPath(); ctx.arc(cx + (j - (i + 2) / 2) * gap, top + i * rowH, Math.max(2, gap * 0.09), 0, 7); ctx.fill(); }
    const by = top + (R - 1) * rowH + rowH * 0.7, bw = gap * 0.9, bh = Math.min(30, gap * 0.9);
    ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
    ctx.font = `800 ${Math.max(9, Math.min(13, gap * 0.34))}px Figtree,sans-serif`;
    for (let b = 0; b <= R; b++) {
      const x = cx + (b - R / 2) * gap, lift = flash[b] && now - flash[b] < 260 ? 5 : 0;
      const [top, lip] = bucketColor(b, R);
      ctx.fillStyle = lip; ctx.beginPath(); ctx.roundRect(x - bw / 2, by + lift + 4, bw, bh, 5); ctx.fill();
      ctx.fillStyle = top; ctx.beginPath(); ctx.roundRect(x - bw / 2, by + lift, bw, bh, 5); ctx.fill();
      ctx.fillStyle = '#0F212E'; ctx.fillText(t[b] != null ? t[b] + (gap > 34 ? '×' : '') : '', x, by + lift + bh / 2 + 1);
    }
    const br = Math.max(4, gap * 0.2);
    for (const ball of balls) { ctx.fillStyle = '#FF1F4B'; ctx.shadowColor = 'rgba(255,31,75,.6)'; ctx.shadowBlur = 10; ctx.beginPath(); ctx.arc(ball.x, ball.y, br, 0, 7); ctx.fill(); ctx.shadowBlur = 0; }
  }, []);
  const resize = useCallback(() => {
    const c = cv.current; if (!c) return;
    const dpr = devicePixelRatio || 1; S.current.W = c.clientWidth; S.current.H = c.clientHeight;
    c.width = S.current.W * dpr; c.height = S.current.H * dpr; c.getContext('2d').setTransform(dpr, 0, 0, dpr, 0, 0); paint();
  }, [paint]);
  useEffect(() => { resize(); addEventListener('resize', resize); return () => { removeEventListener('resize', resize); cancelAnimationFrame(S.current.raf); }; }, [resize]);
  useEffect(() => { paint(); }, [rows, risk, config, paint]);

  const tick = useCallback(now => {
    const st = S.current, { R, gap, top, cx, rowH } = geo(), seg = reducedMotion() ? 1 : 105;
    for (const b of st.balls) {
      const el = now - b.t0, k = Math.min(b.path.length, Math.floor(el / seg)), p = Math.min(1, (el - k * seg) / seg);
      const xAt = n => cx + (b.path.slice(0, n).reduce((a, c) => a + c, 0) - n / 2) * gap;
      const yAt = n => (n === 0 ? top - rowH * 0.9 : top + (n - 1) * rowH + rowH * 0.45);
      if (k >= b.path.length) { b.x = xAt(R); b.y = yAt(R); if (!b.done) { b.done = true; st.flash[b.bucket] = now; b.land(); } continue; }
      b.x = xAt(k) + (xAt(k + 1) - xAt(k)) * p;
      b.y = yAt(k) + (yAt(k + 1) - yAt(k)) * p - Math.sin(Math.PI * p) * rowH * 0.35;
    }
    st.balls = st.balls.filter(b => !b.done || now - st.flash[b.bucket] < 40);
    paint(now);
    st.raf = st.balls.length || Object.values(st.flash).some(t => now - t < 260) ? requestAnimationFrame(tick) : 0;
  }, [paint]);

  const play = useCallback(async amount => {
    const r = await call('/casino/plinko/bet', { amount, rows, risk }, { defer: true, stake: amount, quiet: true });
    if (!r) return null;
    setInFlight(n => n + 1);
    return new Promise(done => {
      S.current.balls.push({ path: r.path, bucket: r.bucket, t0: performance.now(), x: 0, y: 0, land: () => { r.commit(); setInFlight(n => n - 1); done({ payout: r.payout }); } });
      if (!S.current.raf) S.current.raf = requestAnimationFrame(tick);
    });
  }, [call, rows, risk, tick]);
  // Autobet doesn't wait for each ball to land, like the real thing: fire, short gap, fire again
  const autoPlay = useCallback(async amount => {
    const r = await call('/casino/plinko/bet', { amount, rows, risk }, { defer: true, stake: amount, quiet: true });
    if (!r) return null;
    setInFlight(n => n + 1);
    S.current.balls.push({ path: r.path, bucket: r.bucket, t0: performance.now(), x: 0, y: 0, land: () => { r.commit(); setInFlight(n => n - 1); } });
    if (!S.current.raf) S.current.raf = requestAnimationFrame(tick);
    return { payout: r.payout };
  }, [call, rows, risk, tick]);
  const auto = useAutobet({ play: autoPlay, bet, setBet, delay: 350 });
  const locked = auto.running || inFlight > 0;

  const controls = <>
    {auto.panel}
    <BetInput value={bet} onChange={setBet} disabled={auto.running} />
    <div className="field"><span>Risk</span><Seg value={risk} onChange={setRisk} disabled={locked} options={[['low', 'Low'], ['medium', 'Medium'], ['high', 'High']]} /></div>
    <div className="field"><span>Rows</span><Seg value={rows} onChange={setRows} disabled={locked} options={[[8, '8'], [12, '12'], [16, '16']]} /></div>
    <PlayButton auto={auto} onManual={() => play(bet)} label="Bet" />
  </>;
  return <GameShell game="plinko" controls={controls} stage={<canvas className="cv" ref={cv} />} />;
}
