import { html, render, useState, useEffect, useHash, go, Overlays, toast, ago, parseNames } from './ui.js';
import { createLeague, myLeagues, forgetLeague, parseCode, rid, validPin, PIN_MIN } from './net.js';
import { TEMPLATES } from './templates.js';
import { LeaguePage } from './league.js';

const THINGS = ['your friends', 'journalists', 'senators', 'your professors', 'the Love Island cast', 'tech CEOs', 'your coworkers', 'birds at the feeder', 'your group chat'];

function Rotator() {
  const [i, setI] = useState(0);
  useEffect(() => { const t = setInterval(() => setI((x) => (x + 1) % THINGS.length), 1900); return () => clearInterval(t); }, []);
  return html`<span class="rot">${THINGS[i]}</span>`;
}

// Removing a league takes two deliberate steps: expand the row, then type the league's name.
function MyLeague({ code, v, onGone }) {
  const [open, setOpen] = useState(false);
  const [typed, setTyped] = useState('');
  const match = typed.trim().toLowerCase() === v.name.trim().toLowerCase();
  const remove = (e) => { e.preventDefault(); if (!match) return; forgetLeague(code); toast(`Removed ${v.name}`); onGone(); };
  return html`<div class="lrow ${open ? 'open' : ''}">
    <div class="li tap" onClick=${() => !open && go('l/' + code)}>
      <div class="av">${v.emoji || '🏆'}</div>
      <div class="grow"><div class="t ell">${v.name}</div><div class="s">opened ${ago(v.seen / 1000)} ago</div></div>
      <button class="x" title=${open ? 'Cancel' : 'Remove'} aria-label=${open ? 'Cancel' : 'Remove ' + v.name} aria-expanded=${open}
        onClick=${(e) => { e.stopPropagation(); setOpen(!open); setTyped(''); }}>${open ? '↩' : '✕'}</button>
    </div>
    ${open && html`<form class="danger" onSubmit=${remove}>
      <p class="small"><b>Are you sure?</b> This removes <b>${v.name}</b> from this device. You’ll need the invite link to get back in. The league keeps going for everyone else.</p>
      <label class="small" for=${'rm-' + code} style="display:block;margin:10px 0 6px">Type <b>${v.name}</b> to confirm:</label>
      <input id=${'rm-' + code} class="in" autocomplete="off" placeholder=${v.name} value=${typed} onInput=${(e) => setTyped(e.target.value)} />
      <div class="row" style="margin-top:10px"><button type="button" class="btn grow" onClick=${() => { setOpen(false); setTyped(''); }}>Keep it</button>
        <button class="btn grow rm" disabled=${!match}>Remove league</button></div>
    </form>`}
  </div>`;
}

function Home() {
  const [mine, setMine] = useState(myLeagues());
  const list = Object.entries(mine).filter(([c, v]) => parseCode(c) && v.name).sort((a, b) => b[1].seen - a[1].seen);
  return html`<div class="wrap">
    <div class="top"><a class="logo" href="#/">ANY<span>LEAGUE</span></a></div>
    <section class="hero">
      <h1>Fantasy<br/>leagues for <em>anything.</em></h1>
      <p>Draft <${Rotator} />. Make up the scoring. Talk trash all season. No accounts, no app — your league is just a link.</p>
      <div style="margin-top:22px;max-width:360px"><a class="btn pri big" href="#/new">Start a league →</a></div>
      <p class="small muted" style="margin-top:10px;font-size:14px">Got an invite? Just open the link your friend sent.</p>
    </section>

    ${list.length > 0 && html`<div class="sec">Your leagues <span class="n">${list.length}</span></div>
      <div class="list">${list.map(([code, v]) => html`<${MyLeague} key=${code} code=${code} v=${v} onGone=${() => setMine(myLeagues())} />`)}</div>`}

    <div class="sec">Pick a starting point</div>
    <div class="tgrid">${TEMPLATES.map((t) => html`<a class="card tcard" href=${'#/new/' + t.id} key=${t.id}>
      <div class="e">${t.emoji}</div><b>${t.title}</b><span>${t.blurb}</span></a>`)}</div>

    <hr/>
    <div class="sec" style="margin-top:0">Fantasy 101 — how this works</div>
    <div class="card"><div class="how">
      <div><p><b>Someone starts a league and sends the link</b><span>Friends open it, type a name and a PIN, and they’re in. No accounts.</span></p></div>
      <div><p><b>Decide who scores</b><span><b>You do:</b> everyone scores for their own real life — chores, classes, dates. Or <b>people you draft:</b> take turns claiming senators, journalists, a TV cast, and score when they do things.</span></p></div>
      <div><p><b>Something happens, someone logs it</b><span>Pick the person, pick what they did, done. Every league has its own list of what’s worth points. Bad calls can be struck.</span></p></div>
      <div><p><b>Win the week</b><span>Each week you’re matched against one friend. Higher score takes the win. (Or skip matchups and just race for most points.)</span></p></div>
      <div><p><b>Crown a champion</b><span>Best record after the last week wins. Last place does the punishment you all agreed on.</span></p></div>
    </div></div>
    <p class="small muted center" style="margin-top:26px">No accounts and no Anyleague server: each league is end-to-end encrypted with a key that lives only in its invite link. Anyone with the link can view and join, so share it like a group chat invite.</p>
  </div>`;
}

