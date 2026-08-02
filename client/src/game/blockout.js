import * as THREE from 'three'
import { MOVEMENT } from '../../../shared/constants.js'

/**
 * Test geometry for movement. Every piece exists to exercise one rule, so a
 * regression shows up as something you can walk into rather than a number.
 *
 * Laid out ahead of spawn along -Z, which is where the camera faces at yaw 0.
 * That lets the movement tests drive real W/A/S/D without needing pointer lock.
 *
 * @param {typeof MOVEMENT} tuning
 */
export function createBlockout(tuning = MOVEMENT) {
  const group = new THREE.Group()
  /** @type {Array<{half: any, position: any, rotation?: any}>} */
  const colliders = []

  const material = new THREE.MeshStandardMaterial({ color: 0x8d9aa5, roughness: 0.85 })
  const rampMaterial = new THREE.MeshStandardMaterial({ color: 0x7f9b7a, roughness: 0.85 })
  const wallMaterial = new THREE.MeshStandardMaterial({ color: 0xa8907a, roughness: 0.9 })

  /**
   * @param {number} w @param {number} h @param {number} d
   * @param {number} x @param {number} y @param {number} z
   * @param {{ rotX?: number, rotZ?: number, material?: THREE.Material }} [opts]
   */
  function box(w, h, d, x, y, z, opts = {}) {
    const mesh = new THREE.Mesh(
      new THREE.BoxGeometry(w, h, d),
      opts.material ?? material
    )
    mesh.position.set(x, y, z)
    mesh.rotation.set(opts.rotX ?? 0, 0, opts.rotZ ?? 0)
    mesh.castShadow = true
    mesh.receiveShadow = true
    group.add(mesh)

    const quaternion = new THREE.Quaternion().setFromEuler(mesh.rotation)
    colliders.push({
      half: { x: w / 2, y: h / 2, z: d / 2 },
      position: { x, y, z },
      rotation: { x: quaternion.x, y: quaternion.y, z: quaternion.z, w: quaternion.w },
    })
    return mesh
  }

  // Stairs — each rise is below STEP_HEIGHT, so they are walked up, not jumped.
  const rise = tuning.STEP_HEIGHT * 0.85
  for (let i = 0; i < 5; i++) {
    box(6, rise * (i + 1), 0.9, 0, (rise * (i + 1)) / 2, -12 - i * 0.9)
  }

  // Ledge taller than STEP_HEIGHT — this one must require a jump.
  box(4, tuning.STEP_HEIGHT * 1.8, 3, -9, tuning.STEP_HEIGHT * 0.9, -12, { material: wallMaterial })

  // Walkable ramp, comfortably under the slope limit.
  box(5, 0.4, 12, 9, 1.4, -12, { rotX: (22 * Math.PI) / 180, material: rampMaterial })

  // Too-steep ramp, above the slope limit — this one must refuse to be climbed.
  box(5, 0.4, 8, 17, 2.4, -12, { rotX: (65 * Math.PI) / 180, material: rampMaterial })

  // Platform to jump onto. Solid to the ground with its TOP just under the
  // tuned jump height — positioning by centre leaves a floating slab at chest
  // height that cannot be stepped over or walked under.
  // Offset from the centre line: taller than STEP_HEIGHT, so leaving it there
  // would wall off everything beyond it to anyone not jumping.
  const platformHeight = tuning.JUMP_HEIGHT * 0.75
  box(4, platformHeight, 4, -4, platformHeight / 2, -24)

  // Corridor. Sprinting into these at any angle must never pass through.
  box(0.5, 3, 14, -3, 1.5, -34, { material: wallMaterial })
  box(0.5, 3, 14, 3, 1.5, -34, { material: wallMaterial })
  box(6.5, 3, 0.5, 0, 1.5, -41, { material: wallMaterial })

  return { group, colliders }
}
