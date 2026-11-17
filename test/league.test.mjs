// End-to-end rules test: three clients share a league through relays.
// Run: node test/league.test.mjs ws://localhost:7777   (any nostr relay URL works)
import assert from 'node:assert/strict';
import { League, createLeague, rid } from '../js/net.js';
import { scores, standings, matchups, draftSlot } from '../js/core.js';

const relays = process.argv.slice(2);
if (!relays.length) { console.error('usage: node test/league.test.mjs <relay-url>...'); process.exit(2); }
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const until = async (fn, what, ms = 15000) => { const t = Date.now(); while (!fn()) { if (Date.now() - t > ms) throw new Error('timeout: ' + what); await sleep(50); } };
const ok = async (p) => { const r = await p; assert.ok(r.ok, r.err); return r; };
const bad = async (p, re) => { const r = await p; assert.ok(r.err, 'expected rejection'); if (re) assert.match(r.err, re); };

const pool = 'Ana,Ben,Cy,Dee,Eli,Fay,Gus,Hal,Ivy,Jo,Kit,Lou,Max,Nia'.split(',').map((name, i) => ({ id: 'e' + i, name }));
const cats = [{ id: 'a', name: 'Aced it', pts: 10 }, { id: 'b', name: 'Bailed', pts: -4 }];

const A = await createLeague({ name: 'Test League', me: 'Alice', pin: 'alice-pin', settings: { rosterSize: 3, starters: 2, numRounds: 2 }, cats, pool }, { relays });
const open = async (name, pin) => { const l = await new League(A.code, { relays }).init(); await until(() => l.synced && l.state.exists, name + ' sync'); return l; };
const B = await open('Bob'), C = await open('Cara');

// identity: name + PIN
assert.equal(B.login('Alice', 'wrong'), 'taken');
assert.equal(B.login('Bob', ''), 'pin');             // a PIN is always required
assert.equal(B.login('Bob', '12'), 'pin');
assert.equal(B.login('Bob', '1234'), 'new');
await ok(B.act('join', { name: 'Bob' }));
assert.equal(C.login('Cara', 'cara-pin'), 'new');
await ok(C.act('join', { name: 'Cara', team: 'Cara Bears' }));
await until(() => A.state.members.length === 3, 'members propagate');
const D = await open('dup');
assert.equal(D.login('bob', '9999'), 'taken');       // right name, wrong PIN
assert.equal(D.login(' BOB ', '1234'), 'member');   // same person, new device
await bad(D.act('join', { name: 'Bob' }), /Already/);
D.close();

// setup permissions
await bad(B.act('settings', { settings: { rosterSize: 9 } }), /commissioner/);
await ok(B.act('pool+', { items: [{ id: rid(), name: 'Zed' }] }));
await bad(B.act('pool+', { items: [{ id: rid(), name: 'zed' }] }), /duplicate/i);
await bad(B.act('draft.start', { order: A.state.members.map((m) => m.pk) }), /commissioner/);
await until(() => A.state.pool.size === 15, 'pool sync');
await ok(A.act('settings', { settings: { period: 'Episode', draftNote: 'Thursday 8pm' } }));
await bad(B.act('stat', { eid: 'e0', cat: 'a' }), /Scoring opens/);
await ok(A.act('settings', { settings: { period: 'Week' } }));

// draft order can be revealed before the draft, and follows joins/leaves
await bad(B.act('draft.order', { order: [B.me.pk, A.me.pk, C.me.pk] }), /commissioner/);
await ok(A.act('draft.order', { order: [C.me.pk, B.me.pk, A.me.pk] }));
await until(() => B.state.preorder && B.state.preorder[0] === C.me.pk, 'preorder sync');
const X = await open('Xavi'); X.login('Xavi', 'xavi-pin'); await ok(X.act('join', { name: 'Xavi' }));
await until(() => A.state.preorder.length === 4, 'joiner appended to order');
await ok(X.act('leave')); await until(() => A.state.preorder.length === 3 && A.state.members.length === 3, 'leaver removed'); X.close();

