import { createState, computeMovement, applyCollision } from '../../../shared/movement.js'
import { MOVEMENT } from '../../../shared/constants.js'

/**
 * The local player: a capsule driven by shared/movement.js.
 *
 * The previous position is kept so rendering can interpolate between fixed
 * simulation steps. At 30 Hz, drawing the raw simulated position on a 60 Hz
 * screen shows every step as a visible judder.
 *
 * @param {{ physics: any, tuning: typeof MOVEMENT, spawn: {x:number,y:number,z:number} }} opts
 */
export function createPlayer({ physics, tuning, spawn }) {
  const state = createState(spawn.x, spawn.y, spawn.z)
  const previousPos = { ...state.pos }

  let height = tuning.PLAYER_HEIGHT

  const character = physics.createCharacter({
    position: state.pos,
    height,
    radius: tuning.PLAYER_RADIUS,
    stepHeight: tuning.STEP_HEIGHT,
    slopeLimitRad: (tuning.SLOPE_LIMIT_DEG * Math.PI) / 180,
  })

  /**
   * One fixed simulation step.
   *
   * Order matters: the collision query reads the collider's current position,
   * so the body is only moved after the result has been applied, and the world
   * is stepped last to commit it.
   *
   * @param {{ buttons: number, yaw: number }} input
   * @param {number} dt seconds, always the fixed step
   */
  function fixedStep(input, dt) {
    previousPos.x = state.pos.x
    previousPos.y = state.pos.y
    previousPos.z = state.pos.z

    const desired = computeMovement(state, input, dt, tuning)
    const { movement, grounded } = character.move(desired, state.vel.y > 0)
    applyCollision(state, movement, grounded, dt)

    const wantedHeight = state.crouching ? tuning.PLAYER_CROUCH_HEIGHT : tuning.PLAYER_HEIGHT
    if (wantedHeight !== height) {
      // Uncrouching under a low ceiling is not blocked yet — there is nothing
      // low enough in the phase 1 blockout to abuse. It needs a shape cast,
      // which lands with the real map in phase 3.
      height = wantedHeight
      character.setHeight(height)
    }

    character.setFeetPosition(state.pos, height)
    physics.step()
  }

  /**
   * Feet position for rendering, interpolated between the last two steps.
   * @param {number} alpha 0..1 progress through the current step
   */
  function interpolatedPosition(alpha) {
    return {
      x: previousPos.x + (state.pos.x - previousPos.x) * alpha,
      y: previousPos.y + (state.pos.y - previousPos.y) * alpha,
      z: previousPos.z + (state.pos.z - previousPos.z) * alpha,
    }
  }

  return {
    state,
    fixedStep,
    interpolatedPosition,
    /** The player's own collider, so casts can be told to ignore it. */
    get collider() {
      return character.collider
    },
    get height() {
      return height
    },
    /** Horizontal speed, m/s — vertical motion is not "how fast you are moving". */
    get speed() {
      return Math.sqrt(state.vel.x * state.vel.x + state.vel.z * state.vel.z)
    },
  }
}
