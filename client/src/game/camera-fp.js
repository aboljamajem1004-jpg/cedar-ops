import * as THREE from 'three'
import { MOVEMENT } from '../../../shared/constants.js'

/**
 * First-person camera.
 *
 * Look is applied every rendered frame straight from the input, not from the
 * 30 Hz simulation — aiming that updates 30 times a second feels notchy even
 * when movement does not.
 *
 * @param {typeof MOVEMENT} tuning
 */
export function createFirstPersonCamera(tuning = MOVEMENT) {
  const camera = new THREE.PerspectiveCamera(75, 1, 0.1, 500)
  // Yaw then pitch, with no roll — the standard FPS ordering. The default XYZ
  // order tilts the horizon as you look around.
  camera.rotation.order = 'YXZ'

  let eyeHeight = tuning.EYE_HEIGHT

  /**
   * @param {{ position: {x:number,y:number,z:number}, yaw: number, pitch: number,
   *           crouching: boolean, dt: number }} view
   */
  function update(view) {
    const target = view.crouching ? tuning.EYE_HEIGHT_CROUCH : tuning.EYE_HEIGHT
    // Framerate-independent smoothing: the exponential form gives the same
    // result at 30 fps and 144 fps, which a plain lerp does not.
    const blend = 1 - Math.exp(-tuning.CROUCH_LERP * view.dt)
    eyeHeight += (target - eyeHeight) * blend

    camera.position.set(view.position.x, view.position.y + eyeHeight, view.position.z)
    camera.rotation.y = view.yaw
    camera.rotation.x = view.pitch
  }

  return {
    camera,
    update,
    get eyeHeight() {
      return eyeHeight
    },
  }
}
