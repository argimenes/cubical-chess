import { expect, it } from 'vitest';
import { decodeGame, encodeGame, gameFileName, moveLabel, type HistoryEntry } from '../src/app/saved-game';
import { commitMove, legalMoves, sideToMove, unmakeMove } from '../src/rules/engine';
import { cell } from '../src/rules/geometry';
import { createSetup, type SetupId } from '../src/rules/setups';

it('names game files using zero-padded local date and time', () => {
  expect(gameFileName(new Date(2026, 0, 2, 3, 4, 5))).toBe('20260102-030405.chess3.json');
  expect(gameFileName(new Date(2026, 11, 31, 23, 59, 59))).toBe('20261231-235959.chess3.json');
});

it.each(['outer-planes', 'spatial-study', 'king-safety', 'promotion'] as SetupId[])('round-trips %s, including complete history and undo state', setup => {
  const state = createSetup(setup, 'prototype-1-three');
  const original = structuredClone(state);
  const history: HistoryEntry[] = [];
  for (let i = 0; i < 6; i++) {
    const moves = legalMoves(state);
    const move = i === 0 && setup === 'promotion' ? moves.find(m => m.to === cell(4, 3, 7) && m.promotion === 'knight')! : moves[(i * 13) % moves.length];
    const owner = sideToMove(state);
    const label = moveLabel(state.pieces[move.pieceId].type, move);
    history.push({ undo: commitMove(state, move), owner, label });
  }
  const restored = decodeGame(encodeGame(setup, state.profile, history));
  expect(restored.state).toEqual(state);
  expect(restored.history).toEqual(history);
  for (const entry of [...restored.history].reverse()) unmakeMove(restored.state, entry.undo);
  expect(restored.state).toEqual(original);
});

it.each([
  '{', 'null', '{}',
  JSON.stringify({ version: 2, rulesVersion: 1 }),
  JSON.stringify({ version: 1, rulesVersion: 2 }),
  ...[
    { setup: 'missing', moves: [] }, { profile: 'toString', moves: [] },
    { moves: [{ from: -1, to: 3 }] }, { moves: [{ from: 11, to: 12 }] },
    { moves: [{ from: 11, to: 75, promotion: 'king' }] },
  ].map(change => JSON.stringify({ version: 1, rulesVersion: 1, setup: 'outer-planes', profile: 'prototype-1', ...change })),
])('rejects malformed, incompatible or illegal saves: %s', raw => {
  expect(() => decodeGame(raw)).toThrow();
});
