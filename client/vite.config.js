import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { defineConfig } from 'vite'

const clientDir = path.dirname(fileURLToPath(import.meta.url))
const repoRoot = path.resolve(clientDir, '..')

/**
 * One base path everywhere — dev, preview and production.
 *
 * Cloudflare Pages (the deploy target) serves the site from the domain root, so
 * the default is '/'. Hosts that serve from a subpath must pass their prefix in
 * CEDAR_BASE; the GitHub Pages fallback workflow sets CEDAR_BASE=/cedar-ops/
 * because it publishes to https://<user>.github.io/cedar-ops/.
 *
 * Dev, preview and the verify harness all read the same variable, so whichever
 * base you build with is the base you test against.
 */
const base = process.env.CEDAR_BASE || '/'

export default defineConfig({
  root: clientDir,
  base,
  server: {
    fs: {
      // shared/ sits outside client/, so the dev server would refuse to read it
      // by default. Allow the repo root, nothing wider.
      allow: [repoRoot],
    },
  },
  build: {
    target: 'es2022',
    outDir: path.resolve(clientDir, 'dist'),
    emptyOutDir: true,
    sourcemap: true,
    // Three.js is one unavoidable chunk; splitting it buys nothing. Raised from
    // the 500 kB default so the warning still fires well before the 2 MB gzip
    // budget in CLAUDE.md §5, without crying on every build.
    chunkSizeWarningLimit: 800,
  },
})
