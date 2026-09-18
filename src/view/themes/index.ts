import * as THREE from 'three';
import { createCrystalTheme } from './crystal';
import type { PieceAppearance, PieceVisual, ThemeId, ThemeRuntime } from './types';

export const THEMES: { id: ThemeId; name: string }[] = [
  { id: 'diagnostic', name: 'Diagnostic · clean lattice' },
  { id: 'luminous', name: 'Luminous · visual study' },
  { id: 'crystal', name: 'Crystal · optical study' },
];
const BLUE = 0x79d4ff, CORAL = 0xff8f89;

export function disposeVisual(root: THREE.Object3D): void {
  const geometries = new Set<THREE.BufferGeometry>(), materials = new Set<THREE.Material>();
  root.traverse(object => {
    if (object instanceof THREE.Mesh || object instanceof THREE.Line || object instanceof THREE.Points) {
      geometries.add(object.geometry);
      for (const material of Array.isArray(object.material) ? object.material : [object.material]) materials.add(material);
    }
  });
  geometries.forEach(g => g.dispose()); materials.forEach(m => m.dispose());
}

function pieceVisual(piece: PieceAppearance, luminous: boolean): PieceVisual {
  const object = new THREE.Group();
  const color = piece.owner === 'white' ? BLUE : CORAL;
  const geometry = {
    pawn: () => new THREE.IcosahedronGeometry(0.18, 1),
    rook: () => new THREE.BoxGeometry(0.36, 0.36, 0.36),
    bishop: () => new THREE.OctahedronGeometry(0.3),
    knight: () => new THREE.TorusKnotGeometry(0.16, 0.055, 40, 6, 2, 3),
    queen: () => new THREE.IcosahedronGeometry(0.24, 0),
    king: () => new THREE.OctahedronGeometry(0.22),
  }[piece.type]();
  const material = new THREE.MeshStandardMaterial({ color, emissive: color, emissiveIntensity: luminous ? 0.7 : 0.38,
    metalness: luminous ? 0.55 : 0.25, roughness: luminous ? 0.28 : 0.45, transparent: true, opacity: luminous ? 0.92 : 0.85 });
  object.add(new THREE.Mesh(geometry, material));
  object.add(new THREE.LineSegments(new THREE.EdgesGeometry(geometry), new THREE.LineBasicMaterial({ color, transparent: true, opacity: 0.9 })));
  if (piece.type === 'king' || (luminous && piece.type === 'rook')) {
    for (let axis = 0; axis < 3; axis++) {
      const sizes: [number, number, number] = [0.09, 0.09, 0.09]; sizes[axis] = piece.type === 'king' ? 0.67 : 0.5;
      object.add(new THREE.Mesh(new THREE.BoxGeometry(...sizes), material));
    }
  }
  if (piece.type === 'queen') {
    for (let axis = 0; axis < 3; axis++) {
      const ring = new THREE.Mesh(new THREE.TorusGeometry(0.33, 0.017, 4, 24), material);
      if (axis === 1) ring.rotation.x = Math.PI / 2;
      if (axis === 2) ring.rotation.y = Math.PI / 2;
      object.add(ring);
    }
  }
  if (luminous && (piece.type === 'bishop' || piece.type === 'knight')) {
    // A small topology hint inside one cell, never a substitute for the legal field.
    const directions = piece.type === 'bishop'
      ? [[-1, -1, -1], [-1, 1, 1], [1, -1, 1], [1, 1, -1]]
      : [[1, 0, 0], [-1, 0, 0], [0, 1, 0], [0, -1, 0], [0, 0, 1], [0, 0, -1]];
    const points = directions.map(v => new THREE.Vector3(...v).normalize().multiplyScalar(0.3));
    const nodes = new THREE.InstancedMesh(new THREE.IcosahedronGeometry(0.037), material, points.length);
    points.forEach((v, i) => nodes.setMatrixAt(i, new THREE.Matrix4().makeTranslation(v.x, v.y, v.z)));
    object.add(nodes);
  }
  if (luminous) {
    // A sparse fixed shell of tiny glints, readable from every side; no billboard silhouette.
    const points: number[] = [];
    for (let i = 0; i < 18; i++) {
      const y = 1 - 2 * (i + 0.5) / 18, r = Math.sqrt(1 - y * y), a = i * 2.39996;
      points.push(Math.cos(a) * r * 0.23, y * 0.23, Math.sin(a) * r * 0.23);
    }
    const glints = new THREE.Points(new THREE.BufferGeometry().setAttribute('position', new THREE.Float32BufferAttribute(points, 3)),
      new THREE.PointsMaterial({ color, size: 0.022, transparent: true, opacity: 0.7, depthWrite: false }));
    object.add(glints);
  }
  return { object, dispose: () => disposeVisual(object) };
}

