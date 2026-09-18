import { describe, expect, it } from 'vitest';
import { attackCells, commitMove, createState, gameStatus, isCellAttacked, isInCheck, legalMoves, makeMove, pawnVectors, positionKey, pseudoMoves, sideToMove, unmakeMove } from '../src/rules/engine';
import { BISHOP_DIRECTIONS, cell, coordinates, KNIGHT_VECTORS, QUEEN_DIRECTIONS, ROOK_DIRECTIONS } from '../src/rules/geometry';
import { createSetup, SETUPS } from '../src/rules/setups';
import type { GameState, Piece, PieceType, PlayerId, ProfileId } from '../src/rules/types';

const piece = (owner: PlayerId, type: PieceType, x: number, y: number, z: number): Omit<Piece, 'id'> => ({ owner, type, cell: cell(x, y, z) });
const fixture = (type: PieceType, position = [3, 3, 3], profile: ProfileId = 'prototype-1') => createState([
  piece('white', 'king', 0, position.every(n => n === 0) ? 7 : 0, 0), piece('black', 'king', 7, 7, 7), piece('white', type, position[0], position[1], position[2]),
], profile);
const snapshot = (state: GameState) => JSON.stringify(state);

describe('lattice and vectors', () => {
  it('round-trips all 512 cells and rejects invalid coordinates', () => {
    for (let c = 0; c < 512; c++) expect(cell(...coordinates(c))).toBe(c);
    expect(() => cell(-1, 0, 0)).toThrow(); expect(() => cell(8, 0, 0)).toThrow(); expect(() => cell(0.5, 0, 0)).toThrow();
  });
  it('has 6 rook, 20 bishop, 26 queen directions and 24 unique knight vectors', () => {
    expect(ROOK_DIRECTIONS).toHaveLength(6); expect(BISHOP_DIRECTIONS).toHaveLength(20); expect(QUEEN_DIRECTIONS).toHaveLength(26);
    expect(KNIGHT_VECTORS).toHaveLength(24); expect(new Set(KNIGHT_VECTORS.map(v => v.join(','))).size).toBe(24);
    for (const v of KNIGHT_VECTORS) expect(v.map(Math.abs).sort()).toEqual([0, 1, 2]);
    for (const vectors of [ROOK_DIRECTIONS, BISHOP_DIRECTIONS, QUEEN_DIRECTIONS, KNIGHT_VECTORS]) {
      const set = new Set(vectors.map(v => v.join(',')));
      for (const v of vectors) expect(set.has(v.map(n => -n).join(','))).toBe(true);
    }
  });
});

