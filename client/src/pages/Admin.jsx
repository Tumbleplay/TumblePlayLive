import { useState, useEffect, useCallback } from 'react';
import { useApp } from '../lib/store.jsx';
import { api } from '../lib/api.js';
import { fmt, fmtShort, GAME_NAMES, clock, dayLabel } from '../lib/format.js';
import { Modal } from '../components/common.jsx';

const GM_GAME_LIST = [
  ['mines', 'Mines'], ['dice', 'Dice'], ['limbo', 'Limbo'], ['plinko', 'Plinko'],
  ['keno', 'Keno'], ['wheel', 'Wheel'], ['roulette', 'Roulette'], ['crash', 'Aviator'],
  ['hilo', 'HiLo'], ['blackjack', 'Blackjack']
];


function SuperAdminV3Panel() {
  const { toast } = useApp();
  const [open, setOpen] = useState(true);
  const [sub, setSub] = useState('economy');
  const [eco, setEco] = useState(null);
  const [wcfg, setWcfg] = useState(null);
  const [deps, setDeps] = useState([]);
  const [wdrs, setWdrs] = useState([]);
  const [refs, setRefs] = useState([]);
  const [promos, setPromos] = useState([]);
  const [pCode, setPCode] = useState('');
  const [pCoins, setPCoins] = useState('25');
  const [pMax, setPMax] = useState('30');

  const loadV3 = useCallback(() => {
    api('/admin/v3/economy').then(setEco).catch(() => {});
    api('/admin/v3/wallet-settings').then(setWcfg).catch(() => {});
    api('/admin/v3/deposits?status=pending').then(setDeps).catch(() => {});
    api('/admin/v3/withdrawals?status=pending').then(setWdrs).catch(() => {});
    api('/admin/v3/referrals?status=pending').then(setRefs).catch(() => {});
    api('/admin/v3/promos').then(setPromos).catch(() => {});
  }, []);
  useEffect(() => { loadV3(); }, [loadV3]);

  const saveEco = async () => {
    try { await api('/admin/v3/economy', eco); toast('Economy & Bonus settings saved!', 'win'); }
    catch (e) { toast(e.message, 'error'); }
  };
  const saveWcfg = async () => {
    try { await api('/admin/v3/wallet-settings', wcfg); toast('3-in-1 Wallet settings saved!', 'win'); }
    catch (e) { toast(e.message, 'error'); }
  };
  const act = async (url, body = {}, msg = 'Done') => {
    try { await api(url, body); toast(msg, 'win'); loadV3(); }
    catch (e) { toast(e.message, 'error'); }
  };

  return (
    <div className="v3-card" style={{ marginBottom: 20, border: '1px solid #00e70155' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 }}>
        <h2 style={{ margin: 0, color: '#00e701' }}>⚡ TumblePlay v3 Super-Admin Control Center</h2>
        <button className="btn sm" onClick={() => setOpen(o => !o)}>{open ? 'Hide' : 'Show'}</button>
      </div>
      {open && (
        <>
          <div className="v3-tabs">
            <button className={sub === 'economy' ? 'active' : ''} onClick={() => setSub('economy')}>Bonuses &amp; TG</button>
            <button className={sub === 'wallet' ? 'active' : ''} onClick={() => setSub('wallet')}>3-in-1 Wallet Config</button>
            <button className={sub === 'deposits' ? 'active' : ''} onClick={() => setSub('deposits')}>Deposits ({deps.length})</button>
            <button className={sub === 'withdrawals' ? 'active' : ''} onClick={() => setSub('withdrawals')}>Withdrawals ({wdrs.length})</button>
            <button className={sub === 'referrals' ? 'active' : ''} onClick={() => setSub('referrals')}>Referrals ({refs.length})</button>
            <button className={sub === 'promos' ? 'active' : ''} onClick={() => setSub('promos')}>Promo Codes</button>
          </div>

          {sub === 'economy' && eco && (
            <div className="v3-grid2">
              <label className="field"><span>Welcome Bonus Coins (Default 50)</span><input className="input" type="number" value={eco.welcomeBonusCoins} onChange={e => setEco({ ...eco, welcomeBonusCoins: Number(e.target.value) })} /></label>
              <label className="field"><span>Daily Login Bonus (Default 10 / 24h)</span><input className="input" type="number" value={eco.dailyBonusCoins} onChange={e => setEco({ ...eco, dailyBonusCoins: Number(e.target.value) })} /></label>
              <label className="field"><span>Referral Bonus Coins (Default 50)</span><input className="input" type="number" value={eco.referralBonusCoins} onChange={e => setEco({ ...eco, referralBonusCoins: Number(e.target.value) })} /></label>
              <label className="field">
                <span>Referral Verification Mode</span>
                <select className="input" value={eco.referralMode} onChange={e => setEco({ ...eco, referralMode: e.target.value })}>
                  <option value="deposit">Auto-Verify After First Approved Deposit</option>
                  <option value="manual">Manual Admin Approval Only</option>
                </select>
              </label>
              <label className="field"><span>Your Telegram Admin Chat ID (Send /myid to @TumblePlayBot)</span><input className="input" value={eco.telegramAdminId || ''} onChange={e => setEco({ ...eco, telegramAdminId: e.target.value })} placeholder="e.g. 123456789" /></label>
              <div style={{ display: 'flex', alignItems: 'end' }}><button className="btn primary" onClick={saveEco}>Save Economy &amp; TG Settings</button></div>
            </div>
          )}

          {sub === 'wallet' && wcfg && (
            <div className="v3-grid2">
              <label className="field"><span>Coins per ₹1 INR</span><input className="input" type="number" value={wcfg.coinsPerInr} onChange={e => setWcfg({ ...wcfg, coinsPerInr: Number(e.target.value) })} /></label>
              <label className="field"><span>1 USDT Rate (₹)</span><input className="input" type="number" value={wcfg.usdtRateInr} onChange={e => setWcfg({ ...wcfg, usdtRateInr: Number(e.target.value) })} /></label>
              <label className="field"><span>Binance Pay ID (₹0 Fee)</span><input className="input" value={wcfg.binancePayId || ''} onChange={e => setWcfg({ ...wcfg, binancePayId: e.target.value })} /></label>
              <label className="field"><span>USDT BEP20 Address</span><input className="input" value={wcfg.usdtBep20 || ''} onChange={e => setWcfg({ ...wcfg, usdtBep20: e.target.value })} /></label>
              <label className="field"><span>USDT TON Address</span><input className="input" value={wcfg.usdtTon || ''} onChange={e => setWcfg({ ...wcfg, usdtTon: e.target.value })} /></label>
              <label className="field"><span>Telegram Community Channel URL</span><input className="input" value={wcfg.tgChannelUrl || ''} onChange={e => setWcfg({ ...wcfg, tgChannelUrl: e.target.value })} /></label>
              <label className="field"><span>Site Announcement Banner</span><input className="input" value={wcfg.announcement || ''} onChange={e => setWcfg({ ...wcfg, announcement: e.target.value })} placeholder="Optional top banner..." /></label>
              <div style={{ display: 'flex', alignItems: 'end' }}><button className="btn primary" onClick={saveWcfg}>Save 3-in-1 Wallet Settings</button></div>
            </div>
          )}

          {sub === 'deposits' && (
            <div>
              {deps.length === 0 ? <p className="muted">No pending deposits.</p> : deps.map(d => (
                <div key={d.id} className="v3-row">
                  <div><b>{d.order_code}</b> · {d.username} · {d.method} · <b>{d.coins} Coins</b> · <code>{d.reference}</code></div>
                  <div style={{ display: 'flex', gap: 6 }}>
                    {d.method === 'amazon_gc' && <a className="btn sm" href="https://www.amazon.in/gp/css/gc/payment" target="_blank" rel="noreferrer">Claim ↗</a>}
                    {d.method === 'binance_gc' && <a className="btn sm" href="https://www.binance.com/en-IN/gift-card" target="_blank" rel="noreferrer">Redeem ↗</a>}
                    <button className="btn sm primary" onClick={() => act(`/admin/v3/deposits/${d.id}/approve`, {}, 'Deposit Approved!')}>Approve</button>
                    <button className="btn sm" onClick={() => act(`/admin/v3/deposits/${d.id}/reject`, { note: 'Invalid code' }, 'Deposit Rejected')}>Reject</button>
                  </div>
                </div>
              ))}
            </div>
          )}

          {sub === 'withdrawals' && (
            <div>
              {wdrs.length === 0 ? <p className="muted">No pending withdrawals.</p> : wdrs.map(w => (
                <div key={w.id} className="v3-row">
                  <div><b>{w.order_code}</b> · {w.username} · {w.method} · <b>₹{w.inr_amount}</b> · <code>{w.destination}</code></div>
                  <div style={{ display: 'flex', gap: 6 }}>
                    <button className="btn sm primary" onClick={() => { const ref = prompt('Paste Gift Card Code or Payout TxHash:') || 'Paid'; act(`/admin/v3/withdrawals/${w.id}/approve`, { payoutRef: ref }, 'Withdrawal Paid!'); }}>Approve Paid</button>
                    <button className="btn sm" onClick={() => act(`/admin/v3/withdrawals/${w.id}/reject`, { note: 'Rejected' }, 'Rejected & Refunded')}>Reject + Refund</button>
                  </div>
                </div>
              ))}
            </div>
          )}

          {sub === 'referrals' && (
            <div>
              {refs.length === 0 ? <p className="muted">No pending referrals.</p> : refs.map(r => (
                <div key={r.id} className="v3-row">
                  <div><b>{r.referrer_name}</b> invited <b>{r.referred_name}</b> (+{r.bonus_coins} Coins) {r.flagged_same_ip ? <span style={{ color: '#ff4d4d', fontWeight: 700 }}>⚠ SAME IP</span> : ''}</div>
                  <div style={{ display: 'flex', gap: 6 }}>
                    <button className="btn sm primary" onClick={() => act(`/admin/v3/referrals/${r.id}/verify`, {}, 'Referral Verified & Paid!')}>Verify &amp; Pay</button>
                    <button className="btn sm" onClick={() => act(`/admin/v3/referrals/${r.id}/reject`, {}, 'Referral Rejected')}>Reject</button>
                  </div>
                </div>
              ))}
            </div>
          )}

          {sub === 'promos' && (
            <div>
              <div style={{ display: 'flex', gap: 8, marginBottom: 12, flexWrap: 'wrap' }}>
                <input className="input" style={{ maxWidth: 180 }} value={pCode} onChange={e => setPCode(e.target.value)} placeholder="Code (e.g. FLY25)" />
                <input className="input" type="number" value={pCoins} onChange={e => setPCoins(e.target.value)} placeholder="Coins" style={{ width: 90 }} />
                <input className="input" type="number" value={pMax} onChange={e => setPMax(e.target.value)} placeholder="Max Uses" style={{ width: 100 }} />
                <button className="btn primary" onClick={() => { act('/admin/v3/promos', { code: pCode, coins: Number(pCoins), maxUses: Number(pMax) }, 'Promo Created!'); setPCode(''); }}>Create Drop Code</button>
              </div>
              {promos.map(p => (
                <div key={p.id} className="v3-row">
                  <span><b>{p.code}</b> — +{p.coins} Coins</span>
                  <span>{p.used_count} / {p.max_uses} claimed</span>
                </div>
              ))}
            </div>
          )}
        </>
      )}
    </div>
  );
}

