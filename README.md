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

Select a piece to see its full movement field. Hover a destination or focus its button to emphasize that marker and inspect one path: a continuous ray for sliders, a dashed elbow for Knights. The inspector explains displacement, capture and prospective check without changing the game. Reflective, metallic gold markers indicate legal destinations; larger, warmer gold markers indicate captures. The material uses a small shared reflection map so it remains legible in every theme. Click or press Enter to move. On touchscreens, tap a destination to inspect it, then tap it again to commit.

Drag to orbit, scroll or pinch to zoom, and right-drag or use two fingers to pan. If multiple cells overlap under the pointer, choose the intended coordinate from the depth chooser. The piece navigator and destination buttons provide an alternative to picking in the cube. Level isolation is optional; the full cube remains the default.

The **Spatial study** starts with a central knight and 24 legal destinations. **King safety** demonstrates a rook pinned to its king along a body diagonal. **Promotion study** provides both a quiet promotion and a capturing promotion. Loading a position resets the current game.

`prototype-1` pawns move quietly along ±Y or ±Z. They capture at `(±1, ±1, 0)` and `(±1, 0, ±1)`, changing X only by capture. White promotes at Z = 7 and Black at Z = 0. Quiet pawn moves do not reset the 100-ply no-progress counter. Castling, initial pawn double moves and en passant are omitted.

## Project layout

`src/rules/` owns the 512-cell state, rule profiles, attack geometry, legal moves, make/unmake, terminal status, and setups. It has no browser or Three.js dependencies. `src/view/board.ts` renders pieces, guides and picking proxies from that state. `src/main.ts` coordinates user commands, status and the move log; it revalidates moves through the rules core before committing them.

Captures animate as a short electrical takeover: the attacker pulses and crackles during approach, and the victim shatters into glittering crystal shards that scatter and fade. Replay pauses and resumes the whole sequence. Undo, reset, loading a position, returning to the present or switching themes clears the effects immediately. Turning off **Ambient animation** or enabling reduced motion suppresses the electrical/shard effects.

The default renderer draws on changes and during camera/move animation. Destination markers are instanced and grid segments are batched. Themes own piece visuals, materials, lighting and effects; the common view owns copied positions, picking and movement assistance. The development build exposes read-only `window.__cubical` diagnostics used by browser tests; there is no test-only move command.

## Theme and camera study

**Diagnostic · clean lattice** remains the default. Choose **Luminous · electric space** for sapphire/cyan and ruby/red faceted pieces with localized electric light and scintillation against a near-black, sparse starfield. Gold legal destinations and amber captures keep their common styling. The board hangs inside a surrounding star sphere; **Frosty star twinkle** adds icy, independently twinkling highlights. This switch starts off and is remembered across theme changes within the page. Ambient animation and reduced-motion settings freeze the twinkle.

**Lattice display** is independent of theme: **Full** retains the analytical grid, **Structural** reduces it to structural plane cues, and **Adaptive** strengthens local cell context around selected pieces, legal destinations and inspected paths. Switching themes preserves that setting. In Luminous, **Frosted cell lines** temporarily shows the edges of all 512 cubical cells, including the complete interior, as a fine electric-cyan wireframe, with icy glitter, subtle junction accents and sparse travelling light traces; switching it off restores the chosen lattice mode. Turn off **Ambient animation** for static rendering.

Open **Camera study** for **Focus selected**, **Inspect orbit** or **Close inspection**. The close orbit can enter the volume to inspect a piece. Pointer down, wheel or keyboard input immediately returns control to you. Reduced-motion preferences are respected. Theme, lattice and camera changes do not alter the game or its save; these view settings are not persisted yet.

The [Luminous electric study report](docs/LUMINOUS_ELECTRIC_STUDY.md) contains seven-view piece-recognition sheets, lattice comparisons, performance and remaining limitations. This is a bounded visual study, not final art polish.

**Crystal · optical study** remains available for reference, including its independent effects and optional cubical inclusions. Further work on a strongly crystalline playing volume has stopped following human review. See the [Crystal report](docs/CRYSTAL_EXAGGERATED_STUDY.md) for that experiment's results. Future cinematic replay, attract mode and other environments remain later work.


## Current scope

The active game saves automatically in browser localStorage after each move, promotion, undo, position load and reset. Reload restores the setup, pawn profile, board, turn, move history and undo capability. Use the same browser and site address (including port) to resume that save. One active game is retained; camera position and hover previews are not saved.

**Reset game** asks for confirmation, then restarts the currently loaded position with its current pawn profile and clears its move history. **Load position** also asks before replacing a game with played moves. Cancel or Escape keeps the game. The save status below these controls reports storage failures; play can continue in memory if storage is unavailable.

**Save game** downloads the active game as `YYYYMMDD-HHMMSS.chess3.json`, using your device’s local date and time. **Load game** opens a file picker and restores the saved setup, pawn profile, board, turn, full move history and undo capability. Loading over a game with played moves asks for confirmation; Cancel or Escape keeps the current game. Imported games become the browser’s active autosave. Invalid, incompatible or illegal files leave your current game and autosave unchanged. File saving and loading also work when browser storage is unavailable. Visual settings are not included.

### Game replay

The **Move record** controls replay the current game or a game loaded from a JSON file:

- **Jump to start** (⏮), **Previous move** (◀) and **Next move** (▶) inspect recorded positions.
- **Play / Pause** runs the moves automatically, animating pieces in the cube. Pause freezes an in-flight movement; Play resumes it. Play from the present or a completed replay starts again from the beginning.
- **Back to present** exits replay and restores the live position for play. The current recorded move is highlighted.

Replay is read-only and uses a separate position: the live board, move history, undo and browser autosave stay intact. **Save game** still exports the complete live game. Camera, theme and lattice controls remain available. Replay shows all levels on entry so an isolated slice cannot hide the moves. Loading/resetting a game ends replay; reloading the page returns to the saved present. Switching away from the tab pauses playback. Reduced-motion preferences use immediate position changes instead of piece travel.

Records carry schema and rules versions and are validated by replay through the rules engine. An unreadable or incompatible save is reported and left intact until the next game change. Browser save archives, final multidirectional piece designs, a Web Worker computer opponent, threat/ghost overlays, and online play remain later stages in the [approved plan](THREE_DIMENSIONAL_CHESS_PLAN.md).

See the [slice report](docs/PROTOTYPE_1_RESULTS.md) for verification, measurements, and issues to carry into the next stage.

The [spatial UI refinement report](docs/SPATIAL_UI_REFINEMENTS.md) records the subsequent constellation, focus and touch improvements.
