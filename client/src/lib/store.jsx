import { createContext, useContext, useEffect, useState, useCallback, useRef } from 'react';
import { api } from './api.js';
import { socket, resetSocket } from './socket.js';

const Ctx = createContext(null);
export const useApp = () => useContext(Ctx);

/* ---------- tiny router (History API) ---------- */
const listeners = new Set();
export function navigate(to, { replace } = {}) {
  if (to === location.pathname + location.search) return;
  history[replace ? 'replaceState' : 'pushState'](null, '', to);
  listeners.forEach(l => l());
  window.scrollTo(0, 0);
}
export function useRoute() {
  const [path, setPath] = useState(location.pathname);
  useEffect(() => {
    const on = () => setPath(location.pathname);
    listeners.add(on); addEventListener('popstate', on);
    return () => { listeners.delete(on); removeEventListener('popstate', on); };
  }, []);
  return path;
}
export function Link({ to, children, className, onClick, ...rest }) {
  return <a href={to} className={className} {...rest} onClick={e => {
    if (e.metaKey || e.ctrlKey || e.shiftKey || e.button) return;
    e.preventDefault(); onClick?.(e); navigate(to);
  }}>{children}</a>;
}

/* ---------- socket subscription hook ---------- */
export function useSocket(event, fn) {
  const ref = useRef(fn); ref.current = fn;
  useEffect(() => { const h = (...a) => ref.current(...a); socket.on(event, h); return () => socket.off(event, h); }, [event]);
}

export function AppProvider({ children }) {
  const [user, setUser] = useState(undefined); // undefined = loading, null = logged out
  const [config, setConfig] = useState(null);
  const [toasts, setToasts] = useState([]);
  const [authOpen, setAuthOpen] = useState(null); // 'login' | 'register' | null
  const [panel, setPanel] = useState(() => (innerWidth > 1280 ? 'chat' : null));
  const [slip, setSlip] = useState([]); // [{selectionId, odds, name, market, match, eventId}]
  const [online, setOnline] = useState(0);

  const toast = useCallback((text, kind = 'info') => {
    const id = Math.random();
    setToasts(t => [...t.slice(-3), { id, text, kind }]);
    setTimeout(() => setToasts(t => t.filter(x => x.id !== id)), 3200);
  }, []);
  const refresh = useCallback(() => api('/me').then(setUser).catch(() => setUser(null)), []);
  const setBalance = useCallback(b => setUser(u => (u && typeof b === 'number' ? { ...u, balance: b } : u)), []);

  useEffect(() => { refresh(); api('/config').then(setConfig); }, [refresh]);

  // Capture ?ref=CODE and auto-login inside Telegram Mini App
  useEffect(() => {
    const sp = new URLSearchParams(location.search);
    const ref = sp.get('ref');
    if (ref) { try { localStorage.setItem('tp_ref', ref.trim().toUpperCase()); } catch {} }
    const tg = window.Telegram?.WebApp;
    if (tg) {
      try { tg.ready(); tg.expand(); } catch {}
      if (tg.initData) {
        api('/auth/telegram', { initData: tg.initData })
          .then(u => { if (u) { setUser(u); resetSocket(); } })
          .catch(() => {});
      }
    }
  }, []);

  useSocket('balance', d => setBalance(d.balance));
  useSocket('vip:levelup', d => { toast(`You reached ${d.name}${d.reward ? ` and got ${d.reward.toLocaleString()} coins` : ''}`, 'win'); refresh(); });
  useSocket('sports:won', d => { toast(`Sports bet won: ${d.payout.toLocaleString('en-US', { minimumFractionDigits: 2 })} coins`, 'win'); refresh(); });
  useSocket('hello', d => setOnline(d.online));
  useSocket('online', n => setOnline(n));

  const login = async (mode, username, password) => {
    const refCode = (() => { try { return localStorage.getItem('tp_ref') || ''; } catch { return ''; } })();
    const u = await api(`/auth/${mode}`, mode === 'register' ? { username, password, refCode } : { username, password });
    setUser(u); setAuthOpen(null); resetSocket();
    toast(mode === 'register' ? `Welcome, ${u.username}. 50 welcome coins are in your wallet.` : `Welcome back, ${u.username}`, 'win');
  };
  const logout = async () => { await api('/auth/logout', {}); setUser(null); resetSocket(); navigate('/'); };
  const requireUser = () => { if (!user) { setAuthOpen('register'); return false; } return true; };

  const toggleSlip = sel => setSlip(s => {
    if (s.some(x => x.selectionId === sel.selectionId)) return s.filter(x => x.selectionId !== sel.selectionId);
    const rest = s.filter(x => x.eventId !== sel.eventId); // one pick per match
    if (innerWidth > 1100 || s.length === 0) setPanel('slip');
    return [...rest, sel].slice(-12);
  });

  return <Ctx.Provider value={{ user, setUser, refresh, setBalance, config, toast, toasts, authOpen, setAuthOpen, login, logout, requireUser, panel, setPanel, slip, setSlip, toggleSlip, online }}>{children}</Ctx.Provider>;
}
