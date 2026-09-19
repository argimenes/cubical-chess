import { commitMove, gameStatus, isInCheck, legalMoves, makeMove, sideToMove, unmakeMove } from '../rules/engine';
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

export interface ContinuationPreview { moves: Move[]; promotionDependent: boolean; terminal: boolean }

/** Hypothetical same-piece next turn, with the opponent's position left unchanged. */
export function inspectContinuation(state: GameState, candidates: readonly Move[]): ContinuationPreview {
  const moves: Move[] = [];
  let terminal = candidates.length > 0;
  for (const candidate of candidates) {
    const preview = structuredClone(state);
    const owner = sideToMove(preview);
    // Apply captures, vacated cells and promotions through the normal command boundary.
    const { move } = commitMove(preview, candidate);
    if (gameStatus(preview).kind !== 'playing') continue;
    terminal = false;
    preview.turnIndex = preview.players.indexOf(owner);
    moves.push(...legalMoves(preview, move.pieceId));
  }
  return { moves, promotionDependent: candidates.some(move => !!move.promotion), terminal };
}
