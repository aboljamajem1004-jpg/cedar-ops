import { test, expect } from '@playwright/test'

/**
 * Movement against real collision geometry, driven with real key events.
 *
 * These assert on STATE, never on distance covered in a given wall-clock time.
 * Simulated time legitimately lags real time when frames are slow — the loop
 * clamps a long frame rather than taking one enormous physics step — so
 * "should have travelled N metres by now" is not a sound assertion under a
 * software rasteriser. Waiting for a condition is.
 *
 * Pointer lock cannot be granted programmatically, so yaw stays at 0 and the
 * blockout is laid out ahead of spawn along -Z to suit.
 */

/** @param {import('@playwright/test').Page} page */
async function boot(page, query = '') {
  await page.goto(`./?debug=1${query}`)
  await page.waitForFunction(() => window.__CEDAR_DEBUG__?.player !== undefined, null, {
    timeout: 30_000,
  })
  await page.waitForFunction(() => window.__CEDAR_DEBUG__.player.onGround === true, null, {
    timeout: 15_000,
  })
}

/** @param {import('@playwright/test').Page} page */
function playerState(page) {
  return page.evaluate(() => window.__CEDAR_DEBUG__.player)
}

/**
 * Wait for a predicate over the player state.
 * @param {import('@playwright/test').Page} page
 * @param {string} expression body of a function taking `p`
 */
function until(page, expression, timeout = 25_000) {
  return page.waitForFunction(
    (expr) => {
      const p = window.__CEDAR_DEBUG__.player
      // eslint-disable-next-line no-new-func
      return new Function('p', `return (${expr})`)(p)
    },
    expression,
    { timeout }
  )
}

/** @param {import('@playwright/test').Page} page @param {string[]} keys */
async function down(page, keys) {
  for (const key of keys) await page.keyboard.down(key)
}

/** @param {import('@playwright/test').Page} page @param {string[]} keys */
async function up(page, keys) {
  for (const key of keys) await page.keyboard.up(key)
}

test('spawns on the ground and stays there', async ({ page }) => {
  await boot(page)
  const start = await playerState(page)

  await page.waitForTimeout(3000)
  const after = await playerState(page)

  expect(after.onGround).toBe(true)
  // Not sinking through the floor, not drifting on its own.
  expect(Math.abs(after.y - start.y)).toBeLessThan(0.05)
  expect(Math.abs(after.x - start.x)).toBeLessThan(0.05)
  expect(Math.abs(after.z - start.z)).toBeLessThan(0.05)
})

test('walks forward at the tuned speed and stops sharply when released', async ({ page }) => {
  await boot(page)

  await down(page, ['KeyW'])
  await until(page, 'p.speed > 6.4')
  const moving = await playerState(page)
  // Top speed is SPEED_WALK, not more — this is what makes the constant honest.
  expect(moving.speed).toBeLessThan(6.7)

  await up(page, ['KeyW'])
  await until(page, 'p.speed < 0.1', 3000)
})

test('sprinting the length of the corridor does not pass through the end wall', async ({ page }) => {
  await boot(page)

  await down(page, ['KeyW', 'ShiftLeft'])
  // Deep inside the corridor, past the stairs.
  await until(page, 'p.z < -35', 40_000)

  // Keep pushing into the wall for a while.
  await page.waitForTimeout(2500)
  const state = await playerState(page)
  await up(page, ['KeyW', 'ShiftLeft'])

  // The wall face is at z = -40.75 and the capsule radius is 0.35.
  expect(state.z).toBeGreaterThan(-40.75)
  expect(state.speed).toBeLessThan(1)
})

test('walks up stairs without jumping', async ({ page }) => {
  await boot(page)

  await down(page, ['KeyW'])
  // Five risers of 0.34. Reaching 1.0 while still grounded means it walked up
  // rather than bounced up, which is the whole claim — so this wait IS the
  // assertion. Re-reading after releasing would be a race: the player keeps
  // walking during the round trip, off the top step and back down to y = 0.
  await until(page, 'p.y > 1.0 && p.onGround', 45_000)
  await up(page, ['KeyW'])
})

