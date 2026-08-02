import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { test, expect } from '@playwright/test'

const outDir = path.join(path.dirname(fileURLToPath(import.meta.url)), 'out')

/** Sampling window per configuration, per round. */
const SAMPLE_MS = 4000
/** Discarded settling time after each page load. */
const WARMUP_MS = 2500
/**
 * Rounds over the whole config list. One pass is not enough: the machine drifts
 * (other processes, thermal, GC), and whichever config runs first absorbs the
 * browser's cold-start cost. Round-robin plus median-of-medians cancels both.
 */
const ROUNDS = 3

/**
 * Each row changes exactly ONE thing from the baseline, so the cost of that one
 * thing is readable. The presets are measured too, but they move several
 * settings at once and cannot be used to attribute cost.
 */
const CONFIGS = [
  { name: 'baseline (pr 1.0, no msaa, no grid, no shadow)', q: 'low', params: 'pr=1&msaa=0&shadows=0&grid=0' },
  { name: '+ analytic grid', q: 'low', params: 'pr=1&msaa=0&shadows=0&grid=1' },
  { name: '+ MSAA', q: 'low', params: 'pr=1&msaa=1&shadows=0&grid=0' },
  { name: '+ pixelRatio 1.25', q: 'low', params: 'pr=1.25&msaa=0&shadows=0&grid=0' },
  { name: '+ shadows', q: 'low', params: 'pr=1&msaa=0&shadows=1&grid=0' },
  { name: 'preset LOW', q: 'low', params: '' },
  { name: 'preset MEDIUM', q: 'medium', params: '' },
  { name: 'preset HIGH', q: 'high', params: '' },
]

test('quality benchmark: cost of each setting in isolation', async ({ page }) => {
  /**
   * Load a config, let it settle, then sample.
   * @param {{name: string, q: string, params: string}} config
   */
  async function measure(config) {
    const query = `?q=${config.q}${config.params ? '&' + config.params : ''}`
    await page.goto(`./${query}`)
    await page.waitForFunction(() => window.__CEDAR_READY__ === true, null, { timeout: 30_000 })
    await page.waitForFunction(() => window.__CEDAR_DEBUG__.fps > 0, null, { timeout: 30_000 })

    // Shader compilation and JIT warmup dominate the opening frames under
    // software rendering. Sampling through them measures startup, not the
    // setting under test.
    await page.waitForTimeout(WARMUP_MS)

    await page.waitForTimeout(SAMPLE_MS)

    return page.evaluate(() => {
      const d = window.__CEDAR_DEBUG__
      const t = d.frameTimes()
      return { median: t.median, p95: t.p95, samples: t.samples, fps: d.fps, draws: d.drawCalls }
    })
  }

  // Thrown away. The first load of the session pays for browser and rasteriser
  // warmup, and that cost must not land on whichever config happens to be first.
  await measure(CONFIGS[0])

  /** @type {Map<string, Array<any>>} */
  const rounds = new Map(CONFIGS.map((c) => [c.name, []]))
  for (let round = 0; round < ROUNDS; round++) {
    for (const config of CONFIGS) {
      rounds.get(config.name).push(await measure(config))
    }
  }

  const results = CONFIGS.map((config) => {
    const runs = rounds.get(config.name)
    return {
      name: config.name,
      median: median(runs.map((r) => r.median)),
      p95: median(runs.map((r) => r.p95)),
      spread: Math.max(...runs.map((r) => r.median)) - Math.min(...runs.map((r) => r.median)),
      samples: runs.reduce((sum, r) => sum + r.samples, 0),
      fps: median(runs.map((r) => r.fps)),
      draws: runs[0].draws,
    }
  })

  const baseline = results[0].median
  const rows = [['Configuration', 'median ms', 'p95 ms', 'spread', 'vs baseline', 'draws']]
  for (const r of results) {
    const delta = r.median - baseline
    const pct = baseline > 0 ? (delta / baseline) * 100 : 0
    // A difference smaller than the run-to-run spread is not a measurement.
    const noisy = Math.abs(delta) < Math.max(r.spread, results[0].spread)
    rows.push([
      r.name,
      r.median.toFixed(2),
      r.p95.toFixed(2),
      `±${r.spread.toFixed(2)}`,
      r === results[0]
        ? '—'
        : noisy
          ? 'below noise floor'
          : `${delta >= 0 ? '+' : ''}${delta.toFixed(2)} ms (${pct >= 0 ? '+' : ''}${pct.toFixed(0)}%)`,
      String(r.draws),
    ])
  }

  printTable(rows)
  console.log(
    '\nSOFTWARE RENDERING (SwiftShader). These are relative costs on a CPU\n' +
      'rasteriser, not GPU numbers. MSAA and pixel ratio are fill-rate bound and\n' +
      'behave broadly similarly on a real GPU; shader cost does not. Treat the\n' +
      'ORDER as a signal and the magnitudes as unreliable. Real numbers come\n' +
      'from the phone, using F4 to switch presets.\n'
  )

  fs.mkdirSync(outDir, { recursive: true })
  fs.writeFileSync(
    path.join(outDir, 'bench.json'),
    JSON.stringify(
      { sampleMs: SAMPLE_MS, warmupMs: WARMUP_MS, rounds: ROUNDS, renderer: 'swiftshader', results },
      null,
      2
    )
  )

  // The benchmark's job is to produce numbers; it only fails if a config is
  // outright broken.
  for (const r of results) {
    expect(r.samples, `${r.name} produced frames`).toBeGreaterThan(10)
    expect(r.median, `${r.name} frame time`).toBeGreaterThan(0)
  }
})

/** @param {number[]} values */
function median(values) {
  const sorted = [...values].sort((a, b) => a - b)
  return sorted[Math.floor(sorted.length / 2)]
}

/** @param {Array<Array<string>>} rows */
function printTable(rows) {
  const widths = rows[0].map((_, c) => Math.max(...rows.map((r) => String(r[c]).length)))
  const line = (r) => '| ' + r.map((v, c) => String(v).padEnd(widths[c])).join(' | ') + ' |'
  const sep = '|-' + widths.map((w) => '-'.repeat(w)).join('-|-') + '-|'
  console.log('\n' + line(rows[0]))
  console.log(sep)
  for (const r of rows.slice(1)) console.log(line(r))
}
