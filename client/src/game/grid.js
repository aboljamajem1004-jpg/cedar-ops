import * as THREE from 'three'

const vertexShader = /* glsl */ `
  varying vec3 vWorld;
  varying float vViewDepth;

  void main() {
    vec4 worldPos = modelMatrix * vec4(position, 1.0);
    vWorld = worldPos.xyz;
    vec4 viewPos = viewMatrix * worldPos;
    vViewDepth = -viewPos.z;
    gl_Position = projectionMatrix * viewPos;
  }
`

const fragmentShader = /* glsl */ `
  uniform vec3 uMinorColor;
  uniform vec3 uMajorColor;
  uniform float uMinorSpacing;
  uniform float uMajorSpacing;
  uniform float uFadeStart;
  uniform float uFadeEnd;
  uniform float uFogNear;
  uniform float uFogFar;

  varying vec3 vWorld;
  varying float vViewDepth;

  // Coverage of a grid line for THIS pixel.
  //
  // fwidth(coord) is how much the grid coordinate changes across one pixel, so
  // dividing a world-space distance by it converts that distance into pixels.
  // The line therefore stays one pixel wide at any distance and any viewing
  // angle. A fixed world-space width is what causes crawling: in the distance
  // it shrinks below a pixel and each frame samples a different slice of it.
  float lineCoverage(vec2 p, float spacing) {
    vec2 coord = p / spacing;
    vec2 distToLine = abs(fract(coord - 0.5) - 0.5) / fwidth(coord);
    return 1.0 - min(min(distToLine.x, distToLine.y), 1.0);
  }

  void main() {
    float minor = lineCoverage(vWorld.xz, uMinorSpacing);
    float major = lineCoverage(vWorld.xz, uMajorSpacing);

    vec3 color = mix(uMinorColor, uMajorColor, major);
    float alpha = max(minor * 0.45, major * 0.9);

    // Two fades. The first dissolves the grid before the lines get packed
    // closer than a pixel, which no amount of antialiasing can resolve. The
    // second matches the scene fog so the grid does not float on top of it.
    alpha *= 1.0 - smoothstep(uFadeStart, uFadeEnd, vViewDepth);
    alpha *= 1.0 - smoothstep(uFogNear, uFogFar, vViewDepth);

    if (alpha < 0.002) discard;
    gl_FragColor = vec4(color, alpha);
  }
`

/**
 * Ground grid drawn as one analytically antialiased quad.
 *
 * This replaces THREE.GridHelper, which draws real line geometry. Thin lines
 * are the worst case for aliasing: MSAA only samples a few times per pixel, so
 * distant lines still crawl. Computing coverage in the shader is exact, costs
 * one quad instead of hundreds of line segments, and needs no texture.
 *
 * @param {{ size?: number, minorSpacing?: number, majorSpacing?: number,
 *           fadeStart: number, fadeEnd: number, fog: THREE.Fog }} opts
 */
export function createGrid({
  size = 400,
  minorSpacing = 2,
  majorSpacing = 10,
  fadeStart,
  fadeEnd,
  fog,
}) {
  const material = new THREE.ShaderMaterial({
    vertexShader,
    fragmentShader,
    transparent: true,
    depthWrite: false,
    uniforms: {
      uMinorColor: { value: new THREE.Color(0x6d7f8f) },
      uMajorColor: { value: new THREE.Color(0x9fb4c4) },
      uMinorSpacing: { value: minorSpacing },
      uMajorSpacing: { value: majorSpacing },
      uFadeStart: { value: fadeStart },
      uFadeEnd: { value: fadeEnd },
      uFogNear: { value: fog.near },
      uFogFar: { value: fog.far },
    },
  })

  const mesh = new THREE.Mesh(new THREE.PlaneGeometry(size, size), material)
  mesh.rotation.x = -Math.PI / 2
  mesh.position.y = 0.02 // clear of the ground plane, no z-fighting
  mesh.frustumCulled = false // it is centred on the world, always in view
  mesh.renderOrder = 1

  /** @param {number} start @param {number} end */
  mesh.userData.setFade = (start, end) => {
    material.uniforms.uFadeStart.value = start
    material.uniforms.uFadeEnd.value = end
  }

  return mesh
}
