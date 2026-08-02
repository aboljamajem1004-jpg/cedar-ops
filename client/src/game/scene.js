import * as THREE from 'three'
import { createGrid } from './grid.js'

const SKY = 0x8fb6d6
const GROUND = 0x3f4a3a

/**
 * Phase 0 test scene: ground, grid, and three cubes at increasing distance.
 *
 * The cubes sit far apart on purpose. Draw-call and triangle counts mean
 * nothing with a single object, and separated objects make frustum and
 * distance culling visible once they are added in Phase 3.
 *
 * @param {{ shadows: boolean, grid: boolean, gridFadeStart: number, gridFadeEnd: number }} quality
 * @returns {{ scene: THREE.Scene, camera: THREE.PerspectiveCamera, update: (dt: number) => void, setGridFade: (start: number, end: number) => void }}
 */
export function createScene(quality) {
  const scene = new THREE.Scene()
  scene.background = new THREE.Color(SKY)
  // Fog hides the ground plane's far edge, so the world reads as open.
  scene.fog = new THREE.Fog(SKY, 40, 180)

  const camera = new THREE.PerspectiveCamera(70, 1, 0.1, 500)
  camera.position.set(0, 3.5, 12)
  camera.lookAt(0, 1, -20)

  // --- lighting -------------------------------------------------------------
  // Hemisphere light is the cheap ambient fill: sky colour from above, ground
  // bounce from below. It costs nothing and stops shadows going pure black.
  scene.add(new THREE.HemisphereLight(SKY, GROUND, 1.1))

  const sun = new THREE.DirectionalLight(0xfff3e0, 2.2)
  sun.position.set(30, 45, 20)
  if (quality.shadows) {
    sun.castShadow = true
    sun.shadow.mapSize.set(1024, 1024)
    sun.shadow.camera.near = 1
    sun.shadow.camera.far = 120
    const extent = 40
    sun.shadow.camera.left = -extent
    sun.shadow.camera.right = extent
    sun.shadow.camera.top = extent
    sun.shadow.camera.bottom = -extent
    sun.shadow.bias = -0.0005
  }
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

  // --- cubes ----------------------------------------------------------------
  const cubeGeo = new THREE.BoxGeometry(2, 2, 2)
  const specs = [
    { color: 0xe4572e, z: 0, x: -4 },
    { color: 0x2ea3e4, z: -25, x: 3 },
    { color: 0xf0c419, z: -60, x: -8 },
  ]

  const cubes = specs.map((spec) => {
    const mesh = new THREE.Mesh(
      cubeGeo,
      new THREE.MeshStandardMaterial({ color: spec.color, roughness: 0.55 })
    )
    mesh.position.set(spec.x, 1, spec.z)
    mesh.castShadow = true
    mesh.receiveShadow = true
    scene.add(mesh)
    return mesh
  })

  /** @param {number} dt */
  function update(dt) {
    // Rotation is the cheapest possible proof that the loop is actually running
    // and not showing one stale frame.
    for (let i = 0; i < cubes.length; i++) {
      cubes[i].rotation.y += dt * (0.6 - i * 0.15)
      cubes[i].rotation.x += dt * 0.2
    }
  }

  /** @param {number} start @param {number} end */
  function setGridFade(start, end) {
    grid?.userData.setFade(start, end)
  }

  return { scene, camera, update, setGridFade }
}