export function createTheme(id: ThemeId): ThemeRuntime {
  if (id === 'crystal') return createCrystalTheme(createTheme('diagnostic'));
  const luminous = id === 'luminous';
  const root = new THREE.Group(); root.name = 'theme:' + id;
  root.add(new THREE.AmbientLight(0xcdeaff, luminous ? 1.1 : 2));
  const key = new THREE.DirectionalLight(0xffffff, luminous ? 1.8 : 3); key.position.set(5, 9, -7); root.add(key);
  const transient = new THREE.Group(); root.add(transient);
  let lastEffectFrame = -Infinity;
  let burst: { object: THREE.LineSegments; start: number } | null = null;
  let sparkle: THREE.ShaderMaterial | null = null;
  if (luminous) {
    const rim = new THREE.DirectionalLight(0x315dff, 2); rim.position.set(-5, -2, 4); root.add(rim);
    const points: number[] = [];
    // Deterministic environment outside the playing volume, not legal-looking cells inside it.
    for (let i = 0; i < 96; i++) {
      const y = 1 - 2 * (i + 0.5) / 96, r = Math.sqrt(1 - y * y), angle = i * 2.39996;
      points.push(Math.cos(angle) * r * 17, y * 17, Math.sin(angle) * r * 17);
    }
    sparkle = new THREE.ShaderMaterial({ transparent: true, depthWrite: false, uniforms: { time: { value: 0 } },
      vertexShader: 'varying float seed; void main(){ seed = position.x * 2.3 + position.y; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); gl_PointSize = 2.0; }',
      fragmentShader: 'uniform float time; varying float seed; void main(){ float d = length(gl_PointCoord - vec2(0.5)); float a = (1.0 - smoothstep(0.0, 0.5, d)) * (0.22 + 0.10 * sin(time * 0.7 + seed)); gl_FragColor = vec4(0.27, 0.51, 1.0, a); }',
    });
    root.add(new THREE.Points(new THREE.BufferGeometry().setAttribute('position', new THREE.Float32BufferAttribute(points, 3)), sparkle));
  }
  const clearTransient = () => { disposeVisual(transient); transient.clear(); burst = null; };
  return {
    id, root, background: luminous ? new THREE.Color(0x030711) : null,
    volume: { gridColor: luminous ? 0x548aba : 0x6aadd6, gridOpacity: luminous ? 0.06 : 0.075, edgeOpacity: luminous ? 0.28 : 0.42, homeOpacity: luminous ? 0.14 : 0.2 },
    motion: { durationMs: luminous ? 260 : 190, sample: t => 1 - (1 - t) ** 3 },
    createPiece: piece => pieceVisual(piece, luminous),
    onCue(cue, time) {
      if (!luminous || cue.kind !== 'capture') return;
      clearTransient();
      const object = new THREE.LineSegments(new THREE.EdgesGeometry(new THREE.OctahedronGeometry(0.24)),
        new THREE.LineBasicMaterial({ color: 0xffa94d, transparent: true, opacity: 0.6, depthWrite: false }));
      object.position.fromArray(cue.at); transient.add(object); burst = { object, start: time };
    },
    update(time, motionEnabled) {
      if (!motionEnabled) { if (burst) clearTransient(); return false; }
      if (!luminous || time - lastEffectFrame < 1000 / 30) return false;
      lastEffectFrame = time;
      if (sparkle) sparkle.uniforms.time.value = time / 1000;
      if (burst) {
        const t = Math.min((time - burst.start) / 350, 1);
        burst.object.scale.setScalar(1 + t * 1.2);
        (burst.object.material as THREE.LineBasicMaterial).opacity = 0.6 * (1 - t);
        if (t === 1) clearTransient();
      }
      return true;
    },
    clearTransient,
    dispose() { clearTransient(); disposeVisual(root); root.clear(); },
  };
}
