// Anyleague sync layer.
// There is no Anyleague server. Each league is an encrypted, signed event log
// stored on several public Nostr relays (kind 30078, NIP-78 app data) and cached
// in every member's browser. The invite link carries the league key, so relays
// only ever see ciphertext. Clients re-upload anything a relay has lost.

import { schnorr, sha256, bytesToHex, hexToBytes, randomBytes } from './vendor/noble.js';
import { reduce, normName, settle, endsAt } from './core.js';

export const DEFAULT_RELAYS = [
  'wss://nos.lol', 'wss://relay.primal.net', 'wss://nostr.mom', 'wss://offchain.pub',
  'wss://relay.nostr.net', 'wss://nostr.oxtr.dev', 'wss://soloco.nl',
];
const KIND = 30078;
const te = new TextEncoder(), td = new TextDecoder();
const hash = (s) => sha256(te.encode(s));
const mem = new Map();
const LS = (() => {
  try { const l = globalThis.localStorage; l.setItem('al:t', '1'); l.removeItem('al:t'); return l; } catch (e) {
    return { getItem: (k) => (mem.has(k) ? mem.get(k) : null), setItem: (k, v) => mem.set(k, String(v)), removeItem: (k) => mem.delete(k) };
  }
})();
const lsGet = (k, d) => { try { const v = LS.getItem(k); return v == null ? d : JSON.parse(v); } catch (e) { return d; } };
const lsSet = (k, v) => { try { LS.setItem(k, JSON.stringify(v)); return true; } catch (e) { return false; } };

const b64 = (u8) => { let s = ''; for (let i = 0; i < u8.length; i++) s += String.fromCharCode(u8[i]); return btoa(s); };
const unb64 = (s) => { const b = atob(s), u = new Uint8Array(b.length); for (let i = 0; i < b.length; i++) u[i] = b.charCodeAt(i); return u; };
const b64url = (u8) => b64(u8).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
export const rid = (n = 6) => b64url(randomBytes(n));

export function relayList() {
  try {
    const q = new URLSearchParams(globalThis.location ? globalThis.location.search : '').get('relays');
    if (q) return q.split(',');
  } catch (e) {}
  return DEFAULT_RELAYS;
}

// ---- identity & invite codes -------------------------------------------------
// Like when2meet: you are the name and PIN you type. Your signing
// key is derived from league seed + name + PIN, so the same name works on any device.
export function deriveIdentity(seed, name, pin) {
  const sk = hash(`anyleague:id:${seed}:${normName(name)}:${pin || ''}`);
  return { name: String(name).trim(), sk: bytesToHex(sk), pk: bytesToHex(schnorr.getPublicKey(sk)) };
}
export const PIN_MIN = 4;
export const validPin = (pin) => typeof pin === 'string' && pin.length >= PIN_MIN;
export const newSeed = () => b64url(randomBytes(12));
export const makeCode = (seed, pk) => seed + pk.slice(0, 12);
export function parseCode(code) {
  if (!/^[\w-]{16}[0-9a-f]{12}$/.test(code || '')) return null;
  return { seed: code.slice(0, 16), commishPrefix: code.slice(16) };
}

// ---- my leagues (local only) -------------------------------------------------
export const myLeagues = () => lsGet('al:leagues', {});
export function rememberLeague(code, patch) {
  const all = myLeagues();
  all[code] = { ...(all[code] || {}), ...patch, seen: Date.now() };
  lsSet('al:leagues', all);
}
export function forgetLeague(code) { const all = myLeagues(); delete all[code]; lsSet('al:leagues', all); }

// ---- relay connection --------------------------------------------------------
class Relay {
  constructor(url, lg) {
    this.url = url; this.lg = lg; this.have = new Set(); this.ws = null;
    this.open = false; this.synced = false; this.tries = 0; this.dead = false; this.pg = 0;
  }
  connect() {
    if (this.dead) return;
    let ws;
    try { ws = new WebSocket(this.url); } catch (e) { return this.retry(); }
    this.ws = ws;
    ws.onopen = () => {
      this.open = true; this.tries = 0; this.synced = false; this.page = { n: 0, oldest: Infinity };
      this.send(['REQ', 'm', { kinds: [KIND], '#t': [this.lg.tag] }]);
      this.lg.touch();
    };
    ws.onmessage = (m) => {
      let d; try { d = JSON.parse(m.data); } catch (e) { return; }
      if (d[0] === 'EVENT' && d[2]) {
        const ev = d[2];
        if (typeof ev.id !== 'string') return;
        if (!this.have.has(ev.id)) { this.have.add(ev.id); this.page.n++; }
        if (ev.created_at < this.page.oldest) this.page.oldest = ev.created_at;
        this.lg.ingest(ev);
      } else if (d[0] === 'EOSE') {
        if (d[1] !== 'm') this.send(['CLOSE', d[1]]);
        if (this.synced) return;
        // Relays cap results per request; walk backwards until a page adds nothing new.
        if (this.page.n >= 20 && this.page.oldest < Infinity) {
          const until = this.page.oldest; this.page = { n: 0, oldest: Infinity };
          this.send(['REQ', 'p' + (++this.pg), { kinds: [KIND], '#t': [this.lg.tag], until }]);
        } else { this.synced = true; this.lg.relaySynced(this); }
      } else if (d[0] === 'OK') {
        if (d[2] || /duplicate/i.test(d[3] || '')) this.have.add(d[1]);
        else if (/rate/i.test(d[3] || '')) setTimeout(() => this.push(d[1]), 4000);
        this.lg.touch();
      }
    };
    ws.onclose = () => { if (this.ws === ws) { this.open = false; this.lg.touch(); this.retry(); } };
    ws.onerror = () => { try { ws.close(); } catch (e) {} };
  }
  retry() {
    if (this.dead) return;
    this.tries++;
    setTimeout(() => this.connect(), Math.min(30000, 800 * 2 ** Math.min(this.tries, 6)));
  }
  send(msg) { if (this.open) { try { this.ws.send(JSON.stringify(msg)); } catch (e) {} } }
  push(id) { const raw = this.lg.raw.get(id); if (raw && this.open) this.send(['EVENT', raw]); }
  close() { this.dead = true; try { this.ws && this.ws.close(); } catch (e) {} }
}

