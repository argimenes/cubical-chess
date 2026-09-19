import { commitMove, unmakeMove } from '../rules/engine';
import type { GameState } from '../rules/types';
import type { HistoryEntry } from './saved-game';

/** A disposable inspection position. Neither the live game nor its history is mutated. */
export class GameReplay {
  readonly state: GameState;
  private readonly entries: HistoryEntry[];
  private index: number;

  constructor(present: GameState, history: readonly HistoryEntry[]) {
    this.state = structuredClone(present);
    this.entries = structuredClone([...history]);
    this.index = history.length;
  }

  get cursor(): number { return this.index; }
  get length(): number { return this.entries.length; }

  seek(index: number): void {
    if (!Number.isInteger(index) || index < 0 || index > this.length) throw new RangeError('Invalid replay position');
    while (this.index > index) unmakeMove(this.state, this.entries[--this.index].undo);
    while (this.index < index) {
      commitMove(this.state, this.entries[this.index].undo.move);
      this.index++;
    }
  }
}
