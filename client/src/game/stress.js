import * as THREE from 'three'
import { createCharacter } from './character.js'

/** Team colours, multiplied into the base colour texture. */
export const TEAM_COLORS = { blue: 0x4a7fd4, red: 0xd45a4a }

/** Animations cycled through so the mixers are not all doing identical work. */
const CLIPS = ['Idle_Loop', 'Walk_Loop', 'Jog_Fwd_Loop', 'Crouch_Idle_Loop']

/**
 * Spawn N characters for the §5.1 stress test.
 *
 * Both models are used, alternating, because that is the honest worst case: a
 * real match mixes them, and measuring one would report half the texture
 * memory.
 *
 * @param {{ scene: THREE.Scene, assets: any, count: number }} opts
 */
export async function createStressScene({ scene, assets, count }) {
  const [male, female, animationFile] = await Promise.all([
    assets.loadModel('assets/models/character-male.glb'),
    assets.loadModel('assets/models/character-female.glb'),
    assets.loadModel('assets/models/animations.glb'),
  ])

  const clips = animationFile.animations
  const characters = []

  const perRow = Math.ceil(count / 2)
  for (let i = 0; i < count; i++) {
    const model = i % 2 === 0 ? male : female
    const team = i < count / 2 ? TEAM_COLORS.blue : TEAM_COLORS.red

    const character = createCharacter({ model, clips, teamColor: team })

    const column = i % perRow
    const row = Math.floor(i / perRow)
    character.root.position.set((column - (perRow - 1) / 2) * 1.6, 0, -6 - row * 2.5)
    character.root.rotation.y = Math.PI // face the spawn point

    const clipName = CLIPS[i % CLIPS.length]
    const action = character.actions.get(clipName)
    if (action) {
      // Offset each start so eight identical clips do not run in lockstep,
      // which would be an unrealistically cache-friendly best case.
      action.time = (i / count) * action.getClip().duration
      action.play()
    }

    scene.add(character.root)
    characters.push(character)
  }

  return {
    characters,
    /** @param {number} dt seconds */
    update(dt) {
      for (const character of characters) character.update(dt)
    },
  }
}

/**
 * Actual GPU texture memory for everything in the scene, in bytes.
 *
 * Compressed textures carry their mip chain as buffers, so their real size is
 * the sum of those byte lengths — no estimating. Uncompressed textures are
 * width x height x 4, plus a third for mips.
 *
 * §5.1 calls texture memory the constraint that actually kills us on mobile, so
 * it is measured rather than assumed.
 *
 * @param {THREE.Object3D} root
 */
export function measureTextureMemory(root) {
  /** @type {Set<THREE.Texture>} */
  const seen = new Set()
  let bytes = 0
  let compressed = 0
  let uncompressed = 0

  /** @type {Array<{name: string, bytes: number, detail: string}>} */
  const breakdown = []

  /** @param {any} texture */
  function account(texture) {
    if (!texture || !texture.isTexture || seen.has(texture)) return
    seen.add(texture)

    let size = 0
    let detail = ''

    if (texture.isCompressedTexture && texture.mipmaps?.length) {
      for (const mip of texture.mipmaps) size += mip.data?.byteLength ?? 0
      detail = `ktx2 ${texture.mipmaps.length} mips`
      compressed++
    } else if (texture.image?.width) {
      // Half-float is 8 bytes per texel, float 16, everything else 4.
      const bytesPerTexel =
        texture.type === THREE.HalfFloatType ? 8 : texture.type === THREE.FloatType ? 16 : 4

      // A PMREM environment map is a 2D CubeUV atlas: all six faces and every
      // roughness level are already packed into those dimensions. Multiplying
      // by six faces, or adding a mip factor, counts the same bytes twice.
      const isCubeUV = texture.mapping === THREE.CubeUVReflectionMapping
      const mipFactor = isCubeUV ? 1 : 4 / 3

      size = texture.image.width * texture.image.height * bytesPerTexel * mipFactor
      detail = `${texture.image.width}x${texture.image.height} ${bytesPerTexel}B/texel${isCubeUV ? ' cubeUV atlas' : ''}`
      uncompressed++
    }

    bytes += size
    if (size > 0) {
      breakdown.push({ name: texture.name || texture.constructor.name, bytes: size, detail })
    }
  }

  // Environment and background are scene-level, not on any material, but they
  // occupy GPU memory like anything else.
  account(/** @type {any} */ (root).environment)
  account(/** @type {any} */ (root).background)

  root.traverse((object) => {
    const material = /** @type {any} */ (object).material
    if (!material) return

    for (const mat of Array.isArray(material) ? material : [material]) {
      for (const key of Object.keys(mat)) account(mat[key])
    }
  })

  breakdown.sort((a, b) => b.bytes - a.bytes)
  return { bytes, textures: seen.size, compressed, uncompressed, breakdown }
}
