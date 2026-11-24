import crypto from 'node:crypto';
import { db, tx, getSetting, setSetting, scheduleSync } from './db.js';
import { move } from './wallet.js';
import { AppError } from './util.js';
import { CENTS, NOWPAYMENTS_API_KEY, NOWPAYMENTS_IPN_SECRET } from './config.js';
import { bus, toUser } from './bus.js';
import { autoVerifyReferralOnDeposit } from './rewards.js';

const orderCode = pfx => `${pfx}-${crypto.randomBytes(3).toString('hex').toUpperCase()}`;

export function getWalletSettings() {
  return {
    brandName: getSetting('wallet_brand_name', 'TumblePlay'),
    coinsPerInr: Number(getSetting('coins_per_inr', '1')) || 1,
    usdtRateInr: Number(getSetting('usdt_rate_inr', '85')) || 85,
    minDepositInr: Number(getSetting('min_deposit_inr', '100')) || 100,
    maxDepositInr: Number(getSetting('max_deposit_inr', '2000')) || 2000,
    minWithdrawInr: Number(getSetting('min_withdraw_inr', '100')) || 100,
    maxWithdrawInr: Number(getSetting('max_withdraw_inr', '10000')) || 10000,
    enableAmazonGc: getSetting('enable_amazon_gc', '1') !== '0',
    enableBinanceCrypto: getSetting('enable_binance_crypto', '1') !== '0',
    enableBinanceGc: getSetting('enable_binance_gc', '1') !== '0',
    enableNowPayments: getSetting('enable_nowpayments', '0') === '1' && Boolean(NOWPAYMENTS_API_KEY),
    requireDepositToWithdraw: getSetting('require_deposit_to_withdraw', '0') === '1',
    binancePayId: getSetting('binance_pay_id', ''),
    usdtBep20: getSetting('usdt_bep20', ''),
    usdtTon: getSetting('usdt_ton', ''),
    tgChannelUrl: getSetting('tg_channel_url', 'https://t.me/TumblePlayBot'),
    announcement: getSetting('site_announcement', ''),
    maintenanceMode: getSetting('maintenance_mode', '0') === '1'
  };
}

export function publicPaymentConfig() {
  const s = getWalletSettings();
  return {
    ...s,
    networks: [
      s.binancePayId ? { key: 'binance_pay', label: 'Binance Pay ID (₹0 Fee)', address: s.binancePayId, minUsdt: 1 } : null,
      s.usdtBep20 ? { key: 'usdt_bep20', label: 'USDT (BEP20 · ~₹1 Fee)', address: s.usdtBep20, minUsdt: 1 } : null,
      s.usdtTon ? { key: 'usdt_ton', label: 'USDT (TON · ~₹1 Fee)', address: s.usdtTon, minUsdt: 1 } : null
    ].filter(Boolean)
  };
}

export function saveWalletSettings(body = {}) {
  const map = {
    brandName: 'wallet_brand_name',
    coinsPerInr: 'coins_per_inr',
    usdtRateInr: 'usdt_rate_inr',
    minDepositInr: 'min_deposit_inr',
    maxDepositInr: 'max_deposit_inr',
    minWithdrawInr: 'min_withdraw_inr',
    maxWithdrawInr: 'max_withdraw_inr',
    binancePayId: 'binance_pay_id',
    usdtBep20: 'usdt_bep20',
    usdtTon: 'usdt_ton',
    tgChannelUrl: 'tg_channel_url',
    announcement: 'site_announcement'
  };
  for (const [k, dbk] of Object.entries(map)) {
    if (body[k] !== undefined) setSetting(dbk, String(body[k]).trim());
  }
  const bools = {
    enableAmazonGc: 'enable_amazon_gc',
    enableBinanceCrypto: 'enable_binance_crypto',
    enableBinanceGc: 'enable_binance_gc',
    enableNowPayments: 'enable_nowpayments',
    requireDepositToWithdraw: 'require_deposit_to_withdraw',
    maintenanceMode: 'maintenance_mode'
  };
  for (const [k, dbk] of Object.entries(bools)) {
    if (body[k] !== undefined) setSetting(dbk, body[k] ? '1' : '0');
  }
  return getWalletSettings();
}

export function myDeposits(user) {
  return db.prepare('SELECT * FROM deposits WHERE user_id=? ORDER BY id DESC LIMIT 50').all(user.id);
}

export function myWithdrawals(user) {
  return db.prepare('SELECT * FROM withdrawals WHERE user_id=? ORDER BY id DESC LIMIT 50').all(user.id);
}

