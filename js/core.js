// Anyleague rules engine.
// A league is an append-only log of signed events. Every client folds the same
// log in the same order and arrives at the same state. No server decides anything.

export const LIMITS = { members: 20, pool: 600, cats: 40 };
export const DEFAULT_SETTINGS = {
  rosterSize: 4, starters: 3, format: 'h2h', numRounds: 4,
  whoScores: 'all', openPool: true, pickSecs: 0, punishment: '', period: 'Week', draftNote: '', selfDraft: false, mode: 'draft', lengthDays: 0,
};
export const PERIODS = ['Week', 'Episode', 'Round', 'Day'];

export const normName = (s) => String(s || '').trim().toLowerCase().replace(/\s+/g, ' ');
const str = (x, max) => (typeof x === 'string' ? x : '').trim().slice(0, max);
const int = (x, lo, hi, d) => {
  x = Math.round(Number(x));
  return Number.isFinite(x) ? Math.min(hi, Math.max(lo, x)) : d;
};
const r1 = (x) => Math.round(x * 10) / 10;

function cleanSettings(p, base) {
  const s = { ...base };
  if (!p || typeof p !== 'object') return s;
  if ('rosterSize' in p) s.rosterSize = int(p.rosterSize, 1, 15, s.rosterSize);
  if ('starters' in p) s.starters = int(p.starters, 1, 15, s.starters);
  if (p.format === 'h2h' || p.format === 'points') s.format = p.format;
  if ('numRounds' in p) s.numRounds = int(p.numRounds, 1, 52, s.numRounds);
  if (p.whoScores === 'all' || p.whoScores === 'commish') s.whoScores = p.whoScores;
  if ('openPool' in p) s.openPool = !!p.openPool;
  if ('pickSecs' in p) s.pickSecs = int(p.pickSecs, 0, 604800, s.pickSecs);
  if ('punishment' in p) s.punishment = str(p.punishment, 200);
  if (PERIODS.includes(p.period)) s.period = p.period;
  if ('draftNote' in p) s.draftNote = str(p.draftNote, 80);
  if ('selfDraft' in p) s.selfDraft = !!p.selfDraft;
  // 'solo': everyone plays as themselves, no draft. 'draft': managers draft rosters from a list.
  if (p.mode === 'solo' || p.mode === 'draft') s.mode = p.mode;
  if ('lengthDays' in p) s.lengthDays = int(p.lengthDays, 0, 365, s.lengthDays); // points race only; 0 = until the commissioner ends it
  s.starters = Math.min(s.starters, s.rosterSize);
  return s;
}
function cleanCats(list) {
  const out = [], seen = new Set();
  for (const c of Array.isArray(list) ? list : []) {
    const id = str(c && c.id, 16), name = str(c && c.name, 60);
    const pts = r1(Math.min(999, Math.max(-999, Number(c && c.pts) || 0)));
    if (!id || !name || seen.has(id) || out.length >= LIMITS.cats) continue;
    seen.add(id); out.push({ id, name, pts });
  }
  return out;
}
function addPool(st, items) {
  let n = 0;
  const names = new Set([...st.pool.values()].map((e) => normName(e.name)));
  for (const it of Array.isArray(items) ? items : []) {
    const id = str(it && it.id, 16), name = str(it && it.name, 60);
    if (!id || !name || st.pool.has(id) || names.has(normName(name)) || st.pool.size >= LIMITS.pool) continue;
    st.pool.set(id, { id, name, note: str(it.note, 80) });
    names.add(normName(name)); n++;
  }
  return n;
}

