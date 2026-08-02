import { test, expect } from '@playwright/test'
import { BTN, MOVEMENT } from '../../shared/constants.js'
import {
  createState,
  cloneState,
  computeMovement,
  applyCollision,
  jumpVelocity,
} from '../../shared/movement.js'

/**
 * shared/movement.js runs in plain Node here, with no browser and no physics
 * engine. That is the point of keeping it engine-free: the server will import
 * exactly this and must get exactly these numbers.
 */

/** Collision-free stand-in: everything the player asked for is allowed. */
function freeMove(state, desired, dt, grounded) {
  applyCollision(state, desired, grounded, dt)
}

const DT = 1 / 30

test('identical inputs from identical state produce identical output', () => {
  const script = [
    { buttons: BTN.FORWARD, yaw: 0 },
    { buttons: BTN.FORWARD | BTN.RIGHT, yaw: 0.4 },
    { buttons: BTN.FORWARD | BTN.SPRINT, yaw: 0.9 },
    { buttons: BTN.JUMP | BTN.FORWARD, yaw: 1.3 },
    { buttons: BTN.FORWARD, yaw: 1.3 },
    { buttons: 0, yaw: 1.3 },
    { buttons: BTN.BACK | BTN.CROUCH, yaw: -2.1 },
  ]

  /** @param {number} steps */
  function run(steps) {
    const state = createState(0, 0, 0)
    state.onGround = true
    for (let i = 0; i < steps; i++) {
      const input = script[i % script.length]
      const desired = computeMovement(state, input, DT)
      freeMove(state, desired, DT, state.pos.y + desired.y <= 0)
    }
    return state
  }

  const a = run(200)
  const b = run(200)

  // Bit-identical, not approximately equal. Prediction replays these hundreds
  // of times a second in phase 5; "close enough" accumulates into a visible
  // desync.
  expect(a).toEqual(b)
  expect(Number.isFinite(a.pos.x)).toBe(true)
  expect(Number.isFinite(a.pos.y)).toBe(true)
  expect(Number.isFinite(a.pos.z)).toBe(true)
})

test('replaying from a snapshot lands exactly where the original did', () => {
  const state = createState(0, 0, 0)
  state.onGround = true

  const inputs = Array.from({ length: 40 }, (_, i) => ({
    buttons: i % 7 === 0 ? BTN.FORWARD | BTN.JUMP : BTN.FORWARD | BTN.RIGHT,
    yaw: i * 0.05,
  }))

  // Run ten steps, snapshot, then finish.
  for (let i = 0; i < 10; i++) {
    freeMove(state, computeMovement(state, inputs[i], DT), DT, state.pos.y <= 0)
  }
  const snapshot = cloneState(state)
  for (let i = 10; i < inputs.length; i++) {
    freeMove(state, computeMovement(state, inputs[i], DT), DT, state.pos.y <= 0)
  }

  // Replay the same tail from the snapshot — this is exactly what
  // reconciliation does when a server correction arrives.
  const replayed = cloneState(snapshot)
  for (let i = 10; i < inputs.length; i++) {
    freeMove(replayed, computeMovement(replayed, inputs[i], DT), DT, replayed.pos.y <= 0)
  }

  expect(replayed).toEqual(state)
})

test('diagonal movement is not faster than straight', () => {
  /** @param {number} buttons */
  function topSpeed(buttons) {
    const state = createState(0, 0, 0)
    state.onGround = true
    for (let i = 0; i < 60; i++) {
      freeMove(state, computeMovement(state, { buttons, yaw: 0 }, DT), DT, true)
    }
    return Math.hypot(state.vel.x, state.vel.z)
  }

  const straight = topSpeed(BTN.FORWARD)
  const diagonal = topSpeed(BTN.FORWARD | BTN.RIGHT)

  expect(straight).toBeCloseTo(MOVEMENT.SPEED_WALK, 3)
  expect(diagonal).toBeCloseTo(straight, 3)
})

test('stopping is near instant, as the snappy tuning intends', () => {
  const state = createState(0, 0, 0)
  state.onGround = true
  for (let i = 0; i < 60; i++) {
    freeMove(state, computeMovement(state, { buttons: BTN.FORWARD, yaw: 0 }, DT), DT, true)
  }
  expect(Math.hypot(state.vel.x, state.vel.z)).toBeCloseTo(MOVEMENT.SPEED_WALK, 3)

  let steps = 0
  while (Math.hypot(state.vel.x, state.vel.z) > 0.01 && steps < 60) {
    freeMove(state, computeMovement(state, { buttons: 0, yaw: 0 }, DT), DT, true)
    steps++
  }

  // SPEED_WALK / FRICTION_GROUND seconds, in 33ms steps, plus one.
  const expected = Math.ceil(MOVEMENT.SPEED_WALK / MOVEMENT.FRICTION_GROUND / DT) + 1
  expect(steps).toBeLessThanOrEqual(expected)
})

test('jump take-off matches the tuned height', () => {
  // v = sqrt(2gh), so apex = v^2 / 2g should return JUMP_HEIGHT.
  const v = jumpVelocity()
  const apex = (v * v) / (2 * MOVEMENT.GRAVITY)
  expect(apex).toBeCloseTo(MOVEMENT.JUMP_HEIGHT, 6)
})

test('air control steers without granting full ground authority', () => {
  /** Build up forward speed, leave the ground, then try to turn. */
  function turnInAir() {
    const state = createState(0, 10, 0)
    state.onGround = true
    for (let i = 0; i < 60; i++) {
      freeMove(state, computeMovement(state, { buttons: BTN.FORWARD, yaw: 0 }, DT), DT, true)
    }
    state.onGround = false
    for (let i = 0; i < 30; i++) {
      freeMove(state, computeMovement(state, { buttons: BTN.RIGHT, yaw: 0 }, DT), DT, false)
    }
    return state
  }

  const state = turnInAir()

  // Some sideways authority...
  expect(Math.abs(state.vel.x)).toBeGreaterThan(0.5)
  // ...bounded by the air speed cap, or it would be flying.
  expect(Math.abs(state.vel.x)).toBeLessThanOrEqual(MOVEMENT.AIR_SPEED_CAP + 0.01)
  // Forward speed from before the jump is kept — air control steers, it does
  // not brake.
  expect(Math.abs(state.vel.z)).toBeCloseTo(MOVEMENT.SPEED_WALK, 3)
})
