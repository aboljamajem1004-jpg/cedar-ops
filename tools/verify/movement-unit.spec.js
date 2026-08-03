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
  applyCollision(state, desired, desired, grounded, dt)
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

test('changing direction sheds the old velocity', () => {
  // Strafe right to full speed, then release and hold forward instead. The old
  // sideways velocity must decay, and total ground speed must never exceed the
  // tuned maximum.
  const state = createState(0, 0, 0)
  state.onGround = true

  for (let i = 0; i < 60; i++) {
    freeMove(state, computeMovement(state, { buttons: BTN.RIGHT, yaw: 0 }, DT), DT, true)
  }
  expect(Math.abs(state.vel.x)).toBeCloseTo(MOVEMENT.SPEED_WALK, 3)

  let peak = 0
  for (let i = 0; i < 60; i++) {
    freeMove(state, computeMovement(state, { buttons: BTN.FORWARD, yaw: 0 }, DT), DT, true)
    peak = Math.max(peak, Math.hypot(state.vel.x, state.vel.z))
  }

  // Without friction while input is held, the sideways velocity is never shed
  // and the player slides diagonally at SPEED_WALK * sqrt(2) forever.
  expect(peak).toBeLessThanOrEqual(MOVEMENT.SPEED_WALK * 1.02)
  expect(Math.abs(state.vel.x)).toBeLessThan(0.1)
  expect(Math.abs(state.vel.z)).toBeCloseTo(MOVEMENT.SPEED_WALK, 2)
})

test('climbing a step keeps momentum instead of losing it', () => {
  // Regression: the character controller spends part of the requested
  // horizontal motion lifting the capsule onto a stair. Rewriting velocity from
  // that reduced value treats lost distance as lost speed, and the player
  // snags on every step — measured at 6.5 m/s collapsing to about 2.
  const state = createState(0, 0, 0)
  state.onGround = true

  for (let i = 0; i < 60; i++) {
    freeMove(state, computeMovement(state, { buttons: BTN.FORWARD, yaw: 0 }, DT), DT, true)
  }
  const cruising = Math.hypot(state.vel.x, state.vel.z)
  expect(cruising).toBeCloseTo(MOVEMENT.SPEED_WALK, 3)

  // One step where the controller allowed only 60% of the horizontal request
  // and lifted the capsule 5 cm — exactly what the trace recorded on a stair.
  const desired = computeMovement(state, { buttons: BTN.FORWARD, yaw: 0 }, DT)
  const corrected = { x: desired.x * 0.6, y: 0.05, z: desired.z * 0.6 }
  applyCollision(state, desired, corrected, true, DT)

  expect(state.climbed, 'recognised as a climb').toBe(true)
  expect(Math.hypot(state.vel.x, state.vel.z), 'speed survives the step').toBeCloseTo(
    cruising,
    3
  )
})

test('being blocked by a wall still removes velocity', () => {
  // The counterpart: a genuine block must NOT keep momentum, or the player
  // would accumulate speed into a wall.
  const state = createState(0, 0, 0)
  state.onGround = true

  for (let i = 0; i < 60; i++) {
    freeMove(state, computeMovement(state, { buttons: BTN.FORWARD, yaw: 0 }, DT), DT, true)
  }

  const desired = computeMovement(state, { buttons: BTN.FORWARD, yaw: 0 }, DT)
  // Blocked flat. corrected.y is about zero rather than equal to desired.y,
  // because the ground stops the downward stick — which is exactly what every
  // grounded step looks like, and what a naive "rose more than requested" test
  // would misread as a climb.
  applyCollision(state, desired, { x: 0, y: 0.0002, z: 0 }, true, DT)

  expect(state.climbed, 'flat ground is not a climb').toBe(false)
  expect(Math.hypot(state.vel.x, state.vel.z)).toBeLessThan(0.01)
})

test('walking on flat ground is never mistaken for a climb', () => {
  // The bug this guards: while grounded, desired.y is the negative ground stick
  // and corrected.y is about zero, so corrected.y > desired.y holds on EVERY
  // step. Classifying those as climbs means a wall never removes velocity.
  const state = createState(0, 0, 0)
  state.onGround = true

  for (let i = 0; i < 40; i++) {
    const desired = computeMovement(state, { buttons: BTN.FORWARD, yaw: 0 }, DT)
    applyCollision(state, desired, { x: desired.x, y: 0.0002, z: desired.z }, true, DT)
    expect(state.climbed, `tick ${i} on flat ground`).toBe(false)
  }
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