// "Draft each other" leagues: every manager is also a draftable player.
export const selfId = (pk) => '@' + pk.slice(0, 14);
export const isSolo = (st) => st.settings.mode === 'solo';
// Points race: one long race, no weeks or lineups. Points go to whoever owns the player when it happens.
export const isRace = (st) => st.settings.format === 'points';
// A week's matchups are frozen when it starts, so people joining later never rewrite past results.
export const pairsFor = (st, r) => (st.pairs && st.pairs[r]) || matchups(st.draft.order, r);
function syncSelf(st) {
  const want = new Map(st.settings.selfDraft || isSolo(st) ? st.members.map((m) => [selfId(m.pk), m]) : []);
  for (const e of [...st.pool.values()]) if (e.self && !want.has(e.id)) st.pool.delete(e.id);
  const names = new Set([...st.pool.values()].filter((e) => !e.self).map((e) => normName(e.name)));
  for (const [id, m] of want) {
    if (st.pool.has(id)) st.pool.get(id).name = m.name;
    else if (!names.has(normName(m.name)) && st.pool.size < LIMITS.pool) st.pool.set(id, { id, name: m.name, note: '', self: m.pk });
  }
}
// Teams are as big as the pool allows, up to the roster size the commissioner asked for.
export const fitRoster = (st) => Math.min(st.settings.rosterSize, Math.floor(st.pool.size / Math.max(1, st.members.length)));

function fresh() {
  return {
    exists: false, name: '', desc: '', commish: null, settings: { ...DEFAULT_SETTINGS },
    phase: 'setup', members: [], pool: new Map(), cats: [],
    draft: { order: [], picks: [], at: 0 },
    rosters: {}, owner: {}, lineups: {}, locked: {}, round: 0,
    stats: [], trades: [], feed: [], createdAt: 0, endedAt: 0, preorder: null, pairs: {}, startedAt: 0,
  };
}

const member = (st, pk) => st.members.find((m) => m.pk === pk);
const who = (st, pk) => { const m = member(st, pk); return m ? m.name : 'Someone'; };
const ename = (st, id) => (st.pool.get(id) || {}).name || '???';
const say = (st, ev, icon, msg) => st.feed.push({ id: ev.id, at: ev.at, k: 'sys', pk: ev.pk, icon, text: msg });

export function draftSlot(st, n = st.draft.picks.length) {
  const len = st.draft.order.length, total = len * st.settings.rosterSize;
  if (!len || n >= total) return null;
  const r = Math.floor(n / len), i = n % len;
  return { n, round: r + 1, pick: i + 1, pk: st.draft.order[r % 2 ? len - 1 - i : i], total };
}
export const clockStart = (st) => { const p = st.draft.picks; return p.length ? p[p.length - 1].at : st.draft.at; };
export const available = (st) => [...st.pool.values()].filter((e) => !st.owner[e.id]);

function fixLineup(st, pk) {
  const roster = st.rosters[pk] || [], S = Math.min(st.settings.starters, roster.length);
  const lu = (st.lineups[pk] || []).filter((id, i, a) => roster.includes(id) && a.indexOf(id) === i).slice(0, S);
  for (const id of roster) { if (lu.length >= S) break; if (!lu.includes(id)) lu.push(id); }
  st.lineups[pk] = lu;
}
function voidTrades(st) {
  for (const t of st.trades) {
    if (t.status !== 'open') continue;
    const ok = t.give.every((id) => st.owner[id] === t.from) && t.get.every((id) => st.owner[id] === t.to);
    if (!ok) t.status = 'void';
  }
}

