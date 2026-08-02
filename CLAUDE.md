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
- **Stylized-realistic** art direction — the reference points are Valorant and The Finals: correct human proportions, strong silhouettes, clean PBR materials, stylized skin and hair. Not photoreal, not low-poly. Weapons go as close to photoreal as the budget allows, and they can, because they are small, rigid, and carried by normal maps.

### Non-goals (do not build these)
- No battle royale, no 100-player maps, no open world
- No accounts, login, database, or persistence between matches
- No matchmaking service — join by **room code** only
- No monetization, no ads, no anti-cheat beyond server authority + sanity checks
- No Unity / Unreal / WebGPU. Plain Three.js + WebGL2.

**Out of reach — do not propose these.** Not achievable in a browser with 8
players on WebGL2, regardless of effort: photoreal skin (subsurface scattering),
real-time global illumination, cloth or hair simulation, alpha-card hair across 8
characters on mobile (overdraw on tile-based GPUs), screen-space reflections,
volumetric lighting, high-fidelity facial animation at scale, 4K textures.
Realistic *bodies* are not on the table; stylized-realistic bodies are. Realistic
*weapons* are.

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

> **These numbers are ESTIMATES, not measurements.** They were derived from
> hardware reasoning, not from this game on real devices. They get corrected
> with real Samsung A56 data after the Phase 2 stress test. Until that happens,
> treat any number here as provisional.

**Frame time is the real budget.** Everything below is a proxy for it.

| Metric | Desktop | Mobile |
|---|---|---|
| **Frame time** | 16.6 ms | 33.3 ms |
| FPS target | 60 | 30 |
| Draw calls | < 300 | < 150 |
| Triangles on screen | < 1M | < 400k |
| Texture memory | < 400 MB | < 200 MB |
| Full-screen post passes | ≤ 3 | ≤ 1 |
| Shadow-casting lights | 1 | 0 (baked + blob shadows) |
| Skinned meshes | ≤ 16 | ≤ 10 |
| Texture size | ≤ 2048 | ≤ 1024 |
| Total JS bundle (gzip) | < 2 MB | |
| Total assets | < 15 MB | |
| Server tick time | < 5 ms with 8 players | |

**What actually costs frames, in order.** Triangles are sixth. Doubling geometry
is close to free; one badly chosen alpha-blended layer across 8 characters can
cost 30% of the frame.

1. Draw calls — JS→GL overhead on a thread shared with physics and netcode
2. Fill rate and overdraw — mobile GPUs are tile-based, transparency is brutal
3. Texture bandwidth and memory
4. Full-screen post-processing passes
5. Shadow passes
6. Triangles

Techniques that are required, not optional:
- Baked lighting where possible; **one** real-time shadow-casting light (sun) max, disabled on mobile
- **KTX2 / Basis Universal for every texture — mandatory, not optional.** See §5.1.
- PBR metalness/roughness with an HDRI environment map, and ACES tone mapping — this is most of what reads as "modern", and tone mapping is free
- Normal maps instead of geometry for surface detail, especially on weapons
- Baked ambient occlusion in the texture rather than an SSAO pass
- `InstancedMesh` for every repeated prop
- One texture atlas per material group → minimal draw calls
- Object pooling for bullets, tracers, particles, decals, audio nodes
- Frustum culling on, plus manual distance culling for props
- `renderer.setPixelRatio()` clamped: desktop ≤ 1.5, mobile ≤ 1.25, plus a render-scale slider (0.5–1.0)
- All models compressed with Draco or Meshopt before commit
- Show an FPS + draw-call + ping overlay from phase 0 onward (toggle with F3)

### 5.1 Permanent constraints

These are not per-phase decisions. They hold for the life of the project.

**Thermal throttling — design for the throttled state, not the first minute.**
A phone holds its peak for roughly two minutes and then loses 30–40% as it heats
up. A 10-minute match is played almost entirely in the throttled state, so that
is the state the budget must be met in. Never accept a performance result
measured in the first minute of a session. The auto-scaler exists for this.

**Mobile memory ceiling — KTX2 is mandatory for all textures.**
Mobile browsers kill tabs at roughly 1–1.5 GB, and texture memory is what gets
us there, not geometry. An uncompressed 2048² RGBA texture costs ~16 MB of GPU
memory; the same texture as KTX2/Basis costs ~4 MB, transcoded to ASTC on mobile
and BC on desktop. Every texture ships as KTX2. No PNG or JPEG at runtime, ever.

