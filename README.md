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
- Orbit, pan, zoom, front/side/above/below/isometric presets, legal destinations, slider guides, and dashed knight jump guides.
- Depth chooser for overlapping cells, piece navigator, accessible destination buttons, and optional level isolation.
- A single-screen desktop/tablet layout with temporary spatial symbols and letter labels.

Select a piece and then an illuminated destination. Drag to orbit, scroll or pinch to zoom, and right-drag or use two fingers to pan. Gold destinations indicate captures. If multiple cells overlap under the pointer, choose the intended coordinate from the depth chooser. The piece navigator and destination buttons provide an alternative to picking in the cube.

The **Spatial study** starts with a central knight and 24 legal destinations. **King safety** demonstrates a rook pinned to its king along a body diagonal. **Promotion study** provides both a quiet promotion and a capturing promotion. Loading a position resets the current game.

`prototype-1` pawns move quietly along ±Y or ±Z. They capture at `(±1, ±1, 0)` and `(±1, 0, ±1)`, changing X only by capture. White promotes at Z = 7 and Black at Z = 0. Quiet pawn moves do not reset the 100-ply no-progress counter. Castling, initial pawn double moves and en passant are omitted.

## Project layout

`src/rules/` owns the 512-cell state, rule profiles, attack geometry, legal moves, make/unmake, terminal status, and setups. It has no browser or Three.js dependencies. `src/view/board.ts` renders pieces, guides and picking proxies from that state. `src/main.ts` coordinates user commands, status and the move log; it revalidates moves through the rules core before committing them.

The renderer draws on changes and during camera/move animation. Piece geometry is shared, destination markers are instanced, and grid segments are batched. The development build exposes read-only `window.__cubical` diagnostics used by browser tests; there is no test-only move command.

## Current scope

This is the functional vertical slice. The move log lasts for the current page session; reload resets it. LocalStorage archives/resume, final multidirectional piece designs, a Web Worker computer opponent, threat/ghost overlays, and online play remain later stages in the [approved plan](THREE_DIMENSIONAL_CHESS_PLAN.md).

See the [slice report](docs/PROTOTYPE_1_RESULTS.md) for verification, measurements, and issues to carry into the next stage.
