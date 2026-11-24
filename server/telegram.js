import { db, getSetting } from './db.js';
import { TELEGRAM_BOT_TOKEN, TELEGRAM_ADMIN_ID, WEBAPP_URL, CENTS } from './config.js';
import { bus, toUser } from './bus.js';
import * as payments from './payments.js';
import { move } from './wallet.js';

let offset = 0;
let running = false;

async function tg(method, body = {}) {
  if (!TELEGRAM_BOT_TOKEN) return null;
  try {
    const res = await fetch(`https://api.telegram.org/bot${TELEGRAM_BOT_TOKEN}/${method}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
      signal: AbortSignal.timeout(25_000)
    });
    return await res.json();
  } catch {
    return null;
  }
}

function getAdminChatId() {
  return (getSetting('telegram_admin_id', '') || TELEGRAM_ADMIN_ID).trim();
}

export async function notifyAdmin(text, reply_markup = undefined) {
  const chatId = getAdminChatId();
  if (!chatId || !TELEGRAM_BOT_TOKEN) return;
  await tg('sendMessage', { chat_id: chatId, text, parse_mode: 'HTML', reply_markup });
}

async function handleMessage(msg) {
  const chatId = String(msg.chat.id);
  const text = (msg.text || '').trim();
  const isAdmin = chatId === getAdminChatId();
  const channelUrl = getSetting('tg_channel_url', 'https://t.me/TumblePlayBot');

  if (text.startsWith('/start')) {
    const refParam = text.split(' ')[1] || '';
    const appUrl = refParam ? `${WEBAPP_URL}/?ref=${encodeURIComponent(refParam)}` : WEBAPP_URL;
    await tg('sendMessage', {
      chat_id: chatId,
      parse_mode: 'HTML',
      text: `🎮 <b>Welcome to TumblePlay!</b>\n\nPlay <b>Aviator</b>, <b>European Roulette</b>, Mines, Plinko & more right inside Telegram.\n\n🎁 <b>Welcome Bonus:</b> 50 Coins\n📅 <b>Daily Login Bonus:</b> +10 Coins every 24h\n🤝 <b>Verified Referral Bonus:</b> +50 Coins per friend`,
      reply_markup: {
        inline_keyboard: [
          [{ text: '🚀 Play TumblePlay (Mini App)', web_app: { url: appUrl } }],
          [{ text: '📢 Join Official Community', url: channelUrl }]
        ]
      }
    });
    return;
  }

  if (text === '/myid') {
    await tg('sendMessage', { chat_id: chatId, text: `Your Telegram ID: ${chatId}` });
    return;
  }

  if (text === '/stats' && isAdmin) {
    const users = db.prepare('SELECT COUNT(*) AS n FROM users').get().n;
    const pDep = db.prepare("SELECT COUNT(*) AS n FROM deposits WHERE status='pending'").get().n;
    const pWdr = db.prepare("SELECT COUNT(*) AS n FROM withdrawals WHERE status='pending'").get().n;
    const pRef = db.prepare("SELECT COUNT(*) AS n FROM referrals WHERE status='pending'").get().n;
    await tg('sendMessage', {
      chat_id: chatId,
      parse_mode: 'HTML',
      text: `📊 <b>TumblePlay Live Stats</b>\n\n👥 Total Players: <b>${users}</b>\n⏳ Pending Deposits: <b>${pDep}</b>\n💸 Pending Withdrawals: <b>${pWdr}</b>\n🤝 Pending Referrals: <b>${pRef}</b>`
    });
    return;
  }

  if (text.startsWith('/credit ') && isAdmin) {
    const [, uname, amtStr] = text.split(/\s+/);
    const amt = Number(amtStr);
    const u = db.prepare('SELECT * FROM users WHERE LOWER(username)=LOWER(?)').get(uname || '');
    if (!u || !Number.isFinite(amt)) {
      await tg('sendMessage', { chat_id: chatId, text: 'Usage: /credit <username> <coins>' });
      return;
    }
    const bal = move(u.id, Math.round(amt * CENTS), 'admin', 'Telegram Admin Credit');
    toUser(u.id, 'balance', { balance: bal / CENTS });
    await tg('sendMessage', { chat_id: chatId, text: `✅ Updated ${u.username} by ${amt} coins. New balance: ${bal / CENTS}` });
    return;
  }

  if (text.startsWith('/gm ') && isAdmin) {
    const [, uname, mode] = text.split(/\s+/);
    const u = db.prepare('SELECT * FROM users WHERE LOWER(username)=LOWER(?)').get(uname || '');
    if (!u || !['normal', 'win', 'loss'].includes(mode)) {
      await tg('sendMessage', { chat_id: chatId, text: 'Usage: /gm <username> <normal|win|loss>' });
      return;
    }
    db.prepare(`INSERT INTO gm_overrides(user_id,mode,game,remaining,updated_at) VALUES (?,?,'all',-1,?)
      ON CONFLICT(user_id) DO UPDATE SET mode=excluded.mode, updated_at=excluded.updated_at`).run(u.id, mode, Date.now());
    await tg('sendMessage', { chat_id: chatId, text: `🎯 Game Master for ${u.username} set to: ${mode.toUpperCase()}` });
    return;
  }

  if (text.startsWith('/broadcast ') && isAdmin) {
    const body = text.slice('/broadcast '.length).trim();
    const tgUsers = db.prepare('SELECT tg_id FROM users WHERE tg_id IS NOT NULL').all();
    let sent = 0;
    for (const row of tgUsers) {
      const r = await tg('sendMessage', { chat_id: row.tg_id, text: `📢 <b>TumblePlay Announcement</b>\n\n${body}`, parse_mode: 'HTML' });
      if (r?.ok) sent++;
    }
    await tg('sendMessage', { chat_id: chatId, text: `✅ Broadcast delivered to ${sent}/${tgUsers.length} Telegram players.` });
  }
}

async function handleCallback(cb) {
  const chatId = String(cb.message.chat.id);
  if (chatId !== getAdminChatId()) {
    await tg('answerCallbackQuery', { callback_query_id: cb.id, text: 'Admin only', show_alert: true });
    return;
  }
  const [action, idStr] = String(cb.data || '').split(':');
  const id = Number(idStr);
  try {
    if (action === 'dep_ok') {
      const r = payments.approveDeposit(id, 'tg-admin');
      await tg('answerCallbackQuery', { callback_query_id: cb.id, text: `Approved +${r.coins} coins` });
      await tg('editMessageText', { chat_id: chatId, message_id: cb.message.message_id, text: `${cb.message.text}\n\n✅ <b>APPROVED via Telegram (+${r.coins} Coins)</b>`, parse_mode: 'HTML' });
    } else if (action === 'dep_no') {
      payments.rejectDeposit(id, 'tg-admin', 'Rejected via Telegram');
      await tg('answerCallbackQuery', { callback_query_id: cb.id, text: 'Deposit Rejected' });
      await tg('editMessageText', { chat_id: chatId, message_id: cb.message.message_id, text: `${cb.message.text}\n\n❌ <b>REJECTED via Telegram</b>`, parse_mode: 'HTML' });
    } else if (action === 'wdr_ok') {
      payments.approveWithdrawal(id, 'tg-admin', 'Approved via Telegram');
      await tg('answerCallbackQuery', { callback_query_id: cb.id, text: 'Withdrawal Approved' });
      await tg('editMessageText', { chat_id: chatId, message_id: cb.message.message_id, text: `${cb.message.text}\n\n✅ <b>WITHDRAWAL APPROVED via Telegram</b>`, parse_mode: 'HTML' });
    } else if (action === 'wdr_no') {
      const r = payments.rejectWithdrawal(id, 'tg-admin', 'Rejected via Telegram');
      await tg('answerCallbackQuery', { callback_query_id: cb.id, text: `Rejected & Refunded ${r.refunded}` });
      await tg('editMessageText', { chat_id: chatId, message_id: cb.message.message_id, text: `${cb.message.text}\n\n❌ <b>REJECTED & REFUNDED (${r.refunded} Coins)</b>`, parse_mode: 'HTML' });
    }
  } catch (e) {
    await tg('answerCallbackQuery', { callback_query_id: cb.id, text: e.message || 'Action failed', show_alert: true });
  }
}

async function poll() {
  if (!running) return;
  const res = await tg('getUpdates', { offset, timeout: 20, allowed_updates: ['message', 'callback_query'] });
  if (res?.ok && Array.isArray(res.result)) {
    for (const u of res.result) {
      offset = u.update_id + 1;
      if (u.message) await handleMessage(u.message);
      if (u.callback_query) await handleCallback(u.callback_query);
    }
  }
  if (running) setTimeout(poll, 1000);
}

export function startBot() {
  if (!TELEGRAM_BOT_TOKEN || running) return;
  running = true;
  bus.on('admin:deposit_new', ({ deposit, username }) => {
    notifyAdmin(
      `💰 <b>New Deposit Request (${deposit.order_code})</b>\n👤 Player: <b>${username}</b>\n💳 Method: <b>${deposit.method}</b>\n💵 Amount: <b>${deposit.pay_amount} ${deposit.pay_currency}</b> → <b>${deposit.coins} Coins</b>\n🔑 Ref/Code: <code>${deposit.reference}</code>`,
      { inline_keyboard: [[{ text: '✅ Approve', callback_data: `dep_ok:${deposit.id}` }, { text: '❌ Reject', callback_data: `dep_no:${deposit.id}` }]] }
    );
  });
  bus.on('admin:withdrawal_new', ({ withdrawal, username }) => {
    notifyAdmin(
      `💸 <b>New Withdrawal Request (${withdrawal.order_code})</b>\n👤 Player: <b>${username}</b>\n💳 Method: <b>${withdrawal.method}</b>\n💵 Amount: <b>₹${withdrawal.inr_amount}</b> (${withdrawal.coins} Coins)\n📬 Dest: <code>${withdrawal.destination}</code>`,
      { inline_keyboard: [[{ text: '✅ Approve Paid', callback_data: `wdr_ok:${withdrawal.id}` }, { text: '❌ Reject & Refund', callback_data: `wdr_no:${withdrawal.id}` }]] }
    );
  });
  poll();
  console.log('[Telegram] @TumblePlayBot polling started.');
}
