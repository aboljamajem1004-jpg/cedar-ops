/**
 * Character asset pipeline. Re-runnable: swap the source model and run again.
 *
 *   node tools/assets/process-character.mjs
 *
 * Reads from assets-src/ (gitignored, raw pack contents — see CLAUDE.md §8,
 * raw sources are never committed) and writes .glb files into
 * client/public/assets/models/.
 *
 * Steps, in order:
 *   1. repair broken texture URIs shipped in the Quaternius pack
 *   2. split the body mesh into head and body primitives
 *   3. drop vertex attributes no material reads
 *   4. neutralise baseColorFactor so team colour tinting is predictable
 *   5. Meshopt-compress geometry
 *   6. write character glb files
 *   7. strip meshes from the animation library, keeping clips only
 *
 * KTX2 texture compression is a separate step (compress-textures.mjs) because
 * it needs the external KTX-Software binary.
 */
import fs from 'node:fs'
import path from 'node:path'
import { NodeIO } from '@gltf-transform/core'
import { ALL_EXTENSIONS } from '@gltf-transform/extensions'
import { prune, dedup, meshopt } from '@gltf-transform/functions'
import { MeshoptEncoder, MeshoptDecoder } from 'meshoptimizer'

const ROOT = path.resolve(import.meta.dirname, '..', '..')
const SRC = path.join(ROOT, 'assets-src')
const OUT = path.join(ROOT, 'client', 'public', 'assets', 'models')

const CHARACTER_DIR = path.join(SRC, 'characters', 'Base Characters', 'Godot - UE')
const ANIMATION_GLB = path.join(
  SRC,
  'animations',
  'Unreal-Godot',
  'UAL1_Standard.glb'
)

/**
 * Resized textures come from resize-textures.mjs, which runs first in its own
 * process — see the comment there for why the two cannot share one.
 */
const TEXTURE_SIZE = Number(process.env.TEXTURE_SIZE || 1024)
const RESIZED_DIR = `.resized-${TEXTURE_SIZE}`

/** Bones from the neck up. Geometry weighted to these becomes the head mesh. */
const HEAD_BONE = /^(head|neck_01|face|jaw|eye|brow)/i
/** Mesh names in the output. The client looks the head up by this name. */
export const HEAD_MESH_NAME = 'Head'
export const BODY_MESH_NAME = 'Body'

await MeshoptEncoder.ready
await MeshoptDecoder.ready

// The Meshopt extension reads its encoder from the IO's dependency registry,
// not from the meshopt() transform's options — without this, writing fails
// inside the extension rather than at the call site.
const io = new NodeIO().registerExtensions(ALL_EXTENSIONS).registerDependencies({
  'meshopt.encoder': MeshoptEncoder,
  'meshopt.decoder': MeshoptDecoder,
})

/**
 * Point every image at a real file, resized where one exists.
 *
 * Two problems are handled together. The pack ships glTF files referencing
 * "<name>_png.png" while the zip contains "<name>.png", and the textures we
 * actually want are the downscaled copies produced by resize-textures.mjs.
 *
 * Rewriting the JSON in memory avoids leaving junk copies of every texture on
 * disk beside the originals.
 *
 * @param {string} gltfPath
 * @returns {string} path to a patched copy, or the original if nothing changed
 */
function repairTextureUris(gltfPath) {
  const json = JSON.parse(fs.readFileSync(gltfPath, 'utf8'))
  const dir = path.dirname(gltfPath)
  let repaired = 0
  let redirected = 0

  for (const image of json.images ?? []) {
    if (!image.uri) continue
    let decoded = decodeURIComponent(image.uri)

    if (!fs.existsSync(path.join(dir, decoded))) {
      const candidate = decoded.replace(/_png(\.\w+)$/, '$1')
      if (!fs.existsSync(path.join(dir, candidate))) {
        throw new Error(`texture missing with no candidate: ${decoded}`)
      }
      decoded = candidate
      repaired++
    }

    const resizedPath = path.join(dir, RESIZED_DIR, path.basename(decoded))
    if (fs.existsSync(resizedPath)) {
      decoded = `${RESIZED_DIR}/${path.basename(decoded)}`
      redirected++
    }

    image.uri = decoded.split('/').map(encodeURIComponent).join('/')
  }

  if (repaired) console.log(`  repaired ${repaired} broken texture URIs`)
  if (redirected) console.log(`  using ${redirected} resized textures from ${RESIZED_DIR}/`)
  else console.log(`  WARNING: no resized textures found — run resize-textures.mjs first`)

  const patched = path.join(dir, `.patched-${path.basename(gltfPath)}`)
  fs.writeFileSync(patched, JSON.stringify(json))
  return patched
}

/**
 * Split the skinned body mesh into head and body primitives.
 *
 * Both primitives share every vertex buffer and differ only in their index
 * buffer, so this costs one extra index accessor rather than a duplicated copy
 * of the mesh. Triangles that straddle the neck go to the HEAD, which leaves
 * the stump tucked inside the collar rather than a hole in the silhouette.
 *
 * This is what lets the first-person camera drop the head via layers while the
 * shadow camera keeps rendering it — impossible while head and body share one
 * primitive, because layers apply per object, not per vertex.
 *
 * @param {import('@gltf-transform/core').Document} document
 */
