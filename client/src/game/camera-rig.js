import * as THREE from 'three'
import { CAMERA, UI_KEYS } from '../../../shared/constants.js'
import { HEAD_LAYER } from './character.js'

/**
 * First and third person from one camera.
 *
 * One camera rather than two: switching mode moves it and toggles which layers
 * it renders, so there is no second frustum, no duplicated aspect handling, and
 * nothing to keep in sync.
 *
 * Head hiding uses layers. The asset pipeline emits the head as its own mesh
 * (see tools/assets/process-character.mjs) and character.js puts it on
 * HEAD_LAYER; the first-person camera simply stops rendering that layer. The
 * sun's shadow camera keeps the layer enabled, so the shadow still has a head —
 * which is why the mesh was split rather than the head bone being scaled away.
 *
 * @param {{ tuning: any, camera: typeof CAMERA, physics: any, onModeChange?: (mode: string) => void }} opts
 */
export function createCameraRig({ tuning, camera: settings, physics, onModeChange }) {
  const camera = new THREE.PerspectiveCamera(settings.FOV, 1, settings.NEAR, settings.FAR)
  // Yaw then pitch, no roll — the standard FPS ordering. The default XYZ order
  // tilts the horizon as you look around.
  camera.rotation.order = 'YXZ'

  /** @type {'first'|'third'} */
  let mode = 'first'
  let eyeHeight = tuning.EYE_HEIGHT

  // Scratch vectors, reused every frame so the render loop allocates nothing.
  const head = new THREE.Vector3()
  const offset = new THREE.Vector3()
  const direction = new THREE.Vector3()
  const quaternion = new THREE.Quaternion()
  const euler = new THREE.Euler(0, 0, 0, 'YXZ')

  applyMode()

  function applyMode() {
    if (mode === 'first') camera.layers.disable(HEAD_LAYER)
    else camera.layers.enable(HEAD_LAYER)
    onModeChange?.(mode)
  }

  function toggle() {
    mode = mode === 'first' ? 'third' : 'first'
    applyMode()
  }

  window.addEventListener('keydown', (e) => {
    if (e.code !== UI_KEYS.TOGGLE_CAMERA) return
    e.preventDefault()
    toggle()
  })

  /**
   * @param {{ position: {x:number,y:number,z:number}, yaw: number, pitch: number,
   *           crouching: boolean, dt: number, playerCollider?: any }} view
   */
  function update(view) {
    const target = view.crouching ? tuning.EYE_HEIGHT_CROUCH : tuning.EYE_HEIGHT
    // Framerate-independent smoothing: the exponential form gives the same
    // result at 30 fps and 144 fps, which a plain lerp does not.
    const blend = 1 - Math.exp(-tuning.CROUCH_LERP * view.dt)
    eyeHeight += (target - eyeHeight) * blend

    head.set(view.position.x, view.position.y + eyeHeight, view.position.z)
    camera.rotation.y = view.yaw
    camera.rotation.x = view.pitch

    if (mode === 'first') {
      // Sit slightly ahead of the neck axis, which is where eyes actually are.
      // Placed on the body's centreline the camera is inside the torso, and
      // looking down shows the inside of the shoulders and an open neck cavity
      // rather than a chest. The offset is horizontal and independent of pitch,
      // so looking around never slides the viewpoint up or down.
      camera.position.set(
        head.x - Math.sin(view.yaw) * settings.FP_FORWARD,
        head.y,
        head.z - Math.cos(view.yaw) * settings.FP_FORWARD
      )
      return
    }

    // Ideal position: behind, right, and slightly above the head, rotated by
    // where the player is looking.
    euler.set(view.pitch, view.yaw, 0)
    quaternion.setFromEuler(euler)
    offset.set(settings.TP_SHOULDER, settings.TP_HEIGHT, settings.TP_DISTANCE)
    offset.applyQuaternion(quaternion)

    direction.copy(offset).normalize()
    let distance = offset.length()

    // Spring arm: pull in to the first surface between head and camera, so the
    // view never ends up inside a wall.
    const hit = physics.castRay(head, direction, distance, view.playerCollider)
    if (hit !== null) {
      distance = Math.max(settings.TP_MIN_DISTANCE, hit - settings.TP_COLLISION_PAD)
    }

    camera.position.copy(head).addScaledVector(direction, distance)
  }

  return {
    camera,
    update,
    toggle,
    get mode() {
      return mode
    },
    get eyeHeight() {
      return eyeHeight
    },
  }
}
