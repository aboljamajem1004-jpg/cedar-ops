/**
 * Downscale the source PNGs before anything else touches them.
 *
 *   node tools/assets/resize-textures.mjs
 *
 * This is a separate process on purpose. Two different sharp versions live in
 * the dependency tree — a hoisted 0.34.5 and a 0.35.3 nested under
 * ndarray-pixels, which @gltf-transform/functions imports. Loading both into
 * one process puts two libvips builds in the same address space and corrupts
 * the shared type registry, which surfaces as:
 *
 *   value "32" of type 'gint' is invalid for property 'space' of VipsInterpretation
 *   error: colourspace: parameter space not set
 *
 * The identical resize works fine when sharp is the only libvips in the
 * process, so the fix is isolation rather than a different image library.
 *
 * Writes into a sibling directory so the originals are never modified, and the
 * whole step is repeatable.
 */
import fs from 'node:fs'
import path from 'node:path'
import sharp from 'sharp'

const ROOT = path.resolve(import.meta.dirname, '..', '..')
const CHARACTER_DIR = path.join(ROOT, 'assets-src', 'characters', 'Base Characters', 'Godot - UE')

/** Texture edge length. Override with TEXTURE_SIZE=2048 to compare. */
export const TEXTURE_SIZE = Number(process.env.TEXTURE_SIZE || 1024)
export const outputDirFor = (size = TEXTURE_SIZE) => `.resized-${size}`

const outDir = path.join(CHARACTER_DIR, outputDirFor())

if (!fs.existsSync(CHARACTER_DIR)) {
  console.error(`source not found: ${CHARACTER_DIR}`)
  process.exit(1)
}

fs.mkdirSync(outDir, { recursive: true })

const files = fs.readdirSync(CHARACTER_DIR).filter((f) => /\.png$/i.test(f))
let resized = 0
let copied = 0

for (const file of files) {
  const input = path.join(CHARACTER_DIR, file)
  const output = path.join(outDir, file)

  const meta = await sharp(input).metadata()
  const target = Math.min(TEXTURE_SIZE, meta.width, meta.height)

  if (target >= meta.width && target >= meta.height) {
    // Already small enough — the 256² eye maps must not be upscaled.
    fs.copyFileSync(input, output)
    copied++
    continue
  }

  await sharp(input)
    .resize(target, target, { fit: 'fill' })
    .png({ compressionLevel: 9 })
    .toFile(output)

  const before = fs.statSync(input).size
  const after = fs.statSync(output).size
  console.log(
    `  ${file}  ${meta.width}x${meta.height} -> ${target}x${target}  ` +
      `${(before / 1048576).toFixed(1)} MB -> ${(after / 1048576).toFixed(1)} MB`
  )
  resized++
}

console.log(`\nresized ${resized}, copied ${copied} into ${outputDirFor()}/`)