**Drone aerial camera — full-screen only, never picture-in-picture, and the map
must be built for it from Phase 3 onward.**
Picture-in-picture means a second full scene render per frame, up to 2× the GPU
cost. A full-screen mode switch is nearly free — that is the only acceptable
form. The harder problem is that occlusion culling carries the frame at ground
level and collapses from the air: at 40 m up the whole map is visible at once and
draw calls spike. The map's LOD and distance-culling strategy must be designed
for aerial viewing from Phase 3, with culling distances tuned separately per
camera. Retrofitting this later means rebuilding the map's rendering strategy.

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
Load a rigged .glb character, animation set (idle/walk/run/jump/crouch), animation blending, `V` toggle, third-person spring-arm camera with collision, hide head mesh in FP.

**Stress test, run before any integration code**: 8 characters at LOD0 with PBR materials and an HDRI, measured on the Samsung A56 — including after five minutes of continuous running, so the number recorded is the throttled one. The §5 budget stays marked as estimates until this produces real data.

Animation is driven by simulation state (`speed`, `onGround`, `crouching` from `shared/movement.js`), never by input. Remote players arrive over the network as position and velocity with no key presses attached — animation keyed to input would leave them sliding around in a permanent idle pose.

**Done when**: both cameras look right, animations don't pop, and the stress test numbers are recorded in §5.

### Phase 3 — Map v1
Blockout the map (code-generated or modeled), collision, spawn points, skybox, fog, baked-style lighting, atlas materials. Verify performance budget.
**Done when**: full map runs inside the budget on my phone.

