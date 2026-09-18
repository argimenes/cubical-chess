import { isInCheck, makeMove, sideToMove, unmakeMove } from '../rules/engine';
import type { GameState, Move } from '../rules/types';

/** Read-only presentation query over legal moves supplied by the rules engine. */
export function inspectCheck(state: GameState, candidates: readonly Move[]): 'yes' | 'no' | 'promotion-dependent' {
  if (!candidates.length) return 'no';
  const preview = structuredClone(state);
  let checks = 0;
  for (const move of candidates) {
    const undo = makeMove(preview, move);
    try { if (isInCheck(preview, sideToMove(preview))) checks++; }
    finally { unmakeMove(preview, undo); }
  }
  return checks === candidates.length ? 'yes' : checks ? 'promotion-dependent' : 'no';
}
