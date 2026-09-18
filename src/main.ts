import './style.css';
import { decodeGame, encodeGame, moveLabel, SAVE_KEY, type HistoryEntry } from './app/saved-game';
import { inspectCheck } from './app/inspect-move';
import { commitMove, gameStatus, isInCheck, legalMoves, pieceAt, sideToMove, unmakeMove } from './rules/engine';
import { coordinates, formatCell } from './rules/geometry';
import { createSetup, SETUPS, type SetupId } from './rules/setups';
import { PIECE_LETTERS, PROFILES, type Cell, type Move, type PieceType, type ProfileId, type Promotion } from './rules/types';
import { THEMES } from './view/themes';
import type { Point3, ThemeId } from './view/themes/types';
import { BoardView, type CameraPreset, type SelectionInput } from './view/board';

const app = document.querySelector<HTMLDivElement>('#app')!;
app.innerHTML = `
  <header class="app-header">
    <div class="brand"><span class="brand-mark" aria-hidden="true">◇</span><div><h1>CUBICAL</h1><p>THINK IN THREE DIMENSIONS</p></div></div>
    <div class="header-meta"><span class="live-dot"></span> SPATIAL CHESS <span class="divider">/</span> <span class="version">PROTOTYPE 01</span></div>
    <div class="header-actions"><button id="game-panel-button" class="tablet-button" aria-controls="game-panel" aria-expanded="false">Game</button><button id="inspect-panel-button" class="tablet-button" aria-controls="inspect-panel" aria-expanded="false">Inspect</button><button id="help" class="icon-button" aria-label="How to play">?</button></div>
  </header>
  <main class="workspace">
    <aside id="game-panel" class="panel game-panel">
      <section class="panel-section"><div class="section-title">THE GAME <span class="small-badge">LOCAL · 2P</span></div>
        <div id="turn-card" class="turn-card white"><span class="turn-orb"></span><div><h2 id="turn-label">White to move</h2><p id="status-detail">Bottom plane · z = 0</p></div></div>
        <div class="game-facts"><span>VOLUME <strong>8 × 8 × 8</strong></span><span>PIECES <strong id="piece-count">32</strong></span></div>
      </section>
      <section class="panel-section setup-section"><label class="section-title" for="setup">POSITION</label>
        <select id="setup">${SETUPS.map(s => '<option value="' + s.id + '">' + s.name + '</option>').join('')}</select>
        <label class="field-label" for="profile">Pawn experiment</label><select id="profile"><option value="prototype-1">4 directions / 8 captures</option><option value="prototype-1-three">3 directions / 6 captures</option></select>
        <button id="new-game" class="secondary-button full-width">Load position <span>↗</span></button><button id="reset-game" class="secondary-button full-width">Reset game</button><p id="save-status" class="muted small" role="status">Autosave ready</p><p id="setup-description" class="muted small"></p>
      </section>
      <section class="panel-section history-section"><div class="section-title">MOVE RECORD <span id="move-count" class="mono">0 PLY</span></div>
        <div id="history" class="history" aria-label="Move history"><p class="empty-history">A new dimension.<br>Your first move.</p></div>
        <button id="undo" class="secondary-button full-width" disabled>↶ <span>Undo move</span></button>
      </section>
      <div class="panel-footnote">Experimental rules. Every move is checked against the same rules core.</div>
    </aside>
    <section class="stage" aria-label="Chess board">
      <div class="stage-top"><div><span class="eyebrow">THE PLAYING VOLUME</span><p id="stage-description">Opposing outer planes</p></div><span id="plane-badge" class="plane-badge">ALL 8 LEVELS</span></div>
      <div id="board" class="board"></div>
      <div id="depth-chooser" class="depth-chooser" hidden><strong>Choose a cell at this depth</strong><div id="depth-options"></div><button id="depth-cancel">Cancel</button></div>
      <div class="camera-presets" role="group" aria-label="Camera presets"><button data-camera="iso" class="active">Isometric</button><button data-camera="front">Front</button><button data-camera="side">Side</button><button data-camera="top">Above</button><button data-camera="below">Below</button></div>
      <div class="stage-bottom"><span class="legend-dot"></span><span id="instruction">Select a piece to explore its moves.</span><span id="hover-cell" class="mono"></span></div>
    </section>
    <aside id="inspect-panel" class="panel inspect-panel">
      <section class="panel-section"><div class="section-title">VIEW & GUIDANCE</div>
        <label for="theme" class="field-label">Visual theme</label><select id="theme">${THEMES.map(theme => '<option value="' + theme.id + '">' + theme.name + '</option>').join('')}</select>
        <fieldset id="crystal-options" hidden><legend>Crystal · exaggerated study</legend>
          <label class="toggle"><span>Cut facets / reflections</span><input type="checkbox" id="crystal-refraction" /><span class="switch"></span></label>
          <label class="toggle"><span>Spectral / prismatic</span><input type="checkbox" id="crystal-spectral" /><span class="switch"></span></label>
          <label class="toggle"><span>Caustics / scintillation</span><input type="checkbox" id="crystal-caustics" /><span class="switch"></span></label>
          <label class="toggle"><span>Cubical inclusions</span><input type="checkbox" id="crystal-inclusions" /><span class="switch"></span></label>
          <p class="muted small">Compare internal facets with cell inclusions. An intentionally intense study. Toggle components to compare; orbit to catch the light.</p>
        </fieldset>
        <label class="toggle"><span>Ambient animation</span><input type="checkbox" id="ambient-effects" checked /><span class="switch"></span></label>
        <details id="camera-study"><summary>Camera study</summary><div class="director-actions"><button id="focus-piece" class="secondary-button" disabled>Focus selected</button><button id="orbit-piece" class="secondary-button" disabled>Inspect orbit</button></div>
        <button id="manual-camera" class="text-button">Stop camera motion</button><p class="muted small camera-note">Orbit lasts 12 seconds. Any input returns camera control to you.</p></details>
        <label class="toggle"><span>Path on hover / focus</span><input type="checkbox" id="trajectories" checked /><span class="switch"></span></label>
        <label class="toggle"><span>Piece labels</span><input type="checkbox" id="labels" checked /><span class="switch"></span></label>
        <div class="plane-control"><label for="plane" class="field-label">Inspect a Z level</label><select id="plane"><option value="all">All levels</option>${Array.from({ length: 8 }, (_, z) => '<option value="' + z + '">Z = ' + z + (z === 0 ? ' · White home' : z === 7 ? ' · Black home' : '') + '</option>').join('')}</select></div>
        <label class="toggle"><span>Show this level only</span><input type="checkbox" id="isolate" /><span class="switch"></span></label>
        <button id="reset-camera" class="text-button">↺ Reset camera</button>
      </section>
      <section class="panel-section selected-section"><label class="section-title" for="piece-navigator">PIECE INSPECTOR</label>
        <select id="piece-navigator" aria-label="Choose a piece"><option value="">Select on the cube</option></select>
        <div class="selected-heading"><span id="selected-glyph" class="selected-glyph">◇</span><div><h2 id="selected-name">Explore the cube</h2><p id="selected-position" class="mono">X · Y · Z</p></div></div>
        <p id="piece-rule" class="piece-rule">Select a piece to see how it moves through three dimensions.</p>
        <div id="move-explanation" class="move-explanation" aria-live="polite"><strong id="move-title">See the movement field</strong><p id="move-detail">Hover or focus a destination to inspect one move.</p></div>
        <div class="field-legend"><span><i></i>Move</span><span><i class="capture"></i>Capture</span><span><i class="focus"></i>Inspect</span></div>
        <div class="dest-heading"><span class="section-title">LEGAL DESTINATIONS</span><strong id="legal-count">—</strong></div>
        <div id="destinations" class="destinations"><p class="muted small">Highlighted cells are safe moves for the selected piece.</p></div>
      </section>
      <div class="panel-footnote">Temporary spatial symbols · P pawn · R rook · B bishop · N knight · Q queen · K king</div>
    </aside>
  </main>
  <footer class="app-footer"><span><span class="footer-dot"></span> PROTOTYPE-1 <span class="footer-separator">·</span> LOCAL PLAY</span><span class="mouse-help">Drag to orbit · Scroll to zoom · Right-drag to pan</span><span class="touch-help">Drag to orbit · Pinch to zoom · Two fingers to pan</span><span id="notice" role="status" aria-live="polite">Ready to explore</span></footer>
  <dialog id="reset-dialog" aria-labelledby="reset-title" aria-describedby="reset-detail"><div class="dialog-kicker">START AGAIN</div><h2 id="reset-title">Reset this game?</h2><p id="reset-detail"></p><div class="reset-actions"><button id="cancel-reset" class="secondary-button" autofocus>Keep playing</button><button id="confirm-reset" class="primary-button">Reset game</button></div></dialog>
  <dialog id="promotion-dialog"><div class="dialog-kicker">THE FAR HOME PLANE</div><h2>Choose your promotion</h2><p>Your pawn has reached the opposing home plane.</p><div class="promotion-options">${(['queen', 'rook', 'bishop', 'knight'] as const).map(type => '<button data-promote="' + type + '"><strong>' + PIECE_LETTERS[type] + '</strong><span>' + type + '</span></button>').join('')}</div><button id="cancel-promotion" class="secondary-button">Cancel move</button></dialog>
  <dialog id="help-dialog"><div class="dialog-kicker">WELCOME TO CUBICAL</div><h2>Find the move in the volume.</h2><p>White starts on Z = 0. Black starts on Z = 7. Select a piece to see its complete movement constellation. Hover a destination, or focus its button, to inspect one path. Gold markers indicate legal destinations; larger amber markers indicate captures. Click or press Enter to commit. On touchscreens, tap a destination to inspect it, then tap it again to move.</p><p>Drag to orbit; scroll or pinch to zoom. Use the camera presets to look through another face. When cells overlap, a depth chooser lets you select the exact coordinate. The piece navigator and destination list also work with a keyboard.</p><p>Four-direction pawns move into empty cells along ±Y or ±Z. They capture on X–Y or X–Z diagonals. A pawn reaches promotion at the opposite home Z plane.</p><p>A dashed knight guide illustrates just the inspected jump. Intervening cells do not block it. Moves exposing your king are excluded. The inspector can indicate a prospective check without changing the game.</p><p class="muted">Local two-player play and simple spatial symbols. Your game and move history are saved automatically in this browser and restored on reload. Reset game starts the current position again after confirmation. Computer play, final piece designs and saved-game archives come in later stages.</p><button id="close-help" class="primary-button">Enter the cube</button></dialog>
`;

