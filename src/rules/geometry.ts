import type { Cell, Vector } from './types';

export const SIZE = 8;
export const CELL_COUNT = SIZE ** 3;
export const inBounds = ([x, y, z]: Vector): boolean => [x, y, z].every(n => Number.isInteger(n) && n >= 0 && n < SIZE);
export function cell(x: number, y: number, z: number): Cell {
  if (!inBounds([x, y, z])) throw new Error('Cell is outside the cube: ' + [x, y, z]);
  return x + SIZE * y + SIZE * SIZE * z;
}
export function coordinates(index: Cell): Vector {
  if (!Number.isInteger(index) || index < 0 || index >= CELL_COUNT) throw new Error('Invalid cell index');
  return [index % SIZE, Math.floor(index / SIZE) % SIZE, Math.floor(index / (SIZE * SIZE))];
}
export function offset(index: Cell, [dx, dy, dz]: Vector, distance = 1): Cell | null {
  const [x, y, z] = coordinates(index);
  const target: Vector = [x + dx * distance, y + dy * distance, z + dz * distance];
  return inBounds(target) ? cell(...target) : null;
}
export const formatCell = (index: Cell): string => '(' + coordinates(index).join(', ') + ')';

export const QUEEN_DIRECTIONS: Vector[] = [];
for (const x of [-1, 0, 1]) for (const y of [-1, 0, 1]) for (const z of [-1, 0, 1]) {
  if (x || y || z) QUEEN_DIRECTIONS.push([x, y, z]);
}
export const ROOK_DIRECTIONS = QUEEN_DIRECTIONS.filter(v => v.filter(Boolean).length === 1);
export const BISHOP_DIRECTIONS = QUEEN_DIRECTIONS.filter(v => v.filter(Boolean).length >= 2);

export const KNIGHT_VECTORS: Vector[] = [];
for (let long = 0; long < 3; long++) for (let short = 0; short < 3; short++) {
  if (long === short) continue;
  for (const a of [-1, 1]) for (const b of [-1, 1]) {
    const v: [number, number, number] = [0, 0, 0];
    v[long] = 2 * a;
    v[short] = b;
    KNIGHT_VECTORS.push(v);
  }
}
