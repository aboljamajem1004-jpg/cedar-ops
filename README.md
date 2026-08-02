# Cedar Ops

A free, open-source, browser-based 3D multiplayer shooter. Three.js + WebGL2 on
the client, an authoritative Node server over WebRTC data channels. No install,
no accounts, join by room code.

**Status: Phase 0 — skeleton.** A lit test scene, the F3 debug overlay, and the
self-verification harness. No gameplay yet.

## Run it

```bash
npm install
npm run dev
```

Then open the URL Vite prints — <http://localhost:5173/>.

## Scripts

| Command | What it does |
| --- | --- |
| `npm run dev` | Vite dev server on port 5173 |
| `npm run build` | Production build into `client/dist` |
| `npm run preview` | Serve the built output on port 4173 |
| `npm run verify` | build → boot both servers → Playwright checks → pass/fail table |

`npm run verify` needs Chromium once: `npx playwright install chromium`.

## Verification

`npm run verify` builds the client, starts the preview server and the dev
server, then drives headless Chrome against both. It checks that the scene
actually renders (a framebuffer readback catches a black frame), that there are
no console or page errors, that draw calls and triangles are inside budget, and
that the cross-root `shared/` import resolves in dev as well as in the bundle.
Output lands in `tools/verify/out/` — `phase0.png` and `report.json`.

It honours `CEDAR_BASE`, so it tests whichever base path you build with.

## Quality settings

Three presets, defined in `shared/constants.js`. Both desktop and mobile start
on **high**. The choice is remembered.

| Preset | Pixel ratio | MSAA | Shadows |
| --- | --- | --- | --- |
| low | 1.0 | off | off |
| medium | 1.25 | on | off |
| high | 1.5 (1.25 on mobile) | on | on |

MSAA and shadows are fixed when the WebGL context and materials are created, so
switching those reloads the page (carrying the new preset in the URL). Pixel
ratio and grid fade apply instantly.

### Automatic downscaling

If p95 frame time stays above budget for 3 seconds, the preset steps down one
level on its own. Thresholds live in `AUTOSCALE` in `shared/constants.js`.

- It watches **p95**, not the average — a stream of occasional long frames reads
  as fine on average but feels like stutter.
- It only ever steps **down**. Auto-upgrading oscillates: more quality means
  more frame time, which trips the downgrade, which raises it again.
- The first 5 seconds after load are ignored (shader compilation), and there is
  an 8-second cooldown after each step.
- Every switch is written to the overlay log, so it is never silent.
- Choosing a preset yourself, or pinning one with `?q=`, switches the scaler off
  permanently and that sticks across reloads. Clear site data to re-enable it.

An automatic downgrade never reloads the page: it applies pixel ratio, shadows
and grid fade live, and defers only the MSAA part to the next load. A manual
choice reloads immediately, because you asked for it and expect to see it.

### Opening the overlay

The overlay is hidden by default in production builds. On desktop, **F3**
toggles it and **F4** cycles quality. Neither works on a phone, so on any device
with a touchscreen:

| Control | Action |
| --- | --- |
| `?debug=1` in the URL | opens the overlay on load, any device |
| **DBG** button, top right | toggle the overlay |
| **QUAL** button, below it | cycle quality (only shown while the overlay is open) |
| Three-finger tap | toggle the overlay |

The buttons are created only on devices reporting a touchscreen, so they never
appear on desktop. They sit top-right to stay clear of the fire and jump buttons
that arrive bottom-right in Phase 7.

### Measuring one setting at a time

Presets move several settings at once, so they cannot tell you what any single
one costs. URL parameters override individual settings for that purpose:

| Parameter | Effect |
| --- | --- |
| `?q=low\|medium\|high` | pin a preset |
| `?pr=1.25` | pixel ratio |
| `?msaa=0\|1` | MSAA |
| `?shadows=0\|1` | shadow map |
| `?grid=0\|1` | ground grid |

Compare with F3 open and read **p50** (typical) and **p95** (worst) frame time —
they are far more stable than the FPS counter. Example: `?pr=1&msaa=0` versus
`?pr=1&msaa=1` isolates the cost of MSAA and nothing else.

`npm run bench` runs that matrix automatically, but **only under headless
software rendering**, where the differences are smaller than the measurement
noise. It reports "below noise floor" rather than inventing a number. Real
per-setting costs come from a real device using the parameters above.

The FPS number it prints comes from software rendering (SwiftShader) in headless
Chrome. It proves the scene renders without erroring. It is **not** a
performance measurement — those come from a real device.

Press **F3** in the browser to toggle the debug overlay.

## Layout

```
client/     Three.js client (Vite)
shared/     code imported by BOTH client and server — movement, protocol, constants
server/     authoritative game server (arrives in Phase 4)
tools/      the Playwright verification harness
```

Anything under `shared/` runs identically on both sides. Client prediction and
server authority must execute the same code on the same inputs, so never
duplicate that logic into `client/`.

## Deploy

The client is deployed by **Cloudflare Pages**, which builds from this repo on
every push to `main`. One-time setup in the Cloudflare dashboard:

1. <https://dash.cloudflare.com> → **Workers & Pages** → **Create** →
   **Pages** tab → **Connect to Git**
2. Authorise GitHub, pick the **cedar-ops** repository, **Begin setup**
3. Settings:

   | Field | Value |
   | --- | --- |
   | Project name | `cedar-ops` |
   | Production branch | `main` |
   | Framework preset | None |
   | Build command | `npm run build` |
   | Build output directory | `client/dist` |
   | Root directory | *(leave empty — the repo root)* |

4. **Save and Deploy**

The site lands on `https://cedar-ops.pages.dev`. Every later push to `main`
redeploys automatically; pushes to other branches get preview URLs.

**Node version** comes from the `.node-version` file (24) in the repo root, so
there is nothing to set in the dashboard. To override it there instead, add an
environment variable `NODE_VERSION = 24` under Settings → Environment variables.

**No environment variables are required.** Cloudflare serves the site from the
domain root, and the base path already defaults to `/`.

### Base path

Never hardcode a base path. Vite, the dev server and the verify harness all read
`CEDAR_BASE`, defaulting to `/`. Only a host that serves the site from a subpath
needs to set it.

### GitHub Pages fallback

`.github/workflows/deploy.yml` still publishes to GitHub Pages and is kept as a
working fallback. It is **manual-trigger only** (Actions tab → Run workflow), so
it cannot race the Cloudflare deploy. It needs GitHub Actions enabled on the
account and **Settings → Pages → Source: GitHub Actions**.

That path serves from `https://<user>.github.io/cedar-ops/`, so the workflow
passes `CEDAR_BASE=/cedar-ops/` to the build. To test that build locally:

```powershell
$env:CEDAR_BASE = '/cedar-ops/'; npm run verify
```

The game server is self-hosted; its deployment is documented in Phase 9.

## License

MIT. All bundled assets are CC0 or otherwise free for commercial and
open-source use — see `client/public/assets/CREDITS.md`.