test('a ledge taller than the step height is not walked over', async ({ page }) => {
  await boot(page)

  await down(page, ['KeyA'])
  await until(page, 'p.x < -8')
  await up(page, ['KeyA'])

  const before = await playerState(page)
  await down(page, ['KeyW'])
  await page.waitForTimeout(2500)
  const after = await playerState(page)
  await up(page, ['KeyW'])

  // Blocked by the 0.63 m ledge rather than stepping onto it.
  expect(after.y).toBeLessThan(before.y + 0.4)
})

test('a slope under the limit is walked up', async ({ page }) => {
  // Spawned beside the 22 degree ramp rather than walking 20 m to reach it.
  // Under load the simulation runs far behind wall-clock, so a long approach
  // can eat the entire timeout before the behaviour under test even starts.
  await boot(page, '&tune=1&spawn=9,1,-4')

  // Grounded at 1.5 m up the ramp means it was walked, not fallen onto. The
  // wait is the assertion — the far end drops off, so re-reading afterwards
  // would be a race.
  await down(page, ['KeyW'])
  await until(page, 'p.y > 1.5 && p.onGround', 45_000)
  await up(page, ['KeyW'])
})

test('a slope over the limit is not climbed', async ({ page }) => {
  // Spawned beside the 65 degree ramp, well above SLOPE_LIMIT_DEG.
  await boot(page, '&tune=1&spawn=17,1,-6')

  const before = await playerState(page)
  await down(page, ['KeyW'])
  await page.waitForTimeout(3000)
  const after = await playerState(page)
  await up(page, ['KeyW'])

  // Pushed against it, not walked up it.
  expect(after.y).toBeLessThan(before.y + 0.6)
})

test('jumping leaves the ground and lands again', async ({ page }) => {
  await boot(page)
  const start = await playerState(page)

  await down(page, ['Space'])
  await until(page, 'p.onGround === false', 5000)
  const airborne = await playerState(page)
  await up(page, ['Space'])

  expect(airborne.y).toBeGreaterThan(start.y + 0.1)

  await until(page, 'p.onGround === true', 8000)
  const landed = await playerState(page)
  expect(landed.y).toBeCloseTo(start.y, 1)
})

test('crouch-walk works on C, without ever needing Ctrl+W', async ({ page }) => {
  await boot(page)

  // C is the primary crouch binding precisely so this combination exists:
  // crouch on Ctrl made crouch-walk Ctrl+W, which closes the browser tab and
  // cannot be intercepted by the page.
  await down(page, ['KeyC'])
  await until(page, 'p.crouching === true', 5000)

  await down(page, ['KeyW'])
  await until(page, 'p.speed > 1')
  await page.waitForTimeout(600)

  const crouched = await playerState(page)
  await up(page, ['KeyW', 'KeyC'])

  expect(crouched.crouching, 'still crouching while walking').toBe(true)
  // The player must MOVE, not stop: SPEED_CROUCH is 3.2, walking is 6.5.
  expect(crouched.speed, 'crouch-walk moves').toBeGreaterThan(1.5)
  expect(crouched.speed, 'at crouch speed, not walk speed').toBeLessThan(3.6)

  // And it stands back up when released.
  await until(page, 'p.crouching === false', 5000)
})

test('Ctrl still crouches, as the secondary binding', async ({ page }) => {
  await boot(page)

  await down(page, ['ControlLeft'])
  await until(page, 'p.crouching === true', 5000)
  const state = await playerState(page)
  await up(page, ['ControlLeft'])

  expect(state.crouching).toBe(true)
})

test('URL tuning overrides apply without a rebuild', async ({ page }) => {
  await boot(page, '&tune=1&SPEED_WALK=2')

  await down(page, ['KeyW'])
  await until(page, 'p.speed > 1.4')
  await page.waitForTimeout(500)
  const state = await playerState(page)
  await up(page, ['KeyW'])

  // Would top out at 6.5 with the default tuning.
  expect(state.speed).toBeLessThan(2.3)
})
