import { html, useState, useEffect, useRef, useNow, go, toast, ask, ago, assignEmoji, Av, Ini, Pts, num, sgn, plural, Sheet, Seg, Step, copy, leagueUrl } from './ui.js';
import { League, rid, validPin, PIN_MIN } from './net.js';
import { scores, standings, matchups, draftSlot, clockStart, available, roundDone, normName } from './core.js';

// ---------------------------------------------------------------- plumbing
function useLeague(code) {
  const [lg, setLg] = useState(null);
  const [err, setErr] = useState(null);
  const [, force] = useState(0);
  useEffect(() => {
    let l, dead = false;
    try { l = new League(code, { onReject: (m) => toast('Didn’t go through: ' + m, 'err') }); } catch (e) { setErr(e.message); return; }
    l.init().then(() => { if (dead) return l.close(); l.on(() => force((x) => x + 1)); setLg(l); });
    return () => { dead = true; l.close(); };
  }, [code]);
  return { lg, err };
}

const TABS = {
  setup: [['lobby', '🏟️', 'Lobby'], ['feed', '💬', 'Chat']],
  draft: [['draft', '📝', 'Draft'], ['feed', '💬', 'Chat']],
  season: [['scores', '📊', 'Scores'], ['team', '🧢', 'My Team'], ['players', '🔎', 'Players'], ['league', '🏆', 'League'], ['feed', '💬', 'Feed']],
};
TABS.done = TABS.season;

export function LeaguePage({ code, tab }) {
  const { lg, err } = useLeague(code);
  const [sheet, setSheet] = useState(null);
  if (err) return html`<div class="splash"><div><p style="font-size:44px">🔗</p><p><b>That link looks broken.</b></p><p class="muted small">Ask for the invite link again — it has to be copied in full.</p><a class="btn" style="margin-top:14px" href="#/">Home</a></div></div>`;
  if (!lg) return html`<div class="splash"><div class="logo pulse">ANY<span>LEAGUE</span></div></div>`;
  const st = lg.state;
  if (!st.exists) {
    return html`<div class="splash"><div>${lg.synced
      ? html`<p style="font-size:44px">🕵️</p><p><b>Can’t find that league.</b></p><p class="muted small">${lg.online ? 'The link may be mistyped.' : 'You look offline — check your connection.'}</p>
          <div class="row" style="justify-content:center;margin-top:14px"><button class="btn" onClick=${() => location.reload()}>Try again</button><a class="btn" href="#/">Home</a></div>`
      : html`<div class="logo pulse">ANY<span>LEAGUE</span></div><p class="muted" style="margin-top:12px">Finding your league…</p>`}</div></div>`;
  }
  assignEmoji(st.members.map((m) => m.pk));
  const tabs = TABS[st.phase];
  const cur = tabs.some((t) => t[0] === tab) ? tab : tabs[0][0];
  const mem = lg.member, isC = lg.isCommish;
  const run = async (t, p, okMsg) => {
    const r = await lg.act(t, p);
    if (r.err) toast(r.err, 'err'); else if (okMsg) toast(okMsg);
    return r;
  };
  const sc = scores(st);
  const canScore = !!mem && st.phase === 'season' && st.round >= 1 && (isC || st.settings.whoScores === 'all');
  const name = (pk) => (st.members.find((m) => m.pk === pk) || {}).name || '—';
  const team = (pk) => (st.members.find((m) => m.pk === pk) || {}).team || '—';
  const x = { lg, st, sc, mem, isC, run, me: mem ? mem.pk : null, open: setSheet, canScore, name, team, code };

  const seenKey = 'al:seen:' + code;
  const chatN = st.feed.filter((f) => f.k === 'chat' && f.pk !== x.me).length;
  let seen = 0; try { seen = +localStorage.getItem(seenKey) || 0; } catch (e) {}
  if (cur === 'feed' && seen !== chatN) { try { localStorage.setItem(seenKey, chatN); } catch (e) {} seen = chatN; }
  const openTrades = st.trades.filter((t) => t.status === 'open' && t.to === x.me).length;
  const badge = { feed: Math.max(0, chatN - seen), league: openTrades };

  const phasePill = st.phase === 'setup' ? html`<span class="pill yel">Lobby</span>`
    : st.phase === 'draft' ? html`<span class="pill live"><span class="dot pulse" style="background:#17140F"></span>Draft live</span>`
      : st.phase === 'done' ? html`<span class="pill dark">Final</span>`
        : st.round === 0 ? html`<span class="pill yel">Preseason</span>`
          : html`<span class="pill live">Round ${st.round} of ${st.settings.numRounds}</span>`;
  const on = lg.online;

  return html`<div class="wrap">
    <div class="lhead">
      <a class="av lg" href="#/" title="All leagues" style="background:var(--yellow);text-decoration:none">${st.emoji}</a>
      <div class="grow"><h1 class="ell">${st.name}</h1>
        <div class="row" style="gap:6px;margin-top:4px">${phasePill}
          <span class="tiny muted row" style="gap:4px" title=${`Connected to ${on} of ${lg.relays.length} relays`}><span class="dot ${on === 0 ? 'off' : on < 2 ? 'mid' : ''}"></span>${on === 0 ? 'offline' : lg.synced ? 'live' : 'syncing…'}</span></div></div>
      ${mem && html`<button class="btn sm" onClick=${() => setSheet({ k: 'me' })} aria-label="You"><${Av} pk=${mem.pk} size="sm" /> ${mem.name}</button>`}
    </div>
    ${on === 0 && lg.synced && html`<div class="banner warn" style="margin-bottom:12px">📡 You’re offline. Changes you make will sync when you reconnect.</div>`}
    ${!mem && html`<${WhoAreYou} x=${x} />`}
    ${cur === 'lobby' && html`<${Lobby} x=${x} />`}
    ${cur === 'draft' && html`<${Draft} x=${x} />`}
    ${cur === 'scores' && html`<${Scores} x=${x} />`}
    ${cur === 'team' && html`<${Team} x=${x} />`}
    ${cur === 'players' && html`<${Players} x=${x} />`}
    ${cur === 'league' && html`<${LeagueTab} x=${x} />`}
    ${cur === 'feed' && html`<${Feed} x=${x} />`}
    ${canScore && cur !== 'feed' && html`<div class="fab"><button class="btn pri" onClick=${() => setSheet({ k: 'log' })}>＋ Log points</button></div>`}
    <nav class="tabs">${tabs.map(([id, ic, label]) => html`<a href=${`#/l/${code}/${id}`} class=${id === cur ? 'on' : ''}><i>${ic}</i>${label}
      ${badge[id] > 0 && html`<span class="badge">${badge[id]}</span>`}</a>`)}</nav>
    ${sheet && sheet.k === 'me' && html`<${MeSheet} x=${x} onClose=${() => setSheet(null)} />`}
    ${sheet && sheet.k === 'log' && html`<${LogSheet} x=${x} eid=${sheet.eid} onClose=${() => setSheet(null)} />`}
    ${sheet && sheet.k === 'ent' && html`<${EntitySheet} x=${x} eid=${sheet.eid} onClose=${() => setSheet(null)} />`}
    ${sheet && sheet.k === 'trade' && html`<${TradeSheet} x=${x} to=${sheet.to} want=${sheet.want} onClose=${() => setSheet(null)} />`}
    ${sheet && sheet.k === 'pool' && html`<${Sheet} title="Add players" onClose=${() => setSheet(null)}><${PoolAdd} x=${x} onDone=${() => setSheet(null)} /><//>`}
    ${sheet && sheet.k === 'rules' && html`<${Sheet} title="Commissioner tools" onClose=${() => setSheet(null)}><div class="stack"><${Settings} x=${x} /><${CatsEditor} x=${x} /></div><//>`}
  </div>`;
}

// ---------------------------------------------------------------- identity
function WhoAreYou({ x }) {
  const { lg, st } = x;
  const [name, setName] = useState('');
  const [pin, setPin] = useState('');
  const [busy, setBusy] = useState(false);
  const pinRef = useRef(null);
  const setup = st.phase === 'setup';
  const known = !!lg.memberFor(name);
  const enter = async (e) => {
    e.preventDefault();
    const n = name.trim();
    if (!n) return toast('Type your name', 'err');
    if (!validPin(pin)) return toast(known ? 'Enter your PIN' : `Choose a PIN of at least ${PIN_MIN} characters`, 'err');
    const r = lg.login(n, pin);
    if (r === 'taken') return toast('Wrong PIN for that name', 'err');
    if (r === 'member') return toast(`Welcome back, ${lg.member.name}`);
    if (!setup) { lg.logout(); return toast('No manager by that name — the draft already happened', 'err'); }
    setBusy(true);
    const j = await lg.act('join', { name: n });
    setBusy(false);
    if (j.err) { lg.logout(); toast(j.err, 'err'); } else toast('You’re in! 🎉');
  };
  return html`<div class="card yellow" style="margin-bottom:16px">
    <h3>${setup ? '👋 You’re invited' : 'Who are you?'}</h3>
    ${setup && html`<p style="margin-bottom:10px">Join <b>${st.name}</b> as a manager. No account — just a name and a PIN.</p>`}
    <form class="row wrapx" onSubmit=${enter}>
      <input class="in grow" style="min-width:150px" maxlength="24" placeholder="Your name" aria-label="Your name" autocomplete="nickname" value=${name} onInput=${(e) => setName(e.target.value)} />
      <input class="in" style="width:120px" type="password" maxlength="32" placeholder="PIN" aria-label="PIN" autocomplete="off" ref=${pinRef} value=${pin} onInput=${(e) => setPin(e.target.value)} />
      <button class="btn dark" disabled=${busy}>${setup && !known ? 'Join league' : 'Sign in'}</button>
    </form>
    <p class="small" style="margin-top:8px">${known ? 'Enter the PIN you chose when you joined.' : setup ? `New here? Choose a PIN (${PIN_MIN}+ characters). You’ll need it to sign in again.` : 'Managers sign in with their name and PIN. Everyone else can watch.'}</p>
    ${st.members.length > 0 && html`<p class="small" style="margin:10px 0 6px">${setup ? 'Already joined? Tap your name, then enter your PIN:' : 'Tap your name, then enter your PIN:'}</p>
      <div class="chips">${st.members.map((m) => html`<button type="button" class="chip ${normName(m.name) === normName(name) ? 'on' : ''}" onClick=${() => { setName(m.name); setPin(''); if (pinRef.current) pinRef.current.focus(); }}><${Av} pk=${m.pk} size="sm" />${m.name}</button>`)}</div>`}
  </div>`;
}

function MeSheet({ x, onClose }) {
  const { lg, mem, run, code } = x;
  const [team, setTeam] = useState(mem.team);
  return html`<${Sheet} title=${mem.name} onClose=${onClose}><div class="stack">
    <form onSubmit=${async (e) => { e.preventDefault(); const r = await run('profile', { team }, 'Team renamed'); if (r.ok) onClose(); }}>
      <label class="f" for="tn">Team name</label>
      <div class="row"><input id="tn" class="in grow" maxlength="32" value=${team} onInput=${(e) => setTeam(e.target.value)} /><button class="btn dark">Save</button></div>
    </form>
    <div><label class="f">Invite link</label><${LinkBox} code=${code} /></div>
    <p class="small muted">On another device? Open the invite link and sign in with the same name and PIN.</p>
    <div class="row"><button class="btn grow" onClick=${() => { lg.logout(); onClose(); }}>Switch user</button><a class="btn grow" href="#/">All leagues</a></div>
  </div><//>`;
}

