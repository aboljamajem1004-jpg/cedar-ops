import { test, expect } from '@playwright/test'
import * as THREE from 'three'
import { BTN } from '../../shared/constants.js'
import { createState, computeMovement } from '../../shared/movement.js'

/**
 * Regression: WASD directions inverted depending on facing.
 *
 * The wish vector was rotated by -yaw instead of +yaw, which agrees with the
 * camera at 0 and 180 degrees and inverts completely at +-90. Checking only the
 * cardinal directions would have missed it, so this sweeps the full circle.
 *
 * The expected directions come from an actual THREE.PerspectiveCamera rather
 * than from repeating the rotation maths here. Re-deriving it would make the
 * test agree with whatever movement.js does, including being wrong.
 */

const DT = 1 / 30
const YAW_STEP_DEG = 15

/** Every 15 degrees, all the way round, plus some negative angles. */
const YAWS = [
  ...Array.from({ length: 360 / YAW_STEP_DEG + 1 }, (_, i) => (i * YAW_STEP_DEG * Math.PI) / 180),
  -Math.PI / 2,
  -Math.PI / 4,
  -2.7,
]

/**
 * Ground truth: where the camera actually points at this yaw.
 * @param {number} yaw
 */
function cameraBasis(yaw) {
  const camera = new THREE.PerspectiveCamera()
  camera.rotation.order = 'YXZ'
  camera.rotation.set(0, yaw, 0)
  camera.updateMatrixWorld(true)

  const forward = new THREE.Vector3()
  camera.getWorldDirection(forward)
  const right = new THREE.Vector3(1, 0, 0).applyQuaternion(camera.quaternion)

  return { forward, right }
}

/**
 * Normalised horizontal direction the player actually moves for one step from
 * rest.
 *
 * @param {number} buttons
 * @param {number} yaw
 * @param {boolean} airborne
 */
function moveDirection(buttons, yaw, airborne) {
  const state = createState(0, 0, 0)
  state.onGround = !airborne

  const translation = computeMovement(state, { buttons, yaw }, DT)
  const length = Math.hypot(translation.x, translation.z)

  expect(length, 'the player should actually move').toBeGreaterThan(1e-9)
  return { x: translation.x / length, z: translation.z / length }
}

/**
 * @param {THREE.Vector3} forward @param {THREE.Vector3} right
 * @param {number} f how much forward @param {number} r how much right
 */
function expected(forward, right, f, r) {
  const x = forward.x * f + right.x * r
  const z = forward.z * f + right.z * r
  const length = Math.hypot(x, z)
  return { x: x / length, z: z / length }
}

const CASES = [
  { name: 'W  forward', buttons: BTN.FORWARD, f: 1, r: 0 },
  { name: 'S  back', buttons: BTN.BACK, f: -1, r: 0 },
  { name: 'A  left', buttons: BTN.LEFT, f: 0, r: -1 },
  { name: 'D  right', buttons: BTN.RIGHT, f: 0, r: 1 },
  { name: 'WD forward-right', buttons: BTN.FORWARD | BTN.RIGHT, f: 1, r: 1 },
  { name: 'WA forward-left', buttons: BTN.FORWARD | BTN.LEFT, f: 1, r: -1 },
  { name: 'SD back-right', buttons: BTN.BACK | BTN.RIGHT, f: -1, r: 1 },
  { name: 'SA back-left', buttons: BTN.BACK | BTN.LEFT, f: -1, r: -1 },
]

for (const airborne of [false, true]) {
  const where = airborne ? 'airborne' : 'grounded'

  test(`movement follows the camera at every yaw (${where})`, () => {
    /** @type {string[]} */
    const failures = []

    for (const yaw of YAWS) {
      const { forward, right } = cameraBasis(yaw)

      for (const testCase of CASES) {
        const actual = moveDirection(testCase.buttons, yaw, airborne)
        const want = expected(forward, right, testCase.f, testCase.r)

        // Dot product of two unit vectors: 1 means identical, -1 inverted.
        const dot = actual.x * want.x + actual.z * want.z
        if (Math.abs(dot - 1) > 1e-9) {
          const degrees = Math.round((yaw * 180) / Math.PI)
          failures.push(
            `yaw ${degrees}deg ${testCase.name}: expected (${want.x.toFixed(3)}, ${want.z.toFixed(3)}) ` +
              `got (${actual.x.toFixed(3)}, ${actual.z.toFixed(3)}) dot=${dot.toFixed(3)}`
          )
        }
      }
    }

    // Reported together so a systematic error shows its shape rather than
    // stopping at whichever angle happens to be checked first.
    expect(failures, failures.slice(0, 12).join('\n')).toEqual([])
  })
}

test('turning does not change how fast you move', () => {
  const speeds = YAWS.map((yaw) => {
    const state = createState(0, 0, 0)
    state.onGround = true
    for (let i = 0; i < 60; i++) {
      const translation = computeMovement(state, { buttons: BTN.FORWARD, yaw }, DT)
      state.pos.x += translation.x
      state.pos.z += translation.z
    }
    return Math.hypot(state.vel.x, state.vel.z)
  })

  for (const speed of speeds) expect(speed).toBeCloseTo(speeds[0], 9)
})
