import { useState, useEffect } from 'react';

const KEY = 'tumble.sfx.muted';
let ctx = null;
let muted = (() => { try { return localStorage.getItem(KEY) === '1'; } catch { return false; } })();
const subs = new Set();

function ac() {
  if (muted || typeof window === 'undefined') return null;
  if (!ctx) {
    const C = window.AudioContext || window.webkitAudioContext;
    if (!C) return null;
    ctx = new C();
  }
  if (ctx.state === 'suspended') ctx.resume().catch(() => {});
  return ctx;
}

function tone(freq, { type = 'sine', dur = 0.08, gain = 0.08, endFreq = null, delay = 0 } = {}) {
  const c = ac();
  if (!c) return;
  const t0 = c.currentTime + delay;
  const o = c.createOscillator();
  const g = c.createGain();
  o.type = type;
  o.frequency.setValueAtTime(freq, t0);
  if (endFreq) o.frequency.exponentialRampToValueAtTime(Math.max(20, endFreq), t0 + dur);
  g.gain.setValueAtTime(0.0001, t0);
  g.gain.linearRampToValueAtTime(gain, t0 + Math.min(0.012, dur * 0.25));
  g.gain.exponentialRampToValueAtTime(0.0001, t0 + dur);
  o.connect(g);
  g.connect(c.destination);
  o.start(t0);
  o.stop(t0 + dur + 0.02);
}

function noise({ dur = 0.12, gain = 0.08, filterFreq = 900, type = 'lowpass', delay = 0 } = {}) {
  const c = ac();
  if (!c) return;
  const t0 = c.currentTime + delay;
  const buf = c.createBuffer(1, Math.floor(c.sampleRate * dur), c.sampleRate);
  const data = buf.getChannelData(0);
  for (let i = 0; i < data.length; i++) data[i] = (Math.random() * 2 - 1) * Math.exp(-i / (data.length * 0.45));
  const src = c.createBufferSource();
  src.buffer = buf;
  const flt = c.createBiquadFilter();
  flt.type = type;
  flt.frequency.setValueAtTime(filterFreq, t0);
  const g = c.createGain();
  g.gain.setValueAtTime(gain, t0);
  g.gain.exponentialRampToValueAtTime(0.0001, t0 + dur);
  src.connect(flt);
  flt.connect(g);
  g.connect(c.destination);
  src.start(t0);
}

export const sfx = {
  isMuted: () => muted,
  toggle() {
    muted = !muted;
    try { localStorage.setItem(KEY, muted ? '1' : '0'); } catch {}
    subs.forEach(fn => fn(muted));
    if (!muted) sfx.click();
    return muted;
  },
  click() {
    tone(680, { type: 'triangle', dur: 0.045, gain: 0.05, endFreq: 420 });
  },
  chip() {
    tone(1420, { type: 'sine', dur: 0.04, gain: 0.06, endFreq: 980 });
    tone(2100, { type: 'triangle', dur: 0.03, gain: 0.035, delay: 0.012 });
  },
  tick(pitch = 1) {
    tone(520 * pitch, { type: 'triangle', dur: 0.032, gain: 0.045, endFreq: 260 * pitch });
  },
  peg(rowRatio = 0.5) {
    const f = 540 + rowRatio * 480;
    tone(f, { type: 'sine', dur: 0.035, gain: 0.035, endFreq: f * 0.72 });
  },
  card() {
    noise({ dur: 0.09, gain: 0.055, filterFreq: 2400, type: 'bandpass' });
    tone(320, { type: 'sine', dur: 0.04, gain: 0.025, endFreq: 190 });
  },
  gem(streak = 1) {
    const base = 523.25 * Math.pow(1.06, Math.min(streak, 18));
    tone(base, { type: 'sine', dur: 0.14, gain: 0.08 });
    tone(base * 1.5, { type: 'triangle', dur: 0.18, gain: 0.055, delay: 0.045 });
  },
  boom() {
    tone(145, { type: 'sawtooth', dur: 0.34, gain: 0.12, endFreq: 34 });
    noise({ dur: 0.32, gain: 0.14, filterFreq: 520, type: 'lowpass' });
  },
  win(mult = 2) {
    const notes = mult >= 5 ? [523.25, 659.25, 783.99, 1046.5, 1318.5] : [523.25, 659.25, 783.99];
    notes.forEach((n, i) => {
      tone(n, { type: 'triangle', dur: 0.22, gain: 0.075, delay: i * 0.055 });
      tone(n * 2, { type: 'sine', dur: 0.14, gain: 0.03, delay: i * 0.055 + 0.02 });
    });
  },
  loss() {
    tone(260, { type: 'sine', dur: 0.14, gain: 0.055, endFreq: 170 });
    tone(190, { type: 'triangle', dur: 0.18, gain: 0.045, endFreq: 120, delay: 0.07 });
  },
  takeoff() {
    tone(220, { type: 'sawtooth', dur: 0.28, gain: 0.04, endFreq: 540 });
    noise({ dur: 0.22, gain: 0.05, filterFreq: 1100, type: 'bandpass' });
  },
  cashout() {
    tone(880, { type: 'sine', dur: 0.12, gain: 0.08 });
    tone(1174.66, { type: 'sine', dur: 0.16, gain: 0.08, delay: 0.06 });
    tone(1760, { type: 'triangle', dur: 0.22, gain: 0.06, delay: 0.12 });
  },
  flyaway() {
    tone(480, { type: 'sawtooth', dur: 0.26, gain: 0.06, endFreq: 130 });
    noise({ dur: 0.26, gain: 0.08, filterFreq: 700, type: 'lowpass' });
  }
};

export function useSfx() {
  const [m, setM] = useState(muted);
  useEffect(() => {
    subs.add(setM);
    return () => subs.delete(setM);
  }, []);
  return { muted: m, toggle: () => sfx.toggle() };
}