const H = {
  create(st, ev, p, opt) {
    if (st.exists) return 'League already exists';
    if (opt.commishPrefix && !ev.pk.startsWith(opt.commishPrefix)) return 'Not the founder';
    st.exists = true; st.commish = ev.pk; st.createdAt = ev.at;
    st.name = str(p.name, 60) || 'Untitled League'; st.desc = str(p.desc, 300);
    st.emoji = str(p.emoji, 8) || '🏆';
    st.settings = cleanSettings(p.settings, DEFAULT_SETTINGS);
    st.cats = cleanCats(p.cats); addPool(st, p.pool);
    const name = str(p.me, 24) || 'Commish';
    st.hint = str(p.hint, 120);
    st.members.push({ pk: ev.pk, name, team: str(p.team, 32) || `Team ${name}` });
    syncSelf(st);
    say(st, ev, '🎉', `${name} founded the league`);
  },
  settings(st, ev, p) {
    if (ev.pk !== st.commish) return 'Only the commissioner can change settings';
    const next = cleanSettings(p.settings, st.settings);
    next.mode = st.settings.mode; // chosen once at creation, never switched
    if (st.phase !== 'setup') {
      next.rosterSize = st.settings.rosterSize; next.starters = st.settings.starters; next.format = st.settings.format;
      next.selfDraft = st.settings.selfDraft; next.mode = st.settings.mode;
      next.numRounds = Math.max(next.numRounds, st.round, 1);
      if (st.phase === 'done') { next.numRounds = st.settings.numRounds; next.lengthDays = st.settings.lengthDays; }
    }
    st.settings = next;
    if (st.phase === 'setup') syncSelf(st);
    if (typeof p.name === 'string' && str(p.name, 60)) st.name = str(p.name, 60);
    if (typeof p.desc === 'string') st.desc = str(p.desc, 300);
    if (typeof p.emoji === 'string' && str(p.emoji, 8)) st.emoji = str(p.emoji, 8);
  },
  cats(st, ev, p) {
    if (ev.pk !== st.commish) return 'Only the commissioner can edit scoring';
    st.cats = cleanCats(p.cats);
    if (st.phase !== 'setup') say(st, ev, '📐', `${who(st, ev.pk)} updated the scoring rules`);
  },
  'pool+'(st, ev, p) {
    const m = member(st, ev.pk);
    if (!m) return 'Join the league first';
    if (ev.pk !== st.commish && !(st.settings.openPool && st.phase === 'setup')) return 'Only the commissioner can add to the pool';
    if (st.phase === 'done') return 'Season is over';
    if (isSolo(st)) return 'In this league the players are the people in it';
    const n = addPool(st, p.items);
    if (!n) return 'Nothing new to add (duplicates?)';
    if (st.phase !== 'setup') say(st, ev, '🆕', `${m.name} added ${n === 1 ? ename(st, p.items[0].id) : n + ' new names'} to the player pool`);
  },
  'pool-'(st, ev, p) {
    const e = st.pool.get(p.id);
    if (!e) return 'Not in the pool';
    if (ev.pk !== st.commish) return 'Only the commissioner can remove players';
    if (e.self) return 'Managers are draftable in this league';
    if (st.owner[e.id]) return 'Already on a roster';
    st.pool.delete(e.id);
  },
  'pool~'(st, ev, p) {
    const e = st.pool.get(p.id);
    if (!e) return 'Not in the pool';
    if (ev.pk !== st.commish) return 'Only the commissioner can edit players';
    if (str(p.name, 60)) e.name = str(p.name, 60);
    if (typeof p.note === 'string') e.note = str(p.note, 80);
  },
  join(st, ev, p) {
    if (st.phase === 'draft') return 'The draft is happening — join once it’s done';
    if (st.phase === 'done') return 'The season is over';
    if (member(st, ev.pk)) return 'Already in';
    const name = str(p.name, 24);
    if (!name) return 'Name required';
    if (st.members.some((m) => normName(m.name) === normName(name))) return 'That name is taken';
    if (st.members.length >= LIMITS.members) return 'League is full';
    st.members.push({ pk: ev.pk, name, team: str(p.team, 32) || `Team ${name}` });
    if (st.preorder) st.preorder.push(ev.pk);
    syncSelf(st);
    if (st.phase === 'season') {
      // Late joiner: starts at 0. In "we do" leagues they play as themselves right away;
      // in draft leagues they build a team from free agents.
      st.draft.order.push(ev.pk); st.rosters[ev.pk] = [];
      if (isSolo(st)) {
        const id = selfId(ev.pk);
        st.rosters[ev.pk] = [id]; st.owner[id] = ev.pk; st.lineups[ev.pk] = [id];
        if (st.round >= 1) st.locked[st.round][ev.pk] = [id];
      } else st.lineups[ev.pk] = [];
    }
    say(st, ev, '👋', `${name} joined the league`);
  },
  leave(st, ev) {
    if (st.phase !== 'setup') return 'Too late to leave';
    if (ev.pk === st.commish) return 'The commissioner cannot leave';
    if (!member(st, ev.pk)) return 'Not a member';
    say(st, ev, '🚪', `${who(st, ev.pk)} left the league`);
    st.members = st.members.filter((m) => m.pk !== ev.pk);
    if (st.preorder) st.preorder = st.preorder.filter((k) => k !== ev.pk);
    syncSelf(st);
  },
  kick(st, ev, p) {
    if (ev.pk !== st.commish) return 'Only the commissioner can remove managers';
    if (st.phase !== 'setup') return 'Too late to remove managers';
    if (p.pk === st.commish || !member(st, p.pk)) return 'Cannot remove';
    say(st, ev, '🥾', `${who(st, p.pk)} was removed`);
    st.members = st.members.filter((m) => m.pk !== p.pk);
    if (st.preorder) st.preorder = st.preorder.filter((k) => k !== p.pk);
    syncSelf(st);
  },
  profile(st, ev, p) {
    const m = member(st, ev.pk);
    if (!m) return 'Not a member';
    const team = str(p.team, 32);
    if (!team) return 'Team name required';
    m.team = team;
  },
  'draft.order'(st, ev, p) {
    if (ev.pk !== st.commish) return 'Only the commissioner can set the draft order';
    if (st.phase !== 'setup') return 'Draft already started';
    const order = Array.isArray(p.order) ? p.order : [], pks = st.members.map((m) => m.pk);
    if (order.length !== pks.length || new Set(order).size !== order.length || !order.every((k) => pks.includes(k))) return 'Managers changed — try again';
    st.preorder = order.slice();
    say(st, ev, '🎲', `Draft order is set — ${who(st, order[0])} picks first`);
  },
  'draft.start'(st, ev, p) {
    if (ev.pk !== st.commish) return 'Only the commissioner can start the draft';
    if (st.phase !== 'setup') return 'Draft already started';
    if (st.members.length < (isSolo(st) ? 1 : 2)) return 'The draft needs at least 2 people';
    const order = Array.isArray(p.order) ? p.order : [];
    const pks = st.members.map((m) => m.pk);
    if (order.length !== pks.length || new Set(order).size !== order.length || !order.every((k) => pks.includes(k))) return 'Managers changed — try again';
    if (isSolo(st)) {
      // No draft: each person is their own one-player team and Week 1 starts right away.
      for (const e of [...st.pool.values()]) if (!e.self) st.pool.delete(e.id);
      syncSelf(st);
      st.settings.rosterSize = 1; st.settings.starters = 1;
      st.phase = 'season'; st.draft = { order: order.slice(), picks: [], at: ev.at };
      for (const k of order) { const id = selfId(k); st.rosters[k] = [id]; st.owner[id] = k; st.lineups[k] = [id]; }
      st.startedAt = ev.at; beginWeek(st, 1);
      say(st, ev, '📣', isRace(st) ? 'The season is on!' : `The season is on — ${st.settings.period} 1 is live`);
      return;
    }
    const fit = fitRoster(st);
    if (fit < 1) return `Need at least ${pks.length} names to draft — one per manager`;
    st.settings.rosterSize = fit; st.settings.starters = Math.min(st.settings.starters, fit);
    st.phase = 'draft'; st.draft = { order: order.slice(), picks: [], at: ev.at };
    for (const k of pks) st.rosters[k] = [];
    say(st, ev, '🚨', `The draft is live! ${who(st, order[0])} is on the clock`);
  },
  pick(st, ev, p) {
    if (st.phase !== 'draft') return 'Draft is not live';
    const slot = draftSlot(st);
    if (!slot || p.n !== slot.n) return 'That pick was already made';
    const e = st.pool.get(p.eid);
    if (!e || st.owner[e.id]) return 'Already drafted';
    let ok = ev.pk === slot.pk || ev.pk === st.commish;
    if (!ok && p.auto && member(st, ev.pk) && st.settings.pickSecs > 0 &&
        ev.at >= clockStart(st) + st.settings.pickSecs && available(st)[0].id === e.id) ok = true;
    if (!ok) return 'Not your pick';
    st.draft.picks.push({ pk: slot.pk, eid: e.id, by: ev.pk, at: ev.at, auto: !!p.auto });
    st.rosters[slot.pk].push(e.id); st.owner[e.id] = slot.pk;
    const tag = p.auto ? ' (auto)' : ev.pk !== slot.pk ? ' (by commish)' : '';
    say(st, ev, '📝', `${who(st, slot.pk)} drafted ${e.name}${tag} — R${slot.round} P${slot.pick}`);
    st.feed[st.feed.length - 1].minor = true;
    if (!draftSlot(st)) {
      st.phase = 'season'; st.round = 0;
      for (const k of st.draft.order) fixLineup(st, k);
      if (isRace(st)) { st.startedAt = ev.at; beginWeek(st, 1); say(st, ev, '✅', 'Draft complete. The race is on!'); }
      else say(st, ev, '✅', 'Draft complete. Set your lineups!');
    }
  },
  'draft.undo'(st, ev) {
    if (ev.pk !== st.commish) return 'Only the commissioner can undo picks';
    if (st.phase !== 'draft' || !st.draft.picks.length) return 'Nothing to undo';
    const pk = st.draft.picks.pop();
    st.rosters[pk.pk] = st.rosters[pk.pk].filter((id) => id !== pk.eid);
    delete st.owner[pk.eid];
    say(st, ev, '↩️', `Commish undid the pick of ${ename(st, pk.eid)}`);
  },
  lineup(st, ev, p) {
    if (st.phase !== 'season' || isSolo(st)) return 'Lineups are closed';
    const pk = ev.pk === st.commish && p.pk ? p.pk : ev.pk;
    const roster = st.rosters[pk];
    if (!roster) return 'Not a manager';
    const s = Array.isArray(p.starters) ? p.starters : [];
    if (s.length > st.settings.starters || new Set(s).size !== s.length || !s.every((id) => roster.includes(id))) return 'Invalid lineup';
    st.lineups[pk] = s.slice(); fixLineup(st, pk);
  },
  advance(st, ev, p) {
    if (ev.pk !== st.commish) return `Only the commissioner can advance the ${st.settings.period.toLowerCase()}`;
    if (st.phase !== 'season') return 'Season is not live';
    if (p.n !== st.round + 1) return 'Already advanced';
    if (p.n > st.settings.numRounds || (isRace(st) && st.round >= 1)) { finish(st, ev.at, 'Season over!'); return; }
    if (p.n === 1 && !st.startedAt) st.startedAt = ev.at;
    beginWeek(st, p.n);
    say(st, ev, '📣', `${st.settings.period} ${p.n} is live — lineups are locked`);
  },
  adddrop(st, ev, p) {
    if (st.phase !== 'season' || isSolo(st)) return 'Rosters are locked';
    const pk = ev.pk === st.commish && p.pk ? p.pk : ev.pk;
    const roster = st.rosters[pk];
    if (!roster) return 'Not a manager';
    if (p.drop != null && !roster.includes(p.drop)) return 'Not on your roster';
    if (p.add != null && (!st.pool.has(p.add) || st.owner[p.add])) return 'Someone already grabbed them';
    if (p.add == null && p.drop == null) return 'Nothing to do';
    const size = roster.length + (p.add != null ? 1 : 0) - (p.drop != null ? 1 : 0);
    if (size > st.settings.rosterSize) return 'Roster full — drop someone';
    if (p.drop != null) { st.rosters[pk] = roster.filter((id) => id !== p.drop); delete st.owner[p.drop]; }
    if (p.add != null) { st.rosters[pk].push(p.add); st.owner[p.add] = pk; }
    fixLineup(st, pk); voidTrades(st);
    const parts = [];
    if (p.add != null) parts.push(`added ${ename(st, p.add)}`);
    if (p.drop != null) parts.push(`dropped ${ename(st, p.drop)}`);
    say(st, ev, '🔁', `${who(st, pk)} ${parts.join(', ')}`);
  },
  'trade.offer'(st, ev, p) {
    if (st.phase !== 'season' || isSolo(st)) return 'Trading is closed';
    const from = ev.pk, to = p.to;
    if (!st.rosters[from] || !st.rosters[to] || from === to) return 'Invalid trade partner';
    const give = Array.isArray(p.give) ? p.give : [], get = Array.isArray(p.get) ? p.get : [];
    if (!give.length || give.length !== get.length || give.length > 5) return 'Trades must be even: 1-for-1, 2-for-2…';
    if (new Set(give).size !== give.length || new Set(get).size !== get.length) return 'Invalid trade';
    if (!give.every((id) => st.owner[id] === from) || !get.every((id) => st.owner[id] === to)) return 'Rosters changed — rebuild the offer';
    st.trades.push({ id: ev.id, from, to, give, get, status: 'open', at: ev.at });
    say(st, ev, '🤝', `${who(st, from)} offered ${who(st, to)} a trade`);
  },
  'trade.accept'(st, ev, p) {
    const t = st.trades.find((x) => x.id === p.id);
    if (!t || t.status !== 'open') return 'Offer no longer open';
    if (st.phase !== 'season') return 'Trading is closed';
    if (ev.pk !== t.to) return 'Not your offer to accept';
    for (const id of t.give) st.owner[id] = t.to;
    for (const id of t.get) st.owner[id] = t.from;
    st.rosters[t.from] = st.rosters[t.from].filter((id) => !t.give.includes(id)).concat(t.get);
    st.rosters[t.to] = st.rosters[t.to].filter((id) => !t.get.includes(id)).concat(t.give);
    t.status = 'done'; fixLineup(st, t.from); fixLineup(st, t.to); voidTrades(st);
    say(st, ev, '💥', `TRADE: ${who(st, t.from)} sends ${t.give.map((id) => ename(st, id)).join(' + ')} to ${who(st, t.to)} for ${t.get.map((id) => ename(st, id)).join(' + ')}`);
  },
  'trade.decline'(st, ev, p) {
    const t = st.trades.find((x) => x.id === p.id);
    if (!t || t.status !== 'open') return 'Offer no longer open';
    if (ev.pk !== t.to && ev.pk !== t.from) return 'Not your offer';
    t.status = ev.pk === t.from ? 'cancelled' : 'declined';
    if (ev.pk === t.to) say(st, ev, '🙅', `${who(st, t.to)} declined ${who(st, t.from)}'s trade`);
  },
  stat(st, ev, p) {
    if (st.phase !== 'season' && st.phase !== 'done') return 'Scoring opens when the season starts';
    if (st.round < 1) return `Scoring opens when ${st.settings.period} 1 starts`;
    const isC = ev.pk === st.commish;
    if (!isC && !(st.settings.whoScores === 'all' && member(st, ev.pk))) return 'Only the commissioner can log scores';
    if (st.phase === 'done') return 'Season is over — results are final';
    const e = st.pool.get(p.eid);
    if (!e) return 'Unknown player';
    const qty = int(p.qty, 1, 99, 1);
    let label, each;
    const c = st.cats.find((x) => x.id === p.cat);
    if (c) { label = c.name; each = c.pts; }
    else {
      label = str(p.label, 60); each = r1(Math.min(999, Math.max(-999, Number(p.pts) || 0)));
      if (!label || !each) return 'Pick a scoring category';
    }
    const round = isC && Number.isInteger(p.round) && p.round >= 1 && p.round <= st.round ? p.round : st.round;
    const pts = r1(each * qty);
    st.stats.push({ id: ev.id, eid: e.id, team: st.owner[e.id] || null, label, qty, pts, note: str(p.note, 140), round, by: ev.pk, at: ev.at, void: false });
    st.feed.push({ id: ev.id, at: ev.at, k: 'stat', pk: ev.pk, eid: e.id, pts, round,
      text: `${e.name}: ${label}${qty > 1 ? ' ×' + qty : ''}`, note: str(p.note, 140) });
  },
  'stat.void'(st, ev, p) {
    const s = st.stats.find((x) => x.id === p.id);
    if (!s || s.void) return 'Already removed';
    if (ev.pk !== st.commish && ev.pk !== s.by) return 'Only the commissioner or whoever logged it can remove it';
    if (st.phase === 'done') return 'Season is over — results are final';
    s.void = true;
    const f = st.feed.find((x) => x.id === s.id); if (f) f.void = true;
    say(st, ev, '🚫', `${who(st, ev.pk)} struck "${ename(st, s.eid)}: ${s.label}" from the record`);
  },
  'stat.dispute'(st, ev, p) {
    const s = st.stats.find((x) => x.id === p.id);
    if (!s || s.void) return 'Already struck';
    if (st.phase !== 'season') return 'Season is over';
    if (!member(st, ev.pk)) return 'Join the league first';
    if (s.disputed) return 'Already disputed';
    s.disputed = ev.pk; s.why = str(p.why, 140);
    say(st, ev, '⚠️', `${who(st, ev.pk)} disputed "${ename(st, s.eid)}: ${s.label}"${s.why ? ` — “${s.why}”` : ''}`);
  },
  'stat.keep'(st, ev, p) {
    const s = st.stats.find((x) => x.id === p.id);
    if (!s || s.void || !s.disputed) return 'Nothing to resolve';
    if (ev.pk !== st.commish) return 'Only the commissioner can settle disputes';
    s.disputed = null; s.kept = true;
    say(st, ev, '⚖️', `Commish ruled "${ename(st, s.eid)}: ${s.label}" stands`);
  },
  chat(st, ev, p) {
    const m = member(st, ev.pk);
    if (!m) return 'Join the league to chat';
    const text = str(p.text, 500);
    if (!text) return 'Empty message';
    st.feed.push({ id: ev.id, at: ev.at, k: 'chat', pk: ev.pk, text });
  },
};

