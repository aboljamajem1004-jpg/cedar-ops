import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { test, expect } from '@playwright/test'

const outDir = path.join(path.dirname(fileURLToPath(import.meta.url)), 'out')

/**
 * Phase 2 stress test (CLAUDE.md §5.1).
 *
 * Headless numbers are a smoke test only — SwiftShader is a CPU rasteriser and
 * cannot tell you what a Mali GPU will do. What IS meaningful here: draw calls,
 * triangles and texture memory, which are exact regardless of the renderer.
 *
 * The frame-time figures that matter come from the device, after five minutes,
 * at normal screen brightness.
 */
const WARMUP_MS = 4000
const SAMPLE_MS = 6000

test('8 characters: budget metrics', async ({ page }) => {
  /** @type {string[]} */ const errors = []
  page.on('console', (m) => {
    if (m.type() === 'error') errors.push(m.text())
  })
  page.on('pageerror', (e) => errors.push(e.message))

  await page.goto('./?debug=1&stress=8&q=high')
  await page.waitForFunction(() => window.__CEDAR_DEBUG__?.textureBytes > 0, null, {
    timeout: 90_000,
  })
  await page.waitForFunction(() => window.__CEDAR_DEBUG__.fps > 0, null, { timeout: 60_000 })

  await page.waitForTimeout(WARMUP_MS)
  await page.waitForTimeout(SAMPLE_MS)

  const stats = await page.evaluate(() => {
    const d = window.__CEDAR_DEBUG__
    const t = d.frameTimes()
    return {
      drawCalls: d.drawCalls,
      triangles: d.triangles,
      geometries: d.geometries,
      textures: d.textures,
      textureBytes: d.textureBytes,
      textureCount: d.textureCount,
      breakdown: d.textureBreakdown ?? [],
      median: t.median,
      p95: t.p95,
      fps: d.fps,
      quality: d.quality,
    }
  })

  fs.mkdirSync(outDir, { recursive: true })
  await page.screenshot({ path: path.join(outDir, 'stress8.png') })
  fs.writeFileSync(path.join(outDir, 'stress8.json'), JSON.stringify(stats, null, 2))

  const mb = (b) => `${(b / 1048576).toFixed(1)} MB`
  const rows = [
    ['Metric', 'Value', 'Budget (mobile)', 'Meaningful headless?'],
    ['Draw calls', stats.drawCalls, '150', 'YES — exact'],
    ['Triangles', stats.triangles, '400,000', 'YES — exact'],
    ['Texture memory', mb(stats.textureBytes), '200 MB', 'YES — exact'],
    ['Texture count', stats.textureCount, '-', 'YES'],
    ['Geometries', stats.geometries, '-', 'YES'],
    ['Frame p50', `${stats.median.toFixed(1)} ms`, '33.3 ms', 'NO — SwiftShader'],
    ['Frame p95', `${stats.p95.toFixed(1)} ms`, '33.3 ms', 'NO — SwiftShader'],
    ['Console errors', errors.length, '0', 'YES'],
  ]

  const widths = rows[0].map((_, c) => Math.max(...rows.map((r) => String(r[c]).length)))
  const line = (r) => '| ' + r.map((v, c) => String(v).padEnd(widths[c])).join(' | ') + ' |'
  console.log('\n' + line(rows[0]))
  console.log('|-' + widths.map((w) => '-'.repeat(w)).join('-|-') + '-|')
  for (const r of rows.slice(1)) console.log(line(r))
  console.log('\nTexture memory breakdown:')
  for (const entry of stats.breakdown.slice(0, 8)) {
    console.log(`  ${mb(entry.bytes).padStart(8)}  ${entry.name}  (${entry.detail})`)
  }

  console.log(
    `\nDraw calls, triangles and texture memory are exact and platform-independent.\n` +
      `Frame times here are software rendering — the real numbers come from the\n` +
      `phone, after five minutes, at normal screen brightness.\n` +
      `Screenshot: ${path.join(outDir, 'stress8.png')}\n`
  )

  expect(errors, 'console/page errors').toEqual([])
  expect(stats.textureBytes, 'textures actually loaded').toBeGreaterThan(0)
  expect(stats.drawCalls, 'draw call budget (mobile)').toBeLessThanOrEqual(150)
  expect(stats.triangles, 'triangle budget (mobile)').toBeLessThanOrEqual(400_000)
  expect(stats.textureBytes, 'texture memory budget (mobile)').toBeLessThanOrEqual(
    200 * 1048576
  )
})
