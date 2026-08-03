import { BTN, MOVEMENT } from './constants.js'

/**
 * THE movement function. Imported by both the client (prediction) and the
 * server (authority). See CLAUDE.md §3 — never duplicate this logic.
 *
 * It is deliberately free of Three.js, Rapier, the DOM and any clock. It takes
 * a state and an input and produces a desired translation; the caller runs the
 * collision query and feeds the result back through applyCollision(). That
 * split is what lets the same code run in a browser and in Node.
 *
 * Determinism note: this uses Math.sin/cos, which the spec does not require to
 * be bit-identical across engines. Client and server both run V8, so results
 * match. If a non-V8 server ever appears, yaw handling has to be revisited.
 */

/**
 * @typedef {{ x: number, y: number, z: number }} Vec3
 * @typedef {{ pos: Vec3, vel: Vec3, onGround: boolean, crouching: boolean }} MoveState
 * @typedef {{ buttons: number, yaw: number }} MoveInput
 */

/**
 * Fresh player state. `pos` is the FEET, not the capsule centre — spawn points
 * and ground checks are easier to reason about that way.
 *
 * @param {number} x @param {number} y @param {number} z
 * @returns {MoveState}
 */
export function createState(x = 0, y = 0, z = 0) {
  return {
    pos: { x, y, z },
    vel: { x: 0, y: 0, z: 0 },
    onGround: false,
    crouching: false,
    /** True on a step this frame the controller lifted the capsule up a step. */
    climbed: false,
  }
}

/** @param {MoveState} state @returns {MoveState} */
export function cloneState(state) {
  return {
    pos: { ...state.pos },
    vel: { ...state.vel },
    onGround: state.onGround,
    crouching: state.crouching,
    climbed: state.climbed,
  }
}

/**
 * @param {MoveState} target
 * @param {MoveState} source
 */
export function copyState(target, source) {
  target.pos.x = source.pos.x
  target.pos.y = source.pos.y
  target.pos.z = source.pos.z
  target.vel.x = source.vel.x
  target.vel.y = source.vel.y
  target.vel.z = source.vel.z
  target.onGround = source.onGround
  target.crouching = source.crouching
  target.climbed = source.climbed
}

/** Take-off speed for the configured jump height: v = sqrt(2gh). */
export function jumpVelocity(t = MOVEMENT) {
  return Math.sqrt(2 * t.GRAVITY * t.JUMP_HEIGHT)
}

/**
 * Advance velocity by one step and return the translation to attempt.
 *
 * The caller must run this through a collision query and then call
 * applyCollision() with the result.
 *
 * @param {MoveState} state mutated in place
 * @param {MoveInput} input
 * @param {number} dt seconds
 * @param {typeof MOVEMENT} t tuning
 * @returns {Vec3} desired translation for this step
 */
export function computeMovement(state, input, dt, t = MOVEMENT) {
  const { buttons, yaw } = input

  state.crouching = (buttons & BTN.CROUCH) !== 0

  // Wish direction in world space. Forward is -Z at yaw 0, matching the camera.
  let wishX = 0
  let wishZ = 0
  if (buttons & BTN.FORWARD) wishZ -= 1
  if (buttons & BTN.BACK) wishZ += 1
  if (buttons & BTN.LEFT) wishX -= 1
  if (buttons & BTN.RIGHT) wishX += 1

  // Rotate the wish vector into the camera's yaw frame.
  //
  // The camera looks down its local -Z, so at rotation.y = yaw its forward is
  // (-sin, 0, -cos) and its right is (cos, 0, -sin). These two lines must be
  // the rotation that maps local axes onto those; the mirrored version (sin
  // terms negated) is a rotation by -yaw, which agrees at 0 and 180 degrees
  // and inverts completely at +-90.
  const sin = Math.sin(yaw)
  const cos = Math.cos(yaw)
  let dirX = wishX * cos + wishZ * sin
  let dirZ = -wishX * sin + wishZ * cos

  const wishLength = Math.sqrt(dirX * dirX + dirZ * dirZ)
  const hasInput = wishLength > 0
  if (hasInput) {
    // Normalising is what stops diagonal input being faster than straight.
    dirX /= wishLength
    dirZ /= wishLength
  }

  const maxSpeed = state.crouching
    ? t.SPEED_CROUCH
    : buttons & BTN.SPRINT
      ? t.SPEED_SPRINT
      : t.SPEED_WALK

  if (state.onGround) {
    // Friction applies on EVERY grounded step, not only when input is absent.
    //
    // Friction is what sheds velocity in a direction you are no longer asking
    // for. Skipping it while a key is held means strafing right and then
    // pressing forward keeps the whole sideways velocity, and the player slides
    // diagonally at SPEED_WALK * sqrt(2) indefinitely.
    //
    // This does NOT cost top speed. accelerate() tops up to exactly maxSpeed
    // along the wish direction, and it can always cover what friction removed
    // because ACCEL_GROUND (90) exceeds FRICTION_GROUND (70). Steady state is
    // exactly SPEED_WALK.
    applyFriction(state.vel, t.FRICTION_GROUND, dt)
    accelerate(state.vel, dirX, dirZ, maxSpeed, t.ACCEL_GROUND, dt)

    if (buttons & BTN.JUMP) {
      state.vel.y = jumpVelocity(t)
      state.onGround = false
    } else {
      // A small downward bias keeps the capsule pinned to slopes and stairs
      // instead of skipping off every lip.
      state.vel.y = -t.GROUND_STICK
    }
  } else {
    // Without a cap, the directional accelerate below eventually reaches full
    // ground speed sideways given enough airtime — that is flying, not
    // steering. Capping the wish speed is what limits air control to a nudge
    // while still preserving whatever speed the jump started with.
    const airSpeed = Math.min(maxSpeed, t.AIR_SPEED_CAP)
    accelerate(state.vel, dirX, dirZ, airSpeed, t.ACCEL_AIR * t.AIR_CONTROL, dt)
    state.vel.y -= t.GRAVITY * dt
    if (state.vel.y < -t.MAX_FALL_SPEED) state.vel.y = -t.MAX_FALL_SPEED
  }

  return { x: state.vel.x * dt, y: state.vel.y * dt, z: state.vel.z * dt }
}

