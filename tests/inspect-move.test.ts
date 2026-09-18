import { expect, it } from 'vitest';
import { inspectCheck } from '../src/app/inspect-move';
import { legalMoves } from '../src/rules/engine';
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
