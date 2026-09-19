import { cell } from './geometry';
import { createState } from './engine';
import type { GameState, Piece, PieceType, PlayerId, ProfileId } from './types';

export type SetupId = 'outer-planes' | 'spatial-study' | 'king-safety' | 'promotion';
export const SETUPS: { id: SetupId; name: string; description: string }[] = [
  { id: 'outer-planes', name: 'Opposing planes', description: 'Two armies. Eight layers. Meet in the middle.' },
  { id: 'spatial-study', name: 'Spatial study', description: 'A sparse position for exploring rays, jumps and depth.' },
  { id: 'king-safety', name: 'King safety', description: 'The white rook shields its king along a body diagonal.' },
  { id: 'promotion', name: 'Promotion study', description: 'Reach the far home plane to choose a new piece.' },
];

export function createSetup(id: SetupId, profile: ProfileId = 'prototype-1'): GameState {
  const pieces: Omit<Piece, 'id'>[] = [];
  const add = (owner: PlayerId, type: PieceType, x: number, y: number, z: number) => pieces.push({ owner, type, cell: cell(x, y, z) });
  if (id === 'outer-planes') {
    const rank: PieceType[] = ['rook', 'knight', 'bishop', 'queen', 'king', 'bishop', 'knight', 'rook'];
    for (const owner of ['white', 'black'] as const) {
      const white = owner === 'white';
      rank.forEach((type, x) => add(owner, type, x, white ? 0 : 7, white ? 0 : 7));
      for (let x = 0; x < 8; x++) {
        add(owner, 'pawn', x, white ? 1 : 6, white ? 0 : 7);
        add(owner, 'pawn', x, white ? 1 : 6, white ? 1 : 6);
        add(owner, 'pawn', x, white ? 0 : 7, white ? 1 : 6);
      }
    }
  } else if (id === 'spatial-study') {
    add('white', 'king', 0, 0, 0); add('black', 'king', 7, 7, 7);
    add('white', 'knight', 3, 3, 3); add('white', 'rook', 1, 2, 1);
    add('white', 'bishop', 5, 1, 2); add('white', 'pawn', 2, 4, 2);
    add('black', 'rook', 6, 5, 6); add('black', 'bishop', 2, 6, 5);
    add('black', 'knight', 4, 5, 4); add('black', 'pawn', 4, 3, 5);
  } else if (id === 'king-safety') {
    add('white', 'king', 0, 0, 0); add('black', 'king', 7, 0, 7);
    add('white', 'rook', 2, 2, 2); add('black', 'bishop', 6, 6, 6);
    add('white', 'knight', 1, 4, 1);
  } else {
    add('white', 'king', 0, 0, 0); add('black', 'king', 7, 7, 7);
    add('white', 'pawn', 3, 3, 6); add('black', 'rook', 4, 3, 7);
    add('black', 'pawn', 5, 5, 1);
  }
  return createState(pieces, profile);
}