describe('movement geometry', () => {
  it.each(['rook', 'bishop', 'queen'] as const)('%s attack geometry agrees with an independent endpoint oracle', type => {
    // Ignore move generation's direction arrays: derive each valid endpoint from its displacement.
    for (const origin of [[3, 3, 3], [0, 0, 0], [0, 4, 4], [7, 7, 3]]) {
      const state = fixture(type, origin);
      const expected: number[] = [];
      for (let target = 0; target < 512; target++) {
        const d = coordinates(target).map((n, i) => Math.abs(n - origin[i])).filter(Boolean);
        if (!d.length || !d.every(n => n === d[0])) continue;
        if (type === 'rook' && d.length !== 1 || type === 'bishop' && d.length < 2) continue;
        expected.push(target);
      }
      expect(attackCells(state, state.pieces[2]).sort((a, b) => a - b)).toEqual(expected);
    }
  });
  it('stops at friendly and enemy occupants, including body diagonals', () => {
    const state = createState([piece('white', 'king', 0, 0, 0), piece('black', 'king', 7, 7, 0), piece('white', 'bishop', 2, 2, 2), piece('white', 'pawn', 4, 4, 4), piece('black', 'rook', 2, 5, 5)]);
    const moves = pseudoMoves(state, state.pieces[2]);
    expect(moves.some(m => m.to === cell(4, 4, 4))).toBe(false);
    expect(moves.some(m => m.to === cell(5, 5, 5))).toBe(false);
    expect(moves.find(m => m.to === cell(2, 5, 5))?.capturedId).toBe(4);
    expect(moves.some(m => m.to === cell(2, 6, 6))).toBe(false);
    expect(attackCells(state, state.pieces[2])).toContain(cell(4, 4, 4));
  });
  it('preserves traversed cells for a slider guide', () => {
    const state = fixture('rook');
    expect(pseudoMoves(state, state.pieces[2]).find(m => m.to === cell(3, 3, 6))?.path).toEqual([cell(3, 3, 4), cell(3, 3, 5), cell(3, 3, 6)]);
  });
  it('knights jump and clip from 24 interior destinations to 6 at a corner', () => {
    const state = fixture('knight');
    expect(attackCells(state, state.pieces[2])).toHaveLength(24);
    const corner = fixture('knight', [0, 7, 0]);
    expect(attackCells(corner, corner.pieces[2])).toHaveLength(6);
    const blocked = createState([piece('white', 'king', 0, 0, 0), piece('black', 'king', 7, 7, 7), piece('white', 'knight', 3, 3, 3), piece('white', 'pawn', 4, 3, 3), piece('white', 'pawn', 5, 3, 3)]);
    expect(legalMoves(blocked, 2).some(m => m.to === cell(5, 4, 3) && m.kind === 'jump' && m.path.length === 0)).toBe(true);
  });
  it('kings attack 26 interior or 7 corner cells', () => {
    const state = createState([piece('white', 'king', 3, 3, 3), piece('black', 'king', 7, 7, 7)]);
    expect(attackCells(state, state.pieces[0])).toHaveLength(26); expect(attackCells(state, state.pieces[1])).toHaveLength(7);
  });
});

describe('pawn profiles', () => {
  it('has exactly four quiet and eight capture vectors independent of colour', () => {
    const state = fixture('pawn');
    expect(pawnVectors(state, 'white', false)).toHaveLength(4);
    expect(pawnVectors(state, 'white', true)).toHaveLength(8);
    expect(pawnVectors(state, 'white', false)).toEqual(pawnVectors(state, 'black', false));
    expect(pawnVectors(state, 'white', true)).toEqual(pawnVectors(state, 'black', true));
    for (const v of pawnVectors(state, 'white', true)) {
      expect(Math.abs(v[0])).toBe(1); expect(Math.abs(v[1]) + Math.abs(v[2])).toBe(1);
    }
    expect(pseudoMoves(state, state.pieces[2]).map(m => coordinates(m.to))).toEqual(expect.arrayContaining([[3, 2, 3], [3, 4, 3], [3, 3, 2], [3, 3, 4]]));
    expect(pseudoMoves(state, state.pieces[2])).toHaveLength(4);
  });
  it('three-direction comparison keeps both vertical directions and six attacks', () => {
    const state = fixture('pawn', [3, 3, 3], 'prototype-1-three');
    expect(pawnVectors(state, 'white', false)).toEqual([[0, 1, 0], [0, 0, -1], [0, 0, 1]]);
    expect(pawnVectors(state, 'black', false)).toEqual([[0, -1, 0], [0, 0, -1], [0, 0, 1]]);
    expect(pawnVectors(state, 'black', true)).toHaveLength(6);
  });
  it('captures backward and down, never on quiet vectors or Y–Z diagonals', () => {
    const state = createState([piece('white', 'king', 0, 0, 0), piece('black', 'king', 7, 7, 7), piece('white', 'pawn', 3, 3, 3), piece('black', 'rook', 4, 2, 3), piece('black', 'bishop', 2, 3, 2), piece('black', 'pawn', 3, 4, 3), piece('black', 'pawn', 3, 4, 4), piece('black', 'pawn', 4, 3, 3)]);
    const captures = pseudoMoves(state, state.pieces[2]).filter(m => m.capturedId !== null).map(m => m.to);
    expect(captures.sort()).toEqual([cell(4, 2, 3), cell(2, 3, 2)].sort());
    expect(attackCells(state, state.pieces[2])).not.toContain(cell(3, 4, 3));
  });
  it('offers all four promotions on a quiet move and on a capture', () => {
    const state = createSetup('promotion');
    for (const to of [cell(3, 3, 7), cell(4, 3, 7)]) {
      expect(legalMoves(state, 2).filter(m => m.to === to).map(m => m.promotion).sort()).toEqual(['bishop', 'knight', 'queen', 'rook']);
    }
    expect(() => commitMove(state, { from: cell(3, 3, 6), to: cell(3, 3, 7) })).toThrow('Illegal');
    commitMove(state, { from: cell(3, 3, 6), to: cell(3, 3, 7), promotion: 'knight' });
    expect(state.pieces[2].type).toBe('knight');
  });
  it('promotes Black only on Z = 0 and neither side on a Y edge', () => {
    const state = createState([piece('white', 'king', 0, 0, 0), piece('black', 'king', 7, 7, 7), piece('black', 'pawn', 3, 1, 1)], 'prototype-1', 'black');
    expect(legalMoves(state, 2).filter(m => m.to === cell(3, 1, 0))).toHaveLength(4);
    expect(legalMoves(state, 2).find(m => m.to === cell(3, 0, 1))?.promotion).toBeUndefined();
  });
  it('starts with two quiet moves per pawn because the backward cell is occupied', () => {
    const state = createSetup('outer-planes');
    for (const pawn of state.pieces.filter(p => p.type === 'pawn')) expect(pseudoMoves(state, pawn)).toHaveLength(2);
  });
});

