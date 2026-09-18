import * as THREE from 'three';
import type { CrystalEffects, PresentationPass, ThemeRuntime } from './types';

export const CRYSTAL_OFF: Readonly<CrystalEffects> = Object.freeze({ refraction: false, spectral: false, caustics: false, inclusions: false });
export const CRYSTAL_STUDY: Readonly<CrystalEffects> = Object.freeze({ refraction: true, spectral: true, caustics: true, inclusions: false });
type Vec = readonly [number, number, number];
const vector = (p: Vec) => new THREE.Vector3(...p);

/** Batches sparse triangles, ribbons and billboards. No textures, framebuffer copies or screen pass. */
class SurfaceBatch {
  private positions: number[] = [];
  private uvs: number[] = [];
  private seeds: number[] = [];
  private normals: number[] = [];
  private barycentrics: number[] = [];
  triangle(points: THREE.Vector3[], uv: number[][], seed: number): void {
    const normal = points[1].clone().sub(points[0]).cross(points[2].clone().sub(points[0])).normalize();
    points.forEach((p, i) => {
      this.positions.push(...p.toArray()); this.uvs.push(...uv[i]); this.seeds.push(seed);
      this.normals.push(...normal.toArray()); this.barycentrics.push(Number(i === 0), Number(i === 1), Number(i === 2));
    });
  }
  facet(a: Vec, b: Vec, c: Vec, seed: number): void {
    this.triangle([a, b, c].map(vector), [[0, 0], [1, 0], [0.5, 1]], seed);
  }
  quad(a: Vec, b: Vec, c: Vec, d: Vec, seed: number): void {
    this.triangle([a, b, c].map(vector), [[0, 0], [1, 0], [1, 1]], seed);
    this.triangle([a, c, d].map(vector), [[0, 0], [1, 1], [0, 1]], seed);
  }
  ribbon(a: Vec, b: Vec, width: number, seed: number, normal: Vec = [0.3, 1, 0.2]): void {
    const from = vector(a), to = vector(b), side = to.clone().sub(from).cross(vector(normal)).normalize().multiplyScalar(width / 2);
    const points = [from.clone().sub(side), from.clone().add(side), to.clone().add(side), to.clone().sub(side)];
    this.triangle([points[0], points[1], points[2]], [[0, -1], [0, 1], [1, 1]], seed);
    this.triangle([points[0], points[2], points[3]], [[0, -1], [1, 1], [1, -1]], seed);
  }
  glint(at: Vec, radius: number, seed: number): void {
    // Position is the centre; the vertex shader expands this quad in camera space.
    const p = vector(at);
    this.triangle([p, p, p], [[-radius, -radius], [radius, -radius], [radius, radius]], seed);
    this.triangle([p, p, p], [[-radius, -radius], [radius, radius], [-radius, radius]], seed);
  }
  geometry(): THREE.BufferGeometry {
    return new THREE.BufferGeometry()
      .setAttribute('position', new THREE.Float32BufferAttribute(this.positions, 3))
      .setAttribute('uv', new THREE.Float32BufferAttribute(this.uvs, 2))
      .setAttribute('normal', new THREE.Float32BufferAttribute(this.normals, 3))
      .setAttribute('seed', new THREE.Float32BufferAttribute(this.seeds, 1))
      .setAttribute('barycentric', new THREE.Float32BufferAttribute(this.barycentrics, 3));
  }
}

const vertexShader = `
  attribute float seed;
  attribute vec3 barycentric;
  varying vec2 localUV;
  varying vec3 bary, worldPoint, facetNormal;
  varying float phase, inclusionLight;
  void main() {
    localUV = uv; bary = barycentric; phase = seed;
    worldPoint = (modelMatrix * vec4(position, 1.0)).xyz;
    facetNormal = mat3(modelMatrix) * normal;
    vec4 p = modelViewMatrix * vec4(position, 1.0);
    #ifdef GLINT
      p.xy += uv;
    #endif
    gl_Position = projectionMatrix * p;
    inclusionLight = 1.0;
    #ifdef INCLUSION
      // All 512 cells exist, but only a few catch the light at any angle. Collapse
      // inactive faces before rasterisation instead of shading overlapping boxes.
      float angle = atan(cameraPosition.x, cameraPosition.z) + cameraPosition.y * 0.03;
      inclusionLight = smoothstep(0.985, 0.999, sin(seed * 2.39996 + angle * 2.0));
      if (inclusionLight < 0.01) gl_Position = vec4(2.0, 2.0, 2.0, 1.0);
    #endif
  }
`;
const shaderHeader = `
  uniform float time, inclusionsEnabled, spectralEnabled;
  varying vec2 localUV;
  varying vec3 bary, worldPoint, facetNormal;
  varying float phase, inclusionLight;
  vec3 rainbow(float t) {
    return pow(0.5 + 0.5 * cos(6.28318 * (t + vec3(0.0, -0.33, -0.67))), vec3(1.6));
  }
  void main() {
    if (inclusionsEnabled > 0.5 && phase >= 100.0 && phase < 1000.0) discard;
    vec3 eye = normalize(cameraPosition - worldPoint);
    vec3 color = vec3(0.0);
`;
const shaderFooter = `
    gl_FragColor = vec4(color, 1.0);
    #include <colorspace_fragment>
  }
`;
function material(body: string, glint = false): THREE.ShaderMaterial {
  return new THREE.ShaderMaterial({
    transparent: true, blending: THREE.AdditiveBlending, depthWrite: false,
    side: THREE.DoubleSide, toneMapped: false,
    uniforms: { time: { value: 0 }, inclusionsEnabled: { value: 0 }, spectralEnabled: { value: 0 } }, defines: glint ? { GLINT: 1 } : {}, vertexShader,
    fragmentShader: shaderHeader + body + shaderFooter,
  });
}

