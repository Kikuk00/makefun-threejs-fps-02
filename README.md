# Sable Yard — a three.js tactical FPS

[![threejs-fps-02](https://make.fun/badge/threejs-fps-02.svg)](https://make.fun/c/threejs-fps-02)
[![rank](https://make.fun/badge/threejs-fps-02/Kikuk00/makefun-threejs-fps-02/rank.svg)](https://make.fun/c/threejs-fps-02)
[![reward](https://make.fun/badge/threejs-fps-02/Kikuk00/makefun-threejs-fps-02/reward.svg)](https://make.fun/c/threejs-fps-02)

A round-based tactical first-person shooter in the style Counter-Strike made
famous, built on three.js 0.187.0 and served as plain static files — no build
step, no network request. Entered in the
[make.fun "Make the best three.js tactical FPS" bounty](https://make.fun/c/threejs-fps-02).

## The game

Five-against-five in **Sable Yard**, an original dusk industrial yard with three
lanes (Long, Mid, Yard) and two bomb sites: the Fuel Depot (A) and the
Warehouse (B). Vanguard attacks, Rustjackals defend.

- **Rounds** — first to 5. A round ends when a team is wiped out, the planted
  charge explodes, the charge is defused, or the clock runs out with no plant.
- **Objective** — the player carries the charge: hold **E** on a site to plant
  (3.2 s), then defend it against the defuse (5 s). The fuse beeps faster as
  it runs down.
- **Economy** — money for round wins, kills, plants; spend it in the buy menu
  (**B**, during freeze time) on rifles, SMGs, shotguns, a marksman rifle,
  frag and smoke grenades, and a vest.
- **Gunplay** — hitscan weapons with headshot multipliers, recoil and spread
  that punish firing on the move or mid-air, acceleration-based movement with
  crouching and jumping, and AABB collision with the map.
- **Bots** — nine bots that route over a waypoint graph, hold angles, react to
  what they see (raycast line of sight) and hear (gunfire noise), strafe and
  fire in bursts, escort the carrier, plant, and defuse.
- **Presentation** — HUD with health, ammo, round timer, round score, money,
  kill feed, plant progress and a live top-down minimap; procedural WebAudio
  sound (no audio files); pooled tracers, sparks, smoke and explosion
  effects that allocate nothing per frame.

## Play it

```sh
node serve.ts
# open http://localhost:8080
```

Controls: **WASD** move, **mouse** look, **click** fire, **R** reload,
**Ctrl** crouch, **Space** jump, **B** buy menu, **1/2** switch weapon,
**G** frag grenade, **H** smoke grenade, **E** plant the charge.

## Layout

- `main.ts` — the entry program: copies `game/` and `screenshots/` to
  `/output` and writes `dossier.json` with the kit's `buildDossier`.
- `game/` — the playable game: `index.html` plus ES modules under `src/`
  (one job each: `world`, `bots`, `weapons`, `player`, `objective`,
  `effects`, `audio`, `hud`, `input`, `main`), three.js 0.187.0 vendored
  under `game/vendor/three/`.
- `screenshots/` — real renders of the game, taken in a browser.
- `vendor/makefun-threejs.ts` — the kit's dossier library, unchanged.

## License

MIT — see [LICENSE](LICENSE).