// ---- league ------------------------------------------------------------------
export class League {
  constructor(code, opts = {}) {
    const c = parseCode(code);
    if (!c) throw new Error('Bad league link');
    this.code = code; this.seed = c.seed; this.commishPrefix = c.commishPrefix;
    this.tag = bytesToHex(hash('anyleague:tag:' + c.seed)).slice(0, 32);
    this.raw = new Map(); this.parsed = new Map(); this.inflight = new Set();
    this.listeners = new Set(); this.me = null; this.ready = false; this.synced = false;
    this.mine = new Map(); this.urls = opts.relays || relayList(); this.relays = [];
    this.state = reduce([], {}); this.v = 0;
    this.onReject = opts.onReject || (() => {});
  }
  async init() {
    this.key = await crypto.subtle.importKey('raw', hash('anyleague:enc:' + this.seed), 'AES-GCM', false, ['encrypt', 'decrypt']);
    const cached = lsGet('al:ev:' + this.tag, []);
    await Promise.all(cached.map(async (raw) => {
      const p = await this.unseal(raw, false);
      if (p) { this.raw.set(raw.id, raw); this.parsed.set(raw.id, p); }
    }));
    const id = lsGet('al:id:' + this.tag, null);
    if (id && id.sk) this.me = { name: id.name, sk: id.sk, pk: bytesToHex(schnorr.getPublicKey(hexToBytes(id.sk))) };
    this.recompute(); this.ready = true;
    this.relays = this.urls.map((u) => new Relay(u, this));
    this.relays.forEach((r) => r.connect());
    // If relays are slow or unreachable, let people in on cached data.
    this.syncTimer = setTimeout(() => { this.synced = true; this.touch(); }, 7000);
    return this;
  }
  close() { clearTimeout(this.syncTimer); clearTimeout(this.endT); this.relays.forEach((r) => r.close()); this.listeners.clear(); }
  on(fn) { this.listeners.add(fn); return () => this.listeners.delete(fn); }
  touch() {
    if (this.touching) return;
    this.touching = true;
    setTimeout(() => { this.touching = false; this.v++; this.listeners.forEach((f) => f()); }, 0);
  }
  get online() { return this.relays.filter((r) => r.open).length; }

