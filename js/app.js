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
      <div><p><b>Someone starts a league</b><span>They’re the commissioner. They decide who gets drafted — each other, or a list of other people — and what earns points.</span></p></div>
      <div><p><b>Friends join with a link</b><span>Each friend is a manager with their own team. Type a name and a PIN — that’s the whole sign-up.</span></p></div>
      <div><p><b>You draft</b><span>Managers take turns claiming people for their team (1→8, then 8→1). Once someone’s taken, they’re yours alone.</span></p></div>
      <div><p><b>Set a lineup</b><span>Each week you choose starters. Only starters score — your bench is insurance. Lineups lock when the week starts.</span></p></div>
      <div><p><b>Real life happens, points get logged</b><span>Your player aces the exam, lands the scoop, cries on camera? Anyone logs it, the commissioner can strike bad calls.</span></p></div>
      <div><p><b>Win your matchup</b><span>Head-to-head every week, or one big points race. Work the free agents and trade your way to the title. Last place suffers the punishment.</span></p></div>
    </div></div>
    <p class="small muted center" style="margin-top:26px">No accounts and no Anyleague server: each league is end-to-end encrypted with a key that lives only in its invite link. Anyone with the link can view and join, so share it like a group chat invite.</p>
  </div>`;
}

function Create({ tid }) {
  const [tpl, setTplRaw] = useState(TEMPLATES.find((t) => t.id === tid) || TEMPLATES[0]);
  const [self, setSelf] = useState(!!tpl.self);
  const [names, setNames] = useState('');
  const [name, setName] = useState('');
  const [me, setMe] = useState('');
  const [pin, setPin] = useState('');
  const [busy, setBusy] = useState(false);
  const setTpl = (t) => { setTplRaw(t); setSelf(!!t.self); };
  const submit = async (e) => {
    e.preventDefault();
    if (!me.trim()) return toast('Add your name', 'err');
    if (!validPin(pin)) return toast(`Choose a PIN of at least ${PIN_MIN} characters`, 'err');
    setBusy(true);
    try {
      const lg = await createLeague({
        name: name.trim() || tpl.suggest || 'Untitled League', emoji: tpl.emoji, me: me.trim(), pin, hint: tpl.poolHint,
        cats: tpl.cats.map((c) => ({ id: rid(), ...c })), pool: parseNames(names),
        settings: { period: tpl.period || 'Week', selfDraft: self },
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
        <p class="small muted" style="margin-top:8px">${tpl.blurb} Comes with ${tpl.cats.length} ways to score, like “${tpl.cats[0].name}” (${tpl.cats[0].pts > 0 ? '+' : ''}${tpl.cats[0].pts}). You can change them.</p></div>

      <div class="card flat"><label class="f">2 · Who gets drafted?</label>
        <p class="small muted" style="margin-bottom:10px">In fantasy football you draft NFL players and score when they do well. Here, you and your friends are the <b>managers</b> — so who are your players?</p>
        <div class="stack-s">
          <button type="button" class="opt ${self ? 'on' : ''}" onClick=${() => setSelf(true)}><b>🫵 Each other</b><span>Everyone who joins the league can be drafted. You’ll own a few of your friends and score when they do things. Best for roommates, classmates, the group chat.</span></button>
          <button type="button" class="opt ${self ? '' : 'on'}" onClick=${() => setSelf(false)}><b>📋 Other people or things</b><span>You make the list: ${tpl.poolHint.replace(/…$/, '')}. Nobody on it needs to know they’re in a fantasy league.</span></button>
        </div>
        <div style="margin-top:12px"><label class="f" for="pl" style="font-size:12px">${self ? 'Anyone else draftable? (optional)' : 'Who’s on the list? (you can add more later)'}</label>
          <textarea id="pl" class="in" style="min-height:84px" placeholder=${self ? 'People who aren’t joining but should be draftable — one per line\nProf. Okafor\nThe landlord' : `One per line. ${tpl.poolHint}`} value=${names} onInput=${(e) => setNames(e.target.value)}></textarea>
          <p class="tiny muted" style="margin-top:4px">${self ? 'More names means bigger teams.' : 'Aim for at least 3–4 names per manager. Friends can add names too once they join.'}</p></div>
      </div>

      <div><label class="f" for="ln">3 · League name</label>
        <input id="ln" class="in" maxlength="60" placeholder=${tpl.suggest || 'The Big League'} value=${name} onInput=${(e) => setName(e.target.value)} /></div>
      <div class="row wrapx" style="align-items:flex-start"><div class="grow" style="min-width:160px"><label class="f" for="mn">Your name</label>
        <input id="mn" class="in" maxlength="24" placeholder="What your friends call you" autocomplete="nickname" value=${me} onInput=${(e) => setMe(e.target.value)} /></div>
      <div style="width:150px"><label class="f" for="pn">PIN</label>
        <input id="pn" class="in" type="password" maxlength="32" placeholder=${`${PIN_MIN}+ characters`} autocomplete="new-password" value=${pin} onInput=${(e) => setPin(e.target.value)} /></div></div>
      <p class="small muted" style="margin-top:6px">You’ll need your name and PIN to sign in again. There’s no reset.</p>
      <button class="btn pri big" disabled=${busy}>${busy ? 'Creating…' : 'Create league →'}</button>
      <p class="small muted center">You’ll be the commissioner. Next you’ll get a link to send your friends.</p>
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
