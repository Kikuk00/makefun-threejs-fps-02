# Status — threejs-fps-02 entry (Sable Yard)

Updated 2026-11-16 ~10:50 WIB (03:50 UTC). Deadline **Tue 2026-11-17 04:30 WIB
(2026-11-16T21:30:00Z)**. Competition opened 2026-11-14T21:30:00Z.

## Done

- Game built: **Sable Yard** — an original dusk industrial yard (44 x 36 m,
  three lanes, two bomb sites: Fuel Depot A / Warehouse B). 5v5: the player
  + 4 Vanguard bots attack, 5 Rustjackal bots defend.
  - Rounds first to 5 (max 9): elimination, plant + detonation, defuse, or
    timeout with no plant. Buy phase 12 s, round 100 s, fuse 35 s.
  - Objective: the player carries the charge, holds **E** on a site to plant
    (3.2 s); enemies defuse (5 s). Plant +$300, kill +$300, win +$3250.
  - Economy + buy menu (**B**, freeze time, keys 1-7 or click): VK-7 Rifle
    $2700, Kestrel SMG $1500, Maul-12 Shotgun $1200, Longbow DMR $4000,
    frag $300, smoke $250, vest $650. Pistol is the fallback.
  - Gunplay: hitscan vs torso/head hitboxes (headshots x3.5-4), recoil +
    spread that punish moving/airborne fire, crouch bonus, acceleration
    movement, jump, AABB collision. Grenades: frag (blast radius + falloff)
    and smoke (pooled puffs).
  - Bots: waypoint-graph routing (BFS), hold angles, raycast line of sight,
    hearing (gunfire noise radius 26 m), reaction delay, burst fire with
    strafe, escort/plant/defuse jobs.
  - HUD: health bar, ammo, round timer, round score, money, kill feed,
    plant progress, banner, live top-down minimap, buy menu. Procedural
    WebAudio (no audio files). Pooled tracers/sparks/smoke (no per-frame
    allocation in hot loops). Fixed 60 Hz sim separate from rendering.
- Entry files in `/home/hatch/workspace/makefun/entries/threejs-fps-02/`:
  `main.ts`, `serve.ts`, `shots.json`, `README.md` (make.fun badges,
  owner Kikuk00), `LICENSE` (MIT, SPDX), `.makefun/owner.json` (wallet
  DH4J9gUVCRvnv7qL63DZEKVi4YWuzEtHEiVjPXkXXjAA), `game/` (index.html +
  12 source modules under `src/`, three.js 0.187.0 vendored byte-for-byte
  under `game/vendor/three/`, hashes match kit.json),
  `vendor/makefun-threejs.ts` (kit copy, unchanged),
  `screenshots/` (3 JPEGs, 1280x720, real renders).
- Local git commit: `bc766bf04324a6f9ff42fdbf230d471b70076047` (branch main).
- Dossier builds: `MAKEFUN_OUTPUT_DIR=out node main.ts` exits 0;
  dossier 229,113 bytes, text 86,597 bytes (under the 160 KiB cap, all 12
  source files included whole, nothing cut).
- Screenshots verified by eye: 1-start (title menu over the yard), 2-play
  (real rifle headshot on a bot mid-lane, sparks, kill feed, +$300),
  3-end (charge planted at A, banner, fuse timer). Taken with Playwright +
  upstream Chromium (the VM's /opt/meta-chromium refuses headless start:
  "Hatch WebGL domain policy is required"; `npx playwright install
  chromium` worked). No page errors in any shot or in a 5 s live load.
- Wallet verified: DH4J9gUVCRvnv7qL63DZEKVi4YWuzEtHEiVjPXkXXjAA linked,
  primary on @amber-harbor-81 (`makefun wallet list`).
