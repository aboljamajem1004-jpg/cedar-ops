import { ANIMATION } from '../../../shared/constants.js'

/**
 * Picks and blends animation clips from simulation state.
 *
 * Driven by `speed`, `onGround` and `crouching` — the fields shared/movement.js
 * already produces — and never by input. In Phase 4 remote players arrive as
 * position and velocity with no key presses attached; animation keyed to input
 * would leave them sliding around in a permanent idle pose. Keying it to state
 * means they animate correctly for free.
 *
 * @param {{ character: any, animation?: typeof ANIMATION }} opts
 */
export function createAnimationState({ character, animation = ANIMATION }) {
  const actions = character.actions

  /**
   * Clips the free library provides, with the speed each was authored at so
   * playback can be rate-matched to actual movement. Without that, a character
   * moving at 6.5 m/s on a 1.4 m/s walk cycle looks like it is ice skating.
   */
  const CLIPS = {
    idle: { name: 'Idle_Loop', speed: 0 },
    walk: { name: 'Walk_Loop', speed: animation.CLIP_WALK_SPEED },
    jog: { name: 'Jog_Fwd_Loop', speed: animation.CLIP_JOG_SPEED },
    sprint: { name: 'Sprint_Loop', speed: animation.CLIP_SPRINT_SPEED },
    crouchIdle: { name: 'Crouch_Idle_Loop', speed: 0 },
    crouchWalk: { name: 'Crouch_Fwd_Loop', speed: animation.CLIP_CROUCH_SPEED },
    jumpStart: { name: 'Jump_Start', speed: 0 },
    jumpLoop: { name: 'Jump_Loop', speed: 0 },
    jumpLand: { name: 'Jump_Land', speed: 0 },
  }

  /** @type {string|null} */
  let currentKey = null
  /** @type {any} */
  let currentAction = null
  let wasOnGround = true

  const missing = Object.entries(CLIPS)
    .filter(([, clip]) => !actions.has(clip.name))
    .map(([, clip]) => clip.name)
  if (missing.length) {
    console.warn(`[cedar] animation clips missing: ${missing.join(', ')}`)
  }

  /**
   * Which clip suits this state.
   * @param {{ speed: number, onGround: boolean, crouching: boolean }} state
   */
  function selectKey(state) {
    if (!state.onGround) return 'jumpLoop'
    if (state.crouching) {
      return state.speed > animation.IDLE_SPEED ? 'crouchWalk' : 'crouchIdle'
    }
    if (state.speed <= animation.IDLE_SPEED) return 'idle'
    if (state.speed >= animation.SPRINT_SPEED) return 'sprint'
    if (state.speed >= animation.WALK_SPEED) return 'jog'
    return 'walk'
  }

  /** @param {string} key */
  function play(key) {
    const clip = CLIPS[key]
    const next = actions.get(clip.name)
    if (!next || next === currentAction) return

    next.reset()
    next.enabled = true
    next.setEffectiveWeight(1)
    next.play()

    // Crossfade rather than cut, or every state change pops.
    if (currentAction) next.crossFadeFrom(currentAction, animation.BLEND_TIME, true)

    currentAction = next
    currentKey = key
  }

  /**
   * @param {{ speed: number, onGround: boolean, crouching: boolean }} state
   * @param {number} dt seconds
   */
  function update(state, dt) {
    const key = selectKey(state)
    if (key !== currentKey) play(key)

    // Rate-match the clip to actual movement so the feet roughly keep up with
    // the ground. Clamped, because an unbounded timeScale looks worse than a
    // small amount of sliding.
    if (currentAction) {
      const authored = CLIPS[currentKey]?.speed ?? 0
      currentAction.timeScale =
        authored > 0
          ? Math.min(
              animation.TIMESCALE_MAX,
              Math.max(animation.TIMESCALE_MIN, state.speed / authored)
            )
          : 1
    }

    wasOnGround = state.onGround
    character.update(dt)
  }

  return {
    update,
    get current() {
      return currentKey
    },
    get missingClips() {
      return missing
    },
  }
}