const element = <T extends HTMLElement = HTMLElement>(id: string): T => document.getElementById(id) as T;
const title = (value: string) => value.charAt(0).toUpperCase() + value.slice(1);
let setup: SetupId = 'outer-planes';
let state = createSetup(setup);
let selected: number | null = null;
let available: Move[] = [];
const history: HistoryEntry[] = [];
let pendingReset: { setup: SetupId; profile: ProfileId } | null = null;
let promotionMoves: Move[] = [];
let lastGenerationMs = 0;
let inspectedCell: Cell | null = null;
let armedTouchCell: Cell | null = null;
const inspectionCache = new Map<Cell, ReturnType<typeof inspectCheck>>();
let view: BoardView;
const pieceRules: Record<PieceType, string> = {
  pawn: 'Move one empty cell along ±Y or ±Z. Capture diagonally in X–Y or X–Z. Change X only by capturing. Promote on the opposite home Z plane.',
  rook: 'Slide along one axis: X, Y or Z. Six rays. The first occupied cell stops the ray.',
  bishop: 'Slide diagonally through two or three axes by equal distances. Twenty rays, including body diagonals.',
  knight: 'Jump two cells along one axis and one along another. Twenty-four vectors. The dashed elbow is a guide; intervening pieces do not block the jump.',
  queen: 'Slide along any axis, plane diagonal or body diagonal. Twenty-six rays. Occupied cells stop movement.',
  king: 'Step to any of the 26 neighbouring cells. An attacked destination is never legal.',
};

