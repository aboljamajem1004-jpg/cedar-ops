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