function LinkBox({ code }) {
  const url = leagueUrl(code);
  return html`<div class="linkbox"><code>${url.replace(/^https?:\/\//, '')}</code>
    <button class="btn yel" onClick=${() => (navigator.share ? navigator.share({ title: 'Join my fantasy league', url }).catch(() => {}) : copy(url))}>${navigator.share ? 'Share' : 'Copy'}</button>
    ${navigator.share && html`<button class="btn" onClick=${() => copy(url)}>Copy</button>`}</div>`;
}

// ---------------------------------------------------------------- lobby
function Lobby({ x }) {
  const { st, isC, mem, run, me, code } = x;
  const need = st.members.length * st.settings.rosterSize;
  const problems = [];
  if (st.members.length < 2) problems.push('at least 2 managers');
  if (st.pool.size < need) problems.push(`${need - st.pool.size} more ${need - st.pool.size === 1 ? 'player' : 'players'} in the pool`);
  if (!st.cats.length) problems.push('at least one scoring rule');
  const start = async () => {
    if (!await ask('Start the draft?', `Joining closes and the draft order is randomized. ${plural(st.members.length, 'manager')}, ${st.settings.rosterSize} rounds.`, 'Start draft')) return;
    const order = st.members.map((m) => m.pk);
    for (let i = order.length - 1; i > 0; i--) { const j = crypto.getRandomValues(new Uint32Array(1))[0] % (i + 1); [order[i], order[j]] = [order[j], order[i]]; }
    run('draft.start', { order });
  };
  return html`<div>
    <div class="card"><h3>1 · Invite your friends</h3><${LinkBox} code=${code} />
      <p class="small muted" style="margin-top:8px">Anyone with this link can join until the draft starts.</p></div>

    <div class="sec">Managers <span class="n">${st.members.length}</span></div>
    <div class="list">${st.members.map((m) => html`<div class="li ${m.pk === me ? 'me' : ''}" key=${m.pk}>
      <${Av} pk=${m.pk} /><div class="grow"><div class="t ell">${m.team}</div><div class="s">${m.name}${m.pk === st.commish ? ' · commissioner' : ''}${m.pk === me ? ' · you' : ''}</div></div>
      ${isC && m.pk !== me && html`<button class="x" aria-label=${'Remove ' + m.name} onClick=${async () => (await ask(`Remove ${m.name}?`, 'They can rejoin with the link.', 'Remove')) && run('kick', { pk: m.pk })}>✕</button>`}
      ${!isC && m.pk === me && html`<button class="btn sm" onClick=${async () => (await ask('Leave this league?', 'You can rejoin before the draft.', 'Leave')) && run('leave')}>Leave</button>`}
    </div>`)}</div>

    <div class="sec">2 · Player pool <span class="n">${st.pool.size}</span>${st.pool.size < need && html`<span class="tiny muted" style="text-transform:none;letter-spacing:0">need ${need}+</span>`}</div>
    <div class="card stack">
      <p class="small muted">Who (or what) gets drafted. ${st.settings.openPool ? 'Any manager can add names.' : 'Only the commissioner can add names.'}</p>
      ${st.pool.size > 0 && html`<div class="chips">${[...st.pool.values()].map((e) => html`<span class="chip" key=${e.id} title=${e.note}><${Ini} e=${e} size="sm" /><span class="ell">${e.name}</span>${e.note && html`<span class="tiny muted ell">${e.note}</span>`}
        ${isC && html`<button class="x" aria-label=${'Remove ' + e.name} onClick=${() => run('pool-', { id: e.id })}>✕</button>`}</span>`)}</div>`}
      ${(isC || (mem && st.settings.openPool)) ? html`<${PoolAdd} x=${x} />` : !mem && html`<p class="small muted">Join to add players.</p>`}
    </div>

    <div class="sec">3 · Scoring <span class="n">${st.cats.length}</span></div>
    ${isC ? html`<${CatsEditor} x=${x} />` : html`<${CatsView} x=${x} />`}

    <div class="sec">4 · Rules</div>
    <${Settings} x=${x} />

    <div style="margin-top:22px">${isC
    ? html`<button class="btn pri big" disabled=${problems.length > 0} onClick=${start}>🚨 Start the draft</button>
        ${problems.length > 0 && html`<p class="small muted center" style="margin-top:8px">Still need ${problems.join(' and ')}.</p>`}`
    : html`<div class="banner">⏳ <span>Waiting for <b>${x.name(st.commish)}</b> to start the draft${problems.length ? ` (still need ${problems.join(' and ')})` : ''}.</span></div>`}</div>
  </div>`;
}

