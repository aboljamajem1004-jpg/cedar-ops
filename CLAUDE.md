# CLAUDE.md — Project Instructions

> This file is read automatically by Claude Code at the start of every session.
> Keep it updated. It is the single source of truth for how this project is built.

---

## 0. How to work with me (READ FIRST)

**Communication**
- Talk to me in **English**. Keep it plain and direct — short sentences, no idioms.. Code, comments, commit messages and file names stay in **English**.
- I am an experienced Python / FastAPI / React developer, but **new to 3D and game netcode**. Explain 3D-specific concepts briefly when you introduce them; don't explain basic programming.

**Working rhythm — this is mandatory**
1. We build **one phase at a time**, in the order listed in section 7.
2. At the start of a phase: tell me what we're building, which files you'll touch, and any new dependency (and why).
3. Write the code.
4. **STOP.** Give me exact commands to run and a short checklist of what I should see/test.
5. I test and report back. Fix issues. Only then propose moving to the next phase.
6. Never start phase N+1 while phase N is unverified.

**Where you run (important)**
You run **locally inside VS Code on my Windows RDP**, with full access to the repo, the terminal, Node, and Chrome. Use that access — don't ask me to do things you can do yourself.

- You install dependencies, run the dev server, run builds, and read the output yourself.
- You may download free assets directly with `curl`/`Invoke-WebRequest` when I've approved the source.
- **Self-verification is required.** From Phase 0, keep a Playwright setup in `tools/verify/` that: launches headless Chrome against the dev server, waits for the game to boot, reads `console` errors, samples FPS and draw calls from the debug overlay, and saves a screenshot to `tools/verify/out/`. Run it after every change and report the numbers.
- `npm run verify` must be a single command that does: build → launch dev server → run the Playwright check → print a pass/fail summary.
- Playwright headless uses SwiftShader (software GL). Treat its FPS numbers as a **smoke test only** — proof that it renders and doesn't error, not a performance measurement. Real performance numbers come from me.
- Screenshots are your eyes: after any visual change, take one and describe what you see. If it's black, empty, or wrong, fix it before telling me you're done.
- What only I can judge: game feel, whether the map is fun, real-device performance, and real-network multiplayer. Ask me to test those explicitly at the end of each phase, with a numbered checklist.
- I am solo on this repo: commit straight to `main`. Push after every verified phase.

**Hard rules**
- Do **not** refactor across phases without asking. Small, reviewable diffs.
- Do **not** add a dependency without telling me the size and why a lighter option won't work.
- Keep every source file **under ~300 lines**. Split into modules instead of growing one file.
- No placeholder code, no `TODO: implement later` in the main path. If a phase is too big, split it.
- If something in this spec is wrong or a better approach exists, **say so before coding**, don't silently deviate.
- Commit at the end of every phase: `git commit -m "phase N: <what>"` and tell me the command.

**When I need external things**
Whenever a phase needs a program, an account, an asset pack or a manual download, give me:
- exact name + official URL
- the install command for Windows (my RDP) and/or Android/Termux where relevant
- what exactly to download and where to put it in the repo
Never assume I already have it.

---

## 1. What we are building

A **free, open-source, browser-based 3D multiplayer shooter**.

- 3D, **first-person and third-person** (toggleable in-game)
- **Multiplayer** — small private matches with friends (4v4 target, 8 players max)
- Runs in the browser on **desktop and mobile phones**, no install, no accounts
- **Lightweight**: must run on integrated GPUs and mid-range Android phones
- Client hosted free on **Cloudflare Pages**; game server self-hosted on my **Windows RDP**
- Modern stylized **low-poly** art direction (not realistic)

### Non-goals (do not build these)
- No battle royale, no 100-player maps, no open world
- No accounts, login, database, or persistence between matches
- No matchmaking service — join by **room code** only
- No monetization, no ads, no anti-cheat beyond server authority + sanity checks
- No Unity / Unreal / WebGPU. Plain Three.js + WebGL2.

---

## 2. Tech stack

**Client**
- `three` — rendering (WebGL2)
- `@dimforge/rapier3d-compat` — physics (WASM)
- `@geckos.io/client` — networking (WebRTC data channels = UDP-like)
- `@geckos.io/snapshot-interpolation` — snapshot buffering / interpolation
- `vite` — dev server + build
- Vanilla JS/TS + plain DOM/CSS for UI. **No React, no UI framework.**

**Server**
- Node.js 20+
- `@geckos.io/server`
- `@dimforge/rapier3d-compat` (same physics as client — shared deterministic sim)
- `pm2` for keeping it alive on the RDP

**Language**: JavaScript with JSDoc types. (TypeScript only if I ask.)

**Why geckos.io and not WebSocket**: my ping is ~100ms and packet loss is real. TCP head-of-line blocking freezes gameplay; WebRTC data channels give unreliable/unordered UDP-style transport.

---

## 3. Repository structure