// snake draft
const order = [A.me.pk, B.me.pk, C.me.pk];
await ok(A.act('draft.start', { order }));
await until(() => B.state.phase === 'draft' && C.state.phase === 'draft', 'draft start');
const by = { [A.me.pk]: A, [B.me.pk]: B, [C.me.pk]: C };
await bad(B.act('pick', { n: 0, eid: 'e0' }), /Not your pick/);
const seq = [];
for (let n = 0; n < 9; n++) {
  await until(() => [A, B, C].every((l) => l.state.draft.picks.length === n), 'pick ' + n);
  const slot = draftSlot(A.state); seq.push(slot.pk);
  if (n === 1) await bad(by[slot.pk].act('pick', { n, eid: 'e0' }), /Already drafted/);
  await ok(by[slot.pk].act('pick', { n, eid: 'e' + n }));
}
assert.deepEqual(seq, [0, 1, 2, 2, 1, 0, 0, 1, 2].map((i) => order[i]), 'snake order');
await until(() => [A, B, C].every((l) => l.state.phase === 'season'), 'season');
assert.deepEqual(A.state.rosters[A.me.pk], ['e0', 'e5', 'e6']);
assert.deepEqual(A.state.lineups[A.me.pk], ['e0', 'e5']);

// preseason: lineups, no scoring yet
await bad(B.act('stat', { eid: 'e0', cat: 'a' }), /Week 1/);
await ok(A.act('lineup', { starters: ['e6', 'e0'] }));
await bad(A.act('lineup', { starters: ['e1'] }), /Invalid/);
await ok(A.act('advance', { n: 1 }));
await until(() => C.state.round === 1, 'round 1');

// scoring: starters count, bench doesn't, locked lineups
await ok(B.act('stat', { eid: 'e0', cat: 'a', qty: 2, note: 'two exams' })); // Alice starter +20
await ok(C.act('stat', { eid: 'e5', cat: 'a' }));                             // Alice bench
const s1 = await ok(A.act('stat', { eid: 'e1', cat: 'b' }));                  // Bob starter -4
await ok(A.act('lineup', { starters: ['e5', 'e6'] }));                        // only affects round 2
await until(() => [A, B, C].every((l) => l.state.stats.length === 3), 'stats');
let sc = scores(C.state);
assert.equal(sc.team[A.me.pk].r[1], 20); assert.equal(sc.team[B.me.pk].r[1], -4); assert.equal(sc.ent.e5.total, 10);
await bad(C.act('stat.void', { id: s1.id }), /commissioner or whoever/);
await ok(A.act('stat.void', { id: s1.id }));

// free agents: first come first served; simultaneous claims converge
await bad(B.act('adddrop', { add: 'e9' }), /Roster full/);
const [x, y] = await Promise.all([B.act('adddrop', { add: 'e9', drop: 'e4' }), C.act('adddrop', { add: 'e9', drop: 'e3' })]);
assert.ok(x.ok && y.ok); // both valid locally...
await until(() => [A, B, C].every((l) => l.state.owner.e9 && l.state.owner.e9 === A.state.owner.e9 && l.parsed.size === A.parsed.size), 'claim converges');
await sleep(300);
const winner = A.state.owner.e9; assert.ok(winner === B.me.pk || winner === C.me.pk);
assert.equal(B.state.owner.e9, winner); assert.equal(C.state.owner.e9, winner); // ...exactly one wins everywhere

// trades
const cRoster = () => C.state.rosters[C.me.pk];
const give = A.state.rosters[A.me.pk][0], get = cRoster()[0];
await bad(A.act('trade.offer', { to: C.me.pk, give: [give], get: [] }), /even/);
const tr = await ok(A.act('trade.offer', { to: C.me.pk, give: [give], get: [get] }));
await until(() => C.state.trades.length === 1, 'offer arrives');
await bad(B.act('trade.accept', { id: tr.id }), /Not your offer/);
await ok(C.act('trade.accept', { id: tr.id }));
await until(() => A.state.owner[get] === A.me.pk, 'trade settles');
assert.equal(A.state.owner[give], C.me.pk);

// rounds & standings (see bottom for the pick-timer test)
await ok(A.act('advance', { n: 2 }));
await bad(A.act('advance', { n: 2 }), /already/i);
await until(() => B.state.round === 2, 'round 2');
assert.equal(matchups(order, 1).length, 2);            // 3 teams → one game + one bye
let st = standings(B.state);
assert.equal(st.reduce((a, r) => a + r.t, 0), 2); // round 1: Alice on bye, Bob 0–0 Cara
assert.equal(st[0].pk, A.me.pk);                  // tiebreak on points-for
await ok(A.act('advance', { n: 3 }));
await until(() => C.state.phase === 'done', 'season ends');
await bad(B.act('stat', { eid: 'e0', cat: 'a' }), /over/);
await ok(B.act('chat', { text: 'gg' }));

