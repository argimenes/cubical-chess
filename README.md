# Cubical Chess

A functional TypeScript + Three.js prototype of chess on an 8 × 8 × 8 lattice. Node.js runs the development server, build, and headless rules tests.

## Run

Requires Node.js 22.12 or newer.

```sh
npm install
npm run dev
```

Open the local URL printed by Vite, normally **http://127.0.0.1:5173/**. For testing on a tablet on the same network, run `npm run dev -- --host 0.0.0.0` and open the computer's LAN address on port 5173.

```sh
npm run check
npm test
npm run build
npx playwright install chromium
npm run test:browser
```

## The vertical slice

- Two local players; full opposing outer-plane setup or three small study positions.
- All six piece geometries, capture, king safety, promotion, game status, repetition, no-progress draw, and exact undo.
- Four-direction pawns (`prototype-1`) and a three-direction comparison. Profile changes take effect when loading a position.
- Orbit, pan, zoom, front/side/above/below/isometric presets, complete legal-destination constellations, and one inspected path at a time.
- Depth chooser for overlapping cells, piece navigator, accessible destination buttons, and optional level isolation.
- A single-screen desktop/tablet layout with temporary spatial symbols and letter labels.

Select a piece to see its full movement field. Hover a destination or focus its button to emphasize that marker and inspect one path: a continuous ray for sliders, a dashed elbow for Knights. The inspector explains displacement, capture and prospective check without changing the game. Gold markers indicate legal destinations; larger amber markers indicate captures. Click or press Enter to move. On touchscreens, tap a destination to inspect it, then tap it again to commit.

Drag to orbit, scroll or pinch to zoom, and right-drag or use two fingers to pan. If multiple cells overlap under the pointer, choose the intended coordinate from the depth chooser. The piece navigator and destination buttons provide an alternative to picking in the cube. Level isolation is optional; the full cube remains the default.

The **Spatial study** starts with a central knight and 24 legal destinations. **King safety** demonstrates a rook pinned to its king along a body diagonal. **Promotion study** provides both a quiet promotion and a capturing promotion. Loading a position resets the current game.

`prototype-1` pawns move quietly along ±Y or ±Z. They capture at `(±1, ±1, 0)` and `(±1, 0, ±1)`, changing X only by capture. White promotes at Z = 7 and Black at Z = 0. Quiet pawn moves do not reset the 100-ply no-progress counter. Castling, initial pawn double moves and en passant are omitted.

## Project layout

`src/rules/` owns the 512-cell state, rule profiles, attack geometry, legal moves, make/unmake, terminal status, and setups. It has no browser or Three.js dependencies. `src/view/board.ts` renders pieces, guides and picking proxies from that state. `src/main.ts` coordinates user commands, status and the move log; it revalidates moves through the rules core before committing them.

The renderer draws on changes and during camera/move animation. Piece geometry is shared, destination markers are instanced, and grid segments are batched. The development build exposes read-only `window.__cubical` diagnostics used by browser tests; there is no test-only move command.

## Current scope

The active game saves automatically in browser localStorage after each move, promotion, undo, position load and reset. Reload restores the setup, pawn profile, board, turn, move history and undo capability. Use the same browser and site address (including port) to resume that save. One active game is retained; camera position and hover previews are not saved.

**Reset game** asks for confirmation, then restarts the currently loaded position with its current pawn profile and clears its move history. **Load position** also asks before replacing a game with played moves. Cancel or Escape keeps the game. The save status below these controls reports storage failures; play can continue in memory if storage is unavailable.

Records carry schema and rules versions and are validated by replay through the rules engine. An unreadable or incompatible save is reported and left intact until the next game change. Browser save archives, final multidirectional piece designs, a Web Worker computer opponent, threat/ghost overlays, and online play remain later stages in the [approved plan](THREE_DIMENSIONAL_CHESS_PLAN.md).

See the [slice report](docs/PROTOTYPE_1_RESULTS.md) for verification, measurements, and issues to carry into the next stage.

The [spatial UI refinement report](docs/SPATIAL_UI_REFINEMENTS.md) records the subsequent constellation, focus and touch improvements.
