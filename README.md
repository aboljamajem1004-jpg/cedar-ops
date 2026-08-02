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

Then open the URL Vite prints — <http://localhost:5173/cedar-ops/>.

The `/cedar-ops/` path is not a typo. The production site is served from that
subpath on GitHub Pages, so dev uses it too and path bugs surface immediately.
Serving from a domain root instead? Set `CEDAR_BASE=/`.

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

Pushing to `main` builds the client and publishes it to GitHub Pages via
`.github/workflows/deploy.yml`. The repository needs **Settings → Pages →
Source: GitHub Actions** set once, or the deploy step fails.

The game server is self-hosted; its deployment is documented in Phase 9.

## License

MIT. All bundled assets are CC0 or otherwise free for commercial and
open-source use — see `client/public/assets/CREDITS.md`.