describe('king safety and command validation', () => {
  it('filters moves that expose a king along a true spatial diagonal', () => {
    const state = createSetup('king-safety');
    expect(isInCheck(state, 'white')).toBe(false);
    expect(pseudoMoves(state, state.pieces[2]).length).toBeGreaterThan(0);
    expect(legalMoves(state, 2)).toEqual([]);
  });
  it('counts attacks from pinned pieces when checking a king destination', () => {
    const state = createState([piece('white', 'king', 5, 4, 2), piece('black', 'king', 7, 7, 7), piece('white', 'bishop', 3, 3, 3), piece('black', 'knight', 5, 5, 5)]);
    const target = cell(5, 4, 3);
    expect(isCellAttacked(state, target, 'black')).toBe(true);
    expect(legalMoves(state, 0).some(m => m.to === target)).toBe(false);
  });
  it('rejects an illegal move and an out-of-turn move without changing state', () => {
    const state = createSetup('outer-planes'); const before = snapshot(state);
    expect(() => commitMove(state, { from: cell(0, 2, 0), to: cell(0, 2, 4) })).toThrow();
    expect(() => commitMove(state, { from: cell(0, 5, 7), to: cell(0, 5, 6) })).toThrow();
    expect(snapshot(state)).toBe(before);
  });
  it('never generates a king capture or an adjacent king move', () => {
    const state = createState([piece('white', 'king', 3, 3, 3), piece('black', 'king', 5, 5, 5), piece('white', 'queen', 5, 0, 5)]);
    expect(legalMoves(state, 0).some(m => m.to === cell(4, 4, 4))).toBe(false);
    expect(pseudoMoves(state, state.pieces[2]).some(m => m.to === cell(5, 5, 5))).toBe(false);
    expect(isInCheck(state, 'black')).toBe(true);
  });
});