function PoolAdd({ x, onDone }) {
  const [text, setText] = useState('');
  const add = async (e) => {
    e.preventDefault();
    let lines = text.split('\n');
    if (lines.length === 1 && text.includes(',')) lines = text.split(',');
    const items = lines.map((l) => { const [n, ...rest] = l.split('|'); return { id: rid(), name: n.trim(), note: rest.join('|').trim() }; }).filter((i) => i.name);
    if (!items.length) return;
    const r = await x.run('pool+', { items });
    if (r.ok) { setText(''); if (onDone) { toast('Added to the pool'); onDone(); } }
  };
  return html`<form onSubmit=${add}>
    <textarea class="in" aria-label="Add players" placeholder=${'Add players — one per line\nPriya\nMarcus | the roommate\nProf. Okafor | CS 229'} value=${text} onInput=${(e) => setText(e.target.value)}></textarea>
    <div class="row" style="margin-top:8px"><span class="tiny muted grow">One per line (or comma-separated). Optional note after a |</span><button class="btn dark" disabled=${!text.trim()}>Add</button></div>
  </form>`;
}

const CatsView = ({ x }) => html`<div class="card"><div class="chips">${x.st.cats.map((c) => html`<span class="chip" key=${c.id}>${c.name} <span class="pts ${c.pts >= 0 ? 'pos' : 'neg'}">${sgn(c.pts)}</span></span>`)}
  ${!x.st.cats.length && html`<span class="muted small">No scoring rules yet.</span>`}</div></div>`;

function CatsEditor({ x }) {
  const { st, run } = x;
  const sig = JSON.stringify(st.cats);
  const [rows, setRows] = useState(st.cats.map((c) => ({ ...c })));
  const [base, setBase] = useState(sig);
  if (base !== sig && JSON.stringify(rows.filter((r) => r.name.trim())) === base) { setBase(sig); setRows(st.cats.map((c) => ({ ...c }))); }
  const clean = rows.filter((r) => r.name.trim()).map((r) => ({ id: r.id, name: r.name.trim(), pts: Number(r.pts) || 0 }));
  const dirty = JSON.stringify(clean) !== sig;
  const upd = (i, k, v) => setRows(rows.map((r, j) => (j === i ? { ...r, [k]: v } : r)));
  const save = async () => { const r = await run('cats', { cats: clean }, 'Scoring saved'); if (r.ok) { setBase(JSON.stringify(clean)); setRows(clean); } };
  return html`<div class="card"><h3>Scoring rules</h3><p class="small muted" style="margin-bottom:10px">What earns (or costs) points. Negative numbers are penalties.</p>
    <div class="stack-s">${rows.map((r, i) => html`<div class="row" key=${r.id} style="gap:6px">
      <input class="in grow" maxlength="60" placeholder="Something that can happen" aria-label="Rule" value=${r.name} onInput=${(e) => upd(i, 'name', e.target.value)} />
      <input class="in mono" style="width:76px;text-align:center" type="number" step="0.5" aria-label="Points" value=${r.pts} onInput=${(e) => upd(i, 'pts', e.target.value)} />
      <button class="x" aria-label="Delete rule" onClick=${() => setRows(rows.filter((_, j) => j !== i))}>✕</button></div>`)}</div>
    <div class="row" style="margin-top:10px"><button class="btn sm" onClick=${() => setRows([...rows, { id: rid(), name: '', pts: 1 }])}>+ Add rule</button>
      ${dirty && html`<button class="btn pri right" onClick=${save}>Save scoring</button>`}</div></div>`;
}

function Settings({ x }) {
  const { st, isC, run } = x;
  const s = st.settings, pre = st.phase === 'setup';
  const set = (patch) => run('settings', { settings: patch });
  const [pun, setPun] = useState(s.punishment);
  const row = (label, hint, ctl) => html`<div class="setrow"><div class="lbl"><b>${label}</b><span>${hint}</span></div>${ctl}</div>`;
  if (!isC) {
    return html`<div class="card"><div class="chips">
      <span class="chip">${s.format === 'h2h' ? '⚔️ Head-to-head' : '🏁 Points race'}</span><span class="chip">🧢 ${s.rosterSize} per team</span>
      <span class="chip">▶️ ${s.starters} start</span><span class="chip">🗓️ ${plural(s.numRounds, 'round')}</span>
      <span class="chip">✍️ ${s.whoScores === 'all' ? 'Anyone logs points' : 'Commish logs points'}</span>
      ${s.pickSecs > 0 && html`<span class="chip">⏱️ ${fmtSecs(s.pickSecs)} per pick</span>`}
      ${s.punishment && html`<span class="chip">💀 Last place: ${s.punishment}</span>`}</div></div>`;
  }
  return html`<div class="card"><h3>League rules</h3>
    ${row('Format', s.format === 'h2h' ? 'Face a different manager every round. Best record wins.' : 'No matchups — most total points wins.',
    html`<${Seg} value=${s.format} disabled=${!pre} options=${[['h2h', 'Head-to-head'], ['points', 'Points race']]} onChange=${(v) => set({ format: v })} />`)}
    ${row('Roster size', 'Players per team = rounds in the draft.', html`<${Step} value=${s.rosterSize} min=${1} max=${15} disabled=${!pre} onChange=${(v) => set({ rosterSize: v })} />`)}
    ${row('Starters', s.starters < s.rosterSize ? `Only starters score. ${s.rosterSize - s.starters} on the bench.` : 'Everyone starts — no bench.', html`<${Step} value=${s.starters} min=${1} max=${s.rosterSize} disabled=${!pre} onChange=${(v) => set({ starters: v })} />`)}
    ${row('Rounds', 'A round is whatever you want: a week, an episode, a news cycle. You end each one by hand.', html`<${Step} value=${s.numRounds} min=${Math.max(1, st.round)} max=${52} disabled=${st.phase === 'done'} onChange=${(v) => set({ numRounds: v })} />`)}
    ${row('Who logs points', s.whoScores === 'all' ? 'Any manager. You can strike bad calls.' : 'Only you.', html`<${Seg} value=${s.whoScores} options=${[['all', 'Everyone'], ['commish', 'Just me']]} onChange=${(v) => set({ whoScores: v })} />`)}
    ${pre && row('Pool additions', s.openPool ? 'Any manager can add players before the draft.' : 'Only you can add players.', html`<${Seg} value=${s.openPool ? 'y' : 'n'} options=${[['y', 'Everyone'], ['n', 'Just me']]} onChange=${(v) => set({ openPool: v === 'y' })} />`)}
    ${st.phase !== 'season' && st.phase !== 'done' && row('Pick timer', s.pickSecs ? 'Time’s up → best available is auto-picked.' : 'No clock. Draft live or over a few days.',
    html`<select class="in" style="width:auto" aria-label="Pick timer" value=${s.pickSecs} onChange=${(e) => set({ pickSecs: +e.target.value })}>
      ${[[0, 'Off'], [30, '30 sec'], [60, '1 min'], [120, '2 min'], [3600, '1 hour'], [28800, '8 hours']].map(([v, l]) => html`<option value=${v}>${l}</option>`)}</select>`)}
    <div class="setrow" style="display:block"><div class="lbl"><b>Last-place punishment</b><span>Stakes make it real. Optional.</span></div>
      <form class="row" style="margin-top:6px" onSubmit=${(e) => { e.preventDefault(); set({ punishment: pun }); toast('Saved'); }}>
        <input class="in grow" maxlength="200" placeholder="Buys dinner. Wears the jersey. Sings karaoke." value=${pun} onInput=${(e) => setPun(e.target.value)} />
        ${pun !== s.punishment && html`<button class="btn dark">Save</button>`}</form></div>
  </div>`;
}
const fmtSecs = (s) => (s >= 3600 ? `${s / 3600} hr` : s >= 60 ? `${s / 60} min` : `${s} sec`);
const fmtClock = (s) => { s = Math.max(0, Math.floor(s)); const h = Math.floor(s / 3600), m = Math.floor((s % 3600) / 60), ss = String(s % 60).padStart(2, '0'); return h ? `${h}:${String(m).padStart(2, '0')}:${ss}` : `${m}:${ss}`; };