export const sortEvents = (evs) => evs.slice().sort((a, b) => a.s - b.s || a.at - b.at || (a.id < b.id ? -1 : a.id > b.id ? 1 : 0));

// Fold the log. Returns the state plus a map of rejected event ids → reason.
export function reduce(events, opt = {}) {
  const st = fresh(), rejected = new Map();
  let maxS = 0;
  for (const ev of sortEvents(events)) {
    if (ev.s > maxS) maxS = ev.s;
    if (st.exists) settle(st, ev.at);
    const h = H[ev.t];
    let err = 'Unknown action';
    if (h && (st.exists || ev.t === 'create')) {
      try { err = h(st, ev, ev.p && typeof ev.p === 'object' ? ev.p : {}, opt); } catch (e) { err = 'Malformed event'; }
    } else if (h) err = 'League not found';
    if (err) rejected.set(ev.id, err);
  }
  st.maxS = maxS; st.rejected = rejected;
  return st;
}

// Round-robin (circle method). Returns pairs [a, b]; b === null is a bye.
export function matchups(order, r) {
  const t = order.slice();
  if (t.length % 2) t.push(null);
  const n = t.length;
  if (n < 2) return [];
  const k = (r - 1) % (n - 1), rest = t.slice(1);
  const arr = [t[0], ...rest.slice(rest.length - k), ...rest.slice(0, rest.length - k)];
  const out = [];
  for (let i = 0; i < n / 2; i++) out.push(arr[i] === null ? [arr[n - 1 - i], null] : [arr[i], arr[n - 1 - i]]);
  return out;
}