const visualPoint = (cell: Cell): Point3 => { const [x, y, z] = coordinates(cell); return [x - 3.5, z - 3.5, y - 3.5]; };
function announce(text: string): void { element('notice').textContent = text; }
function closeDepth(): void { element('depth-chooser').hidden = true; }
function setHover(cell: Cell | null, restoreFocus = true): void {
  if (cell === null && restoreFocus) {
    const focused = (document.activeElement as HTMLElement | null)?.dataset.inspectCell;
    if (focused !== undefined && available.some(m => m.to === Number(focused))) cell = Number(focused);
  }
  inspectedCell = cell;
  if (armedTouchCell !== cell) armedTouchCell = null;
  view.setHover(cell);
  element('hover-cell').textContent = cell === null ? '' : formatCell(cell);
  const candidates = available.filter(move => move.to === cell);
  const move = candidates[0];
  const explanation = element('move-explanation');
  explanation.classList.toggle('active', !!move);
  explanation.classList.toggle('capture', !!move && move.capturedId !== null);
  element('move-title').textContent = 'See the movement field';
  element('move-detail').textContent = 'Hover or focus a destination to inspect one move.';
  const piece = selected === null ? null : state.pieces[selected];
  element('instruction').textContent = piece ? title(piece.type) + ' · ' + new Set(available.map(m => m.to)).size + ' legal destinations · hover or focus to inspect' : 'Select a piece to explore its moves.';
  if (move) {
    if (!inspectionCache.has(move.to)) inspectionCache.set(move.to, inspectCheck(state, candidates));
    const check = inspectionCache.get(move.to)!;
    const captured = move.capturedId === null ? null : state.pieces[move.capturedId];
    const action = move.kind === 'jump' ? 'Jump' : move.kind === 'slide' ? 'Slide' : 'Step';
    const delta = coordinates(move.to).map((n, i) => n - coordinates(move.from)[i]).map(n => n > 0 ? '+' + n : String(n)).join(', ');
    const details = [captured ? 'Capture ' + title(captured.owner) + ' ' + captured.type + '.' : 'Empty destination.', 'Displacement (' + delta + ').'];
    if (move.kind === 'jump') details.push('Intervening cells do not block the jump.');
    if (move.promotion) details.push('Choose a promotion before committing.');
    if (check === 'yes') details.push('Gives check.');
    if (check === 'promotion-dependent') details.push('Check depends on the promotion choice.');
    element('move-title').textContent = action + ' to ' + formatCell(move.to);
    element('move-detail').textContent = details.join(' ');
    element('instruction').textContent = action + (captured ? ' · capture ' + captured.type : '') + (check === 'yes' ? ' · gives check' : '') + (armedTouchCell === cell ? ' · tap again to move' : ' · click or Enter to move');
  }
  document.querySelectorAll<HTMLButtonElement>('.destination').forEach(button => button.classList.toggle('inspected', !!move && Number(button.dataset.inspectCell) === cell));
}