### Phase 4 — Naive multiplayer
geckos.io server + client, room codes, join/leave, players broadcast state, other players appear and move (no prediction yet, will look laggy — that's expected).

**Build the generic entity system here, not later (§10 LB1).** A player is an entity with `type: player`. There is no players array to grow out of.

**Done when**: two browsers on my LAN see each other move.

### Phase 5 — Real netcode
Binary protocol, 30 Hz server sim, 20 Hz snapshots, client prediction + reconciliation, entity interpolation with 100 ms buffer, network debug panel (RTT, jitter, mis-predictions, bandwidth).

**Load-bearing here (§10):** 16-bit entity ids and 8-bit type tags in the protocol (LB3), optional `parentId` in the transform even though nothing uses it yet (LB2), and a rewind that restores entities rather than players (LB8). All three are nearly free now and a protocol break later.

**Done when**: my own movement feels instant and remote players are smooth over real internet (test me on RDP, friend at home).

### Phase 6 — Combat
Weapons, firing, recoil pattern, fire rate, reload, ammo, muzzle flash + tracer + impact decal, server-side hit detection with lag compensation, damage, death, respawn, killfeed.

**Load-bearing here (§10):** weapons are data in `shared/weapons.js` (LB4), and the projectile system is built first with hitscan expressed as a projectile of infinite speed (LB5) — not a raycast path with projectiles bolted on afterwards. The v1 rifle and pistol are both hitscan, so this costs almost nothing now and is what makes the mortar and the ATGM additions rather than rewrites.

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

### Phase 10 — Drones / UAVs (planned, not scoped)
Airborne drone entities, both as a gameplay element inside TDM and as a possible separate mode. Placeholder so the constraints below are designed for, not retrofitted.

Known costs, from the §5 analysis:
- **Mesh and bandwidth are negligible** — 1–3k triangles, roughly 12 bytes per drone per snapshot quantized. Eight drones at 20 Hz is about 2 KB/s against a 30 KB/s budget.
- **3D flight movement** is a second function in `shared/movement.js`, subject to the same client/server sharing rule as ground movement.
- **Lag compensation is genuinely hard.** Small, fast, airborne targets are the worst case for fair hit registration at 100 ms ping. Budget real design time.
- **The aerial camera is the expensive part** — see §5.1. Full-screen only, and the map's LOD/culling strategy must already account for it from Phase 3.

---

## 8. Assets — sources and rules

All assets must be **CC0 or clearly free for commercial/open-source use**. Record every source in `client/public/assets/CREDITS.md`.

| Need | Source |
|---|---|
| Props, weapons, environment kits | kenney.nl/assets (CC0) |
| Characters, nature, modular kits | quaternius.com (CC0) |
| Search across free 3D | poly.pizza |
| Character animations | quaternius.com Universal Animation Library (CC0, ships as GLB, same universal humanoid rig as Universal Base Characters — no retargeting). mixamo.com (free Adobe account) is the fallback, not the default. |
| Sound effects | freesound.org (check license), kenney.nl audio packs |
| HDRIs / skies | polyhaven.com (CC0) |

Rules:
- Only `.glb`, never `.fbx`/`.obj` at runtime
- Compress every model with `gltf-transform` (Draco/Meshopt) before committing
- Textures ≤ 1024 for props, ≤ 2048 for the atlas
- **Every texture ships as KTX2 / Basis Universal — mandatory (§5.1).** No PNG, JPEG or WebP at runtime. WebP is smaller to download but decodes to uncompressed RGBA in GPU memory, which is the resource that actually runs out on a phone.
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

---

## 10. Roadmap — and the decisions that are load-bearing for it

Planned after v1 ships, roughly in this order: new weapons, mortar (arcing
indirect fire), anti-tank guided missile (slow visible projectile, splash),
23mm autocannon on a pickup, attack drone and FPV/kamikaze drone, drivable
pickup truck.

None of this gets built now. It exists here so Phase 5 and Phase 6 are built to
accept it, because every item below is cheap to design for and expensive to
retrofit.

### Feasibility

| Item | Verdict |
|---|---|
| New weapons | Trivial, if weapons are data |
| Mortar | Realistic — easier than hitscan, see below |
| ATGM | Realistic; wire-guided costs more than fire-and-forget |
| 23mm on a pickup | Realistic; the gun is easy, the truck is the cost |
| Attack / FPV drone | Realistic; reuses player entity machinery |
| Drivable pickup | Realistic **only** as a kinematic arcade vehicle |

**Slow projectiles are easier than bullets.** A hitscan shot needs the full
rewind: every hitbox moved back ~150 ms to judge an instant hit. A mortar shell
flies for seconds, so only the launch transform needs compensating and the
flight is simulated identically on both sides from a single spawn event.

**Not achievable — do not attempt:** networked rigid-body vehicle physics
(suspension, rollovers, vehicle-vs-vehicle collisions at 100 ms ping),
destructible terrain, dozens of simultaneous physics projectiles, physically
"fair" vehicle-vs-player collisions. That last one needs a designed rule, not a
simulation.

### Load-bearing decisions

Each of these is nearly free now and a rewrite later. The retrofit cost is
stated so the tradeoff is never re-litigated from scratch.

**LB1 — The entity system is generic from Phase 4. There is no "players array".**
Snapshots carry a list of entities `{id, type, ...}`. Lag-compensation history is
per entity. Interpolation rules are per type. Players, drones, projectiles and
vehicles are all entities that differ by type, not by code path.
*Retrofit cost: essentially all of Phase 5 — protocol, server sim, client
interpolation, and lag compensation.*

**LB2 — The transform model carries optional parenting from Phase 5.**
An entity has `parentId` plus a local transform. Needed by a passenger in a
vehicle and by a gun mounted on one. Ship it as an optional field even while
nothing uses it.
*Retrofit cost: wire-format change plus every prediction and interpolation path.*

**LB3 — `protocol.js` sizes entity IDs and type tags for growth.**
16-bit entity id, 8-bit type tag, explicit entity count per snapshot. Never "8
player slots".
*Retrofit cost: protocol rewrite, and a version break with any deployed client.*

**LB4 — Weapons are data in `shared/weapons.js`, never classes.**
One table: fire mode, damage, RPM, magazine, spread, recoil pattern, projectile
type, muzzle velocity, gravity scale, splash radius and falloff. The server
validates fire rate and damage against the same table the client fires from.
*Retrofit cost: moderate on its own, but hardcoded weapons drag hardcoded fire
logic into the client, which then diverges from the server.*

**LB5 — Hitscan is a projectile with infinite speed. One firing pipeline.**
Do not build a hitscan path and add projectiles later; build the projectile
system first and express hitscan inside it.
*Retrofit cost: two divergent firing paths, doubled lag-comp logic, doubled
server validation, and two places for every future weapon bug.*

**LB6 — Projectiles are deterministic and simulated on both sides from a spawn
event.** Never stream projectile positions. Reliable spawn event carrying
`{weaponId, origin, direction, launchTick}`, then both sides integrate the same
fixed-step arc from `shared/`. The server owns the impact.
*Retrofit cost: bandwidth blowup, and prediction becomes impossible.*

**LB7 — Vehicles are kinematic and driven by a movement function in `shared/`,
never a Rapier dynamic rigid body.**
This is a constraint, not just a structure. Rigid-body prediction and
reconciliation diverge badly at 100 ms, and correcting them jerks the vehicle
visibly. An arcade vehicle model shares the same predict/replay machinery the
player capsule already uses.
*Retrofit cost: rewriting vehicle movement and prediction after discovering the
desync — the worst possible time.*

**LB8 — Lag compensation rewinds entities, not players.**
The rewind must be able to restore a shooter standing on a moving platform, not
only a player standing on the map.
*Retrofit cost: rewriting the rewind path once vehicles exist.*
