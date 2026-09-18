export type PlayerId = 'white' | 'black';
export type PieceType = 'pawn' | 'rook' | 'bishop' | 'knight' | 'queen' | 'king';
export type Promotion = Exclude<PieceType, 'pawn' | 'king'>;
export type Cell = number;
export type Vector = readonly [number, number, number];
export type ProfileId = 'prototype-1' | 'prototype-1-three';

export interface Piece {
  id: number;
  owner: PlayerId;
  type: PieceType;
  cell: Cell | null;
}

export interface Move {
  pieceId: number;
  from: Cell;
  to: Cell;
  capturedId: number | null;
  promotion?: Promotion;
  kind: 'slide' | 'jump' | 'step';
  /** For sliders, all traversed cells including the destination. No path implies a jump. */
  path: Cell[];
}

export type GameStatus =
  | { kind: 'playing'; check: boolean }
  | { kind: 'checkmate'; winner: PlayerId }
  | { kind: 'draw'; reason: 'stalemate' | 'repetition' | 'no-progress' | 'kings-only' };

export interface GameState {
  profile: ProfileId;
  players: readonly PlayerId[];
  turnIndex: number;
  board: Int16Array;
  pieces: Piece[];
  noProgress: number;
  ply: number;
  positionKeys: string[];
}

export interface UndoRecord {
  move: Move;
  previousType: PieceType;
  turnIndex: number;
  noProgress: number;
  ply: number;
  keyCount: number;
}

export interface RuleProfile {
  id: ProfileId;
  name: string;
  backwardPawn: boolean;
  promotionPlane: Record<PlayerId, number>;
}

export const PROFILES: Record<ProfileId, RuleProfile> = {
  'prototype-1': { id: 'prototype-1', name: 'Four-direction pawns', backwardPawn: true, promotionPlane: { white: 7, black: 0 } },
  'prototype-1-three': { id: 'prototype-1-three', name: 'Three-direction pawns', backwardPawn: false, promotionPlane: { white: 7, black: 0 } },
};

export const PROMOTIONS: readonly Promotion[] = ['queen', 'rook', 'bishop', 'knight'];
export const PIECE_LETTERS: Record<PieceType, string> = { pawn: 'P', rook: 'R', bishop: 'B', knight: 'N', queen: 'Q', king: 'K' };