function clearPreview(): void { armedTouchCell = null; setHover(null, false); }
function bindInspection(button: HTMLButtonElement, cell: Cell): void {
  button.dataset.inspectCell = String(cell);
  button.setAttribute('aria-describedby', 'move-explanation');
  button.addEventListener('mouseenter', () => setHover(cell));
  button.addEventListener('mouseleave', () => setHover(null));
  button.addEventListener('focus', () => setHover(cell));
  button.addEventListener('blur', () => setHover(null));
}

function selectPiece(id: number | null): void {
  closeDepth(); clearPreview(); inspectionCache.clear(); selected = id;
  if (id !== null && element<HTMLInputElement>('isolate').checked) {
    element<HTMLSelectElement>('plane').value = String(coordinates(state.pieces[id].cell!)[2]); updateOptions();
  }
  const start = performance.now();
  available = id === null || gameStatus(state).kind !== 'playing' ? [] : legalMoves(state, id);
  lastGenerationMs = performance.now() - start;
  view.setSelection(selected, available);
  renderInspector();
  if (id !== null) view.present({ kind: 'selection', at: visualPoint(state.pieces[id].cell!) });
  clearPreview();
}

function selectCell(cell: Cell, input: SelectionInput = 'pointer'): void {
  if (view.isAnimating) return;
  closeDepth();
  const candidates = available.filter(m => m.to === cell);
  if (candidates.length) {
    if (input === 'touch' && armedTouchCell !== cell) {
      armedTouchCell = cell; setHover(cell); announce('Inspecting ' + formatCell(cell) + '. Tap again to move.');
      return;
    }
    armedTouchCell = null;
    if (candidates[0].promotion) {
      promotionMoves = candidates; element<HTMLDialogElement>('promotion-dialog').showModal();
    } else play(candidates[0]);
    return;
  }
  const piece = cell === -1 ? undefined : pieceAt(state, cell);
  selectPiece(piece?.id ?? null);
}