describe('history and terminal states', () => {
  it('restores every field after every initial legal move in each fixture', () => {
    for (const setup of SETUPS) {
      const state = createSetup(setup.id); const before = snapshot(state);
      const moves = legalMoves(state);
      expect(snapshot(state)).toBe(before);
      for (const move of moves) {
        const undo = makeMove(state, move, true);
        expect(state.board[move.to]).toBe(move.pieceId);
        expect(isInCheck(state, undo.turnIndex === 0 ? 'white' : 'black')).toBe(false);
        unmakeMove(state, undo); expect(snapshot(state)).toBe(before);
      }
    }
  });
  it('restores a complete deterministic 40-ply game', () => {
    const state = createSetup('outer-planes'); const before = snapshot(state); const stack = [];
    for (let n = 0; n < 40; n++) {
      if (gameStatus(state).kind !== 'playing') break;
      const moves = legalMoves(state); stack.push(makeMove(state, moves[(n * 37 + 11) % moves.length], true));
    }
    expect(stack.length).toBeGreaterThan(10);
    while (stack.length) unmakeMove(state, stack.pop()!);
    expect(snapshot(state)).toBe(before);
  });
  it('draws a repeated pawn shuffle without discarding reversible pawn history', () => {
    const state = createState([piece('white', 'king', 0, 0, 0), piece('black', 'king', 7, 7, 7), piece('white', 'pawn', 3, 3, 3), piece('black', 'pawn', 5, 5, 5)]);
    for (let cycle = 0; cycle < 2; cycle++) {
      for (const [from, to] of [[cell(3,3,3),cell(3,4,3)],[cell(5,5,5),cell(5,4,5)],[cell(3,4,3),cell(3,3,3)],[cell(5,4,5),cell(5,5,5)]]) commitMove(state, { from, to });
    }
    expect(state.noProgress).toBe(8); expect(gameStatus(state)).toEqual({ kind: 'draw', reason: 'repetition' });
  });
  it('resets the no-progress count only on capture or promotion', () => {
    const state = createSetup('promotion'); state.noProgress = 9;
    const quiet = legalMoves(state, 2).find(m => m.to === cell(3, 4, 6))!;
    const undo = makeMove(state, quiet); expect(state.noProgress).toBe(10); unmakeMove(state, undo);
    const capture = legalMoves(state, 2).find(m => m.to === cell(4, 3, 7))!;
    makeMove(state, capture); expect(state.noProgress).toBe(0);
  });
  it('draws at 100 reversible plies', () => {
    const state = createSetup('outer-planes'); state.noProgress = 99;
    commitMove(state, { from: cell(0, 2, 0), to: cell(0, 2, 1) });
    expect(gameStatus(state)).toEqual({ kind: 'draw', reason: 'no-progress' });
  });
  it('distinguishes mate, stalemate and kings-only draw', () => {
    const mate = createState([piece('white', 'king', 0, 0, 0), piece('black', 'king', 2, 2, 2), piece('black', 'queen', 1, 1, 1)]);
    expect(gameStatus(mate)).toEqual({ kind: 'checkmate', winner: 'black' });
    const stalemate = createState([piece('white', 'king', 0, 0, 0), piece('black', 'king', 7, 7, 7), piece('black', 'queen', 2, 1, 0), piece('black', 'queen', 0, 1, 2)]);
    expect(gameStatus(stalemate)).toEqual({ kind: 'draw', reason: 'stalemate' });
    expect(gameStatus(createState([piece('white', 'king', 0, 0, 0), piece('black', 'king', 7, 7, 7)]))).toEqual({ kind: 'draw', reason: 'kings-only' });
  });
  it('does not use piece IDs or counters for repetition identity', () => {
    const state = createSetup('outer-planes'); const key = positionKey(state);
    state.ply = 22; state.noProgress = 45;
    expect(positionKey(state)).toBe(key);
  });
  it('the full opening has no attacks between armies or checks', () => {
    const state = createSetup('outer-planes');
    for (const p of state.pieces) for (const other of state.pieces.filter(q => q.owner !== p.owner)) expect(attackCells(state, p)).not.toContain(other.cell);
    expect(isInCheck(state, 'white')).toBe(false); expect(isInCheck(state, 'black')).toBe(false);
    expect(sideToMove(state)).toBe('white');
  });
});

it('records opening and fixture generation costs for the slice report', () => {
  const result = SETUPS.map(setup => {
    const state = createSetup(setup.id);
    const start = performance.now(); let count = 0;
    for (let i = 0; i < 25; i++) count = legalMoves(state).length;
    return { setup: setup.id, legalMoves: count, meanMs: Number(((performance.now() - start) / 25).toFixed(2)) };
  });
  console.info('Rules benchmark (Node.js; 25 generations):', JSON.stringify(result));
});
