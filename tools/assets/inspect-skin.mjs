/**
 * Answers one question: can the head be hidden by not rendering a mesh, or does
 * it require scaling the head bone?
 *
 * If the head lives in the same skinned mesh as the body, three's layer system
 * cannot exclude it from the first-person camera, and the fallback is scaling
 * the head bone to zero — which also removes the head from the shadow.
 *
 * Usage: node tools/assets/inspect-skin.mjs <file.gltf|glb>
 */
import { NodeIO } from '@gltf-transform/core'

const path = process.argv[2]
if (!path) {
  console.error('usage: node tools/assets/inspect-skin.mjs <file>')
  process.exit(1)
}

const document = await new NodeIO().read(path)
const root = document.getRoot()

const skin = root.listSkins()[0]
const joints = skin.listJoints()
const jointNames = joints.map((j) => j.getName())

// Bones from the neck up. Anything weighted to these is "head" for our purposes.
const headPattern = /^(head|neck|face|jaw|eye|brow|hair)/i
const headJointIndices = new Set(
  jointNames.map((name, i) => (headPattern.test(name) ? i : -1)).filter((i) => i >= 0)
)

console.log(`joints: ${joints.length}`)
console.log(`head-region joints: ${[...headJointIndices].map((i) => jointNames[i]).join(', ')}`)
console.log('')

for (const mesh of root.listMeshes()) {
  for (const primitive of mesh.listPrimitives()) {
    const jointsAttr = primitive.getAttribute('JOINTS_0')
    const weightsAttr = primitive.getAttribute('WEIGHTS_0')
    const position = primitive.getAttribute('POSITION')
    const vertexCount = position.getCount()

    let headVerts = 0
    let bodyVerts = 0

    if (jointsAttr && weightsAttr) {
      const j = [0, 0, 0, 0]
      const w = [0, 0, 0, 0]
      for (let v = 0; v < vertexCount; v++) {
        jointsAttr.getElement(v, j)
        weightsAttr.getElement(v, w)
        let headWeight = 0
        for (let k = 0; k < 4; k++) if (headJointIndices.has(j[k])) headWeight += w[k]
        if (headWeight > 0.5) headVerts++
        else bodyVerts++
      }
    }

    const bbox = position.getMinMax ? null : null
    const min = position.getMin([])
    const max = position.getMax([])

    console.log(`mesh "${mesh.getName()}"`)
    console.log(`  triangles:     ${primitive.getIndices().getCount() / 3}`)
    console.log(`  vertices:      ${vertexCount}`)
    console.log(`  head-weighted: ${headVerts}  body-weighted: ${bodyVerts}`)
    console.log(`  y range:       ${min[1].toFixed(2)} .. ${max[1].toFixed(2)}`)
    console.log(`  material:      ${primitive.getMaterial()?.getName() ?? 'none'}`)
    console.log('')
  }
}

// The question is not "is there a mesh up high" — hair and eyes are separate
// meshes sitting at head height and would pass that test while telling us
// nothing. It is "does any mesh mix head-weighted and body-weighted vertices".
// If one does, the head cannot be excluded per-object, because layers apply to
// whole objects and not to vertices.
console.log('VERDICT:')
let mixed = null
for (const mesh of root.listMeshes()) {
  for (const primitive of mesh.listPrimitives()) {
    const jointsAttr = primitive.getAttribute('JOINTS_0')
    const weightsAttr = primitive.getAttribute('WEIGHTS_0')
    if (!jointsAttr || !weightsAttr) continue

    let head = 0
    let body = 0
    const j = [0, 0, 0, 0]
    const w = [0, 0, 0, 0]
    for (let v = 0; v < primitive.getAttribute('POSITION').getCount(); v++) {
      jointsAttr.getElement(v, j)
      weightsAttr.getElement(v, w)
      let hw = 0
      for (let k = 0; k < 4; k++) if (headJointIndices.has(j[k])) hw += w[k]
      if (hw > 0.5) head++
      else body++
    }
    if (head > 0 && body > 0) mixed = { name: mesh.getName(), head, body }
  }
}

if (mixed) {
  console.log(
    `  Head is INSIDE mesh "${mixed.name}" (${mixed.head} head-weighted vertices ` +
      `alongside ${mixed.body} body ones).`
  )
  console.log('  Camera layers cannot hide it — layers are per object, not per vertex.')
  console.log('  Options: scale the head bone (headless shadow), or split the mesh')
  console.log('  into head and body primitives in the asset pipeline (+1 draw call).')
} else {
  console.log('  Head is a separate mesh — camera layers work, shadows stay intact.')
}