- User's opening prompt saved verbatim at
  `/home/hatch/workspace/makefun/prompt-threejs-fps-02.txt` (1097 chars,
  from the root session's first user message, seq 243).
- Transcript discovery verified: `bundle --dry-run` finds 3 Muse app
  sessions (this subagent c857ec1a-6be0-4b02-89db-11005b0574af, 63 turns;
  parent orchestrator c6026a06-bbe4-4eca-bced-d5858d7e3932, 31 turns; sibling
  f932fd64-7351-475c-8c2a-58a160c0c41a, 107 turns — a parallel subagent on
  another bounty whose tool calls name this repo path, included by bundle's
  own discovery), 1 instruction file (~/AGENTS.md), system prompt in-session.
  No `mcp__<server>__<tool>` calls in any of the three sessions, so
  `--mcp none` is correct.
- Muse usage (partial): `/home/hatch/.makefun/muse-usage-threejs-fps-02.jsonl`
  holds the 6 parent-agent rows found so far (model
  ipnext/avocado-5.17-v2). Must be re-queried after this session ends — a
  subagent's rows are written only once its run completes.
- Local pre-submit check (no transcripts yet): 4 passed —
  competition_open, snapshot (26 files, 2,388,946 bytes), license_osi (MIT),
  entrypoint (main.ts, node22). Everything else is transcripts or
  at-submission repo checks, as expected.

## BLOCKED — needs the parent / a person (do these first)

1. **Create the GitHub repo.** `create_repository` via the GitHub connector
   fails: `403 Resource not accessible by integration` (the GitHub App
   cannot create personal repos; same failure as the sibling entries).
   Create it in the GitHub web UI as **Kikuk00** (public, no README init,
   name `makefun-threejs-fps-02`, description: "Sable Yard — a round-based
   tactical FPS on three.js for the make.fun threejs-fps-02 bounty").
   Then push this repo's files with the GitHub connector `push_files`
   (branch main). **Binary files:** `push_files` (per
   `references/snapshot-push.md`) validates UTF-8 and rejects binary
   content, and the three `screenshots/*.jpg` are binary. After the text
   push, try `create_or_update_file` for each screenshot and verify the
   bytes round-trip (fetch back, compare sha256); if the MCP string path
   corrupts them, upload the three JPEGs through the GitHub web UI instead.
   The submitted commit must contain the screenshots or the gate fails.
2. **Set the repo About** (no MCP tool covers it; `gh` is not logged in):
   homepage `https://make.fun/c/threejs-fps-02`, topic `makefun`.
   Required by the repo_about check.
3. **--harness-version.** Bundle refuses to write without it and no Muse
   app version string is recorded anywhere searchable (session files carry
   only format version 1; the model id is ipnext/avocado-5.17-v2 in all
   records). Do NOT invent one — get the real Muse harness version from
   the top-level agent's context or the app, then add
   `--harness-version <version>`. (Sibling entries hit the same open item.)

## Remaining steps (after the repo exists)

1. Push the files to GitHub (see blocker 1); record the repo URL + full
   commit SHA. The commit to submit is currently
   `bc766bf04324a6f9ff42fdbf230d471b70076047` unless files change; the
   current HEAD (including this STATUS.md) is
   `e6662a00e143f8a7d6bcfb45c3b570f6cdab7e8f`.
2. Re-query usage (all three agent ids) after this subagent session ends:
   `SELECT u.agent_id, u.message_id, u.created_at, u.input_tokens,
   u.output_tokens, a.model FROM agent.agent_message_token_usage u JOIN
   agent.agents a ON a.agent_id = u.agent_id WHERE u.agent_id IN
   ('c857ec1a-6be0-4b02-89db-11005b0574af','c6026a06-bbe4-4eca-bced-d5858d7e3932','f932fd64-7351-475c-8c2a-58a160c0c41a')
   ORDER BY u.created_at DESC LIMIT 500` — write rows unchanged, one JSON
   per line, to `/home/hatch/.makefun/muse-usage-threejs-fps-02.jsonl`
   (overwrite the partial file there now).
3. Bundle (from the kit dir; run it from the top-level agent so its session
   is included too):
   `node cli/makefun.mjs bundle --repo /home/hatch/workspace/makefun/entries/threejs-fps-02 --out /home/hatch/workspace/makefun/entries/threejs-fps-02/bundle.tar.gz --prompt-file /home/hatch/workspace/makefun/prompt-threejs-fps-02.txt --prompt-origin handed-off --prompt-via "main agent to parent orchestrator to subagent handoff" --mcp none --harness Muse --provider meta --model ipnext/avocado-5.17-v2 --effort default --harness-version <version> --muse-usage /home/hatch/.makefun/muse-usage-threejs-fps-02.jsonl --notes "Sable Yard: round-based tactical FPS built by the agent in one session"`
   Note: model is the recorded id `ipnext/avocado-5.17-v2`, not
   `muse-spark-1.3` (the runtime label).
4. `node cli/makefun.mjs check --kit <kit> --repo <entry dir> --transcripts <entry dir>/bundle.tar.gz` until all checks pass.
5. Submit (from the kit dir):
   `node cli/makefun.mjs submit --competition threejs-fps-02 --repo-url https://github.com/Kikuk00/makefun-threejs-fps-02 --commit <sha> --title "Sable Yard" --bundle <entry dir>/bundle.tar.gz --keypair /home/hatch/workspace/makefun/makefun-keypair.json --kit <kit>`
   Record the submission ID/receipt; verify with `makefun status`.

## Safety

Never put the keypair, private key, seed phrase or API key in any repo, file
or message. Never connect the wallet to any site or approve a transaction /
signature beyond the SIWS sign-in already done.