  async seal(t, p, s) {
    const body = te.encode(JSON.stringify({ t, s, p }));
    const iv = randomBytes(12);
    const ct = new Uint8Array(await crypto.subtle.encrypt({ name: 'AES-GCM', iv }, this.key, body));
    const blob = new Uint8Array(12 + ct.length); blob.set(iv); blob.set(ct, 12);
    const ev = {
      pubkey: this.me.pk, created_at: Math.floor(Date.now() / 1000), kind: KIND,
      tags: [['d', `${this.tag}:${rid(9)}`], ['t', this.tag]], content: b64(blob),
    };
    const h = hash(JSON.stringify([0, ev.pubkey, ev.created_at, ev.kind, ev.tags, ev.content]));
    ev.id = bytesToHex(h);
    ev.sig = bytesToHex(schnorr.sign(h, hexToBytes(this.me.sk)));
    return ev;
  }
  async unseal(raw, verify = true) {
    try {
      if (raw.kind !== KIND || !raw.tags.some((x) => x[0] === 't' && x[1] === this.tag)) return null;
      if (verify) {
        const h = hash(JSON.stringify([0, raw.pubkey, raw.created_at, raw.kind, raw.tags, raw.content]));
        if (bytesToHex(h) !== raw.id) return null;
        if (!schnorr.verify(hexToBytes(raw.sig), h, hexToBytes(raw.pubkey))) return null;
      }
      const blob = unb64(raw.content);
      const pt = await crypto.subtle.decrypt({ name: 'AES-GCM', iv: blob.slice(0, 12) }, this.key, blob.slice(12));
      const b = JSON.parse(td.decode(pt));
      if (typeof b.t !== 'string' || !Number.isFinite(b.s)) return null;
      return { id: raw.id, pk: raw.pubkey, at: raw.created_at, s: b.s, t: b.t, p: b.p };
    } catch (e) { return null; }
  }
  async ingest(raw) {
    if (this.raw.has(raw.id) || this.inflight.has(raw.id)) return;
    this.inflight.add(raw.id);
    const p = await this.unseal(raw, true);
    this.inflight.delete(raw.id);
    if (!p) return;
    this.raw.set(raw.id, raw); this.parsed.set(raw.id, p);
    this.dirty();
  }
  dirty() {
    if (this.dirtyT) return;
    this.dirtyT = setTimeout(() => { this.dirtyT = null; this.recompute(); this.touch(); this.save(); }, 25);
  }
  recompute() {
    this.state = settle(reduce([...this.parsed.values()], { commishPrefix: this.commishPrefix }), Date.now() / 1000);
    // Wake up when a timed race runs out so everyone sees the final results without reloading.
    clearTimeout(this.endT);
    const e = endsAt(this.state), wait = e * 1000 - Date.now();
    if (this.state.phase === 'season' && e && wait > 0 && wait < 2 ** 31) this.endT = setTimeout(() => { this.recompute(); this.touch(); }, wait + 500);
    if (this.state.exists) rememberLeague(this.code, { name: this.state.name, emoji: this.state.emoji });
    // Tell the user if something they just did lost a race.
    for (const [id, t] of this.mine) {
      if (this.state.rejected.has(id)) { this.mine.delete(id); this.onReject(this.state.rejected.get(id)); }
      else if (Date.now() - t > 20000) this.mine.delete(id);
    }
  }
  save() {
    clearTimeout(this.saveT);
    this.saveT = setTimeout(() => lsSet('al:ev:' + this.tag, [...this.raw.values()]), 400);
  }
  relaySynced(r) {
    // Heal the relay: upload anything we hold that it is missing.
    let i = 0;
    for (const id of this.raw.keys()) if (!r.have.has(id) && i < 400) setTimeout(() => r.push(id), 40 * i++);
    if (!this.synced) {
      clearTimeout(this.syncTimer);
      this.syncTimer = setTimeout(() => { this.synced = true; this.recompute(); this.touch(); }, 600);
    }
  }

  // ---- identity ----
  memberFor(name) { return this.state.members.find((m) => normName(m.name) === normName(name)); }
  // → 'member' | 'new' | 'taken' (wrong PIN) | 'pin' (PIN missing or too short)
  login(name, pin) {
    if (!validPin(pin)) return 'pin';
    const id = deriveIdentity(this.seed, name, pin);
    const m = this.memberFor(name);
    if (m && m.pk !== id.pk) return 'taken';
    this.me = id;
    lsSet('al:id:' + this.tag, { name: id.name, sk: id.sk });
    this.touch();
    return m ? 'member' : 'new';
  }
  logout() { this.me = null; try { LS.removeItem('al:id:' + this.tag); } catch (e) {} this.touch(); }
  get member() { return this.me ? this.state.members.find((m) => m.pk === this.me.pk) : null; }
  get isCommish() { return !!this.me && this.me.pk === this.state.commish; }

  // ---- actions ----
  // Validates locally against the rules first; only valid events are published.
  async act(t, p = {}) {
    if (!this.me) return { err: 'Tell us who you are first' };
    // Don't act on a stale cache: wait (briefly) for the first relay sync so the event is ordered after what it builds on.
    for (let i = 0; !this.synced && t !== 'create' && i < 80; i++) await new Promise((r) => setTimeout(r, 100));
    const raw = await this.seal(t, p, this.state.maxS + 1);
    const parsed = await this.unseal(raw, false);
    this.parsed.set(raw.id, parsed);
    const next = settle(reduce([...this.parsed.values()], { commishPrefix: this.commishPrefix }), Date.now() / 1000);
    if (next.rejected.has(raw.id)) { this.parsed.delete(raw.id); return { err: next.rejected.get(raw.id) }; }
    this.raw.set(raw.id, raw); this.state = next; this.mine.set(raw.id, Date.now());
    if (next.exists) rememberLeague(this.code, { name: next.name, emoji: next.emoji });
    lsSet('al:ev:' + this.tag, [...this.raw.values()]);
    this.relays.forEach((r) => r.push(raw.id));
    this.touch();
    return { ok: true, id: raw.id };
  }
  // How many relays hold every event we know about.
  get replicas() { return this.relays.filter((r) => r.open && r.synced && [...this.raw.keys()].every((id) => r.have.has(id))).length; }
}

export async function createLeague({ name, desc, emoji, me, pin, team, settings, cats, pool }, opts) {
  if (!validPin(pin)) throw new Error(`Choose a PIN of at least ${PIN_MIN} characters`);
  const seed = newSeed();
  const id = deriveIdentity(seed, me, pin);
  const code = makeCode(seed, id.pk);
  const lg = new League(code, opts);
  await lg.init();
  lg.login(me, pin);
  const res = await lg.act('create', { name, desc, emoji, me: id.name, team, settings, cats, pool });
  if (res.err) throw new Error(res.err);
  return lg;
}
