import { BISHOP_DIRECTIONS, CELL_COUNT, coordinates, KNIGHT_VECTORS, offset, QUEEN_DIRECTIONS, ROOK_DIRECTIONS } from './geometry';
import { PROFILES, PROMOTIONS, type Cell, type GameState, type GameStatus, type Move, type Piece, type PieceType, type PlayerId, type ProfileId, type UndoRecord, type Vector } from './types';

export function createState(pieces: Omit<Piece, 'id'>[], profile: ProfileId = 'prototype-1', side: PlayerId = 'white'): GameState {
  const board = new Int16Array(CELL_COUNT).fill(-1);
  const table = pieces.map((piece, id) => ({ ...piece, id }));
  for (const piece of table) {
    if (piece.cell === null) continue;
    coordinates(piece.cell);
    if (board[piece.cell] !== -1) throw new Error('Overlapping pieces');
    board[piece.cell] = piece.id;
  }
  for (const owner of ['white', 'black'] as const) {
    if (table.filter(p => p.owner === owner && p.type === 'king' && p.cell !== null).length !== 1) throw new Error('Each player needs exactly one king');
  }
  const state: GameState = { profile, players: ['white', 'black'], turnIndex: side === 'white' ? 0 : 1, board, pieces: table, noProgress: 0, ply: 0, positionKeys: [] };
  state.positionKeys.push(positionKey(state));
  return state;
}

export const sideToMove = (state: GameState): PlayerId => state.players[state.turnIndex];
export const enemyOf = (state: GameState, owner: PlayerId): PlayerId => state.players.find(p => p !== owner)!;
export function pieceAt(state: GameState, target: Cell): Piece | undefined {
  return state.pieces[state.board[target]];
}

export function pawnVectors(state: GameState, owner: PlayerId, attacks: boolean): Vector[] {
  const forward = owner === 'white' ? 1 : -1;
  const ys = PROFILES[state.profile].backwardPawn ? [-1, 1] : [forward];
  const quiet: Vector[] = [...ys.map(y => [0, y, 0] as Vector), [0, 0, -1], [0, 0, 1]];
  return attacks ? quiet.flatMap(([_, y, z]) => [[-1, y, z], [1, y, z]] as Vector[]) : quiet;
}

function directions(type: PieceType): Vector[] {
  if (type === 'rook') return ROOK_DIRECTIONS;
  if (type === 'bishop') return BISHOP_DIRECTIONS;
  return QUEEN_DIRECTIONS;
}

/** Geometric attacks include a friendly occupied endpoint and ignore pins. */
export function attackCells(state: GameState, piece: Piece): Cell[] {
  if (piece.cell === null) return [];
  if (piece.type === 'pawn' || piece.type === 'knight' || piece.type === 'king') {
    const vectors = piece.type === 'pawn' ? pawnVectors(state, piece.owner, true) : piece.type === 'knight' ? KNIGHT_VECTORS : QUEEN_DIRECTIONS;
    return vectors.map(v => offset(piece.cell!, v)).filter((c): c is number => c !== null);
  }
  const result: Cell[] = [];
  for (const v of directions(piece.type)) {
    for (let n = 1; n < 8; n++) {
      const target = offset(piece.cell, v, n);
      if (target === null) break;
      result.push(target);
      if (state.board[target] !== -1) break;
    }
  }
  return result;
}

export function isCellAttacked(state: GameState, target: Cell, by: PlayerId): boolean {
  return state.pieces.some(p => p.owner === by && p.cell !== null && attackCells(state, p).includes(target));
}

export function isInCheck(state: GameState, owner: PlayerId): boolean {
  const king = state.pieces.find(p => p.owner === owner && p.type === 'king' && p.cell !== null);
  if (!king || king.cell === null) throw new Error('King missing');
  return isCellAttacked(state, king.cell, enemyOf(state, owner));
}

