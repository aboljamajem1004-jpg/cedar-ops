import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { defineConfig } from 'vite'

const clientDir = path.dirname(fileURLToPath(import.meta.url))
const repoRoot = path.resolve(clientDir, '..')

/**
 * One base path everywhere — dev, preview and production.
 *
 * GitHub Pages serves this repo from https://<user>.github.io/cedar-ops/, so
 * every asset URL needs the /cedar-ops/ prefix. Using the same value in dev
 * means a path bug shows up on the dev server instead of only on Pages.
 * Override with CEDAR_BASE=/ when serving from a domain root.
 */
const base = process.env.CEDAR_BASE || '/cedar-ops/'

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