function play(move: Move): void {
  const piece = state.pieces[move.pieceId];
  const owner = piece.owner;
  const label = moveLabel(piece.type, move);
  try {
    const undo = commitMove(state, move);
    history.push({ undo, label, owner });
    autosave();
    selected = null; available = [];
    inspectionCache.clear(); view.setState(state, true); view.setSelection(null, []); clearPreview();
    if (element<HTMLInputElement>('isolate').checked) {
      element<HTMLSelectElement>('plane').value = String(coordinates(move.to)[2]); updateOptions();
    }
    render();
    const at = visualPoint(move.to), from = visualPoint(move.from);
    view.present({ kind: 'move', from, at, owner });
    if (move.capturedId !== null) view.present({ kind: 'capture', from, at, owner });
    const status = gameStatus(state);
    if (isInCheck(state, sideToMove(state))) {
      const king = state.pieces.find(p => p.owner === sideToMove(state) && p.type === 'king')!;
      view.present({ kind: 'check', at: visualPoint(king.cell!) });
    }
    view.present({ kind: 'position', at });
    announce(status.kind === 'playing' ? title(owner) + ' moved. ' + title(sideToMove(state)) + ' to play.' : status.kind === 'checkmate' ? title(status.winner) + ' wins by checkmate.' : 'Draw: ' + status.reason.replaceAll('-', ' ') + '.');
  } catch (error) { announce(error instanceof Error ? error.message : 'Move rejected'); }
}

function renderInspector(): void {
  const piece = selected === null ? null : state.pieces[selected];
  element<HTMLSelectElement>('piece-navigator').value = piece ? String(piece.id) : '';
  element<HTMLButtonElement>('focus-piece').disabled = !piece;
  element<HTMLButtonElement>('orbit-piece').disabled = !piece;
  element('selected-glyph').textContent = piece ? PIECE_LETTERS[piece.type] : '◇';
  element('selected-glyph').className = 'selected-glyph ' + (piece?.owner ?? '');
  element('selected-name').textContent = piece ? title(piece.owner) + ' ' + piece.type : 'Explore the cube';
  element('selected-position').textContent = piece?.cell !== null && piece?.cell !== undefined ? formatCell(piece.cell) : 'X · Y · Z';
  element('piece-rule').textContent = piece ? (piece.type === 'pawn' && state.profile === 'prototype-1-three' ? 'Move forward on Y or either way on Z. Capture with ±X plus that Y or Z step: six attack vectors. Promote on the opposite home Z plane.' : pieceRules[piece.type]) : 'Select a piece to see how it moves through three dimensions.';
  const moves = [...new Map(available.map(m => [m.to, m])).values()].sort((a, b) => a.to - b.to);
  element('legal-count').textContent = piece ? String(moves.length) : '—';
  const destinations = element('destinations'); destinations.replaceChildren();
  if (!moves.length) {
    const p = document.createElement('p'); p.className = 'muted small';
    p.textContent = !piece ? 'Select a piece to illuminate its legal moves.' : piece.owner !== sideToMove(state) ? 'Inspecting the opponent. Select a ' + sideToMove(state) + ' piece to move.' : 'No legal moves. Moving this piece may expose your king.';
    destinations.append(p);
  }
  for (const move of moves) {
    const button = document.createElement('button');
    button.className = 'destination' + (move.capturedId !== null ? ' capture' : '');
    button.textContent = formatCell(move.to) + (move.promotion ? ' ↟' : move.capturedId !== null ? ' ×' : '');
    button.setAttribute('aria-label', 'Move to ' + formatCell(move.to));
    button.addEventListener('click', event => selectCell(move.to, event.pointerType === 'touch' ? 'touch' : 'pointer'));
    bindInspection(button, move.to);
    destinations.append(button);
  }
  element('instruction').textContent = piece ? title(piece.type) + ' · ' + moves.length + ' legal destinations' + (piece.type === 'knight' ? ' · jumps ignore blockers' : '') : 'Select a piece to explore its moves.';
}

