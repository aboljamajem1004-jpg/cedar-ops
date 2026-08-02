/**
 * KTX2 / Basis texture compression. Run after process-character.mjs.
 *
 *   node tools/assets/compress-textures.mjs
 *
 * Mandatory, not an optimisation — see CLAUDE.md §5.1. An uncompressed 2048²
 * RGBA texture costs ~22 MB of GPU memory; as KTX2 it costs ~5.6 MB, transcoded
 * to ASTC on mobile and BC on desktop. One character carries five of them, so
 * without this two characters exceed the entire mobile texture budget before
 * the map exists.
 *
 * Requires KTX-Software (the `ktx` binary) on PATH:
 *   https://github.com/KhronosGroup/KTX-Software/releases
 *
 * Normal maps get UASTC, everything else ETC1S. ETC1S is far smaller but
 * quantises chroma hard, which a normal map cannot tolerate — its channels are
 * a direction vector, not a colour, and the banding shows up as visibly
 * faceted lighting.
 */
import fs from 'node:fs'
import path from 'node:path'
import { execFileSync } from 'node:child_process'
import { NodeIO } from '@gltf-transform/core'
import { ALL_EXTENSIONS } from '@gltf-transform/extensions'
import { MeshoptEncoder, MeshoptDecoder } from 'meshoptimizer'

const ROOT = path.resolve(import.meta.dirname, '..', '..')
const MODELS = path.join(ROOT, 'client', 'public', 'assets', 'models')
const FILES = ['character-male.glb', 'character-female.glb']

/** Textures whose name or URI matches this get UASTC instead of ETC1S. */
const NORMAL_MAP = '*Normal*'

// Texture resolution is chosen in process-character.mjs (TEXTURE_SIZE).

await MeshoptEncoder.ready
await MeshoptDecoder.ready

const io = new NodeIO().registerExtensions(ALL_EXTENSIONS).registerDependencies({
  'meshopt.encoder': MeshoptEncoder,
  'meshopt.decoder': MeshoptDecoder,
})

function requireKtx() {
  try {
    const version = execFileSync('ktx', ['--version'], { encoding: 'utf8' }).trim()
    console.log(version)
  } catch {
    console.error('KTX-Software not found on PATH.')
    console.error('Install from https://github.com/KhronosGroup/KTX-Software/releases')
    console.error('with "Add to PATH" selected, then reopen the terminal.')
    process.exit(1)
  }
}

/**
 * @param {string[]} args
 */
function gltfTransform(args) {
  execFileSync('npx', ['--no-install', 'gltf-transform', ...args], {
    cwd: ROOT,
    stdio: ['ignore', 'pipe', 'pipe'],
    shell: true,
  })
}

/**
 * GPU memory for one texture including its mip chain, which adds about a third.
 *
 * Reported against the MOBILE transcode target, because that is the budget that
 * binds (§5). KTX2 transcodes to ASTC 4x4 on Mali at 1 byte per pixel; desktop
 * BC7 is the same, and ETC1S to BC1 on desktop is half that. Uncompressed RGBA
 * is 4 bytes per pixel.
 *
 * @param {number} width @param {number} height @param {boolean} compressed
 */
function gpuBytes(width, height, compressed) {
  return width * height * (compressed ? 1 : 4) * (4 / 3)
}

const mb = (bytes) => `${(bytes / 1048576).toFixed(1)} MB`

/** @param {string} file */
async function compress(file) {
  const filePath = path.join(MODELS, file)
  if (!fs.existsSync(filePath)) {
    console.error(`missing ${file} — run process-character.mjs first`)
    process.exit(1)
  }

  console.log(`\n=== ${file} ===`)

  const before = await io.read(filePath)
  const textures = before.getRoot().listTextures()
  const fileBefore = fs.statSync(filePath).size

  let gpuBefore = 0
  const inventory = []
  for (const texture of textures) {
    const [width, height] = texture.getSize() ?? [0, 0]
    const label = texture.getName() || texture.getURI() || '(unnamed)'
    const isNormal = /normal/i.test(label)
    gpuBefore += gpuBytes(width, height, false)
    inventory.push({ label, width, height, isNormal })
  }

  // Resizing already happened in process-character.mjs, so the textures arrive
  // here at their final resolution.
  //
  // Normals first, while they are still PNG. Running ETC1S over everything and
  // then re-encoding normals would re-compress an already-quantised image.
  const temp = path.join(MODELS, `.tmp-${file}`)
  gltfTransform(['uastc', filePath, temp, '--pattern', NORMAL_MAP, '--level', '2', '--rdo', '--rdo-lambda', '2'])
  // Extglob negation, so the pass skips the normal maps just encoded.
  gltfTransform(['etc1s', temp, filePath, '--pattern', `!(${NORMAL_MAP})`, '--quality', '200'])
  fs.unlinkSync(temp)

  const after = await io.read(filePath)
  const fileAfter = fs.statSync(filePath).size

  let gpuAfter = 0
  let ktx2Count = 0
  for (const texture of after.getRoot().listTextures()) {
    const [width, height] = texture.getSize() ?? [0, 0]
    const isKtx2 = texture.getMimeType() === 'image/ktx2'
    if (isKtx2) ktx2Count++
    gpuAfter += gpuBytes(width, height, isKtx2)
  }

  for (const t of inventory) {
    console.log(`  ${t.width}x${t.height}  ${t.isNormal ? 'UASTC' : 'ETC1S'}  ${t.label}`)
  }
  console.log(`  ktx2 textures: ${ktx2Count}/${after.getRoot().listTextures().length}`)

  return { file, fileBefore, fileAfter, gpuBefore, gpuAfter }
}

requireKtx()

const results = []
for (const file of FILES) results.push(await compress(file))

console.log('\n=== TEXTURE MEMORY (mobile transcode target) ===')
let totalBefore = 0
let totalAfter = 0
for (const r of results) {
  console.log(`${r.file}`)
  console.log(`  file size:      ${mb(r.fileBefore)} -> ${mb(r.fileAfter)}`)
  console.log(`  texture memory: ${mb(r.gpuBefore)} -> ${mb(r.gpuAfter)}`)
  totalBefore += r.gpuBefore
  totalAfter += r.gpuAfter
}
console.log(`\nBOTH CHARACTERS`)
console.log(`  texture memory: ${mb(totalBefore)} -> ${mb(totalAfter)}`)
console.log(`  mobile budget:  200 MB (CLAUDE.md §5)`)
console.log(
  `  verdict: ${totalAfter < 200 * 1048576 ? 'within budget' : 'OVER BUDGET'}` +
    ` — texture memory scales with unique models, not player count`
)
