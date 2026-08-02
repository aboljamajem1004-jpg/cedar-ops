/**
 * KTX2 / Basis texture compression. Run after process-character.mjs.
 *
 *   node tools/assets/compress-textures.mjs
 *
 * Mandatory, not an optimisation — see CLAUDE.md §5.1. An uncompressed 2048²
 * RGBA texture costs ~22 MB of GPU memory; the same texture as KTX2 costs ~5.6
 * MB, transcoded to ASTC on mobile and BC on desktop. One character carries
 * five of them.
 *
 * Requires KTX-Software (the `ktx` binary) on PATH:
 *   https://github.com/KhronosGroup/KTX-Software/releases
 *
 * Normal maps use UASTC and everything else ETC1S. ETC1S is far smaller but
 * quantises chroma aggressively, which a normal map cannot tolerate — its
 * channels are a direction vector, not a colour, and banding there shows up as
 * visibly faceted lighting.
 */
import fs from 'node:fs'
import path from 'node:path'
import { execFileSync } from 'node:child_process'
import { NodeIO } from '@gltf-transform/core'
import { ALL_EXTENSIONS } from '@gltf-transform/extensions'
import { textureCompress } from '@gltf-transform/functions'
import { MeshoptEncoder, MeshoptDecoder } from 'meshoptimizer'

const ROOT = path.resolve(import.meta.dirname, '..', '..')
const MODELS = path.join(ROOT, 'client', 'public', 'assets', 'models')

const FILES = ['character-male.glb', 'character-female.glb']

function requireKtx() {
  try {
    const version = execFileSync('ktx', ['--version'], { encoding: 'utf8' }).trim()
    console.log(`ktx: ${version}`)
  } catch {
    console.error('KTX-Software not found on PATH.')
    console.error('Install from https://github.com/KhronosGroup/KTX-Software/releases')
    console.error('and make sure "Add to PATH" is selected, then reopen the terminal.')
    process.exit(1)
  }
}

/** @param {number} bytes */
const mb = (bytes) => `${(bytes / 1048576).toFixed(1)} MB`

/**
 * GPU memory for a texture, including the mip chain (which adds ~1/3).
 * @param {number} width @param {number} height @param {boolean} compressed
 */
function gpuBytes(width, height, compressed) {
  // Uncompressed RGBA is 4 bytes per pixel. ASTC 4x4 and BC7 are both 1.
  const bytesPerPixel = compressed ? 1 : 4
  return width * height * bytesPerPixel * (4 / 3)
}

await MeshoptEncoder.ready
await MeshoptDecoder.ready

const io = new NodeIO().registerExtensions(ALL_EXTENSIONS).registerDependencies({
  'meshopt.encoder': MeshoptEncoder,
  'meshopt.decoder': MeshoptDecoder,
})

requireKtx()

for (const file of FILES) {
  const filePath = path.join(MODELS, file)
  if (!fs.existsSync(filePath)) {
    console.error(`missing ${file} — run process-character.mjs first`)
    process.exit(1)
  }

  console.log(`\n=== ${file} ===`)
  const document = await io.read(filePath)
  const sizeBefore = fs.statSync(filePath).size

  let gpuBefore = 0
  let gpuAfter = 0

  for (const texture of document.getRoot().listTextures()) {
    const size = texture.getSize() ?? [0, 0]
    const isNormal = /normal/i.test(texture.getName() ?? '') || /normal/i.test(texture.getURI() ?? '')

    gpuBefore += gpuBytes(size[0], size[1], false)
    gpuAfter += gpuBytes(size[0], size[1], true)

    await document.transform(
      textureCompress({
        targetFormat: 'ktx2',
        // ETC1S everywhere except normal maps, which need UASTC.
        encoder: isNormal ? 'uastc' : 'etc1s',
        pattern: new RegExp(`^${escapeRegExp(texture.getName() ?? '')}$`),
      })
    )

    console.log(
      `  ${texture.getName()} ${size[0]}x${size[1]} ` +
        `${isNormal ? 'UASTC' : 'ETC1S'}`
    )
  }

  await io.write(filePath, document)
  const sizeAfter = fs.statSync(filePath).size

  console.log(`  file:       ${mb(sizeBefore)} -> ${mb(sizeAfter)}`)
  console.log(`  GPU memory: ${mb(gpuBefore)} -> ${mb(gpuAfter)}`)
}

/** @param {string} value */
function escapeRegExp(value) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
}