export default function Admin() {
  const { user } = useApp();
  const [tab, setTab] = useState('gm');
  if (user?.role !== 'admin') return <div className="empty">Admins only.</div>;
  return (
    <div>
      <div className="game-title"><h1>Admin</h1>
      <SuperAdminV3Panel /></div>
      <div className="tabs-line" role="tablist">
        {[['gm', 'Game Master'], ['deposits', 'Deposits & Payments'], ['overview', 'Overview'], ['users', 'Players'], ['events', 'Custom matches']].map(([k, l]) => (
          <button key={k} role="tab" aria-selected={tab === k} onClick={() => setTab(k)}>{l}</button>
        ))}
      </div>
      {tab === 'gm' ? <GameMaster /> : tab === 'deposits' ? <Deposits /> : tab === 'overview' ? <Overview /> : tab === 'users' ? <Users /> : <Events />}
    </div>
  );
}

function Deposits() {
  const { toast } = useApp();
  const [filter, setFilter] = useState('pending');
  const [data, setData] = useState(null);
  const [cfg, setCfg] = useState(null);
  const [showSettings, setShowSettings] = useState(false);
  const [rejectTarget, setRejectTarget] = useState(null);
  const [rejectNote, setRejectNote] = useState('UTR / TxHash not received');

  const load = useCallback(() => {
    api(`/admin/deposits?status=${filter}`).then(setData).catch(() => {});
  }, [filter]);

  useEffect(() => {
    load();
    api('/admin/deposits/config').then(setCfg).catch(() => {});
    const t = setInterval(load, 4000);
    return () => clearInterval(t);
  }, [load]);

  const review = async (id, decision, note = '') => {
    try {
      await api(`/admin/deposits/${id}/review`, { decision, note });
      toast(decision === 'approve' ? 'Deposit approved & coins credited!' : 'Deposit rejected', decision === 'approve' ? 'win' : 'error');
      setRejectTarget(null);
      load();
    } catch (e) { toast(e.message, 'error'); }
  };

  const saveCfg = async e => {
    e.preventDefault();
    try {
      const updated = await api('/admin/deposits/config', cfg);
      setCfg(updated);
      toast('Payment settings saved & backed up', 'win');
      setShowSettings(false);
    } catch (err) { toast(err.message, 'error'); }
  };

  const setWalletAddr = (id, address) => {
    setCfg(c => ({ ...c, wallets: c.wallets.map(w => (w.id === id ? { ...w, address } : w)) }));
  };

  if (!data) return <div className="empty">Loading deposits…</div>;

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
      <div className="grid-3">
        <div className="stat"><small>Pending Verification</small><b>{data.summary.pendingCount}</b></div>
        <div className="stat"><small>Approved UPI (INR)</small><b>₹{data.summary.totalInr.toLocaleString()}</b></div>
        <div className="stat"><small>Approved Crypto (USD)</small><b>${data.summary.totalUsd.toLocaleString()}</b></div>
      </div>

      <div className="kv">
        <div className="seg" style={{ width: 320 }}>
          {[['pending', 'Pending'], ['approved', 'Approved'], ['rejected', 'Rejected'], ['all', 'All']].map(([k, l]) => (
            <button key={k} aria-pressed={filter === k} onClick={() => setFilter(k)}>{l}</button>
          ))}
        </div>
        <button className="btn gold" onClick={() => setShowSettings(s => !s)}>
          {showSettings ? 'Close Payment Settings' : 'UPI & Crypto Settings'}
        </button>
      </div>

      {showSettings && cfg && (
        <form className="card" onSubmit={saveCfg} style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
          <h2 style={{ fontSize: 18, margin: 0 }}>Payment Gateway Settings (Free UPI QR &amp; Crypto)</h2>

          <div className="row2">
            <label className="field">
              <span>Your UPI ID (e.g. name@okaxis / paytm)</span>
              <input className="input" value={cfg.upiId} onChange={e => setCfg(c => ({ ...c, upiId: e.target.value }))} placeholder="yourname@upi" />
            </label>
            <label className="field">
              <span>UPI Display Name</span>
              <input className="input" value={cfg.upiName} onChange={e => setCfg(c => ({ ...c, upiName: e.target.value }))} placeholder="Tumble Play" />
            </label>
          </div>

          <div className="row2" style={{ gridTemplateColumns: '1fr 1fr 1fr' }}>
            <label className="field">
              <span>Coins per ₹1 INR</span>
              <input className="input" type="number" step="0.01" min="0.01" value={cfg.inrRate} onChange={e => setCfg(c => ({ ...c, inrRate: Number(e.target.value) }))} />
            </label>
            <label className="field">
              <span>Min UPI (₹)</span>
              <input className="input" type="number" min="1" value={cfg.minInr} onChange={e => setCfg(c => ({ ...c, minInr: Number(e.target.value) }))} />
            </label>
            <label className="field">
              <span>Max UPI (₹)</span>
              <input className="input" type="number" min="1" value={cfg.maxInr} onChange={e => setCfg(c => ({ ...c, maxInr: Number(e.target.value) }))} />
            </label>
          </div>

          <div className="row2" style={{ gridTemplateColumns: '1fr 1fr 1fr' }}>
            <label className="field">
              <span>Coins per $1 USDT</span>
              <input className="input" type="number" step="0.01" min="0.01" value={cfg.usdRate} onChange={e => setCfg(c => ({ ...c, usdRate: Number(e.target.value) }))} />
            </label>
            <label className="field">
              <span>Min Crypto ($)</span>
              <input className="input" type="number" min="1" value={cfg.minUsd} onChange={e => setCfg(c => ({ ...c, minUsd: Number(e.target.value) }))} />
            </label>
            <label className="field">
              <span>Max Crypto ($)</span>
              <input className="input" type="number" min="1" value={cfg.maxUsd} onChange={e => setCfg(c => ({ ...c, maxUsd: Number(e.target.value) }))} />
            </label>
          </div>

          <div>
            <small className="muted" style={{ display: 'block', marginBottom: 8 }}>Crypto Deposit Addresses (leave blank to hide a network from players):</small>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
              {cfg.wallets.map(w => (
                <label className="field" key={w.id}>
                  <span>{w.label}</span>
                  <input
                    className="input"
                    value={w.address}
                    onChange={e => setWalletAddr(w.id, e.target.value)}
                    placeholder={`Paste your ${w.label} address`}
                  />
                </label>
              ))}
            </div>
          </div>

          <div className="row2">
            <label style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
              <input type="checkbox" checked={cfg.upiEnabled} onChange={e => setCfg(c => ({ ...c, upiEnabled: e.target.checked }))} />
              <span>Enable UPI Deposits</span>
            </label>
            <label style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
              <input type="checkbox" checked={cfg.cryptoEnabled} onChange={e => setCfg(c => ({ ...c, cryptoEnabled: e.target.checked }))} />
              <span>Enable Crypto Deposits</span>
            </label>
          </div>

          <button className="btn gold">Save Payment Settings</button>
        </form>
      )}

      <div className="feed">
        <table className="tbl">
          <thead>
            <tr>
              <th>Order / Player</th>
              <th>Method</th>
              <th className="r">Paid</th>
              <th className="r">Coins</th>
              <th>UTR / TxHash</th>
              <th>Status</th>
              <th className="r">Action</th>
            </tr>
          </thead>
          <tbody>
            {!data.rows.length ? (
              <tr><td colSpan={7} className="muted">No deposit requests in this view.</td></tr>
            ) : data.rows.map(d => (
              <tr key={d.id}>
                <td>
                  <b>{d.username}</b>
                  <div className="muted" style={{ fontSize: 12 }}>{d.orderCode} · {dayLabel(d.createdAt)} {clock(d.createdAt)}</div>
                </td>
                <td>{d.network}</td>
                <td className="r"><b>{d.payCurrency === 'INR' ? `₹${d.payAmount.toLocaleString()}` : `$${d.payAmount}`}</b></td>
                <td className="r">{fmt(d.coins)}</td>
                <td style={{ fontFamily: 'monospace', fontSize: 12 }}>
                  <div>{d.reference.length > 22 ? `${d.reference.slice(0, 10)}…${d.reference.slice(-8)}` : d.reference}</div>
                  {d.explorerUrl && (
                    <a href={d.explorerUrl} target="_blank" rel="noreferrer" style={{ color: 'var(--gold)', fontSize: 11 }}>
                      Verify on Explorer ↗
                    </a>
                  )}
                </td>
                <td>
                  <span className={`pill ${d.status === 'approved' ? 'w' : d.status === 'rejected' ? 'l' : ''}`}>
                    {d.status.toUpperCase()}
                  </span>
                </td>
                <td className="r">
                  {d.status === 'pending' ? (
                    <div style={{ display: 'inline-flex', gap: 6 }}>
                      <button className="btn sm gold" onClick={() => review(d.id, 'approve')}>Approve</button>
                      <button className="btn sm ghost" style={{ color: 'var(--bust)' }} onClick={() => { setRejectTarget(d); setRejectNote('Payment not received'); }}>Reject</button>
                    </div>
                  ) : (
                    <span className="muted" style={{ fontSize: 12 }}>{d.reviewedBy || '—'}</span>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {rejectTarget && (
        <Modal onClose={() => setRejectTarget(null)} label="Reject Deposit">
          <h2>Reject {rejectTarget.orderCode}</h2>
          <p className="muted">{rejectTarget.username} · {rejectTarget.payCurrency === 'INR' ? `₹${rejectTarget.payAmount}` : `$${rejectTarget.payAmount}`} ({rejectTarget.reference})</p>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 12, marginTop: 12 }}>
            <label className="field">
              <span>Reason (shown to player)</span>
              <input className="input" value={rejectNote} onChange={e => setRejectNote(e.target.value)} />
            </label>
            <button className="btn" style={{ background: 'var(--bust)', color: '#fff' }} onClick={() => review(rejectTarget.id, 'reject', rejectNote)}>
              Confirm Reject
            </button>
          </div>
        </Modal>
      )}
    </div>
  );
}

function GameMaster() {
  const { toast } = useApp();
  const [gm, setGm] = useState(null);
  const [players, setPlayers] = useState([]);
  const [crashPt, setCrashPt] = useState('1.00');
  const [targetUserId, setTargetUserId] = useState('');
  const [targetGame, setTargetGame] = useState('all');
  const [targetMode, setTargetMode] = useState('loss');
  const [targetCount, setTargetCount] = useState('1');

  const load = useCallback(() => {
    api('/admin/gm').then(setGm).catch(() => {});
  }, []);

  useEffect(() => {
    load();
    api('/admin/users?q=').then(rows => {
      setPlayers(rows);
      setTargetUserId(prev => prev || (rows[0] ? String(rows[0].id) : ''));
    }).catch(() => {});
    const t = setInterval(load, 1000);
    return () => clearInterval(t);
  }, [load]);

  if (!gm) return <div className="empty">Loading Game Master…</div>;

  const setGlobalMode = async (mode, games = gm.global.games) => {
    try {
      await api('/admin/gm/global', { mode, games });
      toast(`Global mode: ${mode.toUpperCase()}`, 'win');
      load();
    } catch (e) { toast(e.message, 'error'); }
  };

  const toggleGlobalGame = key => {
    if (key === 'all') return setGlobalMode(gm.global.mode, ['all']);
    const cur = gm.global.games.includes('all') ? [] : [...gm.global.games];
    const next = cur.includes(key) ? cur.filter(g => g !== key) : [...cur, key];
    setGlobalMode(gm.global.mode, next.length ? next : ['all']);
  };

  const crashAction = async (body, msg) => {
    try {
      await api('/admin/gm/crash', body);
      toast(msg, 'win');
      load();
    } catch (e) { toast(e.message, 'error'); }
  };

  const applyPlayerOverride = async e => {
    e.preventDefault();
    if (!targetUserId) return;
    try {
      await api(`/admin/users/${targetUserId}`, {
        action: 'gm',
        mode: targetMode,
        game: targetGame,
        remaining: Number(targetCount)
      });
      toast('Player override applied', 'win');
      load();
    } catch (err) { toast(err.message, 'error'); }
  };

  const clearOverride = async uid => {
    try {
      await api(`/admin/users/${uid}`, { action: 'gm', mode: 'normal' });
      toast('Override cleared', 'win');
      load();
    } catch (err) { toast(err.message, 'error'); }
  };

  const allSelected = gm.global.games.includes('all');

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
      <div className="card" style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
        <div className="kv">
          <h2 style={{ fontSize: 18, margin: 0 }}>Global Control (All Players Simultaneously)</h2>
          <span className={`pill ${gm.global.mode === 'loss' ? 'l' : gm.global.mode === 'win' ? 'w' : ''}`}>
            {gm.global.mode === 'loss' ? 'FORCE LOSS ON' : gm.global.mode === 'win' ? 'FORCE WIN ON' : 'NORMAL'}
          </span>
        </div>
        <div className="seg">
          {[['normal', 'Normal (Fair)'], ['loss', 'Force Loss'], ['win', 'Force Win']].map(([m, label]) => (
            <button key={m} aria-pressed={gm.global.mode === m} onClick={() => setGlobalMode(m)}>{label}</button>
          ))}
        </div>
        <div>
          <small className="muted" style={{ display: 'block', marginBottom: 8 }}>Games affected by Global Mode:</small>
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
            <button className={`btn sm ${allSelected ? 'gold' : 'ghost'}`} onClick={() => toggleGlobalGame('all')}>All 10 Games</button>
            {GM_GAME_LIST.map(([key, name]) => {
              const active = !allSelected && gm.global.games.includes(key);
              return (
                <button key={key} className={`btn sm ${active ? 'gold' : 'ghost'}`} onClick={() => toggleGlobalGame(key)}>
                  {name}
                </button>
              );
            })}
          </div>
        </div>
      </div>

      <div className="card" style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
        <div className="kv">
          <h2 style={{ fontSize: 18, margin: 0 }}>Live Crash Control</h2>
          <span className="pill">{gm.crash.phase?.toUpperCase()}</span>
        </div>
        <div className="grid-3">
          <div className="stat"><small>Current Multiplier</small><b>{gm.crash.liveMult ? `${gm.crash.liveMult.toFixed(2)}×` : '1.00×'}</b></div>
          <div className="stat"><small>Hidden Crash Point</small><b>{gm.crash.scheduledPoint ? `${Number(gm.crash.scheduledPoint).toFixed(2)}×` : '—'}</b></div>
          <div className="stat"><small>Queued Next Round</small><b>{gm.crash.queuedPoint ? `${Number(gm.crash.queuedPoint).toFixed(2)}×` : 'Auto'}</b></div>
        </div>
        <div className="row2">
          <button
            className="btn"
            style={{ background: 'var(--bust)', color: '#fff' }}
            disabled={gm.crash.phase !== 'running'}
            onClick={() => crashAction({ action: 'crash_now' }, 'Round crashed immediately')}
          >
            Crash Now
          </button>
          <div style={{ display: 'flex', gap: 8 }}>
            <input className="input" type="number" step="0.01" min="1" value={crashPt} onChange={e => setCrashPt(e.target.value)} placeholder="e.g. 1.00" />
            <button className="btn gold" onClick={() => crashAction({ action: 'set_point', point: Number(crashPt) }, `Crash set to ${crashPt}×`)}>
              Set Point
            </button>
          </div>
        </div>
        {!!gm.crash.bets?.length && (
          <div className="muted" style={{ fontSize: 13 }}>
            Active Crash bets: {gm.crash.bets.map(b => `${b.username} (${fmt(b.amount)}${b.auto ? ` @${b.auto}×` : ''}${b.cashedAt ? ` ✓${b.cashedAt}×` : ''})`).join(' · ')}
          </div>
        )}
      </div>

      <form className="card" onSubmit={applyPlayerOverride} style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
        <h2 style={{ fontSize: 18, margin: 0 }}>Target Specific Player</h2>
        <div className="row2">
          <label className="field">
            <span>Player</span>
            <select className="input" value={targetUserId} onChange={e => setTargetUserId(e.target.value)}>
              {players.map(p => <option key={p.id} value={p.id}>{p.username} ({fmt(p.balance)})</option>)}
            </select>
          </label>
          <label className="field">
            <span>Game</span>
            <select className="input" value={targetGame} onChange={e => setTargetGame(e.target.value)}>
              <option value="all">All Games</option>
              {GM_GAME_LIST.map(([k, n]) => <option key={k} value={k}>{n}</option>)}
            </select>
          </label>
        </div>
        <div className="row2">
          <label className="field">
            <span>Forced Outcome</span>
            <select className="input" value={targetMode} onChange={e => setTargetMode(e.target.value)}>
              <option value="loss">Force Loss</option>
              <option value="win">Force Win</option>
              <option value="normal">Reset to Normal</option>
            </select>
          </label>
          <label className="field">
            <span>Duration (-1 = Unlimited)</span>
            <input className="input" type="number" min="-1" max="1000" value={targetCount} onChange={e => setTargetCount(e.target.value)} />
          </label>
        </div>
        <button className="btn gold">Apply Player Rule</button>
      </form>

      <div className="feed">
        <table className="tbl">
          <thead><tr><th>Player</th><th>Outcome</th><th>Game</th><th className="r">Remaining Bets</th><th className="r">Clear</th></tr></thead>
          <tbody>
            {!gm.overrides.length ? (
              <tr><td colSpan={5} className="muted">No active per-player overrides.</td></tr>
            ) : gm.overrides.map(o => (
              <tr key={o.userId}>
                <td><b>{o.username}</b></td>
                <td><span className={`pill ${o.mode === 'loss' ? 'l' : 'w'}`}>{o.mode.toUpperCase()}</span></td>
                <td>{o.game === 'all' ? 'All Games' : (GAME_NAMES[o.game] || o.game)}</td>
                <td className="r">{o.remaining === -1 ? 'Unlimited' : o.remaining}</td>
                <td className="r"><button className="btn sm ghost" onClick={() => clearOverride(o.userId)}>Reset</button></td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

function Overview() {
  const { toast } = useApp();
  const [s, setS] = useState(null), [range, setRange] = useState('24h'), [syncing, setSyncing] = useState(false);
  const load = useCallback(() => api('/admin/stats').then(setS), []);
  useEffect(() => { load(); }, [load]);
  if (!s) return <div className="empty">Loading…</div>;
  const casino = range === '24h' ? s.casino24h : s.casinoAll, sports = range === '24h' ? s.sports24h : s.sportsAll;

  const backupNow = async () => {
    setSyncing(true);
    try {
      const r = await api('/admin/sync', {});
      toast(r.lastError ? `Backup error: ${r.lastError}` : 'Database backed up to Supabase!', r.lastError ? 'error' : 'win');
      load();
    } catch (e) { toast(e.message, 'error'); } finally { setSyncing(false); }
  };

  return <>
    <div className="card" style={{ marginBottom: 16 }}>
      <div className="kv">
        <div>
          <b>Supabase Cloud Persistence</b>
          <div className="muted" style={{ fontSize: 13 }}>
            {!s.sync?.enabled
              ? 'Not connected yet — add SUPABASE_URL & SUPABASE_SERVICE_KEY in Render Environment.'
              : s.sync.lastError
                ? `Error: ${s.sync.lastError}`
                : `Connected (${s.sync.bucket}) · Last saved: ${s.sync.lastSyncAt ? `${dayLabel(s.sync.lastSyncAt)} ${clock(s.sync.lastSyncAt)}` : 'Pending first write'}`}
          </div>
        </div>
        <button className="btn sm gold" disabled={!s.sync?.enabled || syncing} onClick={backupNow}>
          {syncing ? 'Saving…' : 'Backup Now'}
        </button>
      </div>
    </div>

    <div className="grid-3" style={{ marginBottom: 16 }}>
      <div className="stat"><small>Players</small><b>{s.users.toLocaleString()}</b><small>{s.signups24h} new today</small></div>
      <div className="stat"><small>Active in 24h</small><b>{s.active24h.toLocaleString()}</b></div>
      <div className="stat"><small>Coins in wallets</small><b>{fmtShort(s.coinsInCirculation)}</b></div>
      <div className="stat"><small>Pending deposits</small><b>{s.pendingDeposits || 0}</b></div>
    </div>
    <div className="kv" style={{ marginBottom: 10 }}><h2 style={{ fontSize: 18, color: 'var(--text)' }}>Games</h2>
      <div className="seg" style={{ width: 200 }}>{[['24h', 'Last 24h'], ['all', 'All time']].map(([k, l]) => <button key={k} aria-pressed={range === k} onClick={() => setRange(k)}>{l}</button>)}</div></div>
    <div className="feed" style={{ marginBottom: 16 }}><table className="tbl"><thead><tr><th>Game</th><th className="r">Bets</th><th className="r">Wagered</th><th className="r">House result</th><th className="r hide-sm">Actual edge</th></tr></thead>
      <tbody>{casino.map(g => <tr key={g.game}><td>{GAME_NAMES[g.game]}</td><td className="r">{g.bets.toLocaleString()}</td><td className="r">{fmtShort(g.wagered)}</td><td className={`r ${g.house >= 0 ? 'pos' : 'bad'}`}>{fmtShort(g.house)}</td><td className="r hide-sm">{(g.edge * 100).toFixed(2)}%</td></tr>)}
        <tr><td>Sports</td><td className="r">{sports.bets.toLocaleString()}</td><td className="r">{fmtShort(sports.wagered)}</td><td className={`r ${sports.house >= 0 ? 'pos' : 'bad'}`}>{fmtShort(sports.house)}</td><td className="r hide-sm">–</td></tr></tbody></table></div>
    <h2 style={{ fontSize: 18, marginBottom: 10 }}>Coins added &amp; giveaways</h2>
    <div className="feed"><table className="tbl"><tbody>{s.giveaways.map(g => <tr key={g.kind}><td>{g.kind.replace('_', ' ')}</td><td className="r">{g.count.toLocaleString()} times</td><td className="r">{fmtShort(g.total)}</td></tr>)}</tbody></table></div>
  </>;
}

function Users() {
  const { toast, user: me } = useApp();
  const [q, setQ] = useState(''), [rows, setRows] = useState([]), [edit, setEdit] = useState(null);
  const load = useCallback(() => api(`/admin/users?q=${encodeURIComponent(q)}`).then(setRows), [q]);
  useEffect(() => { const t = setTimeout(load, 250); return () => clearTimeout(t); }, [load]);
  const act = async (id, body, msg) => { try { await api(`/admin/users/${id}`, body); toast(msg, 'win'); load(); } catch (e) { toast(e.message, 'error'); } };
  return <>
    <input className="input" placeholder="Search by username" value={q} onChange={e => setQ(e.target.value)} style={{ maxWidth: 320, marginBottom: 12 }} />
    <div className="feed"><table className="tbl"><thead><tr><th>Player</th><th className="r">Balance</th><th className="r hide-sm">Wagered</th><th className="r hide-sm">Profit</th><th>Status</th><th className="r">Actions</th></tr></thead>
      <tbody>{rows.map(u => <tr key={u.id}>
        <td><b>{u.username}</b> <span className="vip-tag">{u.role === 'admin' ? 'Admin' : u.vip}</span></td>
        <td className="r">{fmt(u.balance)}</td><td className="r hide-sm">{fmtShort(u.wagered)}</td><td className="r hide-sm">{fmtShort(u.profit)}</td>
        <td>
          {u.banned ? <span className="pill l">Banned</span> : u.mutedUntil > Date.now() ? <span className="pill">Muted</span> : <span className="muted">Active</span>}
          {u.gm && <span className={`pill ${u.gm.mode === 'loss' ? 'l' : 'w'}`} style={{ marginLeft: 6 }}>GM: {u.gm.mode}</span>}
        </td>
        <td className="r"><button className="btn sm" onClick={() => setEdit(u)}>Manage</button></td>
      </tr>)}</tbody></table></div>
    {edit && <ManageUser u={edit} me={me} onClose={() => setEdit(null)} act={(b, m) => act(edit.id, b, m).then(() => setEdit(null))} />}
  </>;
}
function ManageUser({ u, me, onClose, act }) {
  const [amt, setAmt] = useState(''), [note, setNote] = useState(''), [mins, setMins] = useState(60);
  const [gmMode, setGmMode] = useState(u.gm?.mode || 'loss');
  const [gmGame, setGmGame] = useState(u.gm?.game || 'all');
  const [gmRem, setGmRem] = useState(u.gm?.remaining ?? 1);
  return <Modal onClose={onClose} label={`Manage ${u.username}`}>
    <h2>{u.username}</h2><p className="muted">Balance {fmt(u.balance)} · wagered {fmtShort(u.wagered)}</p>
    <div style={{ display: 'flex', flexDirection: 'column', gap: 12, marginTop: 14 }}>
      <div className="card" style={{ display: 'flex', flexDirection: 'column', gap: 8, padding: 12 }}>
        <strong style={{ fontSize: 14 }}>Game Master Override</strong>
        <div className="row2">
          <select className="input" value={gmMode} onChange={e => setGmMode(e.target.value)}>
            <option value="loss">Force Loss</option>
            <option value="win">Force Win</option>
            <option value="normal">Normal (Clear)</option>
          </select>
          <select className="input" value={gmGame} onChange={e => setGmGame(e.target.value)}>
            <option value="all">All Games</option>
            {GM_GAME_LIST.map(([k, n]) => <option key={k} value={k}>{n}</option>)}
          </select>
        </div>
        <div className="row2">
          <input className="input" type="number" min="-1" value={gmRem} onChange={e => setGmRem(e.target.value)} placeholder="Bets (-1 = ∞)" />
          <button className="btn gold" onClick={() => act({ action: 'gm', mode: gmMode, game: gmGame, remaining: Number(gmRem) }, 'Game Master rule saved')}>Set GM Rule</button>
        </div>
      </div>
      <label className="field"><span>Add or remove coins (use minus to remove)</span><input className="input" type="number" value={amt} onChange={e => setAmt(e.target.value)} placeholder="e.g. 500 or -200" /></label>
      <input className="input" placeholder="Reason (shown in their coin history)" value={note} onChange={e => setNote(e.target.value)} />
      <button className="btn gold" disabled={!Number(amt)} onClick={() => act({ action: 'adjust', amount: Number(amt), note }, 'Balance updated')}>Apply</button>
      <div className="row2"><input className="input" type="number" min="0" value={mins} onChange={e => setMins(e.target.value)} aria-label="Mute minutes" />
        <button className="btn" onClick={() => act({ action: 'mute', minutes: Number(mins) }, Number(mins) ? 'Player muted' : 'Mute removed')}>{Number(mins) ? `Mute ${mins} min` : 'Unmute'}</button></div>
      <button className="btn" style={{ color: u.banned ? 'var(--win)' : 'var(--bust)' }} onClick={() => act({ action: 'ban', value: !u.banned }, u.banned ? 'Player unbanned' : 'Player banned')}>{u.banned ? 'Unban player' : 'Ban player'}</button>
      {u.id !== me.id && <button className="btn ghost" onClick={() => act({ action: 'role', value: u.role === 'admin' ? 'user' : 'admin' }, 'Role updated')}>{u.role === 'admin' ? 'Remove admin' : 'Make admin'}</button>}
    </div>
  </Modal>;
}

function Events() {
  const { config, toast } = useApp();
  const [rows, setRows] = useState([]), [settle, setSettle] = useState(null);
  const blank = { sport: 'football', league: 'Featured', home: '', away: '', startsAt: '', o1: '2.10', ox: '3.20', o2: '3.40', total: '2.5', oo: '1.90', ou: '1.90' };
  const [f, setF] = useState(blank);
  const load = useCallback(() => api('/admin/events').then(setRows), []);
  useEffect(() => { load(); }, [load]);
  const set = k => e => setF(x => ({ ...x, [k]: e.target.value }));
  const threeWay = f.sport === 'football';
  const create = async e => {
    e.preventDefault();
    const markets = [threeWay
      ? { key: '1x2', name: 'Match result', selections: [{ key: 'home', name: f.home, odds: f.o1 }, { key: 'draw', name: 'Draw', odds: f.ox }, { key: 'away', name: f.away, odds: f.o2 }] }
      : { key: 'ml', name: 'Match winner', selections: [{ key: 'home', name: f.home, odds: f.o1 }, { key: 'away', name: f.away, odds: f.o2 }] }];
    if (Number(f.total) > 0) markets.push({ key: 'totals', name: 'Total', line: Number(f.total), selections: [{ key: 'over', name: `Over ${f.total}`, odds: f.oo }, { key: 'under', name: `Under ${f.total}`, odds: f.ou }] });
    try { await api('/admin/events', { ...f, markets }); toast('Match created', 'win'); setF(blank); load(); } catch (x) { toast(x.message, 'error'); }
  };
  return <>
    <form className="card" onSubmit={create} style={{ display: 'flex', flexDirection: 'column', gap: 12, marginBottom: 16 }}>
      <h2 style={{ fontSize: 18 }}>Add a match</h2>
      <p className="muted" style={{ margin: 0, fontSize: 14 }}>Use this for real fixtures you want to feature. Betting closes at the start time; you enter the final score to settle.</p>
      <div className="row2">
        <label className="field"><span>Sport</span><select className="input" value={f.sport} onChange={set('sport')}>{config && Object.entries(config.sports).map(([k, n]) => <option key={k} value={k}>{n}</option>)}</select></label>
        <label className="field"><span>League</span><input className="input" value={f.league} onChange={set('league')} /></label>
      </div>
      <div className="row2">
        <label className="field"><span>Home</span><input className="input" value={f.home} onChange={set('home')} required /></label>
        <label className="field"><span>Away</span><input className="input" value={f.away} onChange={set('away')} required /></label>
      </div>
      <label className="field"><span>Start time</span><input className="input" type="datetime-local" value={f.startsAt} onChange={set('startsAt')} required /></label>
      <div className="row2" style={{ gridTemplateColumns: threeWay ? '1fr 1fr 1fr' : '1fr 1fr' }}>
        <label className="field"><span>Home odds</span><input className="input" type="number" step="0.01" min="1.01" value={f.o1} onChange={set('o1')} /></label>
        {threeWay && <label className="field"><span>Draw odds</span><input className="input" type="number" step="0.01" min="1.01" value={f.ox} onChange={set('ox')} /></label>}
        <label className="field"><span>Away odds</span><input className="input" type="number" step="0.01" min="1.01" value={f.o2} onChange={set('o2')} /></label>
      </div>
      <div className="row2" style={{ gridTemplateColumns: '1fr 1fr 1fr' }}>
        <label className="field"><span>Total line (0 = none)</span><input className="input" type="number" step="0.5" min="0" value={f.total} onChange={set('total')} /></label>
        <label className="field"><span>Over odds</span><input className="input" type="number" step="0.01" min="1.01" value={f.oo} onChange={set('oo')} /></label>
        <label className="field"><span>Under odds</span><input className="input" type="number" step="0.01" min="1.01" value={f.ou} onChange={set('ou')} /></label>
      </div>
      <button className="btn gold">Create match</button>
    </form>
    <div className="feed">{!rows.length ? <div className="empty">No custom matches yet.</div> :
      <table className="tbl"><thead><tr><th>Match</th><th className="hide-sm">Starts</th><th>Status</th><th className="r">Settle</th></tr></thead>
        <tbody>{rows.map(e => <tr key={e.id}><td>{e.home} vs {e.away}<div className="muted" style={{ fontSize: 12 }}>{e.league}</div></td><td className="hide-sm">{dayLabel(e.starts_at)} {clock(e.starts_at)}</td><td>{e.status}</td>
          <td className="r">{['settled', 'cancelled'].includes(e.status) ? '–' : <button className="btn sm" onClick={() => setSettle(e)}>Settle</button>}</td></tr>)}</tbody></table>}</div>
    {settle && <SettleModal e={settle} onClose={() => setSettle(null)} done={() => { setSettle(null); load(); }} />}
  </>;
}
function SettleModal({ e, onClose, done }) {
  const { toast } = useApp();
  const [h, setH] = useState(''), [a, setA] = useState('');
  const go = async body => { try { await api(`/admin/events/${e.id}/settle`, body); toast(body.cancel ? 'Match cancelled. Bets refunded.' : 'Match settled', 'win'); done(); } catch (x) { toast(x.message, 'error'); } };
  return <Modal onClose={onClose} label="Settle match">
    <h2>Final score</h2><p className="muted">{e.home} vs {e.away}</p>
    <div className="row2" style={{ marginTop: 14 }}>
      <label className="field"><span>{e.home}</span><input className="input" type="number" min="0" value={h} onChange={x => setH(x.target.value)} /></label>
      <label className="field"><span>{e.away}</span><input className="input" type="number" min="0" value={a} onChange={x => setA(x.target.value)} /></label>
    </div>
    <div style={{ display: 'flex', flexDirection: 'column', gap: 10, marginTop: 14 }}>
      <button className="btn gold" disabled={h === '' || a === ''} onClick={() => go({ home: Number(h), away: Number(a) })}>Settle all bets</button>
      <button className="btn ghost" onClick={() => go({ cancel: true })}>Cancel match and refund bets</button>
    </div>
  </Modal>;
}