```
/
├── CLAUDE.md              ← this file
├── SETUP.md               ← tools I must install (kept in Arabic)
├── README.md
├── package.json           ← workspace root, npm scripts for both sides
├── client/
│   ├── index.html
│   ├── vite.config.js
│   ├── public/
│   │   └── assets/
│   │       ├── models/    ← .glb only
│   │       ├── textures/
│   │       ├── audio/
│   │       └── anim/
│   └── src/
│       ├── main.js            ← entry, boot sequence
│       ├── core/              ← renderer, game loop, asset loader, input
│       ├── game/              ← player, camera, weapons, map, effects
│       ├── net/               ← client socket, prediction, reconciliation
│       └── ui/                ← HUD, menus, touch controls
├── server/
│   ├── index.js
│   ├── room.js            ← one match instance
│   ├── sim.js             ← authoritative fixed-step simulation
│   └── lagcomp.js         ← hitbox history / rewind
└── shared/
    ├── constants.js       ← tick rates, speeds, damage, map size
    ├── protocol.js        ← binary encode/decode of packets
    └── movement.js        ← THE shared movement function (see §4)
```

**Critical**: `shared/movement.js` is imported by *both* client and server. Client prediction and server authority must run **the exact same code** on the same inputs, or prediction will constantly mis-predict. Never duplicate movement logic.

---

## 4. Netcode design (do not improvise here)

| Parameter | Value |
|---|---|
| Simulation tick | 30 Hz fixed (33.33 ms) — both sides |
| Snapshot rate (server → client) | 20 Hz |
| Interpolation delay | 100 ms |
| Input send rate | every client tick, with last 3 unacked inputs re-sent |
| Transport | unreliable+unordered for state, reliable for events (join, spawn, death) |
| Encoding | **binary** (`protocol.js`), never JSON in the hot path |

**Flow**
1. Client samples input → `{seq, dt, buttonBitmask, yaw, pitch}` → sends → **immediately applies it locally** via `shared/movement.js` (prediction) and stores it in a pending buffer.
2. Server runs fixed-step sim, applies inputs, broadcasts snapshots containing `lastProcessedSeq` per player.
3. On snapshot: client sets local player to authoritative state, then **replays** all pending inputs after `lastProcessedSeq` (reconciliation).
4. Remote players are rendered 100 ms in the past, interpolated between the two nearest snapshots.
5. **Lag compensation**: server keeps 1 second of hitbox history per player. On a shot, it rewinds all players to `serverTime - (clientRTT/2 + interpDelay)` before the raycast.

**Authority**: the server owns all positions, health and hits. The client never sends "I hit X" — it sends "I fired at time T with direction D".

Sanity checks on server: max speed, max fire rate, position delta per tick. Reject and snap back.

---

## 5. Performance budget (enforce these — check every phase)

| Metric | Desktop | Mobile |
|---|---|---|
| FPS target | 60 | 30 |
| Draw calls | < 150 | < 100 |
| Triangles on screen | < 300k | < 150k |
| Texture size | ≤ 2048 | ≤ 1024 |
| Total JS bundle (gzip) | < 2 MB | |
| Total assets | < 15 MB | |
| Server tick time | < 5 ms with 8 players | |

Techniques that are required, not optional:
- Baked lighting where possible; **one** real-time shadow-casting light (sun) max, disabled on mobile
- `InstancedMesh` for every repeated prop
- One texture atlas per material group → minimal draw calls
- Object pooling for bullets, tracers, particles, decals, audio nodes
- Frustum culling on, plus manual distance culling for props
- `renderer.setPixelRatio()` clamped: desktop ≤ 1.5, mobile ≤ 1.0, plus a render-scale slider (0.5–1.0)
- All models compressed with Draco or Meshopt before commit
- Show an FPS + draw-call + ping overlay from phase 0 onward (toggle with F3)

---

## 6. Game design (v1)

- **Mode**: Team Deathmatch, 4v4, first to 30 kills or 10 minutes
- **Map**: one map, ~200×200 m, blockout-first. Two team spawns, 3 lanes, cover, one small building, verticality via ramps/roofs. No interiors deeper than one room.
- **Movement**: walk, sprint, crouch, jump. No sliding, no vaulting in v1.
- **Weapons v1**: one assault rifle (hitscan, 25 dmg, 600 RPM, 30 rounds), one pistol (35 dmg, semi). Headshot ×2.
- **Health**: 100 HP, no shields, no regen in v1. Respawn after 5 s at team spawn.
- **Camera**: `V` toggles FP/TP. TP camera is over-the-right-shoulder with collision (spring arm). Aiming in TP uses a centered crosshair with a small camera pull-in.
- **Rooms**: host creates a room → gets a code like `CEDAR-4821` → friends enter the code on the landing page. Max 8. No lobby chat in v1.

---

## 7. Phases

Each phase ends with: it runs, I tested it, it's committed.

### Phase 0 — Skeleton
Vite project, repo structure, root npm scripts (`dev:client`, `build`, `verify`), Three.js scene with a ground plane and a lit cube, F3 debug overlay (FPS, draw calls, tris), the Playwright self-verification harness in `tools/verify/`, and one live deploy to prove the pipeline.
**Done when**: `npm run verify` passes with a screenshot showing the cube, and I open the Cloudflare Pages URL on phone and desktop and see it running at 60/30 fps.