/** The compositor retains the existing protected piece/assistance pass, but has no optical screen pass. */
class CrystalStudy implements PresentationPass {
  readonly preservePieceSilhouettes = true;
  readonly root = new THREE.Group();
  private readonly facets = new THREE.Group();
  private readonly spectrum = new THREE.Group();
  private readonly caustics = new THREE.Group();
  private readonly inclusions = new THREE.Group();
  private readonly materials: THREE.ShaderMaterial[] = [];
  private effects: CrystalEffects = { ...CRYSTAL_STUDY };
  private lastTime: number | null = null;
  private lastFrame = -Infinity;
  private opticalTime = 0;

  constructor() {
    this.root.name = 'crystal:localized-optics';
    this.root.add(this.facets, this.spectrum, this.caustics, this.inclusions);
    const facets = new SurfaceBatch(), reflections = new SurfaceBatch(), spectral = new SurfaceBatch();
    const caustics = new SurfaceBatch(), glints = new SurfaceBatch();
    let seed = 0;
    // One watertight cubical cut: six broad faces, twelve connecting bevels,
    // eight triangular corner cuts. Every facet shares vertices with its neighbours.
    const face = 4, bevel = 3.48;
    const at = (axis: number, depth: number, u: number, v: number): Vec => {
      const p = [0, 0, 0]; p[axis] = depth; p[(axis + 1) % 3] = u; p[(axis + 2) % 3] = v;
      return p as [number, number, number];
    };
    for (let axis = 0; axis < 3; axis++) for (const sign of [-1, 1]) {
      facets.quad(at(axis, sign * face, -bevel, -bevel), at(axis, sign * face, bevel, -bevel),
        at(axis, sign * face, bevel, bevel), at(axis, sign * face, -bevel, bevel), -1);
    }
    for (let axis = 0; axis < 3; axis++) for (const u of [-1, 1]) for (const v of [-1, 1]) {
      const a = at(axis, -bevel, u * face, v * bevel), b = at(axis, bevel, u * face, v * bevel);
      const c = at(axis, bevel, u * bevel, v * face), d = at(axis, -bevel, u * bevel, v * face);
      facets.quad(a, b, c, d, seed++);
      // Local streaks catch only part of an edge; the centre stays open and dark.
      const start = vector(a).lerp(vector(b), 0.12).toArray() as [number, number, number];
      const end = vector(a).lerp(vector(b), 0.62).toArray() as [number, number, number];
      if (seed % 3 !== 0) spectral.ribbon(start, end, 0.32, seed, at(axis, 0, u, v));
      if (seed % 2 === 0) caustics.ribbon(d, c, 0.19, seed, at(axis, 0, u, v));
    }
    for (const x of [-1, 1]) for (const y of [-1, 1]) for (const z of [-1, 1]) {
      const a: Vec = [x * face, y * bevel, z * bevel];
      const b: Vec = [x * bevel, y * face, z * bevel];
      const c: Vec = [x * bevel, y * bevel, z * face];
      facets.facet(a, b, c, seed++);
      spectral.ribbon(a, b, 0.4, seed++, [x, y, z]);
      glints.glint(a, 0.65, seed++); glints.glint(c, 0.34, seed++);
    }
    // Broad internal cleavage planes terminate on the shared outer faces. There
    // are no detached little solids: the optical seams belong to this one volume.
    const fractures: Vec[][] = [
      [[-3.48, 3.48, -4], [3.48, 4, -3.48], [4, -2.2, 3.48], [-3.48, -4, 2.1]],
      [[-4, -2.7, -3.48], [-3.48, 4, 1.7], [3.48, 1.4, 4], [1.9, -4, 3.48]],
    ];
    seed = 100; // internal fracture optics are replaced when comparing cell inclusions
    for (const [a, b, c, d] of fractures) {
      facets.facet(a, b, d, seed++); facets.facet(b, c, d, seed++);
      const junction = vector(b).lerp(vector(d), 0.42).toArray() as [number, number, number];
      const start = vector(b).lerp(vector(d), 0.17).toArray() as [number, number, number];
      const end = vector(b).lerp(vector(d), 0.67).toArray() as [number, number, number];
      spectral.ribbon(start, end, 0.34, seed++);
      caustics.ribbon(a, junction, 0.26, seed++);
      reflections.ribbon(junction, c, 0.06, seed++);
      glints.glint(junction, 0.5, seed++);
    }
    this.add(this.facets, facets, material(`
      vec3 aa = max(fwidth(bary), vec3(0.0001));
      vec3 interior = smoothstep(vec3(0.0), aa * 1.1, bary);
      float edge = 1.0 - min(min(interior.x, interior.y), interior.z);
      if (phase < 0.0) {
        // The broad outer faces are almost clear; suppress their triangulation seam.
        vec2 aaUV = max(fwidth(localUV), vec2(0.0001));
        vec2 frame = smoothstep(vec2(0.0), aaUV * 1.2, min(localUV, 1.0 - localUV));
        edge = 1.0 - min(frame.x, frame.y);
      }
      float facing = abs(dot(eye, normalize(facetNormal)));
      float flash = pow(max(0.0, cos(facing * 10.0 + phase * 1.7)), 22.0);
      float split = smoothstep(0.44, 0.45, localUV.x + localUV.y * 0.3);
      float fill = phase < 0.0 ? 0.0006 : 0.003 + split * 0.007 + flash * 0.03;
      color = vec3(0.22, 0.5, 0.78) * fill;
      color += vec3(0.45, 0.8, 1.0) * edge * (0.12 + flash * 0.8);
    `));
    this.add(this.facets, reflections, material(`
      float edge = pow(max(0.0, 1.0 - abs(localUV.y)), 5.0);
      float ends = sin(localUV.x * 3.14159);
      color = vec3(0.35, 0.7, 1.0) * edge * ends * 0.8;
    `));
    this.add(this.spectrum, spectral, material(`
      float taper = smoothstep(0.0, 0.1, localUV.x) * smoothstep(0.0, 0.24, 1.0 - localUV.x);
      float band = pow(max(0.0, 1.0 - abs(localUV.y)), 0.45);
      float angle = dot(eye, normalize(facetNormal));
      vec3 prism = rainbow(localUV.y * 0.48 + phase * 0.19 + angle * 0.16);
      float fine = 0.7 + 0.3 * pow(0.5 + 0.5 * cos(localUV.y * 50.0), 8.0);
      color = prism * band * taper * fine * (0.65 + 0.6 * pow(abs(angle), 3.0));
    `));
    this.add(this.caustics, caustics, material(`
      float crossBand = exp(-pow(localUV.y * 5.0, 2.0));
      float core = exp(-pow(localUV.y * 23.0, 2.0));
      float pulse = pow(0.5 + 0.5 * cos(localUV.x * 9.0 - time * 1.5 + phase), 10.0);
      float ends = sin(localUV.x * 3.14159);
      color = (vec3(0.1, 0.55, 1.0) * crossBand * 0.5 + vec3(0.7, 0.9, 1.0) * core * 2.0) * ends * (0.4 + pulse * 2.5);
    `));
    this.add(this.caustics, glints, material(`
      vec2 p = localUV;
      float r = length(p);
      float angle = dot(eye, normalize(vec3(sin(phase), cos(phase * 1.3), sin(phase * 0.7))));
      float flash = 0.2 + 0.8 * pow(0.5 + 0.5 * sin(phase * 2.3 + angle * 13.0 + time * 0.7), 12.0);
      float crossLight = exp(-abs(p.x * p.y) * 1200.0) * exp(-r * 10.0);
      float core = exp(-r * r * 2600.0);
      vec3 fringe = rainbow(r * 9.0 + phase * 0.1);
      color = (vec3(0.6, 0.85, 1.0) * crossLight * 1.9 + vec3(core * 4.0) + fringe * exp(-r * 25.0) * 0.25) * flash;
    `, true));
    const cells = new SurfaceBatch();
    for (let x = 0; x < 8; x++) for (let y = 0; y < 8; y++) for (let z = 0; z < 8; z++) {
      const centre = new THREE.Vector3(x - 3.5, y - 3.5, z - 3.5);
      const corner = (axis: number, side: number, u: number, v: number): Vec =>
        vector(at(axis, side * 0.49, u * 0.49, v * 0.49)).add(centre).toArray() as [number, number, number];
      for (let axis = 0; axis < 3; axis++) for (const side of [-1, 1]) {
        cells.quad(corner(axis, side, -1, -1), corner(axis, side, 1, -1),
          corner(axis, side, 1, 1), corner(axis, side, -1, 1), 1000 + x + y * 8 + z * 64);
      }
    }
    const cellMaterial = material(`
      vec3 bound = abs(worldPoint);
      if (max(max(bound.x + bound.y, bound.x + bound.z), bound.y + bound.z) > 7.48 || bound.x + bound.y + bound.z > 10.96) discard;
      vec2 distanceToEdge = min(localUV, 1.0 - localUV);
      vec2 edgeAA = max(fwidth(localUV), vec2(0.0001));
      float edge = 1.0 - min(smoothstep(0.0, edgeAA.x * 1.1, distanceToEdge.x), smoothstep(0.0, edgeAA.y * 1.1, distanceToEdge.y));
      float facing = abs(dot(eye, normalize(facetNormal)));
      float split = pow(max(0.0, 1.0 - abs(localUV.x + localUV.y * 0.27 - 0.65) * 16.0), 4.0);
      color = (vec3(0.18, 0.46, 0.7) * (0.005 + edge * 0.15) + rainbow(localUV.x * 0.6 + facing * 0.3) * split * 0.22 * spectralEnabled) * inclusionLight;
    `);
    cellMaterial.defines.INCLUSION = 1;
    this.add(this.inclusions, cells, cellMaterial);
    this.setEffects(CRYSTAL_STUDY);
  }
  private add(group: THREE.Group, batch: SurfaceBatch, shader: THREE.ShaderMaterial): void {
    const mesh = new THREE.Mesh(batch.geometry(), shader);
    mesh.frustumCulled = false; // glint vertices expand in the shader; bounded world-space batches
    mesh.renderOrder = -1;
    group.add(mesh); this.materials.push(shader);
  }
  get enabled(): boolean { return Object.values(this.effects).some(Boolean); }
  setEffects(effects: CrystalEffects): void {
    this.effects = { ...effects };
    this.facets.visible = effects.refraction; this.spectrum.visible = effects.spectral; this.caustics.visible = effects.caustics; this.inclusions.visible = effects.inclusions;
    this.opticalTime = 0; this.lastTime = null; this.lastFrame = -Infinity;
    this.materials.forEach(m => { m.uniforms.time.value = 0; m.uniforms.inclusionsEnabled.value = Number(effects.inclusions); m.uniforms.spectralEnabled.value = Number(effects.spectral); });
  }
  getEffects(): CrystalEffects { return { ...this.effects }; }
  update(time: number, animated: boolean): boolean {
    const dt = this.lastTime === null ? 0 : Math.min(Math.max(time - this.lastTime, 0), 100);
    this.lastTime = time;
    if (!animated || !this.effects.caustics) return false;
    this.opticalTime += dt / 1000;
    if (time - this.lastFrame < 1000 / 24) return false;
    this.lastFrame = time;
    this.materials.forEach(m => { m.uniforms.time.value = this.opticalTime; });
    return true;
  }
  render(renderer: THREE.WebGLRenderer, scene: THREE.Scene, camera: THREE.Camera): void {
    renderer.setRenderTarget(null); renderer.render(scene, camera);
  }
  resize(): void { /* World-space optics have no resolution-dependent allocations. */ }
  dispose(): void {
    // Assets are attached to base.root and disposed once by the theme, not by this compositor.
  }
}

export function createCrystalTheme(base: ThemeRuntime): ThemeRuntime {
  const study = new CrystalStudy();
  base.root.name = 'theme:crystal'; base.root.add(study.root);
  base.root.traverse(object => { if (object instanceof THREE.Light) object.layers.enable(2); });
  return {
    ...base, id: 'crystal', background: new THREE.Color(0x020611), postprocessing: study, markerBackdrop: 0x020611,
    optical: { set: effects => study.setEffects(effects), get: () => study.getEffects() },
    createPiece(piece) {
      const visual = base.createPiece(piece);
      // Opaque semantic silhouettes keep bright optical events from bleeding through a piece.
      visual.object.traverse(object => {
        if (object instanceof THREE.Mesh && object.material instanceof THREE.MeshStandardMaterial) {
          object.material.transparent = false; object.material.opacity = 1;
        }
      });
      return visual;
    },
    update: (time, animated) => study.update(time, animated),
  };
}