function splitHead(document) {
  const root = document.getRoot()
  const skin = root.listSkins()[0]
  if (!skin) throw new Error('no skin found — is this the rigged model?')

  const headJoints = new Set()
  skin.listJoints().forEach((joint, index) => {
    if (HEAD_BONE.test(joint.getName())) headJoints.add(index)
  })
  if (headJoints.size === 0) throw new Error('no head bones matched')

  for (const mesh of root.listMeshes()) {
    for (const primitive of mesh.listPrimitives()) {
      const joints = primitive.getAttribute('JOINTS_0')
      const weights = primitive.getAttribute('WEIGHTS_0')
      const indices = primitive.getIndices()
      if (!joints || !weights || !indices) continue

      const vertexCount = primitive.getAttribute('POSITION').getCount()
      const isHeadVertex = new Uint8Array(vertexCount)
      const j = [0, 0, 0, 0]
      const w = [0, 0, 0, 0]

      let headVertices = 0
      for (let v = 0; v < vertexCount; v++) {
        joints.getElement(v, j)
        weights.getElement(v, w)
        let weight = 0
        for (let k = 0; k < 4; k++) if (headJoints.has(j[k])) weight += w[k]
        if (weight > 0.5) {
          isHeadVertex[v] = 1
          headVertices++
        }
      }

      // Nothing to split: this primitive is entirely head or entirely body.
      if (headVertices === 0 || headVertices === vertexCount) continue

      const indexArray = indices.getArray()
      const headIndices = []
      const bodyIndices = []
      for (let t = 0; t < indexArray.length; t += 3) {
        const a = indexArray[t]
        const b = indexArray[t + 1]
        const c = indexArray[t + 2]
        // ANY head vertex sends the whole triangle to the head.
        const toHead = isHeadVertex[a] || isHeadVertex[b] || isHeadVertex[c]
        const target = toHead ? headIndices : bodyIndices
        target.push(a, b, c)
      }

      const IndexArrayType = indexArray.constructor
      const headPrimitive = primitive.clone()
      headPrimitive.setIndices(
        document.createAccessor().setArray(IndexArrayType.from(headIndices))
      )
      primitive.setIndices(
        document.createAccessor().setArray(IndexArrayType.from(bodyIndices))
      )

      // The head goes into its own mesh on its own node, not a second primitive
      // of the same mesh. three's GLTFLoader copies mesh-level extras into
      // userData but not primitive-level ones, so a tagged primitive would
      // arrive unidentifiable — whereas a named node is trivial to find.
      const headMesh = document.createMesh(HEAD_MESH_NAME).addPrimitive(headPrimitive)
      mesh.setName(BODY_MESH_NAME)

      for (const node of root.listNodes()) {
        if (node.getMesh() !== mesh) continue

        const headNode = document
          .createNode(HEAD_MESH_NAME)
          .setMesh(headMesh)
          .setSkin(node.getSkin())

        const parent = node.getParentNode()
        if (parent) parent.addChild(headNode)
        else for (const scene of root.listScenes()) scene.addChild(headNode)
      }

      console.log(
        `  split "${mesh.getName()}": head ${headIndices.length / 3} tris ` +
          `(own mesh "${HEAD_MESH_NAME}"), body ${bodyIndices.length / 3} tris`
      )
    }
  }
}

/**
 * Drop vertex-colour attributes that carry no information.
 *
 * glTF materials always multiply COLOR_0, so `prune` will not remove it even
 * when every vertex is pure white — and its presence makes three compile a
 * vertex-colour variant of the shader for no benefit. The values are checked
 * rather than assumed: a pack that did encode skin tone here would be damaged
 * by removing it.
 *
 * @param {import('@gltf-transform/core').Document} document
 */
function dropConstantVertexColors(document) {
  for (const mesh of document.getRoot().listMeshes()) {
    for (const primitive of mesh.listPrimitives()) {
      for (const semantic of primitive.listSemantics()) {
        if (!semantic.startsWith('COLOR_')) continue

        const attribute = primitive.getAttribute(semantic)
        const element = [0, 0, 0, 0]
        let constantWhite = true
        for (let i = 0; i < attribute.getCount() && constantWhite; i++) {
          attribute.getElement(i, element)
          for (let k = 0; k < attribute.getElementSize(); k++) {
            if (element[k] !== 1) {
              constantWhite = false
              break
            }
          }
        }

        if (constantWhite) {
          primitive.setAttribute(semantic, null)
          console.log(`  dropped ${semantic} on "${mesh.getName()}" (all white)`)
        } else {
          console.log(`  KEPT ${semantic} on "${mesh.getName()}" — carries data`)
        }
      }
    }
  }
}

