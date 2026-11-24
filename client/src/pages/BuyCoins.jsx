import { useState, useEffect, useCallback } from 'react';
import { api } from '../lib/api.js';
import { useApp } from '../lib/store.jsx';
import { Coin } from '../components/common.jsx';

export default function BuyCoins() {
  const { user, setAuthOpen, toast, refresh } = useApp();
  const [tab, setTab] = useState('amazon');
  const [cfg, setCfg] = useState(null);
  const [deps, setDeps] = useState([]);
  const [wdrs, setWdrs] = useState([]);
  const [refs, setRefs] = useState(null);

  const [amount, setAmount] = useState('500');
  const [reference, setReference] = useState('');
  const [cryptoNet, setCryptoNet] = useState('binance_pay');
  const [wMethod, setWMethod] = useState('amazon_gc');
  const [wAmount, setWAmount] = useState('500');
  const [wDest, setWDest] = useState('');
  const [promo, setPromo] = useState('');
  const [busy, setBusy] = useState(false);

  const load = useCallback(() => {
    api('/payments/config').then(setCfg).catch(() => {});
    if (user) {
      api('/payments/my').then(setDeps).catch(() => {});
      api('/wallet/withdrawals').then(setWdrs).catch(() => {});
      api('/referrals/my').then(setRefs).catch(() => {});
    }
  }, [user]);
  useEffect(() => { load(); }, [load]);

  const submitDep = async method => {
    if (!user) return setAuthOpen('login');
    setBusy(true);
    try {
      await api('/payments/submit', { method, amount: Number(amount), reference });
      toast('Deposit submitted for Admin approval!', 'win');
      setReference('');
      load();
    } catch (e) { toast(e.message, 'error'); }
    setBusy(false);
  };

  const submitWithdraw = async () => {
    if (!user) return setAuthOpen('login');
    setBusy(true);
    try {
      await api('/wallet/withdraw', { method: wMethod, amount: Number(wAmount), destination: wDest });
      toast('Withdrawal requested! Coins locked pending Admin approval.', 'win');
      setWDest('');
      refresh(); load();
    } catch (e) { toast(e.message, 'error'); }
    setBusy(false);
  };

  const claimDaily = async () => {
    if (!user) return setAuthOpen('login');
    try {
      const r = await api('/rewards/daily', {});
      toast(`Claimed +${r.claimed} Daily Login Coins!`, 'win');
      refresh();
    } catch (e) { toast(e.message, 'error'); }
  };

  const claimPromo = async () => {
    if (!user) return setAuthOpen('login');
    try {
      const r = await api('/promos/claim', { code: promo });
      toast(`Promo ${r.code} claimed: +${r.claimed} Coins!`, 'win');
      setPromo(''); refresh();
    } catch (e) { toast(e.message, 'error'); }
  };

  const copy = txt => { navigator.clipboard?.writeText(txt); toast('Copied!', 'win'); };
  const activeNet = cfg?.networks?.find(n => n.key === cryptoNet) || cfg?.networks?.[0];
  const refLink = user ? `${location.origin}/?ref=${user.refCode}` : '';

  return (
    <div className="page v3-wallet">
      <div className="v3-head">
        <div>
          <h1>TumblePlay Wallet</h1>
          <p className="muted">1:1 INR Rate (₹1 = {cfg?.coinsPerInr || 1} Coin) · 100% Admin-Approved Deposits &amp; Withdrawals</p>
        </div>
        {user && (
          <div className="v3-bal-pill">
            <span>Balance</span>
            <b>{user.balance.toLocaleString()} <Coin /></b>
          </div>
        )}
      </div>

      {cfg?.announcement && <div className="v3-banner">📢 {cfg.announcement}</div>}

      <div className="v3-tabs">
        <button className={tab === 'amazon' ? 'active' : ''} onClick={() => setTab('amazon')}>1. Amazon Pay Gift Card</button>
        <button className={tab === 'crypto' ? 'active' : ''} onClick={() => setTab('crypto')}>2. Binance Pay / Crypto</button>
        <button className={tab === 'binance_gc' ? 'active' : ''} onClick={() => setTab('binance_gc')}>3. Binance Gift Card</button>
        <button className={tab === 'withdraw' ? 'active' : ''} onClick={() => setTab('withdraw')}>Withdraw</button>
        <button className={tab === 'bonuses' ? 'active' : ''} onClick={() => setTab('bonuses')}>Daily +10 &amp; Referrals (+50)</button>
      </div>

      {tab === 'amazon' && (
        <div className="v3-card">
          <h3>Amazon Pay India e-Gift Card (₹{cfg?.minDepositInr || 100} – ₹{cfg?.maxDepositInr || 2000})</h3>
          <p className="muted">Buy an Amazon Pay e-Gift Card on Amazon.in and paste the <b>14-character Claim Code</b> (XXXX-XXXXXX-XXXX) below. Do not enter the 16-digit 6014 Reference ID.</p>
          <div className="v3-presets">
            {[100, 250, 500, 1000, 2000].map(v => (
              <button key={v} className={Number(amount) === v ? 'active' : ''} onClick={() => setAmount(String(v))}>₹{v}</button>
            ))}
          </div>
          <div className="v3-grid2">
            <label className="field"><span>Amount (₹ INR)</span><input className="input" type="number" value={amount} onChange={e => setAmount(e.target.value)} /></label>
            <label className="field"><span>14-Char Amazon Claim Code</span><input className="input" value={reference} onChange={e => setReference(e.target.value)} placeholder="XXXX-XXXXXX-XXXX" /></label>
          </div>
          <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap' }}>
            <button className="btn primary" disabled={busy} onClick={() => submitDep('amazon_gc')}>Submit Gift Card for Approval</button>
            <a className="btn" href="https://www.amazon.in/gp/buyagain/ref=gc_buy" target="_blank" rel="noreferrer">Buy Amazon Gift Card ↗</a>
          </div>
        </div>
      )}

      {tab === 'crypto' && (
        <div className="v3-card">
          <h3>Binance Pay ID &amp; Low-Fee USDT (BEP20 / TON) — Min $1 (~₹{cfg?.usdtRateInr || 85})</h3>
          <div className="v3-presets">
            {(cfg?.networks || []).map(n => (
              <button key={n.key} className={activeNet?.key === n.key ? 'active' : ''} onClick={() => setCryptoNet(n.key)}>{n.label}</button>
            ))}
          </div>
          {activeNet ? (
            <div className="v3-addr-box">
              <div><small>{activeNet.label}</small><br /><code>{activeNet.address}</code></div>
              <button className="btn" onClick={() => copy(activeNet.address)}>Copy</button>
            </div>
          ) : <p className="muted">Admin has not added a Binance Pay ID or BEP20/TON address yet.</p>}
          <div className="v3-grid2">
            <label className="field"><span>Amount Sent (USDT)</span><input className="input" type="number" step="0.1" value={amount} onChange={e => setAmount(e.target.value)} placeholder="e.g. 5" /></label>
            <label className="field"><span>Binance Order ID / TxHash</span><input className="input" value={reference} onChange={e => setReference(e.target.value)} placeholder="Paste Order ID or TxHash" /></label>
          </div>
          <button className="btn primary" disabled={busy || !activeNet} onClick={() => submitDep(activeNet.key)}>Submit Crypto Deposit</button>
        </div>
      )}

      {tab === 'binance_gc' && (
        <div className="v3-card">
          <h3>Binance USDT Gift Card (16-Char Code)</h3>
          <p className="muted">Paste your 16-character Binance USDT Gift Card code ($1 – $25+). Rate: 1 USDT = ₹{cfg?.usdtRateInr || 85}.</p>
          <div className="v3-grid2">
            <label className="field"><span>Voucher Value (USDT)</span><input className="input" type="number" step="0.5" value={amount} onChange={e => setAmount(e.target.value)} placeholder="e.g. 5" /></label>
            <label className="field"><span>16-Character Binance Code</span><input className="input" value={reference} onChange={e => setReference(e.target.value)} placeholder="16-char alphanumeric code" /></label>
          </div>
          <button className="btn primary" disabled={busy} onClick={() => submitDep('binance_gc')}>Submit Binance Gift Card</button>
        </div>
      )}

      {tab === 'withdraw' && (
        <div className="v3-card">
          <h3>Request Withdrawal (Admin Approval)</h3>
          <p className="muted">Coins lock immediately when submitted. If rejected, coins refund automatically to your wallet.</p>
          <div className="v3-grid2">
            <label className="field">
              <span>Payout Method</span>
              <select className="input" value={wMethod} onChange={e => setWMethod(e.target.value)}>
                <option value="amazon_gc">Amazon Pay e-Gift Card (INR)</option>
                <option value="binance_pay">Binance Pay ID (USDT)</option>
                <option value="usdt_bep20">USDT (BEP20)</option>
                <option value="usdt_ton">USDT (TON)</option>
              </select>
            </label>
            <label className="field"><span>Amount (₹ INR / Coins)</span><input className="input" type="number" value={wAmount} onChange={e => setWAmount(e.target.value)} /></label>
          </div>
          <label className="field" style={{ marginBottom: 12 }}>
            <span>Destination (Email/Phone for Amazon GC, or Binance Pay ID / Wallet Address)</span>
            <input className="input" value={wDest} onChange={e => setWDest(e.target.value)} placeholder="Enter destination..." />
          </label>
          <button className="btn primary" disabled={busy} onClick={submitWithdraw}>Request Withdrawal</button>
        </div>
      )}

      {tab === 'bonuses' && (
        <div className="v3-grid2">
          <div className="v3-card">
            <h3>📅 Daily Login Bonus (+10 Coins / 24h)</h3>
            <p className="muted">Log in once every 24 hours to claim your daily free coins.</p>
            <button className="btn primary" onClick={claimDaily}>Claim +10 Daily Coins</button>
            <hr style={{ borderColor: 'rgba(255,255,255,0.08)', margin: '18px 0' }} />
            <h3>🎟️ Promo / Drop Code</h3>
            <div style={{ display: 'flex', gap: 8 }}>
              <input className="input" value={promo} onChange={e => setPromo(e.target.value)} placeholder="Enter drop code (e.g. FLY25)" style={{ flex: 1 }} />
              <button className="btn primary" onClick={claimPromo}>Claim</button>
            </div>
          </div>
          <div className="v3-card">
            <h3>🤝 Verified Referral Program (+{refs?.bonusCoins || 50} Coins)</h3>
            <p className="muted">Share your unique link. You earn <b>+{refs?.bonusCoins || 50} Coins</b> for every verified friend!</p>
            {user && (
              <div className="v3-addr-box">
                <code style={{ fontSize: 12 }}>{refLink}</code>
                <button className="btn" onClick={() => copy(refLink)}>Copy Link</button>
              </div>
            )}
            <p className="muted">Verified Invites: <b>{refs?.verifiedCount || 0}</b> · Total Earned: <b>{refs?.totalEarned || 0} Coins</b></p>
            {(refs?.referrals || []).slice(0, 8).map(r => (
              <div key={r.id} className="v3-row">
                <span>{r.username}</span>
                <span className={`v3-st ${r.status}`}>{r.status.toUpperCase()} (+{r.bonus_coins})</span>
              </div>
            ))}
          </div>
        </div>
      )}

      {user && (
        <div className="v3-grid2" style={{ marginTop: 18 }}>
          <div className="v3-card">
            <h4>Recent Deposits</h4>
            {deps.length === 0 ? <p className="muted">No deposits yet.</p> : deps.slice(0, 8).map(d => (
              <div key={d.id} className="v3-row">
                <span><b>{d.order_code}</b> · {d.method} · {d.coins} Coins</span>
                <span className={`v3-st ${d.status}`}>{d.status}</span>
              </div>
            ))}
          </div>
          <div className="v3-card">
            <h4>Recent Withdrawals</h4>
            {wdrs.length === 0 ? <p className="muted">No withdrawals yet.</p> : wdrs.slice(0, 8).map(w => (
              <div key={w.id} className="v3-row">
                <span><b>{w.order_code}</b> · ₹{w.inr_amount} {w.payout_ref ? `(${w.payout_ref})` : ''}</span>
                <span className={`v3-st ${w.status}`}>{w.status}</span>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