export function submitDeposit(user, body = {}) {
  const s = getWalletSettings();
  const method = String(body.method || '').trim();
  const amount = Number(body.amount);
  let ref = String(body.reference || '').trim().toUpperCase();

  if (!['amazon_gc', 'binance_pay', 'usdt_bep20', 'usdt_ton', 'binance_gc'].includes(method)) {
    throw new AppError('Invalid deposit method');
  }
  if (!Number.isFinite(amount) || amount <= 0) throw new AppError('Enter a valid deposit amount');

  let payCurrency = 'INR';
  let coins = 0;

  if (method === 'amazon_gc') {
    if (!s.enableAmazonGc) throw new AppError('Amazon Pay Gift Card deposits are currently disabled');
    if (amount < s.minDepositInr || amount > s.maxDepositInr) {
      throw new AppError(`Amazon Gift Card deposits must be between ₹${s.minDepositInr} and ₹${s.maxDepositInr}`);
    }
    const clean = ref.replace(/[^A-Z0-9]/g, '');
    if (/^6014\d{12}$/.test(clean)) {
      throw new AppError('That looks like a 16-digit Reference ID (6014...). Please paste the 14-character Claim Code (XXXX-XXXXXX-XXXX).');
    }
    if (clean.length !== 14) {
      throw new AppError('Amazon Pay Claim Code must be exactly 14 characters (e.g., XXXX-XXXXXX-XXXX)');
    }
    ref = `${clean.slice(0, 4)}-${clean.slice(4, 10)}-${clean.slice(10, 14)}`;
    coins = Math.round(amount * s.coinsPerInr);
  } else if (method === 'binance_gc') {
    if (!s.enableBinanceGc) throw new AppError('Binance Gift Card deposits are currently disabled');
    const clean = ref.replace(/[^A-Z0-9]/g, '');
    if (clean.length !== 16) throw new AppError('Binance Gift Card code must be exactly 16 characters');
    ref = clean;
    payCurrency = 'USDT';
    coins = Math.round(amount * s.usdtRateInr * s.coinsPerInr);
  } else {
    if (!s.enableBinanceCrypto) throw new AppError('Crypto deposits are currently disabled');
    if (amount < 1) throw new AppError('Minimum crypto deposit is 1 USDT (~₹85–₹100)');
    if (ref.length < 6) throw new AppError('Please enter your valid Binance Order ID or Transaction Hash (TxHash)');
    payCurrency = 'USDT';
    coins = Math.round(amount * s.usdtRateInr * s.coinsPerInr);
  }

  if (db.prepare('SELECT 1 FROM deposits WHERE UPPER(reference)=UPPER(?)').get(ref)) {
    throw new AppError('This code / transaction reference has already been submitted');
  }

  const code = orderCode('DEP');
  const now = Date.now();
  const info = db.prepare(`
    INSERT INTO deposits(order_code, user_id, method, network, pay_amount, pay_currency, coins, reference, status, created_at)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, 'pending', ?)
  `).run(code, user.id, method, method, amount, payCurrency, coins, ref, now);

  scheduleSync(true);
  const row = db.prepare('SELECT * FROM deposits WHERE id=?').get(info.lastInsertRowid);
  bus.emit('admin:deposit_new', { deposit: row, username: user.username });
  return row;
}

export function approveDeposit(depositId, adminName = 'admin', overrideCoins = null) {
  return tx(() => {
    const d = db.prepare('SELECT * FROM deposits WHERE id=?').get(depositId);
    if (!d) throw new AppError('Deposit not found', 404);
    if (d.status !== 'pending') throw new AppError(`Deposit is already ${d.status}`);
    const finalCoins = overrideCoins != null && Number(overrideCoins) > 0 ? Math.round(Number(overrideCoins)) : d.coins;
    const bal = move(d.user_id, Math.round(finalCoins * CENTS), 'deposit', `${d.order_code} (${d.method})`);
    db.prepare("UPDATE deposits SET status='approved', coins=?, reviewed_by=?, reviewed_at=? WHERE id=?")
      .run(finalCoins, adminName, Date.now(), d.id);
    toUser(d.user_id, 'balance', { balance: bal / CENTS });
    try { autoVerifyReferralOnDeposit(d.user_id); } catch {}
    scheduleSync(true);
    return { ok: true, id: d.id, coins: finalCoins, balance: bal / CENTS };
  })();
}

export function rejectDeposit(depositId, adminName = 'admin', note = '') {
  const d = db.prepare('SELECT * FROM deposits WHERE id=?').get(depositId);
  if (!d) throw new AppError('Deposit not found', 404);
  if (d.status !== 'pending') throw new AppError(`Deposit is already ${d.status}`);
  db.prepare("UPDATE deposits SET status='rejected', admin_note=?, reviewed_by=?, reviewed_at=? WHERE id=?")
    .run(String(note || 'Rejected by Admin').slice(0, 200), adminName, Date.now(), d.id);
  scheduleSync(true);
  return { ok: true, id: d.id };
}