export function scores(st) {
  const ent = {}, team = {};
  for (const s of st.stats) {
    if (s.void || !st.pool.has(s.eid)) continue;
    const e = ent[s.eid] || (ent[s.eid] = { total: 0, r: {} });
    e.total = r1(e.total + s.pts); e.r[s.round] = r1((e.r[s.round] || 0) + s.pts);
  }
  if (isRace(st)) {
    for (const pk of st.draft.order) team[pk] = { total: 0, r: {} };
    for (const s of st.stats) {
      if (s.void || !s.team || !team[s.team] || !st.pool.has(s.eid)) continue;
      const t = team[s.team]; t.total = r1(t.total + s.pts); t.r[1] = t.total;
    }
    return { ent, team };
  }
  for (const pk of st.draft.order) {
    team[pk] = { total: 0, r: {} };
    for (let r = 1; r <= st.round; r++) {
      let sum = 0;
      for (const id of (st.locked[r] || {})[pk] || []) sum += (ent[id] && ent[id].r[r]) || 0;
      team[pk].r[r] = r1(sum); team[pk].total = r1(team[pk].total + sum);
    }
  }
  return { ent, team };
}

// When a timed points race ends (seconds), or 0 if it runs until the commissioner ends it.
export const endsAt = (st) => (isRace(st) && st.settings.lengthDays && st.startedAt ? st.startedAt + st.settings.lengthDays * 86400 : 0);
function finish(st, at, why) {
  st.phase = 'done'; st.endedAt = at;
  const top = standings(st)[0];
  st.feed.push({ id: 'end:' + at, at, k: 'sys', icon: '🏆', text: `${why}${top ? ` ${who(st, top.pk)} takes the title` : ''}` });
}
// Apply a timed ending that has passed. Deterministic given the same clock value.
export function settle(st, now) {
  const e = endsAt(st);
  if (st.phase === 'season' && e && now >= e) finish(st, e, 'Time’s up!');
  return st;
}

