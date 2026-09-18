import './style.css';
import { commitMove, gameStatus, isInCheck, legalMoves, pieceAt, sideToMove, unmakeMove } from './rules/engine';
import { coordinates, formatCell } from './rules/geometry';
import { createSetup, SETUPS, type SetupId } from './rules/setups';
import { PIECE_LETTERS, PROFILES, type Cell, type Move, type PieceType, type ProfileId, type Promotion, type UndoRecord } from './rules/types';
import { BoardView, type CameraPreset } from './view/board';

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
        <button id="new-game" class="secondary-button full-width">Load position <span>↗</span></button><p id="setup-description" class="muted small"></p>
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
        <label class="toggle"><span>Movement guides</span><input type="checkbox" id="trajectories" checked /><span class="switch"></span></label>
        <label class="toggle"><span>Piece labels</span><input type="checkbox" id="labels" checked /><span class="switch"></span></label>
        <div class="plane-control"><label for="plane" class="field-label">Inspect a Z level</label><select id="plane"><option value="all">All levels</option>${Array.from({ length: 8 }, (_, z) => '<option value="' + z + '">Z = ' + z + (z === 0 ? ' · White home' : z === 7 ? ' · Black home' : '') + '</option>').join('')}</select></div>
        <label class="toggle"><span>Show this level only</span><input type="checkbox" id="isolate" /><span class="switch"></span></label>
        <button id="reset-camera" class="text-button">↺ Reset camera</button>
      </section>
      <section class="panel-section selected-section"><label class="section-title" for="piece-navigator">PIECE INSPECTOR</label>
        <select id="piece-navigator" aria-label="Choose a piece"><option value="">Select on the cube</option></select>
        <div class="selected-heading"><span id="selected-glyph" class="selected-glyph">◇</span><div><h2 id="selected-name">Explore the cube</h2><p id="selected-position" class="mono">X · Y · Z</p></div></div>
        <p id="piece-rule" class="piece-rule">Select a piece to see how it moves through three dimensions.</p>
        <div class="dest-heading"><span class="section-title">LEGAL DESTINATIONS</span><strong id="legal-count">—</strong></div>
        <div id="destinations" class="destinations"><p class="muted small">Highlighted cells are safe moves for the selected piece.</p></div>
      </section>
      <div class="panel-footnote">Temporary spatial symbols · P pawn · R rook · B bishop · N knight · Q queen · K king</div>
    </aside>
  </main>
  <footer class="app-footer"><span><span class="footer-dot"></span> PROTOTYPE-1 <span class="footer-separator">·</span> LOCAL PLAY</span><span class="mouse-help">Drag to orbit · Scroll to zoom · Right-drag to pan</span><span class="touch-help">Drag to orbit · Pinch to zoom · Two fingers to pan</span><span id="notice" role="status" aria-live="polite">Ready to explore</span></footer>
  <dialog id="promotion-dialog"><div class="dialog-kicker">THE FAR HOME PLANE</div><h2>Choose your promotion</h2><p>Your pawn has reached the opposing home plane.</p><div class="promotion-options">${(['queen', 'rook', 'bishop', 'knight'] as const).map(type => '<button data-promote="' + type + '"><strong>' + PIECE_LETTERS[type] + '</strong><span>' + type + '</span></button>').join('')}</div><button id="cancel-promotion" class="secondary-button">Cancel move</button></dialog>
  <dialog id="help-dialog"><div class="dialog-kicker">WELCOME TO CUBICAL</div><h2>Find the move in the volume.</h2><p>White starts on Z = 0. Black starts on Z = 7. Select a piece, then select an illuminated cell to move. Gold destinations contain an opposing piece.</p><p>Drag to orbit; scroll or pinch to zoom. Use the camera presets to look through another face. When cells overlap, a depth chooser lets you select the exact coordinate. The piece navigator and destination list also work with a keyboard.</p><p>Four-direction pawns move into empty cells along ±Y or ±Z. They capture on X–Y or X–Z diagonals. A pawn reaches promotion at the opposite home Z plane.</p><p>Dashed knight guides illustrate a jump. Intervening cells do not block it. Moves exposing your king are excluded.</p><p class="muted">This is the functional slice: local two-player play and simple spatial symbols. Computer play, final piece designs and saved-game archives come in later stages.</p><button id="close-help" class="primary-button">Enter the cube</button></dialog>