// ---------------------------------------------------------------- draft
function Draft({ x }) {
  const { st, lg, isC, me, run, name } = x;
  const [q, setQ] = useState('');
  const now = useNow(1000);
  const slot = draftSlot(st);
  const order = st.draft.order, picks = st.draft.picks;
  const mine = slot && slot.pk === me;
  const secs = st.settings.pickSecs;
  const left = secs ? clockStart(st) + secs - now / 1000 : null;
  const avail = available(st);
  const firing = useRef(-1);
  // Clock ran out: any connected manager's browser can submit the auto-pick. First one wins.
  useEffect(() => {
    if (!slot || !secs || left > 0 || !x.mem || !lg.synced || firing.current === slot.n) return;
    firing.current = slot.n;
    const n = slot.n, t = setTimeout(async () => {
      if (lg.state.phase !== 'draft' || lg.state.draft.picks.length !== n) return;
      const top = available(lg.state)[0];
      const r = await lg.act('pick', { n, eid: top.id, auto: true });
      if (r.id) lg.mine.delete(r.id);
    }, (slot.pk === me ? 0 : 600) + Math.random() * 2500);
    return () => clearTimeout(t);
  }, [slot && slot.n, left <= 0]);
  if (!slot) return null;
  const list = avail.filter((e) => !q || (e.name + ' ' + e.note).toLowerCase().includes(q.toLowerCase()));
  const canPick = mine || isC;
  const rounds = st.settings.rosterSize;
  const cell = (r, c) => { const i = r % 2 ? order.length - 1 - c : c; return r * order.length + i; };
  return html`<div>
    <div class="card ${mine ? 'accent' : 'yellow'}"><div class="clock">
      <${Av} pk=${slot.pk} size="lg" />
      <div class="grow"><div class="tiny" style="font-weight:700;letter-spacing:.08em">ROUND ${slot.round} · PICK ${slot.n + 1} OF ${slot.total}</div>
        <div class="big">${mine ? 'You’re on the clock!' : `${name(slot.pk)} is on the clock`}</div></div>
      ${secs > 0 && html`<div class="time ${left < 10 ? 'pulse' : ''}">${fmtClock(left)}</div>`}
    </div></div>

    <div class="sec">Draft board</div>
    <div class="board"><table><thead><tr><th></th>${order.map((pk) => html`<th class=${pk === me ? 'me' : ''}>${name(pk)}</th>`)}</tr></thead>
      <tbody>${Array.from({ length: rounds }, (_, r) => html`<tr><td class="rd">${r + 1}</td>${order.map((pk, c) => {
    const n = cell(r, c), p = picks[n];
    return html`<td class=${n === slot.n ? 'now' : p && n === picks.length - 1 ? 'new' : ''} key=${n + (p ? p.eid : '')}><span class="pn">${r + 1}.${(n % order.length) + 1}${r % 2 ? ' ←' : ' →'}</span>${p ? html`<b>${(st.pool.get(p.eid) || {}).name}</b>` : n === slot.n ? html`<b>…</b>` : ''}</td>`;
  })}</tr>`)}</tbody></table></div>
    ${isC && picks.length > 0 && html`<button class="btn ghost sm" onClick=${async () => (await ask('Undo the last pick?', `${(st.pool.get(picks[picks.length - 1].eid) || {}).name} goes back in the pool.`, 'Undo')) && run('draft.undo')}>↩︎ Undo last pick</button>`}

    <div class="sec">Available <span class="n">${avail.length}</span></div>
    <input class="in" type="search" placeholder="Search players" aria-label="Search players" value=${q} onInput=${(e) => setQ(e.target.value)} style="margin-bottom:10px" />
    <div class="list">${list.map((e) => html`<div class="li" key=${e.id}><${Ini} e=${e} />
      <div class="grow"><div class="t ell">${e.name}</div>${e.note && html`<div class="s ell">${e.note}</div>`}</div>
      ${canPick && html`<button class="btn sm ${mine ? 'pri' : ''}" onClick=${() => run('pick', { n: slot.n, eid: e.id })}>${mine ? 'Draft' : `Pick for ${name(slot.pk)}`}</button>`}
    </div>`)}${!list.length && html`<div class="empty">No one matches.</div>`}</div>
    ${!canPick && x.mem && html`<p class="small muted center" style="margin-top:10px">You can draft when it’s your turn.</p>`}

    ${me && html`<div class="sec">Your picks <span class="n">${(st.rosters[me] || []).length}/${rounds}</span></div>
      <div class="card"><div class="chips">${(st.rosters[me] || []).map((id) => html`<span class="chip"><${Ini} e=${st.pool.get(id)} size="sm" />${st.pool.get(id).name}</span>`)}
      ${!(st.rosters[me] || []).length && html`<span class="muted small">Nobody yet.</span>`}</div></div>`}
  </div>`;
}

