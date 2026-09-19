import { commitMove, sideToMove } from '../rules/engine';
import { formatCell } from '../rules/geometry';
import { createSetup, SETUPS, type SetupId } from '../rules/setups';
import { PIECE_LETTERS, PROFILES, PROMOTIONS, type GameState, type Move, type PieceType, type PlayerId, type ProfileId, type UndoRecord } from '../rules/types';

export const SAVE_KEY = 'cubical-chess.active-game';
// Bump rulesVersion when movement or setup semantics change; never silently replay old rules.
const RULES_VERSION = 1;
export interface HistoryEntry { undo: UndoRecord; label: string; owner: PlayerId }
export interface RestoredGame { setup: SetupId; state: GameState; history: HistoryEntry[] }

/** Local calendar time, matching the date the player sees on their device. */
export function gameFileName(date = new Date()): string {
  const pad = (value: number) => String(value).padStart(2, '0');
  return String(date.getFullYear()).padStart(4, '0') + pad(date.getMonth() + 1) + pad(date.getDate())
    + '-' + pad(date.getHours()) + pad(date.getMinutes()) + pad(date.getSeconds()) + '.chess3.json';
}

export function moveLabel(type: PieceType, move: Move): string {
  return PIECE_LETTERS[type] + ' ' + formatCell(move.from)
    + (move.capturedId !== null ? ' × ' : ' → ') + formatCell(move.to)
    + (move.promotion ? ' = ' + PIECE_LETTERS[move.promotion] : '');
}

export function encodeGame(setup: SetupId, profile: ProfileId, history: readonly HistoryEntry[]): string {
  return JSON.stringify({ version: 1, rulesVersion: RULES_VERSION, setup, profile,
    moves: history.map(({ undo: { move } }) => ({ from: move.from, to: move.to, ...(move.promotion ? { promotion: move.promotion } : {}) })) });
}

/** Rebuild all state, draw counters and undo records by legally replaying the saved commands. */
export function decodeGame(raw: string): RestoredGame {
  const data = JSON.parse(raw);
  if (!data || data.version !== 1 || data.rulesVersion !== RULES_VERSION) throw new Error('Unsupported save version');
  if (!SETUPS.some(s => s.id === data.setup) || !Object.hasOwn(PROFILES, data.profile) || !Array.isArray(data.moves)) throw new Error('Invalid saved game');
  const state = createSetup(data.setup, data.profile);
  const history: HistoryEntry[] = [];
  for (const move of data.moves) {
    if (!move || ![move.from, move.to].every(c => Number.isInteger(c) && c >= 0 && c < 512)
      || (move.promotion !== undefined && !PROMOTIONS.includes(move.promotion))) throw new Error('Invalid saved move');
    const owner = sideToMove(state);
    const undo = commitMove(state, move);
    const label = moveLabel(undo.previousType, undo.move);
    history.push({ undo, label, owner });
  }
  return { setup: data.setup, state, history };
}
