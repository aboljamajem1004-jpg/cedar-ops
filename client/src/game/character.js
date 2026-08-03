import * as THREE from 'three'
import { clone as cloneSkinned } from 'three/examples/jsm/utils/SkeletonUtils.js'

/** Layer the head is moved to, so the first-person camera can skip it. */
export const HEAD_LAYER = 1

/**
 * One character instance.
 *
 * The model is cloned with SkeletonUtils rather than Object3D.clone(), which
 * would copy the meshes but leave every clone pointing at the original's
 * skeleton — all eight players would then animate identically, driven by
 * whichever mixer ran last.
 *
 * Animation clips come from a separate file and are shared: every character
 * uses the identical 65-joint skeleton, so the clips bind by bone name with no
 * retargeting and are never duplicated per instance.
 *
 * @param {{ model: any, clips: THREE.AnimationClip[], teamColor?: number,
 *           alwaysVisible?: boolean }} opts
 */
export function createCharacter({ model, clips, teamColor, alwaysVisible = false }) {
  const root = cloneSkinned(model.scene)

  /** @type {THREE.SkinnedMesh|null} */
  let headMesh = null
  /** @type {THREE.SkinnedMesh[]} */
  const meshes = []
  /**
   * Every mesh moved to the head layer. More than one: the split head, plus
   * eyes and eyebrows, which ship as separate fully head-weighted meshes and
   * would otherwise float in mid-air once the head is hidden.
   * @type {THREE.SkinnedMesh[]}
   */
  const headParts = []

  root.traverse((object) => {
    if (!object.isMesh && !object.isSkinnedMesh) return
    meshes.push(object)
    object.castShadow = true
    object.receiveShadow = true

    // three culls a SkinnedMesh against bounds computed from its BIND pose, not
    // its animated pose. For the local player — whose body surrounds the camera
    // and whose arms swing well outside those bounds while running — the test
    // fails intermittently and limbs flicker in and out of view. Culling saves
    // nothing for a mesh that is always on screen anyway.
    if (alwaysVisible) object.frustumCulled = false

    // Materials are cloned per character so a team colour on one player does
    // not tint every other player sharing the source model.
    object.material = object.material.clone()
    if (teamColor !== undefined) object.material.color.setHex(teamColor)

    // Identified by extras, never by name. The skeleton contains a bone called
    // "Head", so GLTFLoader renames the head mesh to "Head_1" to avoid the
    // collision — a name lookup finds nothing and the head stays visible in
    // first person, which is exactly the bug this replaced.
    if (object.userData?.cedarPart === 'head') {
      headMesh = headMesh ?? object
      headParts.push(object)
      object.layers.set(HEAD_LAYER)
    }
  })

  const mixer = new THREE.AnimationMixer(root)
  /** @type {Map<string, THREE.AnimationAction>} */
  const actions = new Map()
  for (const clip of clips) {
    const action = mixer.clipAction(clip)
    action.enabled = true
    actions.set(clip.name, action)
  }

  return {
    root,
    mixer,
    actions,
    meshes,
    get headMesh() {
      return headMesh
    },
    get headParts() {
      return headParts
    },
    /** @param {number} dt seconds */
    update(dt) {
      mixer.update(dt)
    },
    dispose() {
      mixer.stopAllAction()
      for (const mesh of meshes) mesh.material.dispose()
    },
  }
}