// ---------------------------------------------------------------- scores
function Scores({ x }) {
  const { st, sc, isC, run, me, name, team } = x;
  const [vr, setVr] = useState(null);
  const r = Math.min(vr == null ? st.round : vr, st.round);
  const live = st.phase === 'season' && r === st.round;
  const last = st.round >= st.settings.numRounds;
  const advance = async () => {
    const n = st.round + 1;
    const ok = st.round === 0
      ? await ask('Start Round 1?', 'Lineups lock for the round. Scoring opens.', 'Start Round 1')
      : last ? await ask('End the season?', `Round ${st.round} goes final and a champion is crowned. This can’t be undone.`, 'End season')
        : await ask(`End Round ${st.round}?`, `Round ${st.round} goes final and Round ${n} starts with everyone’s current lineup.`, `Start Round ${n}`);
    if (ok) { await run('advance', { n }); setVr(null); }
  };
  const rows = standings(st, sc);
  const plays = st.stats.filter((s) => s.round === r).slice().reverse();
  return html`<div>
    ${st.phase === 'done' && html`<div class="card yellow champ" style="margin-bottom:16px"><div class="cup">🏆</div>
      <div class="tiny" style="font-weight:700;letter-spacing:.1em;margin-top:8px">CHAMPION</div><h2>${team(rows[0].pk)}</h2><p>${name(rows[0].pk)} wins ${st.name}.</p>
      ${rows.length > 1 && html`<p class="small" style="margin-top:10px">💀 Last place: <b>${name(rows[rows.length - 1].pk)}</b>${st.settings.punishment ? ` — ${st.settings.punishment}` : ''}</p>`}</div>`}

    ${st.round === 0 ? html`<div class="card"><h3>Preseason</h3>
        <p>The draft is done. Managers: check <a href=${`#/l/${x.code}/team`}><b>My Team</b></a> and set your starters${st.settings.starters < st.settings.rosterSize ? ' — only starters score' : ''}. Lineups lock when Round 1 starts.</p>
        ${!isC && html`<p class="small muted" style="margin-top:8px">Waiting for ${name(st.commish)} to start Round 1.</p>`}</div>`
    : html`<div class="rnav"><button class="btn sm" aria-label="Previous round" disabled=${r <= 1} onClick=${() => setVr(r - 1)}>‹</button>
        <div class="ttl">Round ${r} ${live ? html`<span class="pill live"><span class="dot pulse" style="background:#17140F"></span>LIVE</span>` : html`<span class="pill dark">FINAL</span>`}</div>
        <button class="btn sm" aria-label="Next round" disabled=${r >= st.round} onClick=${() => setVr(r + 1)}>›</button></div>
      ${st.settings.format === 'h2h'
    ? html`<div class="stack">${matchups(st.draft.order, r).map(([a, b]) => html`<${Matchup} x=${x} a=${a} b=${b} r=${r} key=${a + r} />`)}</div>`
    : html`<div class="list">${st.draft.order.slice().sort((a, b) => sc.team[b].r[r] - sc.team[a].r[r]).map((pk, i) => html`<div class="li ${pk === me ? 'me' : ''}" key=${pk}>
          <span class="mono muted" style="width:18px">${i + 1}</span><${Av} pk=${pk} /><div class="grow"><div class="t ell">${team(pk)}</div><div class="s">${name(pk)}</div></div>
          <div class="num">${num(sc.team[pk].r[r])}</div></div>`)}</div>`}`}

    ${isC && st.phase === 'season' && html`<div class="card ink" style="margin-top:16px"><div class="row"><div class="grow"><b>Commissioner</b>
      <div class="small" style="opacity:.75">${st.round === 0 ? 'Everyone ready? Lock lineups and open scoring.' : last ? 'Final round. End it when scoring is settled.' : 'When the round is over, close it out.'}</div></div>
      <button class="btn yel" onClick=${advance}>${st.round === 0 ? 'Start Round 1' : last ? 'End season' : `End Round ${st.round} →`}</button></div></div>`}

    ${st.round > 0 && html`<div class="sec">Scoring plays <span class="n">${plays.filter((p) => !p.void).length}</span></div>
      <div class="list feed">${plays.map((s) => html`<${Play} x=${x} s=${s} key=${s.id} />`)}
      ${!plays.length && html`<div class="empty">${live ? (x.canScore ? 'Nothing logged yet. Something happen? Hit “Log points”.' : 'Nothing logged yet this round.') : 'Nothing was logged this round.'}</div>`}</div>`}
  </div>`;
}

function Play({ x, s }) {
  const { st, isC, me, run, name } = x;
  const e = st.pool.get(s.eid);
  const own = Object.entries((st.locked[s.round] || {})).find(([, l]) => l.includes(s.eid));
  return html`<div class="it ${s.void ? 'void' : ''}"><div class="ic"><${Ini} e=${e} size="sm" /></div>
    <div class="grow tx"><b>${e ? e.name : '???'}</b> — ${s.label}${s.qty > 1 ? ` ×${s.qty}` : ''}
      ${s.note && html`<div class="small muted">“${s.note}”</div>`}
      <div class="when">${own ? `counts for ${name(own[0])}` : 'not in a starting lineup'} · logged by ${name(s.by)} · ${ago(s.at)}</div></div>
    <${Pts} v=${s.pts} />
    ${!s.void && (isC || s.by === me) && st.phase !== 'done' && html`<button class="x" aria-label="Strike this play" title="Strike" onClick=${async () => (await ask('Strike this play?', `${e ? e.name : ''}: ${s.label} (${sgn(s.pts)}) is removed from the record.`, 'Strike it')) && run('stat.void', { id: s.id })}>✕</button>`}
  </div>`;
}

function Matchup({ x, a, b, r }) {
  const { st, sc, me, name, team } = x;
  const [open, setOpen] = useState(a === me || b === me);
  const sa = sc.team[a].r[r] || 0, sb = b ? sc.team[b].r[r] || 0 : 0;
  const fin = roundDone(st, r);
  const side = (pk, s, o) => html`<div class="side ${fin && pk && s > o ? 'win' : ''}"><${Av} pk=${pk} />
    <div class="grow"><div class="t ell">${team(pk)}</div><div class="tiny muted">${name(pk)}${fin && s > o ? ' · W' : ''}</div></div><div class="score">${num(s)}</div></div>`;
  const det = (pk) => html`<div class="stack-s">${((st.locked[r] || {})[pk] || []).map((id) => html`<div><span class="ell">${(st.pool.get(id) || {}).name || '—'}</span><${Pts} v=${(sc.ent[id] && sc.ent[id].r[r]) || 0} plain /></div>`)}</div>`;
  if (!b) return html`<div class="card mu"><div class="side"><${Av} pk=${a} /><div class="grow"><div class="t ell">${team(a)}</div><div class="tiny muted">${name(a)} · bye round</div></div><div class="score">${num(sa)}</div></div></div>`;
  return html`<div class="card mu" onClick=${() => setOpen(!open)} style="cursor:pointer">
    ${side(a, sa, sb)}<div class="vs"><span>VS</span></div>${side(b, sb, sa)}
    ${open && html`<div class="det">${det(a)}${det(b)}</div>`}</div>`;
}

