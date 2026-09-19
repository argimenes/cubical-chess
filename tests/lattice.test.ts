import { expect, it } from 'vitest';
import * as THREE from 'three';
import { LatticeView } from '../src/view/lattice';

it('frosted lines cover all twelve edges of every one of the 512 cells, including internal cells', () => {
  const lattice = new LatticeView();
  lattice.setMode('structural');
  lattice.setFrosted(true);
  const frost = lattice.root.getObjectByName('lattice:frosted-cells') as THREE.LineSegments;
  expect(frost.visible).toBe(true);
  const positions = frost.geometry.getAttribute('position');
  const interior = frost.geometry.getAttribute('interiorLine');
  const edges = new Set<string>();
  const key = (a: number[], b: number[]) => [a.join(','), b.join(',')].sort().join('|');
  let internalEdges = 0;
  for (let i = 0; i < positions.count; i += 2) {
    const a = [positions.getX(i), positions.getY(i), positions.getZ(i)];
    const b = [positions.getX(i + 1), positions.getY(i + 1), positions.getZ(i + 1)];
    const axis = a.findIndex((value, j) => value !== b[j]);
    for (let step = 0; step < 8; step++) {
      const from = [...a], to = [...a];
      from[axis] += step; to[axis] += step + 1;
      edges.add(key(from, to));
      if (interior.getX(i) === 1) internalEdges++;
    }
  }
  expect(edges.size).toBe(1944); // Shared edges are drawn once, not once per adjacent cell.
  expect(internalEdges).toBe(1176);
  for (let x = -4; x < 4; x++) for (let y = -4; y < 4; y++) for (let z = -4; z < 4; z++) {
    for (let axis = 0; axis < 3; axis++) for (const sideA of [0, 1]) for (const sideB of [0, 1]) {
      const from = [x, y, z];
      from[(axis + 1) % 3] += sideA; from[(axis + 2) % 3] += sideB;
      const to = [...from]; to[axis]++;
      expect(edges.has(key(from, to))).toBe(true);
    }
  }
  lattice.setFrosted(false);
  expect(frost.visible).toBe(false);
  expect(lattice.metrics().mode).toBe('structural');
  lattice.dispose();
});