/* ---------- Withdrawals (Admin Approval Only + Instant Coin Lock) ---------- */
export function submitWithdrawal(user, body = {}) {
  return tx(() => {
    const s = getWalletSettings();
    const method = String(body.method || 'amazon_gc').trim();
    const inrAmount = Number(body.amount);
    const destination = String(body.destination || '').trim();

    if (!['amazon_gc', 'binance_pay', 'usdt_bep20', 'usdt_ton'].includes(method)) {
      throw new AppError('Invalid withdrawal method');
    }
    if (!Number.isFinite(inrAmount) || inrAmount < s.minWithdrawInr || inrAmount > s.maxWithdrawInr) {
      throw new AppError(`Withdrawal must be between ₹${s.minWithdrawInr} and ₹${s.maxWithdrawInr}`);
    }
    if (!destination || destination.length < 3) {
      throw new AppError('Enter your payout destination (Email/Phone for Amazon Gift Card, or Binance Pay ID / Wallet Address)');
    }
    if (s.requireDepositToWithdraw) {
      const hasDep = db.prepare("SELECT 1 FROM deposits WHERE user_id=? AND status='approved' LIMIT 1").get(user.id);
      if (!hasDep) throw new AppError('At least 1 approved deposit is required before your first withdrawal');
    }

    const coins = Math.round(inrAmount * s.coinsPerInr);
    const cents = Math.round(coins * CENTS);
    const fresh = db.prepare('SELECT balance FROM users WHERE id=?').get(user.id);
    if (!fresh || fresh.balance < cents) throw new AppError('Insufficient balance for this withdrawal');

    const code = orderCode('WDR');
    const bal = move(user.id, -cents, 'withdraw_lock', `Withdrawal Lock ${code}`);
    const cryptoAmt = method === 'amazon_gc' ? null : Number((inrAmount / s.usdtRateInr).toFixed(2));
    const info = db.prepare(`
      INSERT INTO withdrawals(order_code, user_id, method, network, destination, inr_amount, crypto_amount, coins, status, created_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, 'pending', ?)
    `).run(code, user.id, method, method, destination, inrAmount, cryptoAmt, coins, Date.now());

    toUser(user.id, 'balance', { balance: bal / CENTS });
    scheduleSync(true);
    const row = db.prepare('SELECT * FROM withdrawals WHERE id=?').get(info.lastInsertRowid);
    bus.emit('admin:withdrawal_new', { withdrawal: row, username: user.username });
    return row;
  })();
}

export function approveWithdrawal(id, adminName = 'admin', payoutRef = '') {
  const w = db.prepare('SELECT * FROM withdrawals WHERE id=?').get(id);
  if (!w) throw new AppError('Withdrawal not found', 404);
  if (w.status !== 'pending') throw new AppError(`Withdrawal is already ${w.status}`);
  db.prepare("UPDATE withdrawals SET status='approved', payout_ref=?, reviewed_by=?, reviewed_at=? WHERE id=?")
    .run(String(payoutRef || 'Paid by Admin').slice(0, 200), adminName, Date.now(), w.id);
  scheduleSync(true);
  return { ok: true, id: w.id };
}

export function rejectWithdrawal(id, adminName = 'admin', note = '') {
  return tx(() => {
    const w = db.prepare('SELECT * FROM withdrawals WHERE id=?').get(id);
    if (!w) throw new AppError('Withdrawal not found', 404);
    if (w.status !== 'pending') throw new AppError(`Withdrawal is already ${w.status}`);
    const bal = move(w.user_id, Math.round(w.coins * CENTS), 'withdraw_refund', `Refund ${w.order_code}`);
    db.prepare("UPDATE withdrawals SET status='rejected', admin_note=?, reviewed_by=?, reviewed_at=? WHERE id=?")
      .run(String(note || 'Rejected & Refunded').slice(0, 200), adminName, Date.now(), w.id);
    toUser(w.user_id, 'balance', { balance: bal / CENTS });
    scheduleSync(true);
    return { ok: true, id: w.id, refunded: w.coins };
  })();
}