// ---------------------------------------------------------------- team
function Team({ x }) {
  const { st, sc, me, isC, run, name, team, open } = x;
  const [vpk, setVpk] = useState(me || st.draft.order[0]);
  const [swap, setSwap] = useState(null);
  const pk = st.rosters[vpk] ? vpk : st.draft.order[0];
  const roster = st.rosters[pk] || [], lu = st.lineups[pk] || [];
  const bench = roster.filter((id) => !lu.includes(id));
  const can = st.phase === 'season' && (pk === me || isC);
  const locked = st.round >= 1 ? (st.locked[st.round] || {})[pk] || [] : [];
  const hasBench = st.settings.starters < st.settings.rosterSize;
  const doSwap = async (inId, outId) => {
    const s = lu.map((id) => (id === outId ? inId : id));
    if (!outId) s.push(inId);
    setSwap(null);
    await run('lineup', { starters: s, pk }, 'Lineup saved');
  };
  const row = (id, starter) => {
    const e = st.pool.get(id), p = sc.ent[id] || { total: 0, r: {} };
    return html`<div class="li tap" key=${id} onClick=${() => open({ k: 'ent', eid: id })}><${Ini} e=${e} />
      <div class="grow"><div class="t ell">${e.name} ${st.phase === 'season' && locked.includes(id) && html`<span class="pill grn" title="In this round’s locked lineup">R${st.round} ✓</span>`}</div>
        <div class="s ell">${e.note || ' '}${st.round >= 1 ? ` ${e.note ? '· ' : ''}this round ${sgn(p.r[st.round] || 0)}` : ''}</div></div>
      <div class="num"><${Pts} v=${p.total} plain /></div>
      ${can && hasBench && html`<button class="btn sm" onClick=${(ev) => { ev.stopPropagation(); starter ? setSwap({ out: id }) : lu.length < st.settings.starters ? doSwap(id, null) : setSwap({ in: id }); }}>${starter ? 'Bench' : 'Start'}</button>`}
    </div>`;
  };
  const rec = standings(st, sc).find((r) => r.pk === pk);
  return html`<div>
    <div class="row" style="margin-bottom:12px"><${Av} pk=${pk} size="lg" />
      <div class="grow"><div style="font-size:22px;font-weight:800;letter-spacing:-.02em;line-height:1.1" class="ell">${team(pk)}</div>
        <div class="small muted">${name(pk)} · ${st.settings.format === 'h2h' ? `${rec.w}–${rec.l}${rec.t ? '–' + rec.t : ''} · ` : ''}${num(rec.pf)} pts · #${rec.rank}</div></div></div>
    <select class="in" aria-label="View team" value=${pk} onChange=${(e) => setVpk(e.target.value)} style="margin-bottom:12px">
      ${st.draft.order.map((k) => html`<option value=${k}>${team(k)} — ${name(k)}${k === me ? ' (you)' : ''}</option>`)}</select>
    ${can && hasBench && st.round >= 1 && html`<div class="banner" style="margin-bottom:12px">🔒 <span>Round ${st.round} is live and its lineup is locked. Changes here take effect in <b>Round ${st.round + 1}</b>.</span></div>`}
    <div class="sec" style="margin-top:6px">${hasBench ? (st.phase === 'done' ? 'Starters' : st.round >= 1 ? `Starters for round ${st.round + 1}` : 'Starters') : 'Roster'} <span class="n">${lu.length}</span></div>
    <div class="list">${lu.map((id) => row(id, true))}${!lu.length && html`<div class="empty">Empty roster.</div>`}</div>
    ${hasBench && html`<div class="sec">Bench <span class="n">${bench.length}</span></div>
      <div class="list">${bench.map((id) => row(id, false))}${!bench.length && html`<div class="empty">No one on the bench.</div>`}</div>`}
    ${roster.length < st.settings.rosterSize && can && html`<p class="small muted" style="margin-top:10px">Open roster spot — grab a free agent in <a href=${`#/l/${x.code}/players`}>Players</a>.</p>`}
    ${pk !== me && me && st.phase === 'season' && html`<button class="btn" style="margin-top:14px" onClick=${() => open({ k: 'trade', to: pk })}>🤝 Propose a trade with ${name(pk)}</button>`}
    ${swap && html`<${Sheet} title=${swap.in ? 'Who sits?' : 'Who starts instead?'} onClose=${() => setSwap(null)}><div class="list">
      ${(swap.in ? lu : bench).map((id) => html`<div class="li tap" onClick=${() => (swap.in ? doSwap(swap.in, id) : doSwap(id, swap.out))}><${Ini} e=${st.pool.get(id)} /><div class="grow t">${st.pool.get(id).name}</div><${Pts} v=${(sc.ent[id] || {}).total || 0} plain /></div>`)}
      ${!(swap.in ? lu : bench).length && html`<div class="empty">No one to swap with.</div>`}</div><//>`}
  </div>`;
}

// ---------------------------------------------------------------- players
function Players({ x }) {
  const { st, sc, me, isC, name, open } = x;
  const [q, setQ] = useState('');
  const [f, setF] = useState('all');
  let list = [...st.pool.values()];
  if (f === 'fa') list = list.filter((e) => !st.owner[e.id]);
  if (f === 'mine') list = list.filter((e) => st.owner[e.id] === me);
  if (q) list = list.filter((e) => (e.name + ' ' + e.note).toLowerCase().includes(q.toLowerCase()));
  const tot = (e) => (sc.ent[e.id] || {}).total || 0;
  list.sort((a, b) => tot(b) - tot(a) || a.name.localeCompare(b.name));
  return html`<div>
    <div class="row" style="margin-bottom:10px"><input class="in grow" type="search" placeholder="Search players" aria-label="Search players" value=${q} onInput=${(e) => setQ(e.target.value)} />
      ${isC && st.phase === 'season' && html`<button class="btn" onClick=${() => open({ k: 'pool' })}>+ New</button>`}</div>
    <${Seg} value=${f} options=${[['all', 'Everyone'], ['fa', 'Free agents'], ...(me ? [['mine', 'Mine']] : [])]} onChange=${setF} />
    <div class="list" style="margin-top:12px">${list.map((e) => html`<div class="li tap" key=${e.id} onClick=${() => open({ k: 'ent', eid: e.id })}><${Ini} e=${e} />
      <div class="grow"><div class="t ell">${e.name}</div><div class="s ell">${st.owner[e.id] ? name(st.owner[e.id]) : 'Free agent'}${e.note ? ' · ' + e.note : ''}</div></div>
      ${!st.owner[e.id] && html`<span class="pill grn">FA</span>`}<div class="num"><${Pts} v=${tot(e)} plain /></div></div>`)}
      ${!list.length && html`<div class="empty">${f === 'fa' ? 'No free agents — everyone’s rostered.' : 'No one matches.'}</div>`}</div>
  </div>`;
}

function EntitySheet({ x, eid, onClose }) {
  const { st, sc, me, isC, run, name, team, open, canScore } = x;
  const [dropping, setDropping] = useState(false);
  const e = st.pool.get(eid);
  if (!e) return null;
  const owner = st.owner[eid], p = sc.ent[eid] || { total: 0, r: {} };
  const my = me ? st.rosters[me] || [] : [];
  const season = st.phase === 'season';
  const full = my.length >= st.settings.rosterSize;
  const add = async (drop) => { const r = await run('adddrop', { add: eid, drop }, `Added ${e.name}`); if (r.ok) onClose(); };
  const hist = st.stats.filter((s) => s.eid === eid).slice().reverse();
  return html`<${Sheet} title=${e.name} onClose=${onClose}><div class="stack">
    <div class="row"><${Ini} e=${e} /><div class="grow"><div class="small muted">${e.note}</div>
      <div>${owner ? html`On <b>${team(owner)}</b> (${name(owner)})` : html`<span class="pill grn">Free agent</span>`}</div></div>
      <div style="text-align:right"><div class="mono" style="font-size:26px;line-height:1">${num(p.total)}</div><div class="tiny muted">points</div></div></div>
    ${dropping ? html`<div><p class="small" style="margin-bottom:8px"><b>Your roster is full.</b> Who gets dropped for ${e.name}?</p>
        <div class="list">${my.map((id) => html`<div class="li tap" onClick=${() => add(id)}><${Ini} e=${st.pool.get(id)} /><div class="grow t">${st.pool.get(id).name}</div><span class="btn sm">Drop</span></div>`)}</div></div>`
    : html`<div class="row wrapx">
        ${canScore && html`<button class="btn pri" onClick=${() => open({ k: 'log', eid })}>＋ Log points</button>`}
        ${season && me && !owner && html`<button class="btn yel" onClick=${() => (full ? setDropping(true) : add(null))}>Add to my team</button>`}
        ${season && me && owner && owner !== me && html`<button class="btn" onClick=${() => open({ k: 'trade', to: owner, want: eid })}>🤝 Trade for</button>`}
        ${season && owner === me && html`<button class="btn" onClick=${async () => { if (await ask(`Drop ${e.name}?`, 'They become a free agent anyone can grab.', 'Drop')) { const r = await run('adddrop', { drop: eid }); if (r.ok) onClose(); } }}>Drop</button>`}
        ${isC && season && owner && owner !== me && html`<button class="btn" onClick=${async () => { if (await ask(`Drop ${e.name} from ${team(owner)}?`, 'Commissioner move. They become a free agent.', 'Drop')) { const r = await run('adddrop', { drop: eid, pk: owner }); if (r.ok) onClose(); } }}>Force drop</button>`}
      </div>`}
    ${st.round > 0 && html`<div><div class="h3" style="margin-bottom:6px">By round</div><div class="chips">${Array.from({ length: st.round }, (_, i) => html`<span class="chip">R${i + 1} <${Pts} v=${p.r[i + 1] || 0} /></span>`)}</div></div>`}
    <div><div class="h3" style="margin-bottom:6px">Game log</div>
      <div class="list feed">${hist.map((s) => html`<div class="it ${s.void ? 'void' : ''}"><div class="grow tx">${s.label}${s.qty > 1 ? ` ×${s.qty}` : ''}${s.note && html` <span class="muted small">“${s.note}”</span>`}
        <div class="when">Round ${s.round} · ${name(s.by)} · ${ago(s.at)}</div></div><${Pts} v=${s.pts} /></div>`)}
      ${!hist.length && html`<div class="empty">Nothing logged yet.</div>`}</div></div>
  </div><//>`;
}