function beginWeek(st, n) {
  st.round = n; st.locked[n] = {};
  for (const k of st.draft.order) { fixLineup(st, k); st.locked[n][k] = st.lineups[k].slice(); }
  st.pairs[n] = matchups(st.draft.order, n);
}

export const roundDone = (st, r) => r < st.round || st.phase === 'done';

export function standings(st, sc = scores(st)) {
  const rows = st.draft.order.map((pk) => ({ pk, w: 0, l: 0, t: 0, pf: sc.team[pk].total, pa: 0 }));
  const by = Object.fromEntries(rows.map((r) => [r.pk, r]));
  if (st.settings.format === 'h2h') {
    for (let r = 1; r <= st.round; r++) {
      for (const [a, b] of pairsFor(st, r)) {
        if (b === null) continue;
        const sa = sc.team[a].r[r] || 0, sb = sc.team[b].r[r] || 0;
        by[a].pa = r1(by[a].pa + sb); by[b].pa = r1(by[b].pa + sa);
        if (!roundDone(st, r)) continue;
        if (sa > sb) { by[a].w++; by[b].l++; } else if (sb > sa) { by[b].w++; by[a].l++; } else { by[a].t++; by[b].t++; }
      }
    }
    // win–loss differential keeps bye weeks (odd-sized leagues) fair
    rows.sort((x, y) => (y.w - y.l) - (x.w - x.l) || y.pf - x.pf);
  } else rows.sort((x, y) => y.pf - x.pf);
  rows.forEach((r, i) => { r.rank = i + 1; });
  return rows;
}
