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
      <div class="list">${list.map(([code, v]) => html`<div class="li tap" key=${code} onClick=${() => go('l/' + code)}>
        <div class="av">${v.emoji || '🏆'}</div>
        <div class="grow"><div class="t ell">${v.name}</div><div class="s">opened ${ago(v.seen / 1000)} ago</div></div>
        <button class="x" title="Remove from this device" aria-label="Remove from this device" onClick=${(e) => { e.stopPropagation(); forgetLeague(code); setMine(myLeagues()); }}>✕</button>
      </div>`)}</div>`}

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

function Create({ tid }) {
  const [tpl, setTplRaw] = useState(TEMPLATES.find((t) => t.id === tid) || TEMPLATES[0]);
  const [solo, setSolo] = useState(!!tpl.solo);
  const [names, setNames] = useState('');
  const [name, setName] = useState('');
  const [me, setMe] = useState('');
  const [pin, setPin] = useState('');
  const [busy, setBusy] = useState(false);
  const setTpl = (t) => { setTplRaw(t); setSolo(!!t.solo); setNames(''); };
  const c0 = tpl.cats[0], ex = `“${c0.name}” (${c0.pts > 0 ? '+' : ''}${c0.pts})`;
  const count = parseNames(names).length;
  const submit = async (e) => {
    e.preventDefault();
    if (!me.trim()) return toast('Add your name', 'err');
    if (!validPin(pin)) return toast(`Choose a PIN of at least ${PIN_MIN} characters`, 'err');
    setBusy(true);
    try {
      const lg = await createLeague({
        name: name.trim() || tpl.suggest || 'Untitled League', emoji: tpl.emoji, me: me.trim(), pin, hint: tpl.poolHint,
        cats: tpl.cats.map((c) => ({ id: rid(), ...c })), pool: solo ? [] : parseNames(names),
        settings: { period: tpl.period || 'Week', mode: solo ? 'solo' : 'draft' },
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
        <div class="eg"><b>With 4 friends:</b> ${solo
    ? html`everyone joins with your link. Ben does ${ex} → anyone logs it → Ben’s score goes up. Each ${(tpl.period || 'week').toLowerCase()} Ben faces one friend; higher score wins.`
    : html`you make a list of ~16 names and take turns drafting 4 each. Someone on your team does ${ex} → anyone logs it → your score goes up. Each ${(tpl.period || 'week').toLowerCase()} your team faces a friend’s team.`}</div>
        ${!solo && html`<div style="margin-top:12px"><label class="f" for="pl" style="font-size:12px">Who can be drafted? ${count > 0 && html`<span class="muted">· ${count} so far</span>`}</label>
          <textarea id="pl" class="in" style="min-height:96px" placeholder=${`One per line. ${tpl.poolHint}`} value=${names} onInput=${(e) => setNames(e.target.value)}></textarea>
          <div class="row wrapx" style="margin-top:6px"><span class="tiny muted grow" style="min-width:160px">Aim for 3–4 names per person playing. You and your friends can add more later.</span>
            ${tpl.starter && html`<button type="button" class="btn sm" onClick=${() => setNames(tpl.starter.join('\n'))}>Use a starter list (${tpl.starter.length})</button>`}</div></div>`}
      </div>

      <div><label class="f" for="ln">3 · League name</label>
        <input id="ln" class="in" maxlength="60" placeholder=${tpl.suggest || 'The Big League'} value=${name} onInput=${(e) => setName(e.target.value)} /></div>
      <div class="row wrapx" style="align-items:flex-start"><div class="grow" style="min-width:160px"><label class="f" for="mn">Your name</label>
        <input id="mn" class="in" maxlength="24" placeholder="What your friends call you" autocomplete="nickname" value=${me} onInput=${(e) => setMe(e.target.value)} /></div>
      <div style="width:150px"><label class="f" for="pn">PIN</label>
        <input id="pn" class="in" type="password" maxlength="32" placeholder=${`${PIN_MIN}+ characters`} autocomplete="new-password" value=${pin} onInput=${(e) => setPin(e.target.value)} /></div></div>
      <p class="small muted" style="margin-top:6px">You’ll need your name and PIN to sign in again. There’s no reset. The choice in step 2 can’t be changed later.</p>
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
