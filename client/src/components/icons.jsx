const S = p => ({ viewBox: '0 0 24 24', fill: 'none', stroke: 'currentColor', strokeWidth: 2, strokeLinecap: 'round', strokeLinejoin: 'round', 'aria-hidden': true, ...p });
export const I = {
  home: p => <svg {...S(p)}><path d="M3 11l9-7 9 7v9a1 1 0 0 1-1 1h-5v-6H9v6H4a1 1 0 0 1-1-1z" /></svg>,
  casino: p => <svg {...S(p)}><rect x="3" y="3" width="18" height="18" rx="4" /><circle cx="8.5" cy="8.5" r="1.3" fill="currentColor" /><circle cx="15.5" cy="15.5" r="1.3" fill="currentColor" /><circle cx="12" cy="12" r="1.3" fill="currentColor" /></svg>,
  sports: p => <svg {...S(p)}><circle cx="12" cy="12" r="9" /><path d="M12 7l4 3-1.5 4.5h-5L8 10zM12 3v4M21 10h-5M3 10h5M7 20l2.5-5.5M17 20l-2.5-5.5" /></svg>,
  live: p => <svg {...S(p)}><circle cx="12" cy="12" r="3" fill="currentColor" /><path d="M6.3 6.3a8 8 0 0 0 0 11.4M17.7 6.3a8 8 0 0 1 0 11.4" /></svg>,
  trophy: p => <svg {...S(p)}><path d="M8 4h8v6a4 4 0 0 1-8 0zM8 6H4a3 3 0 0 0 4 4M16 6h4a3 3 0 0 1-4 4M12 14v4M8 21h8M9 18h6" /></svg>,
  gift: p => <svg {...S(p)}><rect x="3" y="8" width="18" height="5" rx="1" /><path d="M5 13v7h14v-7M12 8v12M12 8c-2-4-6-4-6-1.5S9 8 12 8c3 0 6 1 6-1.5S14 4 12 8z" /></svg>,
  crown: p => <svg {...S(p)}><path d="M3 7l4.5 4L12 4l4.5 7L21 7l-2 12H5z" /></svg>,
  shield: p => <svg {...S(p)}><path d="M12 2l8 3v6c0 5-3.4 9.3-8 11-4.6-1.7-8-6-8-11V5z" /><path d="M8.5 12l2.5 2.5 4.5-5" /></svg>,
  user: p => <svg {...S(p)}><circle cx="12" cy="8" r="4" /><path d="M4 21c1.5-4 4.5-6 8-6s6.5 2 8 6" /></svg>,
  chat: p => <svg {...S(p)}><path d="M4 5h16v11H9l-5 4z" /></svg>,
  ticket: p => <svg {...S(p)}><path d="M3 7a2 2 0 0 0 2-2h14a2 2 0 0 0 2 2v3a2 2 0 0 0 0 4v3a2 2 0 0 0-2 2H5a2 2 0 0 0-2-2v-3a2 2 0 0 0 0-4z" /><path d="M9 9h6M9 13h6" /></svg>,
  menu: p => <svg {...S(p)}><path d="M4 7h16M4 12h16M4 17h16" /></svg>,
  x: p => <svg {...S(p)}><path d="M6 6l12 12M18 6L6 18" /></svg>,
  cog: p => <svg {...S(p)}><circle cx="12" cy="12" r="3" /><path d="M19.4 15a1.6 1.6 0 0 0 .3 1.8l.1.1a2 2 0 1 1-2.8 2.8l-.1-.1a1.6 1.6 0 0 0-2.7 1.1V21a2 2 0 1 1-4 0v-.1a1.6 1.6 0 0 0-2.7-1.1l-.1.1a2 2 0 1 1-2.8-2.8l.1-.1A1.6 1.6 0 0 0 3.6 15H3a2 2 0 1 1 0-4h.1a1.6 1.6 0 0 0 1.1-2.7l-.1-.1a2 2 0 1 1 2.8-2.8l.1.1A1.6 1.6 0 0 0 9.7 4.5V3a2 2 0 1 1 4 0v.1a1.6 1.6 0 0 0 2.7 1.1l.1-.1a2 2 0 1 1 2.8 2.8l-.1.1a1.6 1.6 0 0 0 1.1 2.7H21a2 2 0 1 1 0 4h-.1a1.6 1.6 0 0 0-1.5 1.3z" /></svg>,
  list: p => <svg {...S(p)}><path d="M9 6h11M9 12h11M9 18h11M4.5 6h.01M4.5 12h.01M4.5 18h.01" /></svg>,
  logout: p => <svg {...S(p)}><path d="M15 4h4v16h-4M10 8l-4 4 4 4M6 12h10" /></svg>,
  refresh: p => <svg {...S(p)}><path d="M20 11a8 8 0 1 0-2.3 5.7M20 4v7h-7" /></svg>,
  search: p => <svg {...S(p)}><circle cx="11" cy="11" r="7" /><path d="M20 20l-3.5-3.5" /></svg>,
  chev: p => <svg {...S(p)}><path d="M6 9l6 6 6-6" /></svg>,
  right: p => <svg {...S(p)}><path d="M9 6l6 6-6 6" /></svg>,
  fire: p => <svg {...S(p)}><path d="M12 22c4 0 7-2.7 7-7 0-4-3-6-4-10-2 2-3 4-3 6-1-1-2-2-2-4-2 2-5 5-5 8 0 4.3 3 7 7 7z" /></svg>,
  star: p => <svg {...S(p)}><path d="M12 3l2.7 5.6 6.1.9-4.4 4.3 1 6.1L12 17l-5.4 2.9 1-6.1L3.2 9.5l6.1-.9z" /></svg>,
  users: p => <svg {...S(p)}><circle cx="9" cy="8" r="3.5" /><path d="M2.5 20c1-3.5 3.5-5 6.5-5s5.5 1.5 6.5 5M16 4.5a3.5 3.5 0 0 1 0 7M18 15c2 .5 3.2 2 3.7 5" /></svg>,
  cards: p => <svg {...S(p)}><rect x="3" y="5" width="11" height="15" rx="2" /><path d="M10 4.5l7-1.3 3 15-6 1.2" /></svg>,
  bolt: p => <svg {...S(p)}><path d="M13 2L4 14h7l-1 8 9-12h-7z" /></svg>,
  stats: p => <svg {...S(p)}><path d="M4 20V10M10 20V4M16 20v-7M22 20H2" /></svg>,
  expand: p => <svg {...S(p)}><path d="M4 9V4h5M20 9V4h-5M4 15v5h5M20 15v5h-5" /></svg>,
  wallet: p => <svg {...S(p)}><rect x="3" y="6" width="18" height="14" rx="3" /><path d="M3 10h18M16 15h2" /></svg>,
  volume: p => <svg {...S(p)}><path d="M4 9h4l5-4v14l-5-4H4zM17 9a4 4 0 0 1 0 6" /></svg>
};

