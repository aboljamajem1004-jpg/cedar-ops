import { test, expect } from '@playwright/test'

/**
 * Held keys must never survive an event that stops keyup from arriving.
 *
 * The browser delivers keydown, then stops delivering anything once the window
 * loses focus — so a key held at that moment stays held from our side forever.
 * In a match that means alt-tabbing while sprinting and returning to a player
 * running into a wall with no way to stop.
 */

/** @param {import('@playwright/test').Page} page */
async function boot(page) {
  await page.goto('./?debug=1')
  await page.waitForFunction(() => window.__CEDAR_DEBUG__?.player !== undefined, null, {
    timeout: 60_000,
  })
  await page.waitForFunction(() => window.__CEDAR_DEBUG__.player.onGround === true, null, {
    timeout: 30_000,
  })
}

const buttons = (page) => page.evaluate(() => window.__CEDAR_DEBUG__.player.buttons)

test('losing window focus releases held keys', async ({ page }) => {
  await boot(page)

  await page.keyboard.down('KeyW')
  await page.keyboard.down('ShiftLeft')
  await expect.poll(() => buttons(page)).toBeGreaterThan(0)

  await page.evaluate(() => window.dispatchEvent(new Event('blur')))

  await expect.poll(() => buttons(page), { timeout: 5000 }).toBe(0)
  await page.keyboard.up('KeyW')
  await page.keyboard.up('ShiftLeft')
})

test('hiding the tab releases held keys', async ({ page }) => {
  await boot(page)

  await page.keyboard.down('KeyW')
  await expect.poll(() => buttons(page)).toBeGreaterThan(0)

  // visibilitychange cannot be faked by dispatching alone — the handler reads
  // document.hidden, so that has to report true as well.
  await page.evaluate(() => {
    Object.defineProperty(document, 'hidden', { configurable: true, get: () => true })
    document.dispatchEvent(new Event('visibilitychange'))
  })

  await expect.poll(() => buttons(page), { timeout: 5000 }).toBe(0)
  await page.keyboard.up('KeyW')
})

test('leaving pointer lock releases held keys', async ({ page }) => {
  await boot(page)

  await page.keyboard.down('KeyD')
  await expect.poll(() => buttons(page)).toBeGreaterThan(0)

  await page.evaluate(() => document.dispatchEvent(new Event('pointerlockchange')))

  await expect.poll(() => buttons(page), { timeout: 5000 }).toBe(0)
  await page.keyboard.up('KeyD')
})

test('a released key stops the player moving', async ({ page }) => {
  await boot(page)

  // The end-to-end version of the same guarantee: strafe, release, walk
  // forward, and confirm the player is not still drifting sideways.
  await page.keyboard.down('KeyD')
  await page.waitForFunction(() => window.__CEDAR_DEBUG__.player.speed > 3, null, {
    timeout: 30_000,
  })
  await page.keyboard.up('KeyD')

  await page.keyboard.down('KeyW')
  await page.waitForTimeout(1500)
  const state = await page.evaluate(() => window.__CEDAR_DEBUG__.player)
  await page.keyboard.up('KeyW')

  // Ground speed must never exceed the tuned maximum. Diagonal drift would show
  // up here as SPEED_WALK * sqrt(2).
  expect(state.speed).toBeLessThan(6.7)
})
