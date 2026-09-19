import { expect, it } from 'vitest';
import { GameReplay } from '../src/app/replay';
import { moveLabel, type HistoryEntry } from '../src/app/saved-game';
import { commitMove, gameStatus, legalMoves, sideToMove } from '../src/rules/engine';
import { createSetup, type SetupId } from '../src/rules/setups';
import type { ProfileId } from '../src/rules/types';

it.each([
  ['spatial-study', 'prototype-1'], ['promotion', 'prototype-1-three'],
] as [SetupId, ProfileId][])('replays %s with captures, promotions and full rule counters without touching the live game', (setup, profile) => {
  const state = createSetup(setup, profile);
  const positions = [structuredClone(state)];
  const history: HistoryEntry[] = [];
  for (let i = 0; i < 6 && gameStatus(state).kind === 'playing'; i++) {
    const moves = legalMoves(state);
    const move = i === 0 ? moves.find(m => m.capturedId !== null && (!m.promotion || m.promotion === 'knight'))! : moves[(i * 13) % moves.length];
    const owner = sideToMove(state);
    const label = moveLabel(state.pieces[move.pieceId].type, move);
    history.push({ undo: commitMove(state, move), owner, label });
    positions.push(structuredClone(state));
  }
  const savedHistory = structuredClone(history);
  const replay = new GameReplay(state, history);
  for (const index of [0, 1, history.length, 2, 0, history.length, history.length - 1]) {
    replay.seek(index);
    expect(replay.cursor).toBe(index);
    expect(replay.state).toEqual(positions[index]);
    expect(state).toEqual(positions.at(-1));
    expect(history).toEqual(savedHistory);
  }
  expect(() => replay.seek(-1)).toThrow(RangeError);
  expect(() => replay.seek(history.length + 1)).toThrow(RangeError);
  expect(() => replay.seek(0.5)).toThrow(RangeError);
});

it('retains repetition history and a terminal draw when traversing in both directions', () => {
  const state = createSetup('spatial-study');
  const history: HistoryEntry[] = [];
  // Two kings retrace safe moves while the rest of the study remains stationary.
  const initial = structuredClone(state);
  const kings = state.pieces.filter(p => p.type === 'king');
  const outward: { from: number; to: number }[] = [];
  for (let cycle = 0; cycle < 2; cycle++) {
    for (let step = 0; step < 4; step++) {
      const owner = sideToMove(state);
      const king = kings.find(p => p.owner === owner)!;
      const command = cycle === 0 && step < 2 ? legalMoves(state, king.id)[0]
        : step < 2 ? outward[step] : { from: outward[step - 2].to, to: outward[step - 2].from };
      if (cycle === 0 && step < 2) outward.push({ from: command.from, to: command.to });
      const undo = commitMove(state, command);
      history.push({ undo, owner, label: moveLabel(undo.previousType, undo.move) });
    }
  }
  expect(gameStatus(state)).toEqual({ kind: 'draw', reason: 'repetition' });
  const replay = new GameReplay(state, history);
  replay.seek(0); expect(replay.state).toEqual(initial);
  replay.seek(history.length); expect(replay.state).toEqual(state);
  expect(gameStatus(replay.state)).toEqual({ kind: 'draw', reason: 'repetition' });
});