function render(): void {
  const status = gameStatus(state);
  const owner = sideToMove(state);
  element('turn-card').className = 'turn-card ' + owner;
  element('turn-label').textContent = status.kind === 'checkmate' ? title(status.winner) + ' wins' : status.kind === 'draw' ? 'Game drawn' : title(owner) + ' to move';
  element('status-detail').textContent = status.kind === 'playing' ? status.check ? 'In check · protect your king' : owner === 'white' ? 'Home Z = 0 · promotion Z = 7' : 'Home Z = 7 · promotion Z = 0' : status.kind === 'checkmate' ? 'Checkmate' : title(status.reason.replaceAll('-', ' '));
  element('turn-card').classList.toggle('in-check', status.kind === 'playing' && status.check);
  element('piece-count').textContent = String(state.pieces.filter(p => p.cell !== null).length);
  element('move-count').textContent = state.ply + ' PLY';
  element<HTMLButtonElement>('undo').disabled = !history.length;
  const navigator = element<HTMLSelectElement>('piece-navigator');
  navigator.replaceChildren(new Option('Select on the cube', ''));
  for (const piece of state.pieces.filter(p => p.cell !== null)) navigator.add(new Option(title(piece.owner) + ' ' + piece.type + ' ' + formatCell(piece.cell!), String(piece.id)));
  const log = element('history'); log.replaceChildren();
  if (!history.length) log.innerHTML = '<p class="empty-history">A new dimension.<br>Your first move.</p>';
  history.forEach((entry, index) => {
    const row = document.createElement('div'); row.className = 'move-row ' + entry.owner;
    const number = document.createElement('span'); number.className = 'move-number'; number.textContent = String(index + 1).padStart(2, '0');
    const text = document.createElement('span'); text.textContent = entry.label;
    row.append(number, text); log.append(row);
  });
  log.scrollTop = log.scrollHeight;
  const setupData = SETUPS.find(s => s.id === setup)!;
  element('setup-description').textContent = setupData.description;
  element('stage-description').textContent = setupData.name + ' · ' + PROFILES[state.profile].name.toLowerCase();
  renderInspector();
}

try {
  view = new BoardView(element('board'), {
    select: selectCell, hover: setHover, gesture: closeDepth, navigate: clearPreview,
    chooseDepth: (cells, x, y, input) => {
      const chooser = element('depth-chooser'); const options = element('depth-options'); options.replaceChildren();
      for (const cell of cells) {
        const piece = pieceAt(state, cell);
        const button = document.createElement('button');
        button.textContent = formatCell(cell) + ' · ' + (piece ? title(piece.owner) + ' ' + piece.type : 'Legal destination');
        button.addEventListener('click', () => selectCell(cell, input)); bindInspection(button, cell); options.append(button);
      }
      const rect = element('board').getBoundingClientRect();
      chooser.style.left = Math.max(8, Math.min(x - rect.left, rect.width - 275)) + 'px';
      chooser.style.top = Math.max(85, Math.min(y - rect.top, rect.height - 250)) + 'px';
      chooser.hidden = false;
    },
  });
  restoreGame();
  view.setState(state); render();
  if (setup !== 'outer-planes' && state.ply === 0) selectPiece(2);
} catch (error) {
  element('board').innerHTML = '<div class="render-error"><h2>The cube needs WebGL 2</h2><p>Enable graphics acceleration in your browser, then reload.</p></div>';
  console.error(error);
}

element('piece-navigator').addEventListener('change', event => {
  const value = (event.target as HTMLSelectElement).value; selectPiece(value === '' ? null : Number(value));
});
function autosave(): void {
  try {
    localStorage.setItem(SAVE_KEY, encodeGame(setup, state.profile, history));
    element('save-status').textContent = 'Saved automatically in this browser';
    element('save-status').classList.remove('save-error');
  } catch {
    element('save-status').textContent = 'Could not save. Keep this page open to retain your game.';
    element('save-status').classList.add('save-error');
  }
}