/**
 * Upward movement that counts as climbing a step, in metres.
 *
 * The test is "did the capsule actually rise", not "did it rise more than
 * requested". While grounded the requested vertical motion is always negative
 * (the ground stick) and the allowed motion is about zero, so comparing the two
 * classifies every flat-ground step as a climb. 1 cm clears the millimetre of
 * noise the controller returns on level ground and is far below any real step.
 */
const STEP_LIFT_EPSILON = 0.01

/**
 * Reconcile velocity with what the collision query actually allowed.
 *
 * Deriving velocity from the corrected translation handles walls, ceilings and
 * landings in one rule, and preserves the slide along a wall that the character
 * controller already computed.
 *
 * Climbing a step is the exception. When the controller lifts the capsule onto
 * a stair it spends part of the requested horizontal motion doing so, and
 * rewriting velocity from that reduced number treats lost DISTANCE as lost
 * SPEED. The result is a hard slowdown on every step — measured at 6.5 m/s
 * dropping to about 2 — followed by a re-acceleration, which reads as snagging.
 * Momentum is preserved through a climb instead.
 *
 * @param {MoveState} state mutated in place
 * @param {Vec3} desired what was requested this step
 * @param {Vec3} corrected movement the collision query permitted
 * @param {boolean} grounded
 * @param {number} dt seconds
 */
export function applyCollision(state, desired, corrected, grounded, dt) {
  state.pos.x += corrected.x
  state.pos.y += corrected.y
  state.pos.z += corrected.z

  // Rose while asking to go down or stay level: the controller stepped us up.
  const climbed = desired.y <= 0 && corrected.y > STEP_LIFT_EPSILON

  if (dt > 0) {
    if (!climbed) {
      state.vel.x = corrected.x / dt
      state.vel.z = corrected.z / dt
    }
    // On the ground the downward stick velocity is spent, not carried.
    state.vel.y = grounded ? 0 : corrected.y / dt
  }

  state.onGround = grounded
  state.climbed = climbed
}

/**
 * Quake-style directional acceleration: only ever adds speed along the wish
 * direction, and never past maxSpeed. Steering therefore costs nothing at low
 * speed and is naturally limited at high speed — which is what makes partial
 * air control feel like steering rather than flying.
 *
 * @param {Vec3} vel @param {number} dirX @param {number} dirZ
 * @param {number} maxSpeed @param {number} accel @param {number} dt
 */
function accelerate(vel, dirX, dirZ, maxSpeed, accel, dt) {
  if (dirX === 0 && dirZ === 0) return
  const current = vel.x * dirX + vel.z * dirZ
  const missing = maxSpeed - current
  if (missing <= 0) return

  const step = Math.min(accel * dt, missing)
  vel.x += dirX * step
  vel.z += dirZ * step
}

/**
 * @param {Vec3} vel @param {number} friction @param {number} dt
 */
function applyFriction(vel, friction, dt) {
  const speed = Math.sqrt(vel.x * vel.x + vel.z * vel.z)
  if (speed <= 0) return

  const next = speed - friction * dt
  if (next <= 0) {
    vel.x = 0
    vel.z = 0
    return
  }

  const scale = next / speed
  vel.x *= scale
  vel.z *= scale
}
