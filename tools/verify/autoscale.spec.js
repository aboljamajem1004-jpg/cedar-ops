import { test, expect } from '@playwright/test'

/**
 * The auto-scaler is exercised for real here rather than simulated: headless
 * SwiftShader runs far slower than the desktop p95 budget, so a page left alone
 * genuinely breaches it and genuinely steps down.
 */

test('steps the preset down on sustained bad frame time, and says so', async ({ page }) => {
  await page.goto('./?debug=1')
  await page.waitForFunction(() => window.__CEDAR_DEBUG__?.fps > 0, null, { timeout: 30_000 })

  expect(await page.evaluate(() => window.__CEDAR_DEBUG__.quality)).toBe('high')

  // grace (5s) + sustained breach (3s) before the first step is allowed.
  await page.waitForFunction(() => window.__CEDAR_DEBUG__.quality !== 'high', null, {
    timeout: 45_000,
  })

  const state = await page.evaluate(() => ({
    quality: window.__CEDAR_DEBUG__.quality,
    log: window.__CEDAR_DEBUG__.log,
  }))

  expect(['medium', 'low']).toContain(state.quality)

  // Every switch has to be visible, not silent.
  const downgrades = state.log.filter((line) => line.includes('auto:'))
  expect(downgrades.length).toBeGreaterThan(0)
  expect(downgrades[0]).toContain('->')
  expect(downgrades[0]).toContain('p95')

  await expect(page.locator('#debug-overlay')).toContainText('auto:')
})

test('a manual choice switches the scaler off and survives a reload', async ({ page }) => {
  await page.goto('./?debug=1')
  await page.waitForFunction(() => window.__CEDAR_READY__ === true, null, { timeout: 30_000 })

  // The cycle wraps, so from high the next preset is low. That also flips MSAA,
  // which a manual choice applies immediately by reloading.
  await page.keyboard.press('F4')
  await expect(page.locator('#debug-overlay')).toContainText('LOW')
  await expect(page.locator('#debug-overlay')).toContainText('auto-scaler off')
  expect(new URL(page.url()).searchParams.get('q')).toBe('low')

  // The override must stick without the URL pin, or the scaler would quietly
  // undo the player's choice on the next load.
  await page.goto('./?debug=1')
  await page.waitForFunction(() => window.__CEDAR_DEBUG__?.fps > 0, null, { timeout: 30_000 })

  expect(await page.evaluate(() => window.__CEDAR_DEBUG__.quality)).toBe('low')
  await expect(page.locator('#debug-overlay')).toContainText('auto-scaler off')

  // Well past the point the scaler would have acted.
  await page.waitForTimeout(12_000)
  const log = await page.evaluate(() => window.__CEDAR_DEBUG__.log)
  expect(log.filter((line) => line.includes('auto:'))).toEqual([])
  expect(await page.evaluate(() => window.__CEDAR_DEBUG__.quality)).toBe('low')
})