`dev:server` is deliberately absent until Phase 4, when `server/index.js` first exists — no placeholder scripts.

### Phase 1 — Local first-person movement
Rapier physics world, capsule character controller, WASD + mouse look (Pointer Lock), jump, sprint, crouch, gravity, slope/step handling. Movement logic lives in `shared/movement.js` from day one.
**Done when**: movement feels solid on a test blockout, no clipping through walls.

### Phase 2 — Character + third person
Load a rigged .glb character, Mixamo animation set (idle/walk/run/jump/crouch), animation blending, `V` toggle, third-person spring-arm camera with collision, hide head mesh in FP.
**Done when**: both cameras look right and animations don't pop.

### Phase 3 — Map v1
Blockout the map (code-generated or modeled), collision, spawn points, skybox, fog, baked-style lighting, atlas materials. Verify performance budget.
**Done when**: full map runs inside the budget on my phone.

### Phase 4 — Naive multiplayer
geckos.io server + client, room codes, join/leave, players broadcast state, other players appear and move (no prediction yet, will look laggy — that's expected).
**Done when**: two browsers on my LAN see each other move.

### Phase 5 — Real netcode
Binary protocol, 30 Hz server sim, 20 Hz snapshots, client prediction + reconciliation, entity interpolation with 100 ms buffer, network debug panel (RTT, jitter, mis-predictions, bandwidth).
**Done when**: my own movement feels instant and remote players are smooth over real internet (test me on RDP, friend at home).

### Phase 6 — Combat
Weapons, raycast firing, recoil pattern, fire rate, reload, ammo, muzzle flash + tracer + impact decal, server-side hit detection with lag compensation, damage, death, respawn, killfeed.
**Done when**: shooting feels responsive at 100 ms ping and hits register fairly.

### Phase 7 — UI / HUD / mobile
Landing page (create/join room, nickname), HUD (health, ammo, crosshair, killfeed, scoreboard on Tab), pause/settings (sensitivity, render scale, shadows), **touch controls** (left stick move, right drag look, fire/jump/crouch/ADS buttons), auto quality detection on mobile.
**Done when**: I can play a full match from my phone.

### Phase 8 — Match flow + polish
TDM scoring, round timer, team assignment, end-of-match screen, sounds (footsteps, gunfire, hit markers), particles, hit feedback.

### Phase 9 — Deploy for real
Client on **Cloudflare Pages**, which builds from the repo on every push to `main`. Server on the RDP under pm2 + Cloudflare Tunnel for HTTPS/WSS. Environment config so the client knows the server URL. Write the deploy steps into README.md.

**Why not GitHub Pages**: a failed card authorization locked GitHub Actions on this account (2026-08-02), so the Actions-based deploy cannot run. The workflow is kept at `.github/workflows/deploy.yml` as a working fallback, manual-trigger only. If Actions is ever unlocked, that file still deploys correctly — it passes `CEDAR_BASE=/cedar-ops/` because GitHub Pages serves from a subpath while Cloudflare serves from the domain root.

**Base path rule**: never hardcode a base path. Vite, the dev server and the verify harness all read `CEDAR_BASE`, defaulting to `/`. A host that serves from a subpath sets that variable; nothing else changes.

---

## 8. Assets — sources and rules

All assets must be **CC0 or clearly free for commercial/open-source use**. Record every source in `client/public/assets/CREDITS.md`.

| Need | Source |
|---|---|
| Props, weapons, environment kits | kenney.nl/assets (CC0) |
| Characters, nature, modular kits | quaternius.com (CC0) |
| Search across free 3D | poly.pizza |
| Character animations | mixamo.com (free Adobe account) |
| Sound effects | freesound.org (check license), kenney.nl audio packs |
| HDRIs / skies | polyhaven.com (CC0) |

Rules:
- Only `.glb`, never `.fbx`/`.obj` at runtime
- Compress every model with `gltf-transform` (Draco/Meshopt) before committing
- Textures ≤ 1024 for props, ≤ 2048 for the atlas, WebP where possible
- Never commit raw source files (`.blend`, `.fbx`) to the repo — keep them out via `.gitignore`

When a phase needs assets, **tell me exactly which pack to download and where to place the files**, then wait — don't invent placeholder geometry and move on unless I say so.

---

## 9. Environment

- Development happens on a **Windows RDP**: VS Code + Claude Code + Node.js 20 + Git + Chrome, all on that machine
- The RDP has fast internet; my home connection is slow — so all installs, asset downloads and testing happen on the RDP, and I connect to it over remote desktop
- Push to GitHub after every verified phase
- Game server runs on the same Windows RDP
- My home internet is slow (~10 Mbps down / 2.7 up, ~100 ms ping) — keep bandwidth per player under ~30 KB/s
- GitHub repo is public; keep it clean enough for others to clone and run in two commands
