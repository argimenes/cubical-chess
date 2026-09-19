import { expect, it } from 'vitest';
import { inspectCheck, inspectContinuation } from '../src/app/inspect-move';
import { createState, isCellAttacked, legalMoves } from '../src/rules/engine';
import { cell } from '../src/rules/geometry';
import { createSetup } from '../src/rules/setups';

it('inspects a checking move without changing any live state', () => {
  const state = createSetup('outer-planes');
  const before = structuredClone(state);
  const moves = legalMoves(state, 3).filter(m => m.to === cell(3, 7, 6));
  expect(moves).toHaveLength(1);
  expect(inspectCheck(state, moves)).toBe('yes');
  expect(state).toEqual(before);
});

it('reports promotion-dependent check without assuming a queen or changing history', () => {
  const state = createSetup('promotion');
  const before = structuredClone(state);
  const moves = legalMoves(state, 2).filter(m => m.to === cell(3, 3, 7));
  expect(moves).toHaveLength(4);
  expect(inspectCheck(state, moves)).toBe('promotion-dependent');
  expect(inspectCheck(state, moves.filter(m => m.promotion === 'queen'))).toBe('yes');
  expect(inspectCheck(state, moves.filter(m => m.promotion === 'knight'))).toBe('no');
  expect(state).toEqual(before);
});

it('inspects an ordinary capture without removing the live victim', () => {
  const state = createSetup('spatial-study');
  const before = structuredClone(state);
  expect(inspectCheck(state, legalMoves(state, 2).filter(m => m.to === cell(4, 3, 5)))).toBe('no');
  expect(inspectCheck(state, [])).toBe('no');
  expect(state).toEqual(before);
});

it('previews a knight from a captured cell, including a return to the vacated source, without mutating the game', () => {
  const state = createSetup('spatial-study');
  const before = structuredClone(state);
  const candidates = legalMoves(state, 2).filter(m => m.to === cell(4, 3, 5));
  const next = inspectContinuation(state, candidates);
  expect(next.moves.length).toBeGreaterThan(0);
  expect(next.moves.every(m => m.pieceId === 2 && m.from === cell(4, 3, 5))).toBe(true);
  expect(next.moves.some(m => m.to === cell(3, 3, 3) && m.capturedId === null)).toBe(true);
  expect(next.moves.some(m => m.capturedId === 9)).toBe(false);
  expect(state).toEqual(before);
});

it('updates slider blockers after a capture and keeps friendly blockers', () => {
  const state = createState([
    { type: 'king', owner: 'white', cell: cell(0, 0, 0) },
    { type: 'king', owner: 'black', cell: cell(7, 7, 7) },
    { type: 'rook', owner: 'white', cell: cell(2, 2, 2) },
    { type: 'pawn', owner: 'black', cell: cell(2, 2, 4) },
    { type: 'pawn', owner: 'white', cell: cell(2, 2, 6) },
  ]);
  const next = inspectContinuation(state, legalMoves(state, 2).filter(m => m.to === cell(2, 2, 4)));
  const cells = next.moves.map(m => m.to);
  expect(cells).toContain(cell(2, 2, 0)); // The previous source no longer blocks this ray.
  expect(cells).toContain(cell(2, 2, 5));
  expect(cells).not.toContain(cell(2, 2, 6));
  expect(cells).not.toContain(cell(2, 2, 7));
});

it('uses king safety for the hypothetical next move', () => {
  const state = createState([
    { type: 'king', owner: 'white', cell: cell(1, 1, 1) },
    { type: 'king', owner: 'black', cell: cell(7, 7, 7) },
    { type: 'rook', owner: 'black', cell: cell(3, 1, 4) },
    { type: 'pawn', owner: 'white', cell: cell(6, 1, 1) },
  ]);
  const next = inspectContinuation(state, legalMoves(state, 0).filter(m => m.to === cell(2, 1, 1)));
  expect(next.moves.length).toBeGreaterThan(0);
  expect(next.moves.map(m => m.to)).not.toContain(cell(3, 1, 1));
  expect(next.moves.every(m => !isCellAttacked(state, m.to, 'black'))).toBe(true);
});

it('unions promotion alternatives explicitly, including distinct knight and rook continuations', () => {
  const state = createSetup('promotion');
  const before = structuredClone(state);
  const candidates = legalMoves(state, 2).filter(m => m.to === cell(4, 3, 7));
  const next = inspectContinuation(state, candidates);
  expect(next.promotionDependent).toBe(true);
  expect(next.moves.some(m => m.kind === 'jump')).toBe(true);
  expect(next.moves.some(m => m.kind === 'slide')).toBe(true);
  expect(state).toEqual(before);
});

it('does not suggest continuations after a move ends the game', () => {
  const state = createSetup('spatial-study');
  state.noProgress = 99;
  const quiet = legalMoves(state, 2).filter(m => m.capturedId === null).slice(0, 1);
  expect(inspectContinuation(state, quiet)).toEqual({ moves: [], promotionDependent: false, terminal: true });
});
