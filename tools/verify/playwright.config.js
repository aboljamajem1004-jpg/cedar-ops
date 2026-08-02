import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { defineConfig, devices } from '@playwright/test'

const here = path.dirname(fileURLToPath(import.meta.url))
const repoRoot = path.resolve(here, '..', '..')

export const BASE_PATH = '/cedar-ops/'
export const PREVIEW_URL = `http://127.0.0.1:4173${BASE_PATH}`
export const DEV_URL = `http://127.0.0.1:5173${BASE_PATH}`

export default defineConfig({
  testDir: here,
  outputDir: path.join(here, 'out', 'test-results'),
  timeout: 90_000,
  fullyParallel: false,
  workers: 1,
  reporter: [['list']],

  use: {
    baseURL: PREVIEW_URL,
    viewport: { width: 1280, height: 720 },
    ...devices['Desktop Chrome'],
    launchOptions: {
      // Headless Chrome has no GPU here. These flags force the ANGLE/SwiftShader
      // software path so WebGL2 works at all. Recent Chrome refuses software
      // WebGL without --enable-unsafe-swiftshader.
      args: [
        '--use-gl=angle',
        '--use-angle=swiftshader',
        '--enable-unsafe-swiftshader',
        '--ignore-gpu-blocklist',
      ],
    },
  },

  // Two servers: the production build (preview) and the dev server. The dev one
  // exists so the shared/ import outside Vite's root is proven to resolve in
  // both modes on every run, not just in the bundle.
  webServer: [
    {
      command: 'npm run preview',
      url: PREVIEW_URL,
      cwd: repoRoot,
      timeout: 60_000,
      reuseExistingServer: !process.env.CI,
      stdout: 'pipe',
    },
    {
      command: 'npm run dev',
      url: DEV_URL,
      cwd: repoRoot,
      timeout: 60_000,
      reuseExistingServer: !process.env.CI,
      stdout: 'pipe',
    },
  ],
})
