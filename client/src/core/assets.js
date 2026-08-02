import * as THREE from 'three'
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js'
import { KTX2Loader } from 'three/examples/jsm/loaders/KTX2Loader.js'
import { RGBELoader } from 'three/examples/jsm/loaders/RGBELoader.js'
import { MeshoptDecoder } from 'three/examples/jsm/libs/meshopt_decoder.module.js'

/**
 * Asset loading. One loader, one cache, shared by everything.
 *
 * KTX2 needs the Basis transcoder served from /basis/ — the textures are
 * compressed with it (CLAUDE.md §5.1) and the browser cannot decode them
 * otherwise. It also has to be told the renderer's capabilities so it can pick
 * a transcode target the GPU supports: ASTC on most phones, BC on desktop.
 */
export function createAssets(renderer) {
  const ktx2 = new KTX2Loader()
    .setTranscoderPath(`${import.meta.env.BASE_URL}basis/`)
    .detectSupport(renderer)

  const gltf = new GLTFLoader().setKTX2Loader(ktx2).setMeshoptDecoder(MeshoptDecoder)
  const rgbe = new RGBELoader()

  /** @type {Map<string, Promise<any>>} */
  const cache = new Map()

  /**
   * Load a .glb once. Repeat calls get the same promise, so eight characters
   * sharing a model download and parse it a single time.
   * @param {string} url
   */
  function loadModel(url) {
    const key = `model:${url}`
    if (!cache.has(key)) {
      cache.set(key, gltf.loadAsync(`${import.meta.env.BASE_URL}${url}`))
    }
    return cache.get(key)
  }

  /**
   * Load an HDRI and convert it to a prefiltered environment map.
   *
   * PMREM is the step that turns a plain image into something usable for PBR
   * reflections: it prefilters the map into mip levels matched to roughness, so
   * a rough surface samples a blurred version and a smooth one samples sharp.
   * Without it the environment cannot light a material correctly.
   *
   * @param {string} url
   */
  function loadEnvironment(url) {
    const key = `env:${url}`
    if (!cache.has(key)) {
      cache.set(
        key,
        rgbe.loadAsync(`${import.meta.env.BASE_URL}${url}`).then((texture) => {
          const pmrem = new THREE.PMREMGenerator(renderer)
          pmrem.compileEquirectangularShader()
          const target = pmrem.fromEquirectangular(texture)
          texture.dispose()
          pmrem.dispose()
          return target.texture
        })
      )
    }
    return cache.get(key)
  }

  function dispose() {
    ktx2.dispose()
    cache.clear()
  }

  return { loadModel, loadEnvironment, dispose }
}