/**
 * White baseColorFactor, so multiplying by a team colour at runtime produces the
 * texture tinted by exactly that colour and nothing else.
 * @param {import('@gltf-transform/core').Document} document
 */
function neutraliseBaseColor(document) {
  for (const material of document.getRoot().listMaterials()) {
    const factor = material.getBaseColorFactor()
    if (factor[0] !== 1 || factor[1] !== 1 || factor[2] !== 1) {
      material.setBaseColorFactor([1, 1, 1, factor[3]])
      console.log(`  neutralised baseColorFactor on "${material.getName()}"`)
    }
  }
}

/** @param {import('@gltf-transform/core').Document} document */
function countTriangles(document) {
  let total = 0
  for (const mesh of document.getRoot().listMeshes()) {
    for (const primitive of mesh.listPrimitives()) {
      const indices = primitive.getIndices()
      total += indices ? indices.getCount() / 3 : 0
    }
  }
  return total
}

/** @param {import('@gltf-transform/core').Document} document */
function listAttributes(document) {
  const set = new Set()
  for (const mesh of document.getRoot().listMeshes()) {
    for (const primitive of mesh.listPrimitives()) {
      for (const semantic of primitive.listSemantics()) set.add(semantic)
    }
  }
  return [...set].sort()
}

/**
 * @param {string} sourceName
 * @param {string} outputName
 */
async function processCharacter(sourceName, outputName) {
  console.log(`\n=== ${sourceName} ===`)
  const sourcePath = path.join(CHARACTER_DIR, sourceName)
  const patchedPath = repairTextureUris(sourcePath)

  const document = await io.read(patchedPath)
  if (patchedPath !== sourcePath) fs.unlinkSync(patchedPath)

  const before = {
    triangles: countTriangles(document),
    attributes: listAttributes(document),
    meshes: document.getRoot().listMeshes().length,
  }

  splitHead(document)
  dropConstantVertexColors(document)
  neutraliseBaseColor(document)

  await document.transform(
    dedup(),
    // keepAttributes: false drops vertex attributes no material actually reads.
    // The pack ships four UV sets and two colour attributes for the paid engine
    // shaders' customisable skin, none of which we use.
    prune({ keepAttributes: false, keepIndices: false, keepLeaves: false }),
    meshopt({ encoder: MeshoptEncoder })
  )

  const after = {
    triangles: countTriangles(document),
    attributes: listAttributes(document),
    primitives: document
      .getRoot()
      .listMeshes()
      .reduce((n, m) => n + m.listPrimitives().length, 0),
  }

  fs.mkdirSync(OUT, { recursive: true })
  const outputPath = path.join(OUT, outputName)
  await io.write(outputPath, document)

  const bytes = fs.statSync(outputPath).size
  console.log(`  triangles:  ${before.triangles} -> ${after.triangles}`)
  console.log(`  attributes: ${before.attributes.join(', ')}`)
  console.log(`           -> ${after.attributes.join(', ')}`)
  console.log(`  primitives: ${after.primitives}  (draw calls per character)`)
  console.log(`  written:    ${outputName}  ${(bytes / 1024).toFixed(0)} KB`)

  return { outputName, ...after, bytes }
}

/**
 * The animation library ships a mannequin mesh we do not need — the clips bind
 * to our character by bone name, so only the skeleton and the animations have
 * to survive. Dropping the mesh keeps the shared clip file small, and it is
 * loaded once and reused by every character instance.
 */
async function processAnimations() {
  console.log(`\n=== animations ===`)
  const document = await io.read(ANIMATION_GLB)
  const root = document.getRoot()

  const clips = root.listAnimations().map((a) => a.getName())

  for (const mesh of root.listMeshes()) mesh.dispose()
  for (const material of root.listMaterials()) material.dispose()
  for (const texture of root.listTextures()) texture.dispose()
  for (const skin of root.listSkins()) skin.dispose()

  await document.transform(
    dedup(),
    // keepLeaves is required: the bone hierarchy has no meshes now, and pruning
    // leaves would delete the very nodes the animation channels target.
    prune({ keepLeaves: true }),
    meshopt({ encoder: MeshoptEncoder })
  )

  fs.mkdirSync(OUT, { recursive: true })
  const outputPath = path.join(OUT, 'animations.glb')
  await io.write(outputPath, document)

  const bytes = fs.statSync(outputPath).size
  console.log(`  clips:   ${clips.length}`)
  console.log(`  written: animations.glb  ${(bytes / 1024).toFixed(0)} KB`)
  return { clips, bytes }
}

if (!fs.existsSync(CHARACTER_DIR)) {
  console.error(`source not found: ${CHARACTER_DIR}`)
  console.error('Extract the Quaternius packs into assets-src/ first.')
  process.exit(1)
}

await processCharacter('Superhero_Male_FullBody.gltf', 'character-male.glb')
await processCharacter('Superhero_Female_FullBody.gltf', 'character-female.glb')
await processAnimations()

console.log('\nNext: node tools/assets/compress-textures.mjs (needs KTX-Software)')