function LogSheet({ x, eid, onClose }) {
  const { st, isC, run } = x;
  const [e, setE] = useState(eid || null);
  const [q, setQ] = useState('');
  const [cat, setCat] = useState(null);
  const [qty, setQty] = useState(1);
  const [note, setNote] = useState('');
  const [label, setLabel] = useState('');
  const [pts, setPts] = useState('');
  const [round, setRound] = useState(st.round);
  const ent = e && st.pool.get(e);
  const c = st.cats.find((k) => k.id === cat);
  const each = cat === '*' ? Number(pts) || 0 : c ? c.pts : 0;
  const ok = ent && (c || (cat === '*' && label.trim() && each));
  const submit = async (ev) => {
    ev.preventDefault();
    const p = { eid: e, qty, note };
    if (c) p.cat = c.id; else { p.label = label.trim(); p.pts = each; }
    if (isC && round !== st.round) p.round = round;
    const r = await run('stat', p, `${ent.name} ${sgn(each * qty)}`);
    if (r.ok) onClose();
  };
  const list = [...st.pool.values()].filter((p) => !q || p.name.toLowerCase().includes(q.toLowerCase()))
    .sort((a, b) => (st.owner[b.id] ? 1 : 0) - (st.owner[a.id] ? 1 : 0) || a.name.localeCompare(b.name));
  return html`<${Sheet} title="Log points" onClose=${onClose}>
    ${!ent ? html`<div><input class="in" type="search" placeholder="Who did something?" aria-label="Search players" value=${q} onInput=${(v) => setQ(v.target.value)} style="margin-bottom:10px" />
      <div class="list">${list.map((p) => html`<div class="li tap" key=${p.id} onClick=${() => setE(p.id)}><${Ini} e=${p} /><div class="grow"><div class="t ell">${p.name}</div>
        <div class="s">${st.owner[p.id] ? x.name(st.owner[p.id]) : 'Free agent'}</div></div></div>`)}${!list.length && html`<div class="empty">No one matches.</div>`}</div></div>`
    : html`<form class="stack" onSubmit=${submit}>
      <div class="row"><${Ini} e=${ent} /><b class="grow">${ent.name}</b><button type="button" class="btn sm" onClick=${() => setE(null)}>Change</button></div>
      <div><label class="f">What happened?</label><div class="chips">
        ${st.cats.map((k) => html`<button type="button" class="chip ${cat === k.id ? 'on' : ''}" onClick=${() => setCat(k.id)}>${k.name} <span class="pts ${cat === k.id ? '' : k.pts >= 0 ? 'pos' : 'neg'}">${sgn(k.pts)}</span></button>`)}
        <button type="button" class="chip ${cat === '*' ? 'on' : ''}" onClick=${() => setCat('*')}>Something else…</button></div></div>
      ${cat === '*' && html`<div class="row"><input class="in grow" maxlength="60" placeholder="What happened" aria-label="What happened" value=${label} onInput=${(v) => setLabel(v.target.value)} />
        <input class="in mono" style="width:86px;text-align:center" type="number" step="0.5" placeholder="±pts" aria-label="Points" value=${pts} onInput=${(v) => setPts(v.target.value)} /></div>`}
      <div class="row"><div class="grow"><label class="f">How many times</label><${Step} value=${qty} min=${1} max=${99} onChange=${setQty} /></div>
        ${isC && st.round > 1 && html`<div><label class="f">Round</label><${Step} value=${round} min=${1} max=${st.round} onChange=${setRound} /></div>`}</div>
      <div><label class="f" for="nt">Receipts (optional)</label><input id="nt" class="in" maxlength="140" placeholder="Link, quote, or what you saw" value=${note} onInput=${(v) => setNote(v.target.value)} /></div>
      <button class="btn pri big" disabled=${!ok}>${ok ? `Log ${sgn(each * qty)} for ${ent.name}` : 'Pick what happened'}</button>
    </form>`}
  <//>`;
}

function TradeSheet({ x, to, want, onClose }) {
  const { st, me, run, name } = x;
  const [give, setGive] = useState([]);
  const [get, setGet] = useState(want ? [want] : []);
  const tog = (arr, set, id) => set(arr.includes(id) ? arr.filter((i) => i !== id) : [...arr, id]);
  const chips = (pk, arr, set) => html`<div class="chips">${(st.rosters[pk] || []).map((id) => html`<button type="button" class="chip ${arr.includes(id) ? 'on' : ''}" onClick=${() => tog(arr, set, id)}>${st.pool.get(id).name}</button>`)}</div>`;
  const ok = give.length > 0 && give.length === get.length;
  return html`<${Sheet} title=${`Trade with ${name(to)}`} onClose=${onClose}><div class="stack">
    <div><label class="f">You get</label>${chips(to, get, setGet)}</div>
    <div><label class="f">You give</label>${chips(me, give, setGive)}</div>
    <button class="btn pri big" disabled=${!ok} onClick=${async () => { const r = await run('trade.offer', { to, give, get }, 'Offer sent'); if (r.ok) onClose(); }}>
      ${ok ? `Offer ${give.length}-for-${get.length}` : 'Pick the same number on each side'}</button>
  </div><//>`;
}