// a brand-new device rebuilds everything from relays alone, across pagination
const E = await open('fresh');
await until(() => E.parsed.size === A.parsed.size, 'full history from relay');
assert.equal(E.state.phase, 'done');
assert.deepEqual(standings(E.state).map((r) => r.pk), standings(A.state).map((r) => r.pk));
assert.equal(E.state.rejected.size, A.state.rejected.size);
// "you're the players" league: no draft, everyone scores for themselves
const S = await createLeague({ name: 'Roomies', me: 'Sam', pin: 'sam-pin', settings: { mode: 'solo', numRounds: 2 }, cats, pool: [{ id: 'zz', name: 'Stray' }] }, { relays });
const R = await new League(S.code, { relays }).init(); await until(() => R.synced && R.state.exists, 'roomies sync');
R.login('Rae', 'rae-pin'); await ok(R.act('join', { name: 'Rae' }));
await until(() => S.state.members.length === 2, 'rae joins');
await bad(R.act('pool+', { items: [{ id: 'dog', name: 'The Dog' }] }), /players are the people/);
await ok(S.act('draft.start', { order: [S.me.pk, R.me.pk] }));
assert.equal(S.state.phase, 'season'); assert.equal(S.state.round, 1);            // straight into Week 1
assert.deepEqual([...S.state.pool.values()].map((e) => e.name), ['Sam', 'Rae']);   // only the people in it
const samId = S.state.rosters[S.me.pk][0], raeId = S.state.rosters[R.me.pk][0];
await until(() => R.state.round === 1, 'season start syncs');
await ok(R.act('stat', { eid: raeId, cat: 'a' }));                                 // Rae logs her own +10
await ok(R.act('stat', { eid: samId, cat: 'b' }));                                 // ...and Sam's -4
await bad(R.act('adddrop', { drop: raeId }), /locked/);
await bad(R.act('trade.offer', { to: S.me.pk, give: [raeId], get: [samId] }), /closed/);
await until(() => S.state.stats.length === 2, 'solo stats sync');
await ok(S.act('advance', { n: 2 })); await ok(S.act('advance', { n: 3 }));
let ss = standings(S.state);
assert.equal(ss[0].pk, R.me.pk); assert.equal(ss[0].w, 1); assert.equal(ss[0].pf, 10); assert.equal(ss[1].pf, -4);
[S, R].forEach((l) => l.close());

// pick timer: once the clock runs out, any manager's client may submit the top available player
const T = await createLeague({ name: 'Timer', me: 'Tia', pin: 'tia-pin', settings: { rosterSize: 1, starters: 1, pickSecs: 1 }, cats, pool: pool.slice(0, 4) }, { relays });
const U = await new League(T.code, { relays }).init(); await until(() => U.synced && U.state.exists, 'timer league sync');
U.login('Uma', 'uma-pin'); await ok(U.act('join', { name: 'Uma' })); await until(() => T.state.members.length === 2, 'uma joins');
await ok(T.act('draft.start', { order: [T.me.pk, U.me.pk] })); await until(() => U.state.phase === 'draft', 'timer draft');
await bad(U.act('pick', { n: 0, eid: 'e0', auto: true }), /Not your pick/);   // clock still running
await sleep(2100);
await bad(U.act('pick', { n: 0, eid: 'e2', auto: true }), /Not your pick/);   // must be the top available
await ok(U.act('pick', { n: 0, eid: 'e0', auto: true }));
await until(() => T.state.draft.picks.length === 1 && T.state.draft.picks[0].auto, 'auto-pick lands');
assert.equal(T.state.owner.e0, T.me.pk);
[T, U].forEach((l) => l.close());
console.log(`PASS — ${A.parsed.size} events, ${A.state.feed.length} feed items, champion: ${A.state.members.find((m) => m.pk === standings(A.state)[0].pk).name}`);
[A, B, C, E].forEach((l) => l.close());
process.exit(0);
