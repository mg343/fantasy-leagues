import { html, useState, useEffect, useRef, useNow, go, toast, ask, parseNames, ago, assignEmoji, Av, Ini, Pts, num, sgn, plural, Sheet, Seg, Step, copy, leagueUrl } from './ui.js';
import { League, rid, validPin, PIN_MIN } from './net.js';
import { scores, standings, matchups, draftSlot, clockStart, available, roundDone, normName, PERIODS, fitRoster, isSolo, isRace, pairsFor, selfId, endsAt } from './core.js';

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
  season: [['scores', '📊', 'Scores'], ['team', '🧢', 'My Team'], ['players', '🔎', 'Players'], ['league', '🏆', 'League'], ['feed', '💬', 'Chat']],
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
  const solo = isSolo(st);
  const tabs = solo && st.phase !== 'setup' ? TABS.season.filter((t) => t[0] !== 'team' && t[0] !== 'players') : TABS[st.phase];
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
  const P = st.settings.period || 'Week';
  const x = { lg, st, sc, mem, isC, run, me: mem ? mem.pk : null, open: setSheet, canScore, name, team, code, P, p: P.toLowerCase(), solo, race: isRace(st) };

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
          : isRace(st) ? html`<span class="pill live">${endsAt(st) ? `Live · ${timeLeft(endsAt(st))}` : 'Season live'}</span>`
            : html`<span class="pill live">${P} ${st.round} of ${st.settings.numRounds}</span>`;
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
    ${cur !== 'league' && st.trades.filter((t) => t.status === 'open' && t.to === x.me).slice(0, 1).map((t) => html`<div class="card yellow" style="margin-bottom:14px;padding:12px 14px" key=${t.id}>
      <div class="small"><b>🤝 ${name(t.from)} wants to trade.</b> You get ${t.give.map((id) => (st.pool.get(id) || {}).name).join(' + ')} for ${t.get.map((id) => (st.pool.get(id) || {}).name).join(' + ')}.</div>
      <div class="row" style="margin-top:8px"><button class="btn sm dark" onClick=${() => run('trade.accept', { id: t.id }, 'Trade accepted')}>Accept</button><button class="btn sm" onClick=${() => run('trade.decline', { id: t.id })}>Decline</button></div></div>`)}
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
  const setup = st.phase === 'setup' || st.phase === 'season'; // can join
  const known = !!lg.memberFor(name);
  const enter = async (e) => {
    e.preventDefault();
    const n = name.trim();
    if (!n) return toast('Type your name', 'err');
    if (!validPin(pin)) return toast(known ? 'Enter your PIN' : `Choose a PIN of at least ${PIN_MIN} characters`, 'err');
    const r = lg.login(n, pin);
    if (r === 'taken') return toast('Wrong PIN for that name', 'err');
    if (r === 'member') return toast(`Welcome back, ${lg.member.name}`);
    if (!setup) { lg.logout(); return toast(st.phase === 'draft' ? 'The draft is happening — join once it’s done' : 'The season is over — joining is closed', 'err'); }
    setBusy(true);
    const j = await lg.act('join', { name: n });
    setBusy(false);
    if (j.err) { lg.logout(); toast(j.err, 'err'); } else toast(st.phase === 'season' && !x.solo ? 'You’re in! Grab free agents in Players to build your team.' : 'You’re in! 🎉');
  };
  return html`<div class="card yellow" style="margin-bottom:16px">
    <h3>${setup ? '👋 You’re invited' : 'Who are you?'}</h3>
    ${setup && html`<p style="margin-bottom:10px">Join <b>${st.name}</b>. No account — just a name and a PIN.${st.phase === 'season' ? (x.solo ? ' The season’s already going; you start at 0.' : ' The draft’s done; you’ll build your team from free agents.') : ''}</p>`}
    <form class="row wrapx" onSubmit=${enter}>
      <input class="in grow" style="min-width:150px" maxlength="24" placeholder="Your name" aria-label="Your name" autocomplete="nickname" value=${name} onInput=${(e) => setName(e.target.value)} />
      <input class="in" style="width:120px" type="password" maxlength="32" placeholder="PIN" aria-label="PIN" autocomplete="off" ref=${pinRef} value=${pin} onInput=${(e) => setPin(e.target.value)} />
      <button class="btn dark" disabled=${busy}>${setup && !known ? 'Join league' : 'Sign in'}</button>
    </form>
    <p class="small" style="margin-top:8px">${known ? 'Enter the PIN you chose when you joined.' : setup ? `New here? Choose a PIN (${PIN_MIN}+ characters). You’ll need it to sign in again.` : (st.phase === 'draft' ? 'The draft is on — you can join once it’s done. ' : 'Joining is closed. ') + 'Players sign in with their name and PIN.'}</p>
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
  const { st, isC, mem, run, me, code, open, name, solo, P, p } = x;
  const need = st.members.length * st.settings.rosterSize;
  const fit = fitRoster(st), set = st.settings, h2h = set.format === 'h2h';
  const checks = [
    [st.members.length >= (solo ? 1 : 2), solo && st.members.length < 2 ? 'Just you so far — friends can join any time, even mid-season' : `${plural(st.members.length, 'person')} in the league`.replace('persons', 'people'), 'at least 2 people for the draft'],
    ...(solo ? [] : [[fit >= 1, fit >= 1 ? `${plural(st.pool.size, 'name')} to draft → teams of ${fit}` : `${plural(st.pool.size, 'name')} to draft`, 'at least one name to draft per person']]),
    [st.cats.length > 0, `${plural(st.cats.length, 'scoring rule')}`, 'at least one scoring rule'],
  ];
  const problems = checks.filter((c) => !c[0]).map((c) => c[2]);
  const order = !solo && st.preorder && st.preorder.length === st.members.length ? st.preorder : null;
  const shuffle = () => {
    const o = st.members.map((m) => m.pk);
    for (let i = o.length - 1; i > 0; i--) { const j = crypto.getRandomValues(new Uint32Array(1))[0] % (i + 1); [o[i], o[j]] = [o[j], o[i]]; }
    return o;
  };
  const start = async () => {
    const ok = solo
      ? await ask('Start the season?', `Scoring opens now${x.race ? (set.lengthDays ? ` and the race ends on ${fmtDay(Date.now() / 1000 + set.lengthDays * 86400)}` : '') : ` with ${P} 1`}. Friends can still join with the link and start at 0.`, 'Start season')
      : await ask('Start the draft?', `Anyone who joins after this builds a team from free agents. ${order ? `${name(order[0])} picks first.` : 'The draft order will be randomized.'} ${st.members.length} people, ${fit} ${fit === 1 ? 'pick' : 'picks'} each.`, 'Start draft');
    if (ok) run('draft.start', { order: order || shuffle() });
  };
  const list = order ? order.map((pk) => st.members.find((m) => m.pk === pk)) : st.members;
  const startBtn = html`<button class="btn pri big" disabled=${problems.length > 0} onClick=${start}>${solo ? '▶️ Start the season' : '🚨 Start the draft'}</button>`;
  const c0 = st.cats[0], ex = c0 ? `“${c0.name}” (${sgn(c0.pts)})` : 'something on the scoring list';
  const wk = h2h ? `Each ${p}, everyone is matched against one other person. Higher score wins the ${p}.` : 'No weeks, no matchups — one long race for the most points.';
  const end = h2h ? `After ${plural(set.numRounds, p)} the best record wins.` : set.lengthDays ? `After ${lenLabel(set.lengthDays)} (the clock starts when the season does), most points wins. The commissioner can end it early or extend it.` : 'When the commissioner ends the season, most points wins.';
  const steps = solo ? [
    ['Send the link below to your friends.', `${st.members.length > 1 ? `${st.members.length} in so far. ` : ''}You can start now — people can join any time and start at 0.`],
    ['Do things, log points.', `When someone does ${ex}, anyone taps “Log points”, picks the person and what they did.`],
    [h2h ? `Win your ${p}.` : 'Climb the standings.', wk],
    ['Crown a champion.', `${end}${set.punishment ? ` Last place: ${set.punishment}.` : ''}`],
  ] : [
    ['Build the list of who can be drafted.', `${plural(st.pool.size, 'name')} so far${st.hint ? ` — ${st.hint.replace(/…$/, '').toLowerCase()}` : ''}. Aim for 3–4 per person playing.`],
    ['Everyone joins, then you draft.', `Take turns claiming names until each of you has a team${fit >= 1 ? ` of ${fit}` : ''}. Once a name is taken, it’s that person’s alone.`],
    ['Your team does things, you score.', `When someone you drafted does ${ex}, anyone logs it and the points go to you${set.starters < set.rosterSize ? ' (if you’re starting them)' : ''}.`],
    [h2h ? `Win your ${p}, win the league.` : 'Climb the standings.', `${wk} ${end}`],
  ];
  return html`<div>
    ${isC && html`<div class="card" style="margin-bottom:14px"><h3>${solo ? 'Before you start' : 'Before you draft'}</h3>
      <div class="stack-s" style="margin-bottom:12px">${checks.map(([ok, label]) => html`<div class="row small" style="gap:8px"><span class="pill ${ok ? 'grn' : ''}" style="min-width:26px;justify-content:center">${ok ? '✓' : '·'}</span><span class=${ok ? '' : 'muted'}>${label}</span></div>`)}</div>
      ${!solo && set.draftNote && html`<p class="small" style="margin-bottom:10px">🗓 Draft: <b>${set.draftNote}</b></p>`}
      ${startBtn}${problems.length > 0 && html`<p class="small muted center" style="margin-top:8px">Still need ${problems.join(' and ')}.</p>`}</div>`}
    ${!isC && mem && html`<div class="card yellow" style="margin-bottom:14px"><b>✅ You’re in.</b> ${!solo && set.draftNote ? html`Draft: <b>${set.draftNote}</b>.` : html`Waiting for <b>${name(st.commish)}</b> to start the ${solo ? 'season' : 'draft'}.`}</div>`}
    ${!mem && !solo && set.draftNote && html`<div class="banner" style="margin-bottom:14px">🗓 <span>Draft: <b>${set.draftNote}</b></span></div>`}

    <div class="card" style="margin-bottom:14px"><h3>How this league works</h3><div class="how">${steps.map(([b, t]) => html`<div><p><b>${b}</b><span>${t}</span></p></div>`)}</div></div>

    <div class="card"><h3>Invite your friends</h3><${LinkBox} code=${code} />
      <p class="small muted" style="margin-top:8px">${solo ? 'Anyone with this link can join, now or after the season starts.' : 'Anyone with this link can join. People who join after the draft build a team from free agents.'}</p></div>

    <div class="sec">${solo ? 'Who’s playing' : 'Who’s in'} <span class="n">${st.members.length}</span>${order && html`<span class="tiny muted" style="text-transform:none;letter-spacing:0">in draft order</span>`}</div>
    <div class="list">${list.map((m, i) => html`<div class="li ${m.pk === me ? 'me' : ''}" key=${m.pk}>
      ${order && html`<span class="mono muted" style="width:18px">${i + 1}</span>`}
      <${Av} pk=${m.pk} /><div class="grow"><div class="t ell">${m.team}</div><div class="s">${m.name}${m.pk === st.commish ? ' · commissioner' : ''}${m.pk === me ? ' · you' : ''}</div></div>
      ${m.pk === me && html`<button class="btn sm" onClick=${() => open({ k: 'me' })}>✎ Rename team</button>`}
      ${isC && m.pk !== me && html`<button class="x" aria-label=${'Remove ' + m.name} onClick=${async () => (await ask(`Remove ${m.name}?`, 'They can rejoin with the link.', 'Remove')) && run('kick', { pk: m.pk })}>✕</button>`}
    </div>`)}</div>
    <div class="row wrapx" style="margin-top:10px">
      <span class="small muted grow" style="min-width:180px">${solo ? '' : order ? 'Snake draft: the order reverses every round.' : 'Draft order is random. It’s revealed when the draft starts' + (isC ? ' — or reveal it now.' : '.')}</span>
      ${isC && !solo && st.members.length > 1 && html`<button class="btn sm" onClick=${() => run('draft.order', { order: shuffle() })}>🎲 ${order ? 'Re-roll order' : 'Reveal draft order'}</button>`}
      ${!isC && mem && html`<button class="btn sm ghost" onClick=${async () => (await ask('Leave this league?', 'You can rejoin before it starts.', 'Leave')) && run('leave')}>Leave league</button>`}
    </div>

    ${!solo && html`<div class="sec">Who can be drafted <span class="n">${st.pool.size}</span></div>
    <div class="card stack">
      <p class="small"><b>This is the list you’ll draft your teams from</b>${st.hint ? ` — ${st.hint.replace(/…$/, '').toLowerCase()}` : ''}.
        ${' '}<span class="muted">${set.openPool ? 'Anyone in the league can add names.' : 'Only the commissioner can add names.'}</span></p>
      ${st.pool.size > 0 && html`<div class="chips">${[...st.pool.values()].map((e) => html`<span class="chip" key=${e.id} title=${e.note}><${Ini} e=${e} size="sm" /><span class="ell">${e.name}</span>${e.self ? html`<span class="tiny muted">in the league</span>` : e.note && html`<span class="tiny muted ell">${e.note}</span>`}
        ${isC && !e.self && html`<button class="x" aria-label=${'Remove ' + e.name} onClick=${() => run('pool-', { id: e.id })}>✕</button>`}</span>`)}</div>`}
      ${st.members.length > 1 && fit < set.rosterSize && html`<div class="banner">💡 <span>${fit >= 1 ? html`Right now that’s <b>teams of ${fit}</b>. ` : ''}Add ${need - st.pool.size} more ${need - st.pool.size === 1 ? 'name' : 'names'} for teams of ${set.rosterSize}.</span></div>`}
      ${(isC || (mem && set.openPool)) ? html`<${PoolAdd} x=${x} />` : !mem && html`<p class="small muted">Join to add names.</p>`}
    </div>`}

    <div class="sec">What’s worth points <span class="n">${st.cats.length}</span></div>
    ${isC ? html`<${CatsEditor} x=${x} />` : html`<${CatsView} x=${x} />`}

    <div class="sec">Rules</div>
    <${Settings} x=${x} />
    ${isC && html`<div style="margin-top:22px">${startBtn}</div>`}
  </div>`;
}

function PoolAdd({ x, onDone }) {
  const [text, setText] = useState('');
  const hint = (x.st.hint || 'Whoever you’re drafting…');
  const add = async (e) => {
    e.preventDefault();
    const items = parseNames(text).map((i) => ({ ...i, id: rid() }));
    if (!items.length) return;
    const r = await x.run('pool+', { items });
    if (r.ok) { setText(''); if (onDone) { toast('Added'); onDone(); } }
  };
  return html`<form onSubmit=${add}>
    <textarea class="in" aria-label="Add names" placeholder=${`Add names — one per line\n${hint}`} value=${text} onInput=${(e) => setText(e.target.value)}></textarea>
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
  const { st, isC, run, P, p } = x;
  const s = st.settings, pre = st.phase === 'setup';
  const set = (patch) => run('settings', { settings: patch });
  const [pun, setPun] = useState(s.punishment);
  const [note, setNote] = useState(s.draftNote);
  const solo = x.solo;
  const odd = s.format === 'h2h' && st.members.length > 1 && st.members.length % 2 === 1;
  const row = (label, hint, ctl) => html`<div class="setrow"><div class="lbl"><b>${label}</b><span>${hint}</span></div>${ctl}</div>`;
  if (!isC) {
    return html`<div class="card"><div class="chips">
      <span class="chip">${solo ? '🙋 You score for yourselves' : '📋 Drafted teams'}</span>
      <span class="chip">${s.format === 'h2h' ? '⚔️ Head-to-head' : '🏁 Points race'}</span>${!solo && html`<span class="chip">🧢 ${s.rosterSize} per team</span>
      ${!x.race && html`<span class="chip">▶️ ${s.starters} start</span>`}`}${x.race ? html`<span class="chip">🏁 ${endsAt(st) ? `Ends ${fmtDay(endsAt(st))}` : s.lengthDays ? `Runs ${lenLabel(s.lengthDays)}` : 'Ends when the commissioner says'}</span>` : html`<span class="chip">🗓️ ${plural(s.numRounds, p)}</span>`}
      <span class="chip">✍️ ${s.whoScores === 'all' ? 'Anyone logs points' : 'Commish logs points'}</span>
      ${s.pickSecs > 0 && html`<span class="chip">⏱️ ${fmtSecs(s.pickSecs)} per pick</span>`}
      ${s.punishment && html`<span class="chip">💀 Last place: ${s.punishment}</span>`}</div></div>`;
  }
  return html`<div class="card"><h3>League rules</h3>
    ${row('Format', odd ? `Odd number of people: one sits out each ${p}. Points race avoids that.` : s.format === 'h2h' ? `Face a different person every ${p}. Best record wins.` : 'One long race — no weeks, no matchups. You end the season whenever; most points wins.',
    html`<${Seg} value=${s.format} disabled=${!pre} options=${[['h2h', 'Head-to-head'], ['points', 'Points race']]} onChange=${(v) => set({ format: v })} />`)}
    ${row('League type', solo ? 'Everyone scores for what they do. No draft.' : 'Each of you drafts a team from a list.', html`<span class="pill dark">${solo ? '🙋 We score' : '📋 Drafted teams'}</span>`)}
    ${!solo && row(pre ? 'Team size (max)' : 'Team size', pre ? 'Names per team. Shrinks to fit if the list is short.' : 'Names per team.', html`<${Step} value=${s.rosterSize} min=${1} max=${15} disabled=${!pre} onChange=${(v) => set({ rosterSize: v })} />`)}
    ${!solo && !x.race && row('Starters', s.starters < s.rosterSize ? `Only starters score. ${s.rosterSize - s.starters} on the bench.` : 'Everyone starts — no bench.', html`<${Step} value=${s.starters} min=${1} max=${s.rosterSize} disabled=${!pre} onChange=${(v) => set({ starters: v })} />`)}
    ${!x.race && row('Scoring period', `What one stretch of the season is called. You start and end each ${p} by hand, so it can be any length.`,
    html`<select class="in" style="width:auto" aria-label="Scoring period" value=${P} onChange=${(e) => set({ period: e.target.value })}>${PERIODS.map((v) => html`<option value=${v}>${v}</option>`)}</select>`)}
    ${x.race && st.phase !== 'done' && row('Length', st.phase === 'season' && endsAt(st) ? `Ends ${fmtDay(endsAt(st))} — ${timeLeft(endsAt(st))}.` : s.lengthDays ? 'The clock starts when you start the season. It ends on its own.' : 'No end date. You end it from the Scores tab.',
    html`<select class="in" style="width:auto" aria-label="Length" value=${s.lengthDays} onChange=${async (e) => {
      const v = +e.target.value;
      if (st.phase === 'season' && v && st.startedAt + v * 86400 <= Date.now() / 1000) { e.target.value = s.lengthDays; return toast('That would end the season right now — use End season instead', 'err'); }
      set({ lengthDays: v });
    }}>${(LEN_OPTS.some((o) => o[0] === s.lengthDays) ? LEN_OPTS : [...LEN_OPTS, [s.lengthDays, `${s.lengthDays} days`]]).map(([v, l]) => html`<option value=${v}>${st.phase === 'season' && v ? `${l} → ${fmtDay(st.startedAt + v * 86400)}` : l}</option>`)}</select>`)}
    ${!x.race && row('Season length', `How many ${p}s you play.`, html`<${Step} value=${s.numRounds} min=${Math.max(1, st.round)} max=${52} disabled=${st.phase === 'done'} onChange=${(v) => set({ numRounds: v })} />`)}
    ${row('Who logs points', s.whoScores === 'all' ? 'Anyone in the league. You can strike bad calls.' : 'Only you.', html`<${Seg} value=${s.whoScores} options=${[['all', 'Everyone'], ['commish', 'Just me']]} onChange=${(v) => set({ whoScores: v })} />`)}
    ${pre && !solo && row('List additions', s.openPool ? 'Anyone in the league can add names before the draft.' : 'Only you can add names.', html`<${Seg} value=${s.openPool ? 'y' : 'n'} options=${[['y', 'Everyone'], ['n', 'Just me']]} onChange=${(v) => set({ openPool: v === 'y' })} />`)}
    ${!solo && st.phase !== 'season' && st.phase !== 'done' && row('Pick timer', s.pickSecs ? 'Time’s up → best available is auto-picked.' : 'No clock. Draft live or over a few days.',
    html`<select class="in" style="width:auto" aria-label="Pick timer" value=${s.pickSecs} onChange=${(e) => set({ pickSecs: +e.target.value })}>
      ${[[0, 'Off'], [30, '30 sec'], [60, '1 min'], [120, '2 min'], [3600, '1 hour'], [28800, '8 hours']].map(([v, l]) => html`<option value=${v}>${l}</option>`)}</select>`)}
    ${pre && !solo && html`<div class="setrow" style="display:block"><div class="lbl"><b>Draft time</b><span>Tell everyone when to show up. Optional.</span></div>
      <form class="row" style="margin-top:6px" onSubmit=${(e) => { e.preventDefault(); set({ draftNote: note }); toast('Saved'); }}>
        <input class="in grow" maxlength="80" placeholder="Thursday 8pm, my place" aria-label="Draft time" value=${note} onInput=${(e) => setNote(e.target.value)} />
        ${note !== s.draftNote && html`<button class="btn dark">Save</button>`}</form></div>`}
    <div class="setrow" style="display:block"><div class="lbl"><b>Last-place punishment</b><span>Stakes make it real. Optional.</span></div>
      <form class="row" style="margin-top:6px" onSubmit=${(e) => { e.preventDefault(); set({ punishment: pun }); toast('Saved'); }}>
        <input class="in grow" maxlength="200" placeholder="Buys dinner. Wears the jersey. Sings karaoke." aria-label="Last-place punishment" value=${pun} onInput=${(e) => setPun(e.target.value)} />
        ${pun !== s.punishment && html`<button class="btn dark">Save</button>`}</form></div>
  </div>`;
}
const fmtDay = (t) => new Date(t * 1000).toLocaleDateString(undefined, { weekday: 'short', month: 'short', day: 'numeric' });
function timeLeft(t) {
  const d = t - Date.now() / 1000;
  if (d <= 0) return 'ending now';
  if (d < 3600) return `${Math.ceil(d / 60)} min left`;
  if (d < 86400) return `${Math.ceil(d / 3600)} hr left`;
  return `${Math.ceil(d / 86400)} days left`;
}
const LEN_OPTS = [[0, 'Until I end it'], [7, '1 week'], [14, '2 weeks'], [21, '3 weeks'], [30, '1 month'], [45, '6 weeks'], [60, '2 months'], [90, '3 months']];
const lenLabel = (d) => (LEN_OPTS.find((o) => o[0] === d) || [d, `${d} days`])[1];
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
  useEffect(() => {
    const t = document.title;
    if (mine) document.title = '🟠 Your pick! — ' + st.name;
    return () => { document.title = t; };
  }, [mine]);
  if (!slot) return null;
  const draft = async (e) => {
    if (await ask(`Draft ${e.name}?`, mine ? `Round ${slot.round}, pick ${slot.pick}. No take-backs.` : `You’re making this pick for ${name(slot.pk)}.`, 'Draft')) run('pick', { n: slot.n, eid: e.id });
  };
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
      ${canPick && html`<button class="btn sm ${mine ? 'pri' : ''}" onClick=${() => draft(e)}>${mine ? 'Draft' : `Pick for ${name(slot.pk)}`}</button>`}
    </div>`)}${!list.length && html`<div class="empty">No one matches.</div>`}</div>
    ${!canPick && x.mem && html`<p class="small muted center" style="margin-top:10px">You can draft when it’s your turn.</p>`}

    ${me && html`<div class="sec">Your picks <span class="n">${(st.rosters[me] || []).length}/${rounds}</span></div>
      <div class="card"><div class="chips">${(st.rosters[me] || []).map((id) => html`<span class="chip"><${Ini} e=${st.pool.get(id)} size="sm" />${st.pool.get(id).name}</span>`)}
      ${!(st.rosters[me] || []).length && html`<span class="muted small">Nobody yet.</span>`}</div></div>`}
  </div>`;
}