const LENGTHS = [[7, '1 week'], [14, '2 weeks'], [30, '1 month'], [0, 'Until I end it']];

function Create({ tid }) {
  const [tpl, setTplRaw] = useState(TEMPLATES.find((t) => t.id === tid) || TEMPLATES[0]);
  const [solo, setSolo] = useState(!!tpl.solo);
  const [race, setRace] = useState(tpl.format === 'points');
  const [days, setDays] = useState(tpl.lengthDays ?? 30);
  const [names, setNames] = useState('');
  const [name, setName] = useState('');
  const [me, setMe] = useState('');
  const [pin, setPin] = useState('');
  const [busy, setBusy] = useState(false);
  const setTpl = (t) => { setTplRaw(t); setSolo(!!t.solo); setRace(t.format === 'points'); setDays(t.lengthDays ?? 30); setNames(''); };
  const c0 = tpl.cats[0], ex = `“${c0.name}” (${c0.pts > 0 ? '+' : ''}${c0.pts})`;
  const per = (tpl.period || 'Week').toLowerCase();
  const span = days ? (LENGTHS.find((l) => l[0] === days) || [0, `${days} days`])[1] : '';
  const count = parseNames(names).length;
  const who = solo ? 'Ben' : 'Someone on your team';
  const gets = solo ? 'Ben’s score goes up' : 'your score goes up';
  const win = race
    ? (days ? `After ${span}, whoever has the most points wins.` : 'When you end the season, whoever has the most points wins.')
    : `Each ${per} ${solo ? 'Ben faces one friend' : 'your team faces a friend’s team'}; higher score wins the ${per}. Best record wins the league.`;
  const submit = async (e) => {
    e.preventDefault();
    if (!me.trim()) return toast('Add your name', 'err');
    if (!validPin(pin)) return toast(`Choose a PIN of at least ${PIN_MIN} characters`, 'err');
    setBusy(true);
    try {
      const lg = await createLeague({
        name: name.trim() || tpl.suggest || 'Untitled League', emoji: tpl.emoji, me: me.trim(), pin, hint: tpl.poolHint,
        cats: tpl.cats.map((c) => ({ id: rid(), ...c })), pool: solo ? [] : parseNames(names),
        settings: { period: tpl.period || 'Week', mode: solo ? 'solo' : 'draft', format: race ? 'points' : 'h2h', lengthDays: race ? days : 0 },
      });
      const code = lg.code; lg.close(); go('l/' + code);
    } catch (err) { toast(String(err.message || err), 'err'); setBusy(false); }
  };
  return html`<div class="wrap">
    <div class="top"><a class="logo" href="#/">ANY<span>LEAGUE</span></a></div>
    <h1 style="font-size:34px;font-weight:800;letter-spacing:-.03em;margin:10px 0 14px">Start a league</h1>
    <form class="stack" onSubmit=${submit}>
      <div><label class="f">1 · What’s it about?</label>
        <div class="chips">${TEMPLATES.map((t) => html`<button type="button" class="chip ${t === tpl ? 'on' : ''}" onClick=${() => setTpl(t)}>${t.emoji} ${t.title}</button>`)}</div>
        <p class="small muted" style="margin-top:8px">${tpl.blurb} Comes with ${tpl.cats.length} ways to score, like ${ex}. You can change them later.</p></div>

      <div class="card flat"><label class="f">2 · Who scores the points?</label>
        <div class="stack-s">
          <button type="button" class="opt ${solo ? 'on' : ''}" onClick=${() => setSolo(true)}><b>🙋 We do</b><span>No draft. Everyone in the league scores for what they do in real life.</span></button>
          <button type="button" class="opt ${solo ? '' : 'on'}" onClick=${() => setSolo(false)}><b>📋 People we draft</b><span>Like fantasy football. Each of you drafts a team from a list of other people, and scores when they do things.</span></button>
        </div>
        ${!solo && html`<div style="margin-top:12px"><label class="f" for="pl" style="font-size:12px">Who can be drafted? ${count > 0 && html`<span class="muted">· ${count} so far</span>`}</label>
          <textarea id="pl" class="in" style="min-height:96px" placeholder=${`One per line. ${tpl.poolHint}`} value=${names} onInput=${(e) => setNames(e.target.value)}></textarea>
          <div class="row wrapx" style="margin-top:6px"><span class="tiny muted grow" style="min-width:160px">Aim for 3–4 names per person playing. You and your friends can add more later.</span>
            ${tpl.starter && html`<button type="button" class="btn sm" onClick=${() => setNames(tpl.starter.join('\n'))}>Use a starter list (${tpl.starter.length})</button>`}</div></div>`}
      </div>

      <div class="card flat"><label class="f">3 · How do you win?</label>
        <div class="stack-s">
          <button type="button" class="opt ${race ? 'on' : ''}" onClick=${() => setRace(true)}><b>🏁 Most points</b><span>One running leaderboard. Simple — good for tracking a house, a trip, a semester.</span></button>
          <button type="button" class="opt ${race ? '' : 'on'}" onClick=${() => setRace(false)}><b>⚔️ Weekly matchups</b><span>Like real fantasy: each ${per} you go head-to-head with one friend. Best record wins.</span></button>
        </div>
        ${race && html`<div style="margin-top:12px"><label class="f" style="font-size:12px">How long?</label>
          <div class="chips">${LENGTHS.map(([d, l]) => html`<button type="button" class="chip ${days === d ? 'on' : ''}" onClick=${() => setDays(d)}>${l}</button>`)}</div>
          <p class="tiny muted" style="margin-top:6px">${days ? 'The clock starts when you start the season, and it ends on its own. You can extend or end it early.' : 'You end it whenever you want.'}</p></div>`}
        <div class="eg"><b>With 4 friends:</b> everyone joins with your link${solo ? '' : ' and you draft'}. ${who} does ${ex} → anyone logs it → ${gets}. ${win}</div>
      </div>

      <div><label class="f" for="ln">4 · League name</label>
        <input id="ln" class="in" maxlength="60" placeholder=${tpl.suggest || 'The Big League'} value=${name} onInput=${(e) => setName(e.target.value)} /></div>
      <div class="row wrapx" style="align-items:flex-start"><div class="grow" style="min-width:160px"><label class="f" for="mn">Your name</label>
        <input id="mn" class="in" maxlength="24" placeholder="What your friends call you" autocomplete="nickname" value=${me} onInput=${(e) => setMe(e.target.value)} /></div>
      <div style="width:150px"><label class="f" for="pn">PIN</label>
        <input id="pn" class="in" type="password" maxlength="32" placeholder=${`${PIN_MIN}+ characters`} autocomplete="new-password" value=${pin} onInput=${(e) => setPin(e.target.value)} /></div></div>
      <p class="small muted" style="margin-top:6px">You’ll need your name and PIN to sign in again. There’s no reset. Step 2 can’t be changed later.</p>
      <button class="btn pri big" disabled=${busy}>${busy ? 'Creating…' : 'Create league →'}</button>
      <p class="small muted center">Next you’ll get a link to send your friends.</p>
    </form>
  </div>`;
}

function App() {
  const h = useHash();
  const [a, b, c] = h.split('/');
  let page;
  if (!a) page = html`<${Home} />`;
  else if (a === 'new') page = html`<${Create} tid=${b} key=${b || ''} />`;
  else if (a === 'l' && b) page = html`<${LeaguePage} code=${b} tab=${c || ''} key=${b} />`;
  else page = html`<div class="splash"><div><p style="font-size:44px">🤷</p><p>Nothing here.</p><a class="btn" style="margin-top:14px" href="#/">Home</a></div></div>`;
  return html`${page}<${Overlays} />`;
}

const root = document.getElementById('app');
root.textContent = '';
render(html`<${App} />`, root);
