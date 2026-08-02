import { BTN, MOVEMENT } from '../../../shared/constants.js'

const KEY_TO_BUTTON = {
  KeyW: BTN.FORWARD,
  ArrowUp: BTN.FORWARD,
  KeyS: BTN.BACK,
  ArrowDown: BTN.BACK,
  KeyA: BTN.LEFT,
  ArrowLeft: BTN.LEFT,
  KeyD: BTN.RIGHT,
  ArrowRight: BTN.RIGHT,
  Space: BTN.JUMP,
  ShiftLeft: BTN.SPRINT,
  ShiftRight: BTN.SPRINT,
  ControlLeft: BTN.CROUCH,
  KeyC: BTN.CROUCH,
}

/**
 * Keyboard and mouse-look input.
 *
 * Keys are tracked whether or not the pointer is locked, so the movement tests
 * can drive real key events without needing pointer lock, which cannot be
 * granted programmatically.
 *
 * Look is accumulated per frame rather than per simulation step: at 30 Hz,
 * sampling the mouse only on the fixed step makes aiming feel notchy.
 *
 * @param {HTMLCanvasElement} canvas
 * @param {typeof MOVEMENT} tuning
 */
export function createInput(canvas, tuning = MOVEMENT) {
  let buttons = 0
  let yaw = 0
  let pitch = 0
  let locked = false

  const pitchLimit = (tuning.PITCH_LIMIT_DEG * Math.PI) / 180

  window.addEventListener('keydown', (e) => {
    const bit = KEY_TO_BUTTON[e.code]
    if (!bit) return
    // Space scrolls the page and Ctrl is a browser modifier; neither should
    // reach the document while playing.
    e.preventDefault()
    buttons |= bit
  })

  window.addEventListener('keyup', (e) => {
    const bit = KEY_TO_BUTTON[e.code]
    if (!bit) return
    buttons &= ~bit
  })

  /**
   * Drop every held key.
   *
   * The browser stops delivering keyup once the window loses focus, so a key
   * held at that moment stays held forever from our side — alt-tab while
   * sprinting and you come back sprinting into a wall with no way to stop.
   * Every path that can swallow a keyup clears the state instead.
   *
   * @param {string} reason
   */
  function releaseAll(reason) {
    if (buttons === 0) return
    buttons = 0
    lastRelease = reason
  }

  let lastRelease = ''

  // Alt-tab, clicking another window, or the OS taking focus.
  window.addEventListener('blur', () => releaseAll('blur'))

  // Escape out of pointer lock mid-move: the keyup often lands on the document
  // rather than reaching us.
  document.addEventListener('pointerlockchange', () => {
    locked = document.pointerLockElement === canvas
    if (!locked) releaseAll('pointerlock exit')
  })

  // Tab switch or phone screen lock. blur does not always fire on mobile.
  document.addEventListener('visibilitychange', () => {
    if (document.hidden) releaseAll('tab hidden')
  })

  canvas.addEventListener('click', () => {
    if (!locked) canvas.requestPointerLock()
  })

  document.addEventListener('mousemove', (e) => {
    if (!locked) return
    yaw -= e.movementX * tuning.MOUSE_SENSITIVITY
    pitch -= e.movementY * tuning.MOUSE_SENSITIVITY
    if (pitch > pitchLimit) pitch = pitchLimit
    if (pitch < -pitchLimit) pitch = -pitchLimit
  })

  return {
    /** Input for one simulation step. */
    sample() {
      return { buttons, yaw }
    },
    get yaw() {
      return yaw
    },
    get pitch() {
      return pitch
    },
    get locked() {
      return locked
    },
    get buttons() {
      return buttons
    },
    /** Why keys were last force-released — surfaced in the debug overlay. */
    get lastRelease() {
      return lastRelease
    },
  }
}