// ---------------------------------------------------------------- scores
function Scores({ x }) {
  const { st, sc, isC, run, me, name, team, P, p } = x;
  const [vr, setVr] = useState(null);
  const r = Math.min(vr == null ? st.round : vr, st.round);
  const live = st.phase === 'season' && r === st.round;
  const last = st.round >= st.settings.numRounds;
  const h2h = st.settings.format === 'h2h';
  const advance = async () => {
    const n = st.round + 1;
    const ok = st.round === 0
      ? await ask(`Start ${P} 1?`, `Everyone’s lineup locks for the ${p} and scoring opens.`, `Start ${P} 1`)
      : last ? await ask('End the season?', `${P} ${st.round} goes final and a champion is crowned. This can’t be undone.`, 'End season')
        : await ask(`End ${P} ${st.round}?`, `${P} ${st.round} goes final. ${P} ${n} starts right away with the lineups managers have set for it.`, `Start ${P} ${n}`);
    if (ok) { await run('advance', { n }); setVr(null); }
  };
  const rows = standings(st, sc);
  if (x.race && st.round >= 1) return html`<${RaceScores} x=${x} rows=${rows} />`;
  const plays = st.stats.filter((s) => s.round === r).slice().reverse();
  const mineFirst = (list) => list.slice().sort((a, b) => (b.includes(me) ? 1 : 0) - (a.includes(me) ? 1 : 0));
  return html`<div>
    ${st.phase === 'done' && html`<div class="card yellow champ" style="margin-bottom:16px"><div class="cup">🏆</div>
      <div class="tiny" style="font-weight:700;letter-spacing:.1em;margin-top:8px">CHAMPION</div><h2>${team(rows[0].pk)}</h2><p>${name(rows[0].pk)} wins ${st.name}.</p>
      ${rows.length > 1 && html`<p class="small" style="margin-top:10px">💀 Last place: <b>${name(rows[rows.length - 1].pk)}</b>${st.settings.punishment ? ` — ${st.settings.punishment}` : ''}</p>`}</div>`}

    ${st.round === 0 ? html`<div class="card" style="margin-bottom:14px"><h3>Preseason</h3>
        <p>The draft is done. ${st.settings.starters < st.settings.rosterSize ? html`Pick your starters in <a href=${`#/l/${x.code}/team`}><b>My Team</b></a> — only starters score. ` : ''}Lineups lock when ${P} 1 starts.</p>
        ${!isC && html`<p class="small muted" style="margin-top:8px">Waiting for ${name(st.commish)} to start ${P} 1.</p>`}</div>
      ${h2h && html`<div class="sec" style="margin-top:0">${P} 1 matchups</div>
        <div class="stack">${mineFirst(matchups(st.draft.order, 1)).map(([a, b]) => html`<${Matchup} x=${x} a=${a} b=${b} r=${1} pre key=${a} />`)}</div>`}`
    : html`<div class="rnav"><button class="btn sm" aria-label=${'Previous ' + p} disabled=${r <= 1} onClick=${() => setVr(r - 1)}>‹</button>
        <div class="ttl">${P} ${r} ${live ? html`<span class="pill live"><span class="dot pulse" style="background:#17140F"></span>LIVE</span>` : html`<span class="pill dark">FINAL</span>`}</div>
        <button class="btn sm" aria-label=${'Next ' + p} disabled=${r >= st.round} onClick=${() => setVr(r + 1)}>›</button></div>
      ${h2h
    ? html`<div class="stack">${mineFirst(pairsFor(st, r)).map(([a, b]) => html`<${Matchup} x=${x} a=${a} b=${b} r=${r} key=${a + r} />`)}</div>`
    : html`<div class="list">${st.draft.order.slice().sort((a, b) => sc.team[b].r[r] - sc.team[a].r[r]).map((pk, i) => html`<div class="li ${pk === me ? 'me' : ''}" key=${pk}>
          <span class="mono muted" style="width:18px">${i + 1}</span><${Av} pk=${pk} /><div class="grow"><div class="t ell">${team(pk)}</div><div class="s">${name(pk)}</div></div>
          <div class="num">${num(sc.team[pk].r[r])}</div></div>`)}</div>`}`}

    ${isC && st.phase === 'season' && html`<div class="card ink" style="margin-top:16px"><div class="row wrapx"><div class="grow" style="min-width:150px"><b>Commissioner</b>
      <div class="small" style="opacity:.75">${st.round === 0 ? 'Everyone ready? Lock lineups and open scoring.' : last ? `Final ${p}. End it when scoring is settled.` : `When the ${p} is over, close it out.`}</div></div>
      <button class="btn yel" onClick=${advance}>${st.round === 0 ? `Start ${P} 1` : last ? 'End season' : `End ${P} ${st.round} →`}</button></div></div>`}

    <${Disputes} x=${x} />
    ${st.round > 0 && html`<div class="sec">Scoring plays <span class="n">${plays.filter((s) => !s.void).length}</span></div>
      <div class="list feed">${plays.map((s) => html`<${Play} x=${x} s=${s} key=${s.id} />`)}
      ${!plays.length && html`<div class="empty">${live ? (x.canScore ? 'Nothing logged yet. Something happen? Hit “Log points”.' : `Nothing logged yet this ${p}.`) : `Nothing was logged this ${p}.`}</div>`}</div>`}
  </div>`;
}

function Disputes({ x }) {
  const n = x.st.stats.filter((s) => s.disputed && !s.void).length;
  if (!n || x.st.phase !== 'season') return null;
  return html`<div class="banner warn" style="margin-top:14px">⚠️ <span>${plural(n, 'play')} ${n === 1 ? 'is' : 'are'} disputed. ${x.isC ? 'Strike or keep each one below.' : `Waiting on ${x.name(x.st.commish)} to rule.`}</span></div>`;
}

function RaceScores({ x, rows }) {
  const { st, sc, isC, run, me, name, team } = x;
  const [preview, setPreview] = useState(false);
  useNow(30000);
  const plays = st.stats.slice().reverse();
  const e = endsAt(st);
  const place = (i) => ['🥇', '🥈', '🥉'][i] || `${i + 1}.`;
  const end = async () => { setPreview(false); await run('advance', { n: st.round + 1 }); };
  return html`<div>
    ${st.phase === 'done' && html`<div class="card yellow champ" style="margin-bottom:16px"><div class="cup">🏆</div>
      <div class="tiny" style="font-weight:700;letter-spacing:.1em;margin-top:8px">CHAMPION</div><h2>${team(rows[0].pk)}</h2><p>${name(rows[0].pk)} wins ${st.name}.</p>
      ${rows.length > 1 && html`<p class="small" style="margin-top:10px">💀 Last place: <b>${name(rows[rows.length - 1].pk)}</b>${st.settings.punishment ? ` — ${st.settings.punishment}` : ''}</p>`}
      ${st.endedAt && html`<p class="tiny" style="margin-top:8px;opacity:.7">Final · ${fmtDay(st.endedAt)}</p>`}</div>`}
    <div class="rnav" style="display:block"><div class="ttl">The race ${st.phase === 'season' ? html`<span class="pill live"><span class="dot pulse" style="background:#17140F"></span>LIVE</span>` : html`<span class="pill dark">FINAL</span>`}</div>
      ${st.phase === 'season' && html`<div class="small muted" style="margin-top:2px">${e ? html`Ends <b>${fmtDay(e)}</b> · ${timeLeft(e)}` : `No end date — ${isC ? 'you end it' : `${name(st.commish)} ends it`} when you’re done.`}</div>`}</div>
    <div class="list">${rows.map((r, i) => html`<div class="li ${r.pk === me ? 'me' : ''}" key=${r.pk}>
      <span class="mono muted" style="width:18px">${i + 1}</span><${Av} pk=${r.pk} />
      <div class="grow"><div class="t ell">${team(r.pk)}</div><div class="s">${name(r.pk)}${r.pk === me ? ' · you' : ''}${i > 0 ? ` · ${num(rows[0].pf - r.pf)} back` : rows.length > 1 ? (st.phase === 'done' ? ' · champion' : ' · leading') : ''}</div></div>
      <div class="num" style="font-size:20px">${num(sc.team[r.pk].total)}</div></div>`)}</div>
    ${isC && st.phase === 'season' && html`<div class="card ink" style="margin-top:16px"><div class="row wrapx"><div class="grow" style="min-width:150px"><b>Commissioner</b>
      <div class="small" style="opacity:.75">${e ? `It ends on its own ${fmtDay(e)}. You can extend it in League → Commissioner tools, or end it early.` : 'End the season whenever you’re done.'}</div></div>
      <button class="btn yel" onClick=${() => setPreview(true)}>End season…</button></div></div>`}
    <${Disputes} x=${x} />
    <div class="sec">Scoring plays <span class="n">${plays.filter((s) => !s.void).length}</span></div>
    <div class="list feed">${plays.map((s) => html`<${Play} x=${x} s=${s} key=${s.id} />`)}
    ${!plays.length && html`<div class="empty">${x.canScore ? 'Nothing logged yet. Something happen? Hit “Log points”.' : 'Nothing logged yet.'}</div>`}</div>
    ${preview && html`<${Sheet} title="Final results preview" onClose=${() => setPreview(false)}><div class="stack">
      <p class="small muted">If you end the season now, this is the final result. It can’t be undone${e ? ` — otherwise it ends on its own ${fmtDay(e)}` : ''}.</p>
      <div class="list">${rows.map((r, i) => html`<div class="li ${i === 0 ? 'me' : ''}" key=${r.pk}><span style="width:26px;text-align:center;font-size:18px">${place(i)}</span>
        <div class="grow"><div class="t ell">${team(r.pk)}</div><div class="s">${name(r.pk)}${i === 0 ? ' · champion' : i === rows.length - 1 && rows.length > 1 ? ` · last place${st.settings.punishment ? ` — ${st.settings.punishment}` : ''}` : ''}</div></div>
        <div class="num">${num(r.pf)}</div></div>`)}</div>
      ${st.stats.some((s) => s.disputed && !s.void) && html`<div class="banner warn">⚠️ <span>Some plays are still disputed. Settle them first so the result is fair.</span></div>`}
      <div class="row"><button class="btn grow" onClick=${() => setPreview(false)}>Keep playing</button><button class="btn pri grow" data-end onClick=${end}>End season now</button></div>
    </div><//>`}
  </div>`;
}

function Play({ x, s }) {
  const { st, isC, me, run, name } = x;
  const e = st.pool.get(s.eid);
  const own = Object.entries((st.locked[s.round] || {})).find(([, l]) => l.includes(s.eid));
  const live = st.phase === 'season' && !s.void;
  return html`<div class="it ${s.void ? 'void' : ''} ${s.disputed && !s.void ? 'disputed' : ''}"><div class="ic"><${Ini} e=${e} size="sm" /></div>
    <div class="grow tx"><b>${e ? e.name : '???'}</b> — ${s.label}${s.qty > 1 ? ` ×${s.qty}` : ''}
      ${s.note && html`<div class="small muted">“${s.note}”</div>`}
      <div class="when">${x.solo ? '' : x.race ? (s.team ? `counts for ${name(s.team)} · ` : 'free agent — counts for no one · ') : (own ? `counts for ${name(own[0])}` : 'not in a starting lineup') + ' · '}logged by ${name(s.by)} · ${ago(s.at)}</div>
      ${s.disputed && !s.void && html`<div class="dispute">⚠️ Disputed by ${name(s.disputed)}${isC && live ? html`
        <button class="btn sm" onClick=${() => run('stat.void', { id: s.id }, 'Struck')}>Strike</button><button class="btn sm" onClick=${() => run('stat.keep', { id: s.id }, 'Ruling: it stands')}>Keep</button>` : html` · waiting on the commissioner`}</div>`}
      ${s.kept && !s.void && html`<div class="when">⚖️ Upheld by the commissioner</div>`}
      ${live && !s.disputed && !s.kept && x.mem && s.by !== me && !isC && html`<button class="btn ghost sm" style="padding:0;min-height:0;font-size:12px" onClick=${async () => (await ask('Dispute this play?', `${e ? e.name : ''}: ${s.label} (${sgn(s.pts)}). ${name(st.commish)} will be asked to strike it or keep it.`, 'Dispute')) && run('stat.dispute', { id: s.id }, 'Disputed — the commissioner will rule')}>Dispute</button>`}</div>
    <${Pts} v=${s.pts} />
    ${!s.void && (isC || s.by === me) && st.phase !== 'done' && html`<button class="x" aria-label="Strike this play" title="Strike" onClick=${async () => (await ask('Strike this play?', `${e ? e.name : ''}: ${s.label} (${sgn(s.pts)}) is removed from the record.`, 'Strike it')) && run('stat.void', { id: s.id })}>✕</button>`}
  </div>`;
}

function Matchup({ x, a, b, r, pre }) {
  const { st, sc, me, name, team, p } = x;
  const isMine = a === me || b === me;
  const [open, setOpen] = useState(isMine && !pre);
  const sa = pre ? 0 : sc.team[a].r[r] || 0, sb = b && !pre ? sc.team[b].r[r] || 0 : 0;
  const fin = !pre && roundDone(st, r);
  const side = (pk, s, o) => html`<div class="side ${fin && pk && s > o ? 'win' : ''}"><${Av} pk=${pk} />
    <div class="grow"><div class="t ell">${team(pk)}</div><div class="tiny muted">${name(pk)}${pk === me ? ' · you' : ''}${fin && s > o ? ' · W' : ''}</div></div><div class="score">${pre ? '–' : num(s)}</div></div>`;
  const det = (pk) => html`<div class="stack-s">${((st.locked[r] || {})[pk] || []).map((id) => html`<div><span class="ell">${(st.pool.get(id) || {}).name || '—'}</span><${Pts} v=${(sc.ent[id] && sc.ent[id].r[r]) || 0} plain /></div>`)}</div>`;
  if (!b) return html`<div class="card mu"><div class="side"><${Av} pk=${a} /><div class="grow"><div class="t ell">${team(a)}</div><div class="tiny muted">${name(a)}${a === me ? ' · you' : ''} · no opponent this ${p}</div></div><div class="score">${pre ? '–' : num(sa)}</div></div></div>`;
  const tap = !pre && !x.solo;
  return html`<div class="card mu ${isMine ? 'mine' : ''}" onClick=${() => tap && setOpen(!open)} style=${tap ? 'cursor:pointer' : ''}>
    ${isMine && html`<div class="tag">Your matchup</div>`}
    ${side(a, sa, sb)}<div class="vs"><span>VS</span></div>${side(b, sb, sa)}
    ${tap && open && html`<div class="det">${det(a)}${det(b)}</div>`}
    ${tap && !open && html`<div class="more">Tap for lineups</div>`}</div>`;
}

// ---------------------------------------------------------------- team
function RaceTeam({ x, pk, setVpk }) {
  const { st, sc, me, name, team, open } = x;
  const roster = st.rosters[pk] || [];
  const forYou = (id) => st.stats.filter((s) => !s.void && s.eid === id && s.team === pk).reduce((a, s) => a + s.pts, 0);
  const rec = standings(st, sc).find((r) => r.pk === pk);
  return html`<div>
    <div class="row" style="margin-bottom:12px"><${Av} pk=${pk} size="lg" />
      <div class="grow"><div style="font-size:22px;font-weight:800;letter-spacing:-.02em;line-height:1.1" class="ell">${team(pk)}</div>
        <div class="small muted">${name(pk)} · ${num(rec.pf)} pts · #${rec.rank}</div></div></div>
    <select class="in" aria-label="View team" value=${pk} onChange=${(e) => setVpk(e.target.value)} style="margin-bottom:12px">
      ${st.draft.order.map((k) => html`<option value=${k}>${team(k)} — ${name(k)}${k === me ? ' (you)' : ''}</option>`)}</select>
    <p class="small muted" style="margin-bottom:4px">Everyone on your team scores. Points count for whoever has the player when it happens.</p>
    <div class="sec" style="margin-top:6px">Roster <span class="n">${roster.length}/${st.settings.rosterSize}</span></div>
    <div class="list">${roster.map((id) => { const e = st.pool.get(id); return html`<div class="li tap" key=${id} onClick=${() => open({ k: 'ent', eid: id })}><${Ini} e=${e} />
      <div class="grow"><div class="t ell">${e ? e.name : '—'}</div><div class="s ell">${e && e.note ? e.note + ' · ' : ''}season ${num((sc.ent[id] || {}).total || 0)}</div></div>
      <div class="num"><${Pts} v=${forYou(id)} plain /><div class="tiny muted">for you</div></div></div>`; })}
      ${!roster.length && html`<div class="empty">No one yet. Grab free agents in <a href=${`#/l/${x.code}/players`}>Players</a>.</div>`}</div>
    ${roster.length > 0 && roster.length < st.settings.rosterSize && st.phase === 'season' && pk === me && html`<p class="small muted" style="margin-top:10px">Open roster spot — grab a free agent in <a href=${`#/l/${x.code}/players`}>Players</a>.</p>`}
    ${pk !== me && me && st.phase === 'season' && html`<button class="btn" style="margin-top:14px" onClick=${() => open({ k: 'trade', to: pk })}>🤝 Propose a trade with ${name(pk)}</button>`}
  </div>`;
}

function Team({ x }) {
  const { st, sc, me, isC, run, name, team, open, P, p } = x;
  const [vpk, setVpk] = useState(me || st.draft.order[0]);
  const [swap, setSwap] = useState(null);
  const [view, setView] = useState('now');
  const pk = st.rosters[vpk] ? vpk : st.draft.order[0];
  if (x.race) return html`<${RaceTeam} x=${x} pk=${pk} setVpk=${setVpk} />`;
  const roster = st.rosters[pk] || [], lu = st.lineups[pk] || [];
  const hasBench = st.settings.starters < st.settings.rosterSize && !x.race;
  const started = st.round >= 1;
  const hasNext = st.phase === 'season' && st.round < st.settings.numRounds;
  // "now" = the lineup that is locked in and scoring. "next" = the one you can still change.
  const now = started && (view === 'now' || !hasNext || !hasBench);
  const locked = started ? (st.locked[st.round] || {})[pk] || [] : [];
  const starters = now ? locked : lu;
  const bench = roster.filter((id) => !starters.includes(id));
  const can = st.phase === 'season' && !now && hasBench && (pk === me || isC);
  const doSwap = async (inId, outId) => {
    const s = lu.map((id) => (id === outId ? inId : id));
    if (!outId) s.push(inId);
    setSwap(null);
    await run('lineup', { starters: s, pk }, 'Lineup saved');
  };
  const row = (id, starter) => {
    const e = st.pool.get(id), pt = sc.ent[id] || { total: 0, r: {} };
    const wk = pt.r[st.round] || 0;
    return html`<div class="li tap" key=${id} onClick=${() => open({ k: 'ent', eid: id })} style=${now && !starter ? 'opacity:.6' : ''}><${Ini} e=${e} />
      <div class="grow"><div class="t ell">${e ? e.name : '—'} ${now && st.owner[id] !== pk && html`<span class="pill">dropped</span>`}</div>
        <div class="s ell">${[e && e.note, now ? `season ${num(pt.total)}` : started ? `this ${p} ${sgn(wk)}` : ''].filter(Boolean).join(' · ') || ' '}</div></div>
      <div class="num">${now ? html`<${Pts} v=${wk} />` : html`<${Pts} v=${pt.total} plain />`}</div>
      ${can && html`<button class="btn sm" onClick=${(ev) => { ev.stopPropagation(); starter ? setSwap({ out: id }) : lu.length < st.settings.starters ? doSwap(id, null) : setSwap({ in: id }); }}>${starter ? 'Bench' : 'Start'}</button>`}
    </div>`;
  };
  const rec = standings(st, sc).find((r) => r.pk === pk);
  const opp = st.settings.format === 'h2h' && started ? (pairsFor(st, st.round).find((m) => m.includes(pk)) || []).find((k) => k !== pk) : null;
  const target = started ? st.round + 1 : 1;
  return html`<div>
    <div class="row" style="margin-bottom:12px"><${Av} pk=${pk} size="lg" />
      <div class="grow"><div style="font-size:22px;font-weight:800;letter-spacing:-.02em;line-height:1.1" class="ell">${team(pk)}</div>
        <div class="small muted">${name(pk)} · ${st.settings.format === 'h2h' ? `${rec.w}–${rec.l}${rec.t ? '–' + rec.t : ''} · ` : ''}${num(rec.pf)} pts · #${rec.rank}</div></div>
      ${now && html`<div style="text-align:right"><div class="mono" style="font-size:28px;line-height:1">${num(sc.team[pk].r[st.round])}</div><div class="tiny muted">${opp ? `vs ${name(opp)} ${num(sc.team[opp].r[st.round])}` : `${p} ${st.round}`}</div></div>`}</div>
    <select class="in" aria-label="View team" value=${pk} onChange=${(e) => setVpk(e.target.value)} style="margin-bottom:12px">
      ${st.draft.order.map((k) => html`<option value=${k}>${team(k)} — ${name(k)}${k === me ? ' (you)' : ''}</option>`)}</select>
    ${started && hasNext && hasBench && html`<div style="margin-bottom:12px"><${Seg} value=${view} options=${[['now', `${P} ${st.round} · live`], ['next', `Set ${P} ${st.round + 1}`]]} onChange=${setView} /></div>`}
    ${now && st.phase === 'season' && html`<p class="small muted" style="margin-bottom:4px">🔒 Locked when ${P} ${st.round} started.${hasNext && hasBench && (pk === me || isC) ? html` <a href="#" onClick=${(e) => { e.preventDefault(); setView('next'); }}>Set your ${P} ${st.round + 1} lineup</a>.` : ''}</p>`}
    ${!now && st.phase === 'season' && hasBench && html`<p class="small muted" style="margin-bottom:4px">${pk === me ? `Choose who starts in ${P} ${target}.` : `${name(pk)}’s plan for ${P} ${target}.`} It locks when the commissioner starts that ${p}.</p>`}
    <div class="sec" style="margin-top:6px">${hasBench || now ? 'Starters' : 'Roster'} <span class="n">${starters.length}</span></div>
    <div class="list">${starters.map((id) => row(id, true))}${!starters.length && html`<div class="empty">${roster.length ? 'Nobody starting.' : html`No one yet. Grab free agents in <a href=${`#/l/${x.code}/players`}>Players</a>.`}</div>`}</div>
    ${(hasBench || bench.length > 0) && html`<div class="sec">${hasBench ? 'Bench' : `Joins the lineup next ${p}`} <span class="n">${bench.length}</span>${now && bench.length > 0 && hasBench && html`<span class="tiny muted" style="text-transform:none;letter-spacing:0">not scoring this ${p}</span>`}</div>
      <div class="list">${bench.map((id) => row(id, false))}${!bench.length && html`<div class="empty">No one on the bench.</div>`}</div>`}
    ${roster.length < st.settings.rosterSize && st.phase === 'season' && (pk === me || isC) && html`<p class="small muted" style="margin-top:10px">Open roster spot — grab a free agent in <a href=${`#/l/${x.code}/players`}>Players</a>.</p>`}
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
      <div>${x.solo ? '' : owner ? html`On <b>${team(owner)}</b> (${name(owner)})` : html`<span class="pill grn">Free agent</span>`}</div></div>
      <div style="text-align:right"><div class="mono" style="font-size:26px;line-height:1">${num(p.total)}</div><div class="tiny muted">points</div></div></div>
    ${dropping ? html`<div><p class="small" style="margin-bottom:8px"><b>Your roster is full.</b> Who gets dropped for ${e.name}?</p>
        <div class="list">${my.map((id) => html`<div class="li tap" onClick=${() => add(id)}><${Ini} e=${st.pool.get(id)} /><div class="grow t">${st.pool.get(id).name}</div><span class="btn sm">Drop</span></div>`)}</div></div>`
    : html`<div class="row wrapx">
        ${canScore && html`<button class="btn pri" onClick=${() => open({ k: 'log', eid })}>＋ Log points</button>`}
        ${season && !x.solo && me && !owner && html`<button class="btn yel" onClick=${() => (full ? setDropping(true) : add(null))}>Add to my team</button>`}
        ${season && !x.solo && me && owner && owner !== me && html`<button class="btn" onClick=${() => open({ k: 'trade', to: owner, want: eid })}>🤝 Trade for</button>`}
        ${season && !x.solo && owner === me && html`<button class="btn" onClick=${async () => { if (await ask(`Drop ${e.name}?`, 'They become a free agent anyone can grab.', 'Drop')) { const r = await run('adddrop', { drop: eid }); if (r.ok) onClose(); } }}>Drop</button>`}
        ${isC && !x.solo && season && owner && owner !== me && html`<button class="btn" onClick=${async () => { if (await ask(`Drop ${e.name} from ${team(owner)}?`, 'Commissioner move. They become a free agent.', 'Drop')) { const r = await run('adddrop', { drop: eid, pk: owner }); if (r.ok) onClose(); } }}>Force drop</button>`}
      </div>`}
    ${st.round > 0 && !x.race && html`<div><div class="h3" style="margin-bottom:6px">By ${x.p}</div><div class="chips">${Array.from({ length: st.round }, (_, i) => html`<span class="chip">${x.P} ${i + 1} <${Pts} v=${p.r[i + 1] || 0} /></span>`)}</div></div>`}
    <div><div class="h3" style="margin-bottom:6px">Game log</div>
      <div class="list feed">${hist.map((s) => html`<div class="it ${s.void ? 'void' : ''}"><div class="grow tx">${s.label}${s.qty > 1 ? ` ×${s.qty}` : ''}${s.note && html` <span class="muted small">“${s.note}”</span>`}
        <div class="when">${x.race ? '' : `${x.P} ${s.round} · `}${name(s.by)} · ${ago(s.at)}</div></div><${Pts} v=${s.pts} /></div>`)}
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
        ${!x.solo && html`<div class="s">${st.owner[p.id] ? x.name(st.owner[p.id]) : 'Free agent'}</div>`}</div></div>`)}${!list.length && html`<div class="empty">No one matches.</div>`}</div></div>`
    : html`<form class="stack" onSubmit=${submit}>
      <div class="row"><${Ini} e=${ent} /><b class="grow">${ent.name}</b><button type="button" class="btn sm" onClick=${() => setE(null)}>Change</button></div>
      <div><label class="f">What happened?</label><div class="chips">
        ${st.cats.map((k) => html`<button type="button" class="chip ${cat === k.id ? 'on' : ''}" onClick=${() => setCat(k.id)}>${k.name} <span class="pts ${cat === k.id ? '' : k.pts >= 0 ? 'pos' : 'neg'}">${sgn(k.pts)}</span></button>`)}
        <button type="button" class="chip ${cat === '*' ? 'on' : ''}" onClick=${() => setCat('*')}>Something else…</button></div></div>
      ${cat === '*' && html`<div class="row"><input class="in grow" maxlength="60" placeholder="What happened" aria-label="What happened" value=${label} onInput=${(v) => setLabel(v.target.value)} />
        <input class="in mono" style="width:86px;text-align:center" type="number" step="0.5" placeholder="±pts" aria-label="Points" value=${pts} onInput=${(v) => setPts(v.target.value)} /></div>`}
      <div class="row"><div class="grow"><label class="f">How many times</label><${Step} value=${qty} min=${1} max=${99} onChange=${setQty} /></div>
        ${isC && st.round > 1 && !x.race && html`<div><label class="f">${x.P}</label><${Step} value=${round} min=${1} max=${st.round} onChange=${setRound} /></div>`}</div>
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
      <tbody>${rows.map((r) => html`<tr class=${r.pk === me ? 'me' : ''} key=${r.pk} style=${x.solo ? 'cursor:pointer' : ''} onClick=${() => x.solo && open({ k: 'ent', eid: selfId(r.pk) })}><td>${r.rank}</td><td><div class="ell" style="max-width:42vw">${team(r.pk)}</div><div class="tiny muted" style="font-weight:400">${name(r.pk)}</div></td>
        ${h2h && html`<td>${r.w}-${r.l}${rows.some((q) => q.t) ? '-' + r.t : ''}</td>`}<td>${num(r.pf)}</td>${h2h && html`<td>${num(r.pa)}</td>`}</tr>`)}</tbody></table></div>
    ${st.settings.punishment && html`<p class="small" style="margin-top:8px">💀 Last place: <b>${st.settings.punishment}</b></p>`}

    ${!x.solo && html`    <div class="sec">Trades ${trades.filter((t) => t.status === 'open').length > 0 && html`<span class="n">${trades.filter((t) => t.status === 'open').length} open</span>`}</div>
    <div class="list">${trades.map((t) => html`<div class="li" key=${t.id} style="flex-wrap:wrap"><div class="grow" style="min-width:200px">
        <div class="t" style="font-weight:600"><b>${name(t.from)}</b> gives ${en(t.give)} <span class="muted">for</span> <b>${name(t.to)}</b>’s ${en(t.get)}</div>
        <div class="s">${{ open: 'Waiting on ' + name(t.to), done: 'Accepted ✓', declined: 'Declined', cancelled: 'Withdrawn', void: 'Voided — rosters changed' }[t.status]} · ${ago(t.at)}</div></div>
      ${t.status === 'open' && t.to === me && html`<button class="btn sm pri" onClick=${() => run('trade.accept', { id: t.id }, 'Trade accepted')}>Accept</button><button class="btn sm" onClick=${() => run('trade.decline', { id: t.id })}>Decline</button>`}
      ${t.status === 'open' && t.from === me && html`<button class="btn sm" onClick=${() => run('trade.decline', { id: t.id }, 'Offer withdrawn')}>Withdraw</button>`}
    </div>`)}${!trades.length && html`<div class="empty">No trades yet. Somebody make an offer.</div>`}</div>
    ${me && st.phase === 'season' && html`<button class="btn" style="margin-top:10px" onClick=${() => setPick(true)}>🤝 Propose a trade</button>`}`}

    ${h2h && html`<div class="sec">Schedule</div>
      <div class="card stack-s">${Array.from({ length: st.settings.numRounds }, (_, i) => i + 1).map((r) => html`<div key=${r}>
        <div class="tiny muted" style="font-weight:700;letter-spacing:.06em">${x.P.toUpperCase()} ${r}${r === st.round && st.phase === 'season' ? ' · LIVE' : ''}</div>
        ${(r <= st.round ? pairsFor(st, r) : matchups(st.draft.order, r)).map(([a, b]) => html`<div class="row small" style="gap:6px"><span class="ell ${a === me ? '' : ''}" style=${a === me ? 'font-weight:700' : ''}>${name(a)}</span>
          ${b ? html`${r <= st.round && html`<span class="mono">${num(sc.team[a].r[r])}–${num(sc.team[b].r[r])}</span>`}${r > st.round && html`<span class="muted">vs</span>`}<span class="ell" style=${b === me ? 'font-weight:700' : ''}>${name(b)}</span>` : html`<span class="muted">bye</span>`}</div>`)}</div>`)}</div>`}

    ${x.solo && html`<p class="small muted" style="margin-top:8px">Tap a name to see everything they’ve been scored for.</p>`}
    <div class="sec">What’s worth points</div><${CatsView} x=${x} />
    <div class="sec">Rules</div><${Settings} x=${{ ...x, isC: false }} />
    ${isC && html`<button class="btn dark" style="margin-top:12px" onClick=${() => open({ k: 'rules' })}>⚙️ Commissioner tools</button>`}
    <div class="sec">Invite link</div><${LinkBox} code=${code} />
    <p class="small muted" style="margin-top:8px">Anyone with the link can watch or join.${st.phase === 'season' && !x.solo ? ' Late joiners build a team from free agents.' : ''}</p>
    ${pick && html`<${Sheet} title="Trade with…" onClose=${() => setPick(false)}><div class="list">${st.draft.order.filter((k) => k !== me).map((k) => html`<div class="li tap" onClick=${() => { setPick(false); open({ k: 'trade', to: k }); }}>
      <${Av} pk=${k} /><div class="grow"><div class="t">${team(k)}</div><div class="s">${name(k)}</div></div></div>`)}</div><//>`}
  </div>`;
}

// ---------------------------------------------------------------- chat
function Feed({ x }) {
  const { st, me, mem, run, name, P } = x;
  const [text, setText] = useState('');
  const send = async (e) => { e.preventDefault(); const t = text.trim(); if (!t) return; setText(''); const r = await run('chat', { text: t }); if (r.err) setText(t); };
  const items = st.feed.filter((f) => !f.minor).slice(-250);
  // Group-chat behaviour: newest at the bottom, and stay pinned there as messages arrive.
  useEffect(() => { window.scrollTo(0, document.documentElement.scrollHeight); }, [items.length]);
  return html`<div class="log">
    ${!items.length && html`<div class="empty">Quiet in here.</div>`}
    ${items.map((f) => (f.k === 'chat'
    ? html`<div class="msg ${f.pk === me ? 'mine' : ''}" key=${f.id}>${f.pk !== me && html`<${Av} pk=${f.pk} size="sm" />`}<div><div class="when">${f.pk === me ? '' : name(f.pk) + ' · '}${ago(f.at)}</div><div class="bub">${f.text}</div></div></div>`
    : f.k === 'stat'
      ? html`<div class="play ${f.void ? 'void' : ''}" key=${f.id}><span>🧾</span><div class="grow"><span class="tx">${f.text}</span>${f.note && html` <span class="muted">“${f.note}”</span>`}<div class="when">${name(f.pk)} · ${x.race ? '' : `${P} ${f.round} · `}${ago(f.at)}</div></div><${Pts} v=${f.pts} /></div>`
      : html`<div class="sys" key=${f.id}><span>${f.icon} ${f.text} · ${ago(f.at)}</span></div>`))}
    ${mem ? html`<form class="chatbar" onSubmit=${send}><input class="in grow" maxlength="500" placeholder="Talk your trash" aria-label="Message" autocomplete="off" value=${text} onInput=${(e) => setText(e.target.value)} /><button class="btn dark">Send</button></form>`
    : html`<p class="small muted center" style="margin-top:14px">Sign in as a manager to chat.</p>`}
  </div>`;
}
