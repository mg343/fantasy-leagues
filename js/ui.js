import { html, useState, useEffect } from './vendor/preact-htm.js';
export { html, render, useState, useEffect, useRef, useMemo } from './vendor/preact-htm.js';

const EMO = ['🦊', '🐙', '🦖', '🦅', '🐝', '🦈', '🐸', '🦁', '🐧', '🦉', '🐺', '🦄', '🐢', '🦩', '🐻', '🦀', '🐯', '🦝', '🐬', '🦬', '🦜', '🐊', '🦔', '🐳'];
const hnum = (s) => { let h = 5381; s = String(s); for (let i = 0; i < s.length; i++) h = ((h << 5) + h + s.charCodeAt(i)) >>> 0; return h; };
export const hue = (id) => hnum(id) % 360;
const assigned = new Map();
// Give each manager in a league a distinct mascot (hash first, then next free one).
export function assignEmoji(pks) {
  const used = new Set();
  for (const pk of pks) {
    let i = hnum(pk) % EMO.length;
    while (used.has(i) && used.size < EMO.length) i = (i + 1) % EMO.length;
    used.add(i); assigned.set(pk, EMO[i]);
  }
}
export const emo = (pk) => assigned.get(pk) || EMO[hnum(pk) % EMO.length];

export const Av = ({ pk, size = '' }) => html`<div class="av ${size}" style="background:hsl(${hue(pk)} 85% 76%)">${emo(pk)}</div>`;
export const Ini = ({ e, size = '' }) => {
  const parts = (e ? e.name : '?').split(/\s+/).filter(Boolean);
  const ini = (parts.length > 1 ? parts[0][0] + parts[parts.length - 1][0] : parts[0].slice(0, 2)).toUpperCase();
  return html`<div class="av ini ${size}" style="background:hsl(${hue(e ? e.id : 'x')} 70% 84%)">${ini}</div>`;
};

export const num = (x) => (Math.round((x || 0) * 10) / 10).toString();
export const sgn = (x) => (x > 0 ? '+' : '') + num(x);
export const Pts = ({ v, plain }) => html`<span class="mono ${v > 0 ? 'pos' : v < 0 ? 'neg' : ''}">${plain ? num(v) : sgn(v)}</span>`;
export function ago(at) {
  const d = Date.now() / 1000 - at;
  if (d < 60) return 'now';
  if (d < 3600) return Math.floor(d / 60) + 'm';
  if (d < 86400) return Math.floor(d / 3600) + 'h';
  return Math.floor(d / 86400) + 'd';
}
export const plural = (n, w) => `${n} ${w}${n === 1 ? '' : 's'}`;

// ---- routing ----
export const go = (path) => { location.hash = '#/' + path; };
export function useHash() {
  const read = () => location.hash.replace(/^#\/?/, '');
  const [h, setH] = useState(read());
  useEffect(() => {
    const f = () => { setH(read()); window.scrollTo(0, 0); };
    window.addEventListener('hashchange', f);
    return () => window.removeEventListener('hashchange', f);
  }, []);
  return h;
}
export function useNow(ms = 1000) {
  const [n, setN] = useState(Date.now());
  useEffect(() => { const t = setInterval(() => setN(Date.now()), ms); return () => clearInterval(t); }, [ms]);
  return n;
}

// ---- toasts & confirm ----
let pushToast = () => {}, pushAsk = () => {};
export const toast = (text, kind = '') => pushToast({ text, kind, id: Math.random() });
export const ask = (title, body, yes = 'Do it') => new Promise((res) => pushAsk({ title, body, yes, res }));
export function Overlays() {
  const [list, setList] = useState([]);
  const [q, setQ] = useState(null);
  pushToast = (t) => { setList((l) => [...l.slice(-2), t]); setTimeout(() => setList((l) => l.filter((x) => x !== t)), 3200); };
  pushAsk = setQ;
  const done = (v) => { q.res(v); setQ(null); };
  return html`
    <div class="toasts" aria-live="polite">${list.map((t) => html`<div key=${t.id} class="toast ${t.kind}">${t.text}</div>`)}</div>
    ${q && html`<${Sheet} title=${q.title} onClose=${() => done(false)}>
      <p style="margin-bottom:16px">${q.body}</p>
      <div class="row"><button class="btn grow" onClick=${() => done(false)}>Cancel</button>
      <button class="btn pri grow" data-yes onClick=${() => done(true)}>${q.yes}</button></div>
    <//>`}`;
}

export function Sheet({ title, onClose, children }) {
  useEffect(() => {
    const f = (e) => { if (e.key === 'Escape') onClose(); };
    document.addEventListener('keydown', f);
    document.body.style.overflow = 'hidden';
    return () => { document.removeEventListener('keydown', f); document.body.style.overflow = ''; };
  }, []);
  return html`<div class="scrim" onClick=${(e) => { if (e.target === e.currentTarget) onClose(); }}>
    <div class="sheet" role="dialog" aria-label=${title}>
      <div class="hd"><h2>${title}</h2><button class="x" aria-label="Close" onClick=${onClose}>✕</button></div>
      <div class="bd">${children}</div>
    </div></div>`;
}

export const Seg = ({ value, options, onChange, disabled }) => html`<div class="seg">${options.map(([v, l]) =>
  html`<button type="button" class=${v === value ? 'on' : ''} disabled=${disabled} onClick=${() => v !== value && onChange(v)}>${l}</button>`)}</div>`;
export const Step = ({ value, min, max, onChange, disabled }) => html`<div class="step">
  <button type="button" aria-label="Less" disabled=${disabled || value <= min} onClick=${() => onChange(value - 1)}>−</button><span>${value}</span>
  <button type="button" aria-label="More" disabled=${disabled || value >= max} onClick=${() => onChange(value + 1)}>+</button></div>`;

export async function copy(text) {
  try { await navigator.clipboard.writeText(text); toast('Link copied'); } catch (e) { prompt('Copy this link', text); }
}
export const leagueUrl = (code) => `${location.origin}${location.pathname}${location.search}#/l/${code}`;

// "one per line" (or comma-separated) → pool items; optional note after a |
export function parseNames(text) {
  let lines = String(text || '').split('\n');
  if (lines.length === 1 && text.includes(',')) lines = text.split(',');
  return lines.map((l) => { const [n, ...rest] = l.split('|'); return { id: Math.random().toString(36).slice(2, 12), name: n.trim(), note: rest.join('|').trim() }; }).filter((i) => i.name);
}