export function handleNowPaymentsWebhook(req) {
  if (!NOWPAYMENTS_IPN_SECRET) throw new AppError('NOWPayments IPN secret not configured', 503);
  const sig = req.headers['x-nowpayments-sig'];
  const sorted = JSON.stringify(req.body, Object.keys(req.body || {}).sort());
  const expected = crypto.createHmac('sha512', NOWPAYMENTS_IPN_SECRET).update(sorted).digest('hex');
  if (sig !== expected) throw new AppError('Invalid NOWPayments signature', 401);
  const { payment_status, order_id, actually_paid } = req.body || {};
  if (payment_status === 'finished' && order_id) {
    const dep = db.prepare("SELECT * FROM deposits WHERE order_code=? AND status='pending'").get(order_id);
    if (dep) approveDeposit(dep.id, 'nowpayments-ipn');
  }
  return { ok: true, status: payment_status, paid: actually_paid };
}

// Backward-compatible legacy exports so existing Admin tabs keep working cleanly
export function getPaymentConfig() {
  const s = getWalletSettings();
  return {
    upiId: getSetting('upi_id', ''),
    upiName: getSetting('upi_name', s.brandName),
    inrRate: s.coinsPerInr,
    minInr: s.minDepositInr,
    maxInr: s.maxDepositInr,
    usdRate: s.usdtRateInr * s.coinsPerInr,
    minUsd: 1,
    maxUsd: 1000,
    upiEnabled: s.enableAmazonGc,
    cryptoEnabled: s.enableBinanceCrypto,
    wallets: [
      { id: 'binance_pay', label: 'Binance Pay ID (₹0 Fee)', address: s.binancePayId },
      { id: 'usdt_bep20', label: 'USDT (BEP20)', address: s.usdtBep20 },
      { id: 'usdt_ton', label: 'USDT (TON)', address: s.usdtTon }
    ]
  };
}

export function savePaymentConfig(body = {}) {
  if (body.upiId !== undefined) setSetting('upi_id', String(body.upiId).trim());
  if (body.upiName !== undefined) setSetting('upi_name', String(body.upiName).trim());
  if (body.inrRate !== undefined) setSetting('coins_per_inr', Number(body.inrRate) || 1);
  if (body.minInr !== undefined) setSetting('min_deposit_inr', Number(body.minInr) || 100);
  if (body.maxInr !== undefined) setSetting('max_deposit_inr', Number(body.maxInr) || 2000);
  if (body.usdRate !== undefined) {
    const inrRate = Number(body.inrRate) || Number(getSetting('coins_per_inr', '1')) || 1;
    setSetting('usdt_rate_inr', Math.max(1, Math.round((Number(body.usdRate) || 85) / inrRate)));
  }
  if (body.upiEnabled !== undefined) setSetting('enable_amazon_gc', body.upiEnabled ? '1' : '0');
  if (body.cryptoEnabled !== undefined) setSetting('enable_binance_crypto', body.cryptoEnabled ? '1' : '0');
  if (Array.isArray(body.wallets)) {
    for (const w of body.wallets) {
      if (w.id === 'binance_pay') setSetting('binance_pay_id', String(w.address || '').trim());
      if (w.id === 'usdt_bep20') setSetting('usdt_bep20', String(w.address || '').trim());
      if (w.id === 'usdt_ton') setSetting('usdt_ton', String(w.address || '').trim());
    }
  }
  return getPaymentConfig();
}
export function adminListDeposits(status = 'pending') {
  const where = status && status !== 'all' ? 'WHERE d.status=?' : '';
  const sql = `SELECT d.*, u.username FROM deposits d JOIN users u ON u.id = d.user_id ${where} ORDER BY d.id DESC LIMIT 150`;
  const rows = (where ? db.prepare(sql).all(status) : db.prepare(sql).all()).map(d => ({
    id: d.id, orderCode: d.order_code, username: d.username, method: d.method, network: d.network || d.method,
    payAmount: d.pay_amount, payCurrency: d.pay_currency, coins: d.coins, reference: d.reference,
    status: d.status, reviewedBy: d.reviewed_by, createdAt: d.created_at
  }));
  const pendingCount = db.prepare("SELECT COUNT(*) n FROM deposits WHERE status='pending'").get().n;
  const totalInr = db.prepare("SELECT COALESCE(SUM(pay_amount),0) s FROM deposits WHERE status='approved' AND pay_currency='INR'").get().s;
  const totalUsd = db.prepare("SELECT COALESCE(SUM(pay_amount),0) s FROM deposits WHERE status='approved' AND pay_currency!='INR'").get().s;
  return { rows, summary: { pendingCount, totalInr, totalUsd } };
}
export function reviewDeposit(adminUser, id, body = {}) {
  return body.decision === 'approve'
    ? approveDeposit(Number(id), adminUser.username, body.coins)
    : rejectDeposit(Number(id), adminUser.username, body.note);
}