export function pseudoMoves(state: GameState, piece: Piece): Move[] {
  if (piece.cell === null) return [];
  const result: Move[] = [];
  function append(to: Cell, kind: Move['kind'], path: Cell[]) {
    const occupant = pieceAt(state, to);
    if (occupant && (occupant.owner === piece.owner || occupant.type === 'king')) return;
    const move: Move = { pieceId: piece.id, from: piece.cell!, to, capturedId: occupant?.id ?? null, kind, path: [...path] };
    if (piece.type === 'pawn' && coordinates(to)[2] === PROFILES[state.profile].promotionPlane[piece.owner]) {
      for (const promotion of PROMOTIONS) result.push({ ...move, promotion });
    } else result.push(move);
  }

  if (piece.type === 'pawn') {
    for (const v of pawnVectors(state, piece.owner, false)) {
      const target = offset(piece.cell, v);
      if (target !== null && state.board[target] === -1) append(target, 'step', [target]);
    }
    for (const target of attackCells(state, piece)) {
      if (pieceAt(state, target)?.owner === enemyOf(state, piece.owner)) append(target, 'step', [target]);
    }
  } else if (piece.type === 'knight' || piece.type === 'king') {
    for (const target of attackCells(state, piece)) append(target, piece.type === 'knight' ? 'jump' : 'step', piece.type === 'knight' ? [] : [target]);
  } else {
    for (const v of directions(piece.type)) {
      const path: Cell[] = [];
      for (let n = 1; n < 8; n++) {
        const target = offset(piece.cell, v, n);
        if (target === null) break;
        path.push(target);
        append(target, 'slide', path);
        if (state.board[target] !== -1) break;
      }
    }
  }
  return result;
}

/** Internal primitive for already generated moves. Does not append history during search. */
export function makeMove(state: GameState, move: Move, recordPosition = false): UndoRecord {
  const piece = state.pieces[move.pieceId];
  const undo: UndoRecord = { move, previousType: piece.type, turnIndex: state.turnIndex, noProgress: state.noProgress, ply: state.ply, keyCount: state.positionKeys.length };
  state.board[move.from] = -1;
  if (move.capturedId !== null) state.pieces[move.capturedId].cell = null;
  piece.cell = move.to;
  if (move.promotion) piece.type = move.promotion;
  state.board[move.to] = piece.id;
  state.noProgress = move.capturedId !== null || move.promotion ? 0 : state.noProgress + 1;
  state.ply++;
  state.turnIndex = (state.turnIndex + 1) % state.players.length;
  if (recordPosition) state.positionKeys.push(positionKey(state));
  return undo;
}

export function unmakeMove(state: GameState, undo: UndoRecord): void {
  const { move } = undo;
  const piece = state.pieces[move.pieceId];
  piece.cell = move.from;
  piece.type = undo.previousType;
  state.board[move.from] = piece.id;
  state.board[move.to] = move.capturedId ?? -1;
  if (move.capturedId !== null) state.pieces[move.capturedId].cell = move.to;
  state.turnIndex = undo.turnIndex;
  state.noProgress = undo.noProgress;
  state.ply = undo.ply;
  state.positionKeys.length = undo.keyCount;
}

export function legalMoves(state: GameState, pieceId?: number): Move[] {
  const owner = sideToMove(state);
  const pieces = pieceId === undefined ? state.pieces : [state.pieces[pieceId]].filter(Boolean);
  const result: Move[] = [];
  for (const piece of pieces) {
    if (piece.owner !== owner || piece.cell === null) continue;
    for (const move of pseudoMoves(state, piece)) {
      const undo = makeMove(state, move);
      const legal = !isInCheck(state, owner);
      unmakeMove(state, undo);
      if (legal) result.push(move);
    }
  }
  return result;
}

export function positionKey(state: GameState): string {
  // IDs and move counters are not part of repetition identity.
  return state.profile + '|' + sideToMove(state) + '|' + state.pieces.filter(p => p.cell !== null).map(p => [p.owner, p.type, p.cell].join(':')).sort().join(';');
}

export function gameStatus(state: GameState): GameStatus {
  const owner = sideToMove(state);
  const check = isInCheck(state, owner);
  if (!legalMoves(state).length) return check ? { kind: 'checkmate', winner: enemyOf(state, owner) } : { kind: 'draw', reason: 'stalemate' };
  const key = positionKey(state);
  if (state.positionKeys.filter(k => k === key).length >= 3) return { kind: 'draw', reason: 'repetition' };
  if (state.noProgress >= 100) return { kind: 'draw', reason: 'no-progress' };
  if (state.pieces.every(p => p.cell === null || p.type === 'king')) return { kind: 'draw', reason: 'kings-only' };
  return { kind: 'playing', check };
}

/** User-facing command boundary: regenerate legality; never trust a rendered destination. */
export function commitMove(state: GameState, request: Pick<Move, 'from' | 'to' | 'promotion'>): UndoRecord {
  if (gameStatus(state).kind !== 'playing') throw new Error('The game has ended');
  const piece = pieceAt(state, request.from);
  const move = piece && legalMoves(state, piece.id).find(m => m.to === request.to && m.promotion === request.promotion);
  if (!move) throw new Error('Illegal move');
  return makeMove(state, move, true);
}