export const Logo = () => (
  <svg viewBox="0 0 32 32" aria-hidden="true">
    <defs><linearGradient id="lg-logo" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stopColor="#4DA3FF" /><stop offset="1" stopColor="#1462D6" /></linearGradient></defs>
    <rect x="4.5" y="4.5" width="23" height="23" rx="6.5" transform="rotate(-14 16 16)" fill="url(#lg-logo)" />
    <g fill="#fff"><circle cx="11.4" cy="12.4" r="2.1" /><circle cx="16" cy="16" r="2.1" /><circle cx="20.6" cy="19.6" r="2.1" /></g>
  </svg>
);

/* ---------- original tile art: one illustration per game ---------- */
const G = (id, a, b) => <linearGradient id={id} x1="0" y1="0" x2="0" y2="1"><stop offset="0" stopColor={a} /><stop offset="1" stopColor={b} /></linearGradient>;
const Die = ({ x, y, s, r, fill, side, pips, pip = '#2A1460' }) => (
  <g transform={`translate(${x} ${y}) rotate(${r})`}>
    <rect x={-s / 2} y={-s / 2 + s * .1} width={s} height={s} rx={s * .22} fill={side} />
    <rect x={-s / 2} y={-s / 2} width={s} height={s} rx={s * .22} fill={fill} />
    {pips.map(([px, py], i) => <circle key={i} cx={px * s} cy={py * s} r={s * .085} fill={pip} />)}
  </g>
);
export const GLYPHS = {
  dice: <svg viewBox="0 0 120 120"><Die x={46} y={64} s={52} r={-14} fill="#fff" side="#C9C2E8" pips={[[-.25, -.25], [0, 0], [.25, .25], [-.25, .25], [.25, -.25]]} /><Die x={82} y={44} s={40} r={16} fill="#FF3D7F" side="#B8164F" pip="#fff" pips={[[-.22, -.22], [.22, .22]]} /></svg>,
  mines: <svg viewBox="0 0 120 120"><defs>{G('gm1', '#7CFF8A', '#00B84A')}{G('gm2', '#FF6B6B', '#C3122F')}</defs>
    <g transform="translate(64 62)"><path d="M-30-14h60l14 18-44 40-44-40z" fill="url(#gm1)" /><path d="M-44 4h88M-14-14l2 58M14-14l-2 58M-30-14l16 18M30-14l-16 18M-14 4h28" stroke="#0A6B2E" strokeWidth="2.4" fill="none" strokeLinejoin="round" /><path d="M-24-10h18l-8 12z" fill="#fff" opacity=".55" /></g>
    <g transform="translate(30 34)"><circle r="17" fill="url(#gm2)" /><path d="M0-17v-8M12-12l5-5" stroke="#3B0A14" strokeWidth="4" strokeLinecap="round" /><circle cx="18" cy="-19" r="4" fill="#FFD23F" /><circle cx="-6" cy="-6" r="5" fill="#fff" opacity=".6" /></g></svg>,
  plinko: <svg viewBox="0 0 120 120">{[[60, 22], [48, 38], [72, 38], [36, 54], [60, 54], [84, 54], [24, 70], [48, 70], [72, 70], [96, 70]].map(([x, y]) => <circle key={x + '' + y} cx={x} cy={y} r="4.2" fill="#fff" />)}
    {['#FF1F4B', '#FF6A2B', '#FFB02B', '#FFE14D', '#FFB02B', '#FF6A2B', '#FF1F4B'].map((c, i) => <rect key={i} x={12 + i * 14} y="84" width="12" height="11" rx="3" fill={c} />)}
    <circle cx="54" cy="30" r="9" fill="#FF2E6E" stroke="#fff" strokeWidth="3" /><path d="M54 4c0 10 0 12 0 16" stroke="#fff" strokeWidth="2" strokeDasharray="3 4" opacity=".7" /></svg>,
  limbo: <svg viewBox="0 0 120 120"><defs>{G('gl1', '#FFFFFF', '#FFE08A')}</defs>
    <g transform="rotate(-18 60 60)"><path d="M60 8c16 10 22 30 18 54H42C38 38 44 18 60 8z" fill="url(#gl1)" /><circle cx="60" cy="36" r="9" fill="#2B7BFF" stroke="#fff" strokeWidth="3" /><path d="M42 50l-14 18 16-2zM78 50l14 18-16-2z" fill="#FF3D3D" /><path d="M48 66h24l-4 14H52z" fill="#FF7A00" /><path d="M54 82h12l-6 18z" fill="#FFD23F" /></g></svg>,
  crash: <svg viewBox="0 0 120 120"><defs>{G('gc1', '#FFE14D', '#FF7A00')}</defs>
    <path d="M10 104 C 44 102, 70 84, 98 26" fill="none" stroke="#fff" strokeWidth="9" strokeLinecap="round" /><path d="M10 104 C 44 102, 70 84, 98 26 L 98 104 Z" fill="#fff" opacity=".18" />
    <g transform="translate(96 26) rotate(28)"><path d="M0-20c8 6 10 16 7 30H-7C-10-4-8-14 0-20z" fill="url(#gc1)" stroke="#fff" strokeWidth="2.5" /><circle cy="-6" r="4" fill="#2B7BFF" /><path d="M-5 10h10l-5 12z" fill="#FF3D3D" /></g></svg>,
  keno: <svg viewBox="0 0 120 120">{[0, 1, 2, 3].map(r => [0, 1, 2, 3].map(c => { const k = r * 4 + c, hit = [1, 6, 9, 14].includes(k), pick = [3, 11].includes(k); return <g key={k}><rect x={18 + c * 22} y={20 + r * 22} width="18" height="18" rx="4" fill={hit ? '#00E701' : pick ? '#9B30FF' : '#fff'} opacity={hit || pick ? 1 : .85} />{hit && <circle cx={27 + c * 22} cy={29 + r * 22} r="4" fill="#05310A" />}</g>; }))}</svg>,
  wheel: <svg viewBox="0 0 120 120"><g transform="translate(60 64)">{Array.from({ length: 12 }, (_, i) => { const a0 = (i / 12) * Math.PI * 2, a1 = ((i + 1) / 12) * Math.PI * 2, r = 44; return <path key={i} d={`M0 0L${r * Math.sin(a0)} ${-r * Math.cos(a0)}A${r} ${r} 0 0 1 ${r * Math.sin(a1)} ${-r * Math.cos(a1)}z`} fill={['#FFE14D', '#2B7BFF', '#fff', '#FF3D7F'][i % 4]} />; })}<circle r="44" fill="none" stroke="#fff" strokeWidth="5" /><circle r="12" fill="#0F212E" stroke="#fff" strokeWidth="4" /></g><path d="M60 6l10 18H50z" fill="#fff" stroke="#0F212E" strokeWidth="2" /></svg>,
  roulette: <svg viewBox="0 0 120 120"><g transform="translate(60 60)"><circle r="48" fill="#5A2A0E" /><circle r="42" fill="#1B1B1B" />{Array.from({ length: 18 }, (_, i) => { const a0 = (i / 18) * Math.PI * 2, a1 = ((i + 1) / 18) * Math.PI * 2, r = 40, q = 24; return <path key={i} d={`M${q * Math.sin(a0)} ${-q * Math.cos(a0)}L${r * Math.sin(a0)} ${-r * Math.cos(a0)}A${r} ${r} 0 0 1 ${r * Math.sin(a1)} ${-r * Math.cos(a1)}L${q * Math.sin(a1)} ${-q * Math.cos(a1)}z`} fill={i === 0 ? '#2FBF4A' : i % 2 ? '#E3173E' : '#1B1B1B'} />; })}<circle r="22" fill="#C8902E" /><circle r="8" fill="#F5D27A" /><path d="M0-20V20M-20 0H20" stroke="#F5D27A" strokeWidth="4" strokeLinecap="round" /><circle cx="22" cy="-27" r="5.5" fill="#fff" /></g></svg>,
  hilo: <svg viewBox="0 0 120 120"><g transform="rotate(-12 44 62)"><rect x="20" y="28" width="46" height="66" rx="7" fill="#fff" /><text x="30" y="52" fontSize="20" fontWeight="900" fill="#E3173E" fontFamily="Figtree,sans-serif">K</text><path d="M43 66c-6-6-12-2-8 4l8 9 8-9c4-6-2-10-8-4z" fill="#E3173E" /></g>
    <g transform="rotate(10 78 58)"><rect x="54" y="24" width="46" height="66" rx="7" fill="#1475E1" stroke="#fff" strokeWidth="4" /><path d="M77 38l12 16H65zM77 78L65 62h24z" fill="#fff" /></g></svg>,
  blackjack: <svg viewBox="0 0 120 120"><g transform="rotate(-14 42 62)"><rect x="18" y="26" width="46" height="66" rx="7" fill="#fff" /><text x="27" y="50" fontSize="20" fontWeight="900" fill="#111" fontFamily="Figtree,sans-serif">A</text><path d="M41 58l9 10c3 4-1 9-6 7l-3-2-3 2c-5 2-9-3-6-7z" fill="#111" /><path d="M41 74l-3 8h6z" fill="#111" /></g>
    <g transform="rotate(10 80 58)"><rect x="56" y="24" width="46" height="66" rx="7" fill="#fff" /><text x="64" y="48" fontSize="20" fontWeight="900" fill="#E3173E" fontFamily="Figtree,sans-serif">K</text><path d="M79 60c-6-6-12-2-8 4l8 9 8-9c4-6-2-10-8-4z" fill="#E3173E" /></g>
    <circle cx="96" cy="94" r="14" fill="#FFD23F" stroke="#fff" strokeWidth="3" /><text x="96" y="99" fontSize="13" fontWeight="900" textAnchor="middle" fill="#7A4B00" fontFamily="Figtree,sans-serif">21</text></svg>
};
export const TILE_BG = {
  crash: 'linear-gradient(160deg,#FF9A2F,#FF4E1A 60%,#E0161B)',
  dice: 'linear-gradient(160deg,#B14DFF,#7B2FF7 55%,#5016D6)',
  mines: 'linear-gradient(160deg,#2FA4FF,#1268F2 60%,#0B45C9)',
  plinko: 'linear-gradient(160deg,#FF5E8A,#FF1F5A 55%,#C8104A)',
  limbo: 'linear-gradient(160deg,#FFD23F,#FF9800 60%,#FF6A00)',
  keno: 'linear-gradient(160deg,#25D6F2,#0096D6 60%,#0067C2)',
  wheel: 'linear-gradient(160deg,#35E08A,#10B26A 55%,#078A55)',
  roulette: 'linear-gradient(160deg,#FF5468,#D0213B 55%,#8E1030)',
  hilo: 'linear-gradient(160deg,#6E7BFF,#4B4FE0 55%,#3326B8)',
  blackjack: 'linear-gradient(160deg,#2FCF7A,#178F4E 55%,#0B6338)'
};