function restoreGame(): void {
  try {
    const raw = localStorage.getItem(SAVE_KEY);
    if (raw === null) { autosave(); return; }
    const saved = decodeGame(raw);
    setup = saved.setup; state = saved.state; history.push(...saved.history);
    element<HTMLSelectElement>('setup').value = setup;
    element<HTMLSelectElement>('profile').value = state.profile;
    element('save-status').textContent = 'Saved game restored from this browser';
    announce('Game restored. ' + title(sideToMove(state)) + ' to play.');
  } catch {
    // Keep unreadable data intact until the user starts or changes a game.
    element('save-status').textContent = 'Saved game unavailable or incompatible. Showing a fresh board; your next move or reset replaces the save.';
    element('save-status').classList.add('save-error');
  }
}

function startGame(nextSetup: SetupId, profile: ProfileId): void {
  setup = nextSetup;
  state = createSetup(setup, profile); history.length = 0; selected = null; available = []; promotionMoves = [];
  element<HTMLSelectElement>('setup').value = setup;
  element<HTMLSelectElement>('profile').value = profile;
  inspectionCache.clear(); clearPreview();
  closeDepth(); view.setState(state); view.setSelection(null, []); render(); updateOptions();
  if (setup !== 'outer-planes') selectPiece(2);
  autosave();
  announce('Loaded ' + SETUPS.find(s => s.id === setup)!.name.toLowerCase());
}
function confirmReset(nextSetup: SetupId, profile: ProfileId): void {
  pendingReset = { setup: nextSetup, profile };
  element('reset-detail').textContent = 'Start ' + SETUPS.find(s => s.id === nextSetup)!.name.toLowerCase()
    + ' again with ' + PROFILES[profile].name.toLowerCase() + '? This replaces the current board, move history and automatic save.';
  element<HTMLDialogElement>('reset-dialog').showModal();
}
element('new-game').addEventListener('click', () => {
  const nextSetup = element<HTMLSelectElement>('setup').value as SetupId;
  const profile = element<HTMLSelectElement>('profile').value as ProfileId;
  if (history.length) confirmReset(nextSetup, profile);
  else startGame(nextSetup, profile);
});
element('reset-game').addEventListener('click', () => confirmReset(setup, state.profile));
element('cancel-reset').addEventListener('click', () => element<HTMLDialogElement>('reset-dialog').close());
element('reset-dialog').addEventListener('close', () => { pendingReset = null; });
element('confirm-reset').addEventListener('click', () => {
  if (!pendingReset) return;
  const next = pendingReset;
  element<HTMLDialogElement>('reset-dialog').close();
  pendingReset = null;
  startGame(next.setup, next.profile);
});
element('undo').addEventListener('click', () => {
  const entry = history.pop(); if (!entry) return;
  unmakeMove(state, entry.undo); autosave(); selected = null; available = [];
  inspectionCache.clear(); view.setState(state); view.setSelection(null, []); clearPreview(); render(); announce('Move undone. ' + title(sideToMove(state)) + ' to play.');
});
function updateOptions(): void {
  let plane = element<HTMLSelectElement>('plane').value;
  const isolate = element<HTMLInputElement>('isolate').checked;
  if (isolate && plane === 'all') { plane = selected === null ? '0' : String(coordinates(state.pieces[selected].cell!)[2]); element<HTMLSelectElement>('plane').value = plane; }
  view.setOptions({ trajectories: element<HTMLInputElement>('trajectories').checked, labels: element<HTMLInputElement>('labels').checked, plane: plane === 'all' ? null : Number(plane), isolate });
  element('plane-badge').textContent = plane === 'all' ? 'ALL 8 LEVELS' : 'Z = ' + plane + (isolate ? ' · ISOLATED' : ' · EMPHASISED');
}
for (const id of ['trajectories', 'labels', 'plane', 'isolate']) element(id).addEventListener('change', () => {
  if (id === 'plane' || id === 'isolate') clearPreview();
  updateOptions();
});
document.querySelectorAll<HTMLButtonElement>('[data-camera]').forEach(button => button.addEventListener('click', () => {
  clearPreview(); view.preset(button.dataset.camera as CameraPreset);
  document.querySelectorAll('[data-camera]').forEach(el => el.classList.toggle('active', el === button)); closeDepth();
}));
element('theme').addEventListener('change', () => {
  const theme = element<HTMLSelectElement>('theme').value as ThemeId;
  view.setTheme(theme);
  element('crystal-options').hidden = theme !== 'crystal';
  for (const effect of ['refraction', 'spectral', 'caustics', 'inclusions']) element<HTMLInputElement>('crystal-' + effect).checked = theme === 'crystal' && effect !== 'inclusions';
  if (theme === 'crystal') view.setCrystalEffects({ refraction: true, spectral: true, caustics: true, inclusions: false });
  announce('Theme changed. Game and movement field retained.');
});
for (const effect of ['refraction', 'spectral', 'caustics', 'inclusions']) element('crystal-' + effect).addEventListener('change', () => {
  view.setCrystalEffects({ refraction: element<HTMLInputElement>('crystal-refraction').checked,
    spectral: element<HTMLInputElement>('crystal-spectral').checked, caustics: element<HTMLInputElement>('crystal-caustics').checked, inclusions: element<HTMLInputElement>('crystal-inclusions').checked });
});
element('ambient-effects').addEventListener('change', () => view.setEffects(element<HTMLInputElement>('ambient-effects').checked));
element('focus-piece').addEventListener('click', () => { clearPreview(); if (view.focusSelection()) announce('Focusing selected piece. Any input interrupts.'); });
element('orbit-piece').addEventListener('click', () => { clearPreview(); if (view.focusSelection(true)) announce('Inspecting selected piece. Any input interrupts.'); });
element('manual-camera').addEventListener('click', () => { view.director.interrupt(); announce('Manual camera control'); });
element('reset-camera').addEventListener('click', () => { clearPreview(); view.preset('iso'); closeDepth(); });
element('depth-cancel').addEventListener('click', closeDepth);
element('help').addEventListener('click', () => element<HTMLDialogElement>('help-dialog').showModal());
element('close-help').addEventListener('click', () => element<HTMLDialogElement>('help-dialog').close());
element('cancel-promotion').addEventListener('click', () => element<HTMLDialogElement>('promotion-dialog').close());
document.querySelectorAll<HTMLButtonElement>('[data-promote]').forEach(button => button.addEventListener('click', () => {
  const move = promotionMoves.find(m => m.promotion === button.dataset.promote as Promotion);
  element<HTMLDialogElement>('promotion-dialog').close(); if (move) play(move);
}));
for (const which of ['game', 'inspect']) element(which + '-panel-button').addEventListener('click', () => {
  const open = !element(which + '-panel').classList.contains('open');
  for (const panel of ['game', 'inspect']) {
    element(panel + '-panel').classList.toggle('open', panel === which && open);
    element(panel + '-panel-button').setAttribute('aria-expanded', String(panel === which && open));
  }
});
window.addEventListener('keydown', event => {
  if (event.key === 'Escape' && !document.querySelector('dialog[open]')) { closeDepth(); selectPiece(null); }
});

// Read-only diagnostics for browser verification; no bypass around user move validation.
if (import.meta.env.DEV) {
  Object.assign(window, { __cubical: {
    snapshot: () => ({ pieces: state.pieces.map(p => ({ ...p })), board: Array.from(state.board), side: sideToMove(state), ply: state.ply, profile: state.profile, selected, moves: available.map(m => ({ ...m })), status: gameStatus(state), inCheck: isInCheck(state, sideToMove(state)), history: history.map(h => h.label), generationMs: lastGenerationMs }),
    project: (cell: Cell) => view.project(cell),
    metrics: () => ({ ...view.metrics }),
    movementField: () => ({ ...view.movementField(), inspectedCell }),
    camera: () => view.camera.position.toArray(),
    presentation: () => ({ ...view.presentationMetrics(), target: view.controls.target.toArray() }),
  } });
}
window.addEventListener('pagehide', event => { if (!event.persisted) view?.dispose(); });
