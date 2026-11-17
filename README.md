# Anyleague

Fantasy leagues for anything — friends, journalists, senators, a reality TV cast. Live at https://fantasy-leagues.vercel.app/

## How it plays

1. Someone starts a league (they're the commissioner), picks a template, and shares the link.
2. Friends open the link and type a name and a PIN. That's the whole sign-up.
3. Everyone builds the player pool and the commissioner tunes scoring rules.
4. Snake draft, live or slow, with an optional pick timer.
5. Each round: set starters, log points when things happen in real life, win your matchup.
6. Free agents, trades, chat, standings, a champion, and a punishment for last place.

## How it works (no server)

- Static site, no build step: `index.html` + ES modules in `js/`.
- A league is an append-only log of signed events. `js/core.js` folds the log into league state, deterministically, so every browser agrees.
- `js/net.js` stores the log on several public Nostr relays (kind 30078) and caches it in `localStorage`. Clients re-upload anything a relay loses.
- Events are AES-GCM encrypted with a key derived from the invite link, so relays only see ciphertext. Anyone with the link can read and join.
- Identity is when2meet-style: your signing key is derived from league + name + PIN, so the same name works on any device.

## Develop

```
python3 -m http.server 8766        # then open http://localhost:8766
node test/league.test.mjs wss://nos.lol wss://nostr.mom   # rules + sync test (Node 22+)
```

`?relays=ws://localhost:7777` points the app at a different relay for testing.
