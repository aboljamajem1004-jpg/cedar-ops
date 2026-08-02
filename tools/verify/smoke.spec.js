import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { test, expect } from '@playwright/test'
import { TICK_HZ, BUDGET } from '../../shared/constants.js'

const outDir = path.join(path.dirname(fileURLToPath(import.meta.url)), 'out')

const SAMPLE_MS = 3000
/** Mean luminance (0-255) below this means we are looking at a black frame. */
const MIN_BRIGHTNESS = 8

test('phase 0 smoke: production build renders, reports and stays clean', async ({ page }) => {
  /** @type {string[]} */ const consoleErrors = []
  /** @type {string[]} */ const pageErrors = []

  // Subscribe before navigating — errors thrown during boot are the ones we
  // care about most, and they fire before goto() resolves.
  page.on('console', (m) => {
    if (m.type() === 'error') consoleErrors.push(m.text())
  })
  page.on('pageerror', (e) => pageErrors.push(e.message))

  await page.goto('./')
  await page.waitForFunction(() => window.__CEDAR_READY__ === true, null, { timeout: 30_000 })

  // Wait for the overlay's first full measurement window to close before
  // sampling. Under SwiftShader the opening frames take hundreds of
  // milliseconds each (shader compilation), so a blind sleep can read stats
  // that were never populated.
  await page.waitForFunction(() => window.__CEDAR_DEBUG__.fps > 0, null, { timeout: 30_000 })
  await page.waitForTimeout(SAMPLE_MS)

  const stats = await page.evaluate(() => {
    const d = window.__CEDAR_DEBUG__
    return {
      fps: d.fps,
      fpsMin: d.fpsMin,
      frameMs: d.frameMs,
      drawCalls: d.drawCalls,
      triangles: d.triangles,
      geometries: d.geometries,
      textures: d.textures,
      width: d.width,
      height: d.height,
      pixelRatio: d.pixelRatio,
      webgl2: d.webgl2,
      tickHz: d.tickHz,
      frame: d.frame,
    }
  })

  // Ask the render loop to read the framebuffer back on its next frame.
  await page.evaluate(() => window.__CEDAR_DEBUG__.requestPixelSample())
  const sample = await page
    .waitForFunction(() => window.__CEDAR_DEBUG__.pixelSample, null, { timeout: 10_000 })
    .then((h) => h.jsonValue())

  fs.mkdirSync(outDir, { recursive: true })
  await page.screenshot({ path: path.join(outDir, 'phase0.png') })

  const budget = BUDGET.desktop
  const report = {
    phase: 0,
    url: page.url(),
    sampleMs: SAMPLE_MS,
    stats,
    pixelSample: sample,
    consoleErrors,
    pageErrors,
    note: 'FPS measured under SwiftShader software rendering — smoke test only, not a performance measurement.',
  }
  fs.writeFileSync(path.join(outDir, 'report.json'), JSON.stringify(report, null, 2))

  printTable([
    ['Metric', 'Value', 'Budget', 'Note'],
    ['FPS (avg)', stats.fps, budget.fps, 'SwiftShader — NOT a measurement'],
    ['FPS (1s low)', stats.fpsMin, budget.fps, 'SwiftShader — NOT a measurement'],
    ['Frame time', `${stats.frameMs.toFixed(1)} ms`, '-', 'software rendered'],
    ['Draw calls', stats.drawCalls, budget.drawCalls, 'real — geometry dependent'],
    ['Triangles', stats.triangles, budget.triangles, 'real — geometry dependent'],
    ['Geometries', stats.geometries, '-', 'GPU memory'],
    ['Textures', stats.textures, '-', 'GPU memory'],
    ['Resolution', `${stats.width}x${stats.height}`, '-', `pixelRatio ${stats.pixelRatio}`],
    ['WebGL2', stats.webgl2 ? 'yes' : 'NO', 'yes', 'context type'],
    ['Frames drawn', stats.frame, '>0', `over ${SAMPLE_MS} ms`],
    ['shared tickHz', stats.tickHz, TICK_HZ, 'cross-root import, built bundle'],
    ['Frame brightness', sample.mean.toFixed(1), `>${MIN_BRIGHTNESS}`, `range ${sample.min}-${sample.max}`],
    ['Console errors', consoleErrors.length, 0, ''],
    ['Page errors', pageErrors.length, 0, ''],
  ])

  console.log(
    '\nFPS here comes from headless Chrome on SwiftShader (software GL).\n' +
      'It proves the scene renders and does not error. It is NOT a performance\n' +
      'measurement — real numbers come from a real device.\n' +
      `Screenshot: ${path.join(outDir, 'phase0.png')}\n`
  )

  expect(pageErrors, 'uncaught page errors').toEqual([])
  expect(consoleErrors, 'console errors').toEqual([])
  expect(stats.webgl2, 'WebGL2 context').toBe(true)
  expect(stats.tickHz, 'shared/constants.js resolved in the production build').toBe(TICK_HZ)
  expect(stats.frame, 'frames drawn').toBeGreaterThan(10)
  expect(stats.fps, 'average fps').toBeGreaterThan(0)
  expect(stats.drawCalls, 'draw calls').toBeGreaterThan(0)
  expect(stats.triangles, 'triangles').toBeGreaterThan(0)
  expect(stats.drawCalls, 'draw call budget').toBeLessThanOrEqual(budget.drawCalls)
  expect(stats.triangles, 'triangle budget').toBeLessThanOrEqual(budget.triangles)
  expect(sample.mean, 'frame is not black').toBeGreaterThan(MIN_BRIGHTNESS)
  expect(sample.max, 'frame is not a flat colour').toBeGreaterThan(sample.min)
})

/** @param {Array<Array<string|number>>} rows */
function printTable(rows) {
  const widths = rows[0].map((_, c) => Math.max(...rows.map((r) => String(r[c]).length)))
  const line = (r) => '| ' + r.map((v, c) => String(v).padEnd(widths[c])).join(' | ') + ' |'
  const sep = '|-' + widths.map((w) => '-'.repeat(w)).join('-|-') + '-|'
  console.log('\n' + line(rows[0]))
  console.log(sep)
  for (const r of rows.slice(1)) console.log(line(r))
}