`;

const element = <T extends HTMLElement = HTMLElement>(id: string): T => document.getElementById(id) as T;
const title = (value: string) => value.charAt(0).toUpperCase() + value.slice(1);
let setup: SetupId = 'outer-planes';
let state = createSetup(setup);
let selected: number | null = null;
let available: Move[] = [];
const history: { undo: UndoRecord; label: string; owner: string }[] = [];
let promotionMoves: Move[] = [];
let lastGenerationMs = 0;
let view: BoardView;
const pieceRules: Record<PieceType, string> = {
  pawn: 'Move one empty cell along ±Y or ±Z. Capture diagonally in X–Y or X–Z. Change X only by capturing. Promote on the opposite home Z plane.',
  rook: 'Slide along one axis: X, Y or Z. Six rays. The first occupied cell stops the ray.',
  bishop: 'Slide diagonally through two or three axes by equal distances. Twenty rays, including body diagonals.',
  knight: 'Jump two cells along one axis and one along another. Twenty-four vectors. The dashed elbow is a guide; intervening pieces do not block the jump.',
  queen: 'Slide along any axis, plane diagonal or body diagonal. Twenty-six rays. Occupied cells stop movement.',
  king: 'Step to any of the 26 neighbouring cells. An attacked destination is never legal.',
};

function announce(text: string): void { element('notice').textContent = text; }
function closeDepth(): void { element('depth-chooser').hidden = true; }
function setHover(cell: Cell | null): void {
  view.setHover(cell);
  element('hover-cell').textContent = cell === null ? '' : formatCell(cell);
}

function selectPiece(id: number | null): void {
  closeDepth(); selected = id;
  if (id !== null && element<HTMLInputElement>('isolate').checked) {
    element<HTMLSelectElement>('plane').value = String(coordinates(state.pieces[id].cell!)[2]); updateOptions();
  }
  const start = performance.now();
  available = id === null || gameStatus(state).kind !== 'playing' ? [] : legalMoves(state, id);
  lastGenerationMs = performance.now() - start;
  view.setSelection(selected, available);
  renderInspector();
}

function selectCell(cell: Cell): void {
  if (view.isAnimating) return;
  closeDepth();
  const candidates = available.filter(m => m.to === cell);
  if (candidates.length) {
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
  const label = PIECE_LETTERS[piece.type] + ' ' + formatCell(move.from) + (move.capturedId !== null ? ' × ' : ' → ') + formatCell(move.to) + (move.promotion ? ' = ' + PIECE_LETTERS[move.promotion] : '');
  try {
    const undo = commitMove(state, move);
    history.push({ undo, label, owner });
    selected = null; available = [];
    view.setState(state, true); view.setSelection(null, []); setHover(null);
    if (element<HTMLInputElement>('isolate').checked) {
      element<HTMLSelectElement>('plane').value = String(coordinates(move.to)[2]); updateOptions();
    }
    render();
    const status = gameStatus(state);
    announce(status.kind === 'playing' ? title(owner) + ' moved. ' + title(sideToMove(state)) + ' to play.' : status.kind === 'checkmate' ? title(status.winner) + ' wins by checkmate.' : 'Draw: ' + status.reason.replaceAll('-', ' ') + '.');
  } catch (error) { announce(error instanceof Error ? error.message : 'Move rejected'); }
}

function renderInspector(): void {
  const piece = selected === null ? null : state.pieces[selected];
  element<HTMLSelectElement>('piece-navigator').value = piece ? String(piece.id) : '';
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
    button.addEventListener('click', () => selectCell(move.to));
    button.addEventListener('mouseenter', () => setHover(move.to));
    button.addEventListener('mouseleave', () => setHover(null));
    button.addEventListener('focus', () => setHover(move.to));
    button.addEventListener('blur', () => setHover(null));
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
    select: selectCell, hover: setHover, gesture: closeDepth,
    chooseDepth: (cells, x, y) => {
      const chooser = element('depth-chooser'); const options = element('depth-options'); options.replaceChildren();
      for (const cell of cells) {
        const piece = pieceAt(state, cell);
        const button = document.createElement('button');
        button.textContent = formatCell(cell) + ' · ' + (piece ? title(piece.owner) + ' ' + piece.type : 'Legal destination');
        button.addEventListener('click', () => selectCell(cell)); options.append(button);
      }
      const rect = element('board').getBoundingClientRect();
      chooser.style.left = Math.max(8, Math.min(x - rect.left, rect.width - 275)) + 'px';
      chooser.style.top = Math.max(85, Math.min(y - rect.top, rect.height - 250)) + 'px';
      chooser.hidden = false;
    },
  });
  view.setState(state); render();
} catch (error) {
  element('board').innerHTML = '<div class="render-error"><h2>The cube needs WebGL 2</h2><p>Enable graphics acceleration in your browser, then reload.</p></div>';
  console.error(error);
}

element('piece-navigator').addEventListener('change', event => {
  const value = (event.target as HTMLSelectElement).value; selectPiece(value === '' ? null : Number(value));
});
element('new-game').addEventListener('click', () => {
  setup = element<HTMLSelectElement>('setup').value as SetupId;
  const profile = element<HTMLSelectElement>('profile').value as ProfileId;
  state = createSetup(setup, profile); history.length = 0; selected = null; available = [];
  closeDepth(); view.setState(state); view.setSelection(null, []); render(); updateOptions();
  if (setup !== 'outer-planes') selectPiece(2);
  announce('Loaded ' + SETUPS.find(s => s.id === setup)!.name.toLowerCase());
});
element('undo').addEventListener('click', () => {
  const entry = history.pop(); if (!entry) return;
  unmakeMove(state, entry.undo); selected = null; available = [];
  view.setState(state); view.setSelection(null, []); setHover(null); render(); announce('Move undone. ' + title(sideToMove(state)) + ' to play.');
});
function updateOptions(): void {
  let plane = element<HTMLSelectElement>('plane').value;
  const isolate = element<HTMLInputElement>('isolate').checked;
  if (isolate && plane === 'all') { plane = selected === null ? '0' : String(coordinates(state.pieces[selected].cell!)[2]); element<HTMLSelectElement>('plane').value = plane; }
  view.setOptions({ trajectories: element<HTMLInputElement>('trajectories').checked, labels: element<HTMLInputElement>('labels').checked, plane: plane === 'all' ? null : Number(plane), isolate });
  element('plane-badge').textContent = plane === 'all' ? 'ALL 8 LEVELS' : 'Z = ' + plane + (isolate ? ' · ISOLATED' : ' · EMPHASISED');
}
for (const id of ['trajectories', 'labels', 'plane', 'isolate']) element(id).addEventListener('change', updateOptions);
document.querySelectorAll<HTMLButtonElement>('[data-camera]').forEach(button => button.addEventListener('click', () => {
  view.preset(button.dataset.camera as CameraPreset);
  document.querySelectorAll('[data-camera]').forEach(el => el.classList.toggle('active', el === button)); closeDepth();
}));
element('reset-camera').addEventListener('click', () => { view.preset('iso'); closeDepth(); });
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
    camera: () => view.camera.position.toArray(),
  } });
}
window.addEventListener('pagehide', event => { if (!event.persisted) view?.dispose(); });
