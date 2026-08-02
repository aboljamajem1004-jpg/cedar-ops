import * as THREE from 'three'
import { createGrid } from './grid.js'

const SKY = 0x8fb6d6
const GROUND = 0x3f4a3a

/**
 * The world: ground, grid, lighting and fog. The camera belongs to
 * camera-fp.js now that there is a player to attach it to, and the phase 0 test
 * cubes are gone — the movement blockout replaced them.
 *
 * @param {{ shadows: boolean, grid: boolean, gridFadeStart: number, gridFadeEnd: number }} quality
 * @returns {{ scene: THREE.Scene, setGridFade: (start: number, end: number) => void, setShadows: (enabled: boolean) => void }}
 */
export function createScene(quality) {
  const scene = new THREE.Scene()
  scene.background = new THREE.Color(SKY)
  // Fog hides the ground plane's far edge, so the world reads as open.
  scene.fog = new THREE.Fog(SKY, 40, 180)

  // --- lighting -------------------------------------------------------------
  // Hemisphere light is the cheap ambient fill: sky colour from above, ground
  // bounce from below. It costs nothing and stops shadows going pure black.
  scene.add(new THREE.HemisphereLight(SKY, GROUND, 1.1))

  const sun = new THREE.DirectionalLight(0xfff3e0, 2.2)
  sun.position.set(30, 45, 20)
  // Always configured, even when shadows are off, so they can be switched on
  // later without rebuilding the light.
  sun.shadow.mapSize.set(1024, 1024)
  sun.shadow.camera.near = 1
  sun.shadow.camera.far = 120
  const extent = 40
  sun.shadow.camera.left = -extent
  sun.shadow.camera.right = extent
  sun.shadow.camera.top = extent
  sun.shadow.camera.bottom = -extent
  sun.shadow.bias = -0.0005
  sun.castShadow = quality.shadows
  scene.add(sun)

  // --- ground ---------------------------------------------------------------
  const ground = new THREE.Mesh(
    new THREE.PlaneGeometry(400, 400),
    new THREE.MeshStandardMaterial({ color: GROUND, roughness: 1, metalness: 0 })
  )
  ground.rotation.x = -Math.PI / 2
  ground.receiveShadow = true
  scene.add(ground)

  const grid = quality.grid
    ? createGrid({
        fadeStart: quality.gridFadeStart,
        fadeEnd: quality.gridFadeEnd,
        fog: scene.fog,
      })
    : null
  if (grid) scene.add(grid)

  /** @param {number} start @param {number} end */
  function setGridFade(start, end) {
    grid?.userData.setFade(start, end)
  }

  /**
   * Turn shadows on or off without a reload.
   *
   * Whether a material samples a shadow map is baked into its compiled shader,
   * so every material has to be marked for recompilation. That costs a stall of
   * a few frames — acceptable for an occasional quality change, which is why
   * this is not something to call per frame.
   *
   * @param {boolean} enabled
   */
  function setShadows(enabled) {
    sun.castShadow = enabled
    scene.traverse((object) => {
      const material = /** @type {any} */ (object).material
      if (!material) return
      for (const m of Array.isArray(material) ? material : [material]) {
        m.needsUpdate = true
      }
    })
  }

  return { scene, setGridFade, setShadows }
}