// ---------------------------------------------------------------- league
function LeagueTab({ x }) {
  const { st, sc, me, isC, run, name, team, open, code } = x;
  const rows = standings(st, sc), h2h = st.settings.format === 'h2h';
  const en = (ids) => ids.map((id) => (st.pool.get(id) || {}).name).join(' + ');
  const trades = st.trades.slice().reverse();
  const [pick, setPick] = useState(false);
  return html`<div>
    <div class="sec" style="margin-top:4px">Standings</div>
    <div class="card" style="padding:8px 10px"><table class="st"><thead><tr><th>#</th><th>Team</th>${h2h && html`<th>W-L${rows.some((r) => r.t) ? '-T' : ''}</th>`}<th>PF</th>${h2h && html`<th>PA</th>`}</tr></thead>
      <tbody>${rows.map((r) => html`<tr class=${r.pk === me ? 'me' : ''} key=${r.pk}><td>${r.rank}</td><td><div class="ell" style="max-width:42vw">${team(r.pk)}</div><div class="tiny muted" style="font-weight:400">${name(r.pk)}</div></td>
        ${h2h && html`<td>${r.w}-${r.l}${rows.some((q) => q.t) ? '-' + r.t : ''}</td>`}<td>${num(r.pf)}</td>${h2h && html`<td>${num(r.pa)}</td>`}</tr>`)}</tbody></table></div>
    ${st.settings.punishment && html`<p class="small" style="margin-top:8px">💀 Last place: <b>${st.settings.punishment}</b></p>`}

    <div class="sec">Trades ${trades.filter((t) => t.status === 'open').length > 0 && html`<span class="n">${trades.filter((t) => t.status === 'open').length} open</span>`}</div>
    <div class="list">${trades.map((t) => html`<div class="li" key=${t.id} style="flex-wrap:wrap"><div class="grow" style="min-width:200px">
        <div class="t" style="font-weight:600"><b>${name(t.from)}</b> gives ${en(t.give)} <span class="muted">for</span> <b>${name(t.to)}</b>’s ${en(t.get)}</div>
        <div class="s">${{ open: 'Waiting on ' + name(t.to), done: 'Accepted ✓', declined: 'Declined', cancelled: 'Withdrawn', void: 'Voided — rosters changed' }[t.status]} · ${ago(t.at)}</div></div>
      ${t.status === 'open' && t.to === me && html`<button class="btn sm pri" onClick=${() => run('trade.accept', { id: t.id }, 'Trade accepted')}>Accept</button><button class="btn sm" onClick=${() => run('trade.decline', { id: t.id })}>Decline</button>`}
      ${t.status === 'open' && t.from === me && html`<button class="btn sm" onClick=${() => run('trade.decline', { id: t.id }, 'Offer withdrawn')}>Withdraw</button>`}
    </div>`)}${!trades.length && html`<div class="empty">No trades yet. Somebody make an offer.</div>`}</div>
    ${me && st.phase === 'season' && html`<button class="btn" style="margin-top:10px" onClick=${() => setPick(true)}>🤝 Propose a trade</button>`}

    ${h2h && html`<div class="sec">Schedule</div>
      <div class="card stack-s">${Array.from({ length: st.settings.numRounds }, (_, i) => i + 1).map((r) => html`<div key=${r}>
        <div class="tiny muted" style="font-weight:700;letter-spacing:.06em">ROUND ${r}${r === st.round && st.phase === 'season' ? ' · LIVE' : ''}</div>
        ${matchups(st.draft.order, r).map(([a, b]) => html`<div class="row small" style="gap:6px"><span class="ell ${a === me ? '' : ''}" style=${a === me ? 'font-weight:700' : ''}>${name(a)}</span>
          ${b ? html`${r <= st.round && html`<span class="mono">${num(sc.team[a].r[r])}–${num(sc.team[b].r[r])}</span>`}${r > st.round && html`<span class="muted">vs</span>`}<span class="ell" style=${b === me ? 'font-weight:700' : ''}>${name(b)}</span>` : html`<span class="muted">bye</span>`}</div>`)}</div>`)}</div>`}

    <div class="sec">Scoring</div><${CatsView} x=${x} />
    <div class="sec">Rules</div><${Settings} x=${{ ...x, isC: false }} />
    ${isC && html`<button class="btn dark" style="margin-top:12px" onClick=${() => open({ k: 'rules' })}>⚙️ Commissioner tools</button>`}
    <div class="sec">Invite link</div><${LinkBox} code=${code} />
    <p class="small muted" style="margin-top:8px">Anyone with the link can watch. Only managers can play.</p>
    ${pick && html`<${Sheet} title="Trade with…" onClose=${() => setPick(false)}><div class="list">${st.draft.order.filter((k) => k !== me).map((k) => html`<div class="li tap" onClick=${() => { setPick(false); open({ k: 'trade', to: k }); }}>
      <${Av} pk=${k} /><div class="grow"><div class="t">${team(k)}</div><div class="s">${name(k)}</div></div></div>`)}</div><//>`}
  </div>`;
}

// ---------------------------------------------------------------- feed
function Feed({ x }) {
  const { st, me, mem, run, name } = x;
  const [text, setText] = useState('');
  const send = async (e) => { e.preventDefault(); const t = text.trim(); if (!t) return; setText(''); const r = await run('chat', { text: t }); if (r.err) setText(t); };
  const items = st.feed.slice().reverse().slice(0, 300);
  return html`<div>
    ${mem ? html`<form class="chatbar" onSubmit=${send} style="margin:0 0 12px"><input class="in grow" maxlength="500" placeholder="Talk your trash" aria-label="Message" value=${text} onInput=${(e) => setText(e.target.value)} /><button class="btn dark">Send</button></form>`
    : html`<p class="small muted" style="margin-bottom:10px">Sign in as a manager to chat.</p>`}
    <div class="list feed">${items.map((f) => (f.k === 'chat'
    ? html`<div class="it chat ${f.pk === me ? 'mine' : ''}" key=${f.id}><${Av} pk=${f.pk} size="sm" /><div class="grow"><div class="when">${name(f.pk)} · ${ago(f.at)}</div><div class="bub">${f.text}</div></div></div>`
    : f.k === 'stat'
      ? html`<div class="it sys ${f.void ? 'void' : ''}" key=${f.id}><div class="ic">🧾</div><div class="grow tx">${f.text} ${f.note && html`<span class="muted">“${f.note}”</span>`}<div class="when">${name(f.pk)} · R${f.round} · ${ago(f.at)}</div></div><${Pts} v=${f.pts} /></div>`
      : html`<div class="it sys" key=${f.id}><div class="ic">${f.icon}</div><div class="grow">${f.text}<div class="when">${ago(f.at)}</div></div></div>`))}
    ${!items.length && html`<div class="empty">Quiet in here.</div>`}</div>
  </div>`;
}
