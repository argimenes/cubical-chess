import * as THREE from 'three';
import { createLuminousTheme } from './luminous';
import { disposeVisual } from './dispose';
export { disposeVisual } from './dispose';
import { createCrystalTheme } from './crystal';
import type { PieceAppearance, PieceVisual, ThemeId, ThemeRuntime } from './types';

export const THEMES: { id: ThemeId; name: string }[] = [
  { id: 'diagnostic', name: 'Diagnostic · clean lattice' },
  { id: 'luminous', name: 'Luminous · electric space' },
  { id: 'crystal', name: 'Crystal · optical study' },
];
const BLUE = 0x79d4ff, CORAL = 0xff8f89;


function pieceVisual(piece: PieceAppearance): PieceVisual {
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
  const material = new THREE.MeshStandardMaterial({ color, emissive: color, emissiveIntensity: 0.38,
    metalness: 0.25, roughness: 0.45, transparent: true, opacity: 0.85 });
  object.add(new THREE.Mesh(geometry, material));
  object.add(new THREE.LineSegments(new THREE.EdgesGeometry(geometry), new THREE.LineBasicMaterial({ color, transparent: true, opacity: 0.9 })));
  if (piece.type === 'king') {
    for (let axis = 0; axis < 3; axis++) {
      const sizes: [number, number, number] = [0.09, 0.09, 0.09]; sizes[axis] = 0.67;
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
  return { object, dispose: () => disposeVisual(object) };
}

export function createTheme(id: ThemeId): ThemeRuntime {
  if (id === 'crystal') return createCrystalTheme(createTheme('diagnostic'));
  if (id === 'luminous') return createLuminousTheme();
  const root = new THREE.Group(); root.name = 'theme:diagnostic';
  root.add(new THREE.AmbientLight(0xcdeaff, 2));
  const key = new THREE.DirectionalLight(0xffffff, 3); key.position.set(5, 9, -7); root.add(key);
  return {
    id, root, background: null,
    motion: { durationMs: 190, sample: t => 1 - (1 - t) ** 3 },
    createPiece: piece => pieceVisual(piece),
    onCue() {}, update: () => false, clearTransient() {},
    dispose() { disposeVisual(root); root.clear(); },
  };
}
