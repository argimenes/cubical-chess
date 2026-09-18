# Cubical Chess: rules and implementation plan

**Status:** approved for staged implementation, 18 September 2026. The `prototype-1` functional vertical slice is implemented; see [results and issues](docs/PROTOTYPE_1_RESULTS.md). Movement rules remain playtest hypotheses.

## Source interpretation

The supplied [game brief](/Users/iianneill/Downloads/THREE_DIMENSIONAL_CHESS_GAME_BRIEF.md) describes the intended game and asks its original addressee to resolve several rules before coding. Those embedded instructions are design input, not a separate request to begin implementation. The supplied concept image is a strong visual reference, not evidence for rules, legal positions, notation, clocks, an “End Turn” action, or AI behaviour. This document provides a playable starting interpretation and a build sequence. Playtesting can change movement rules without holding up the first prototype.

The product is an **8 × 8 × 8 chess variant**, with 512 addressable cells and recognisable orthodox pieces. Its first complete version should support a legal local two-player game and a responsive computer opponent that looks a few plies ahead. It is a single-screen website for desktop PCs and tablets; phone layout is outside the initial target. TypeScript owns game logic; Three.js presents and controls the board; Node.js runs development, tests, builds, and optional headless analysis. A server is unnecessary for the first version.

## Proposed rules

### Coordinates and movement

Use integer game coordinates `(x, y, z)` in `[0, 7]³`: `x` and `y` span each horizontal plane, and `z` is vertical. White starts on the bottom plane (`z = 0`) and Black on the top plane (`z = 7`). The inherited planar “forward” direction is `+y` for White and `−y` for Black. Pawns may also move vertically in either direction; `z` is **not** their privileged forward move. Reaching the opposing `z` face is the experimental promotion objective. Map `(x, y, z)` to Three.js world `(x, z, y)` so the camera's up axis remains vertical. Show these axes, the planar forward direction, and both promotion faces in the UI.

| Piece | Proposed geometry | Open-space direction/vector count |
| --- | --- | ---: |
| Rook | Any unobstructed distance along exactly one axis | 6 rays |
| Bishop | Any unobstructed distance with equal nonzero changes on two or three axes | 20 rays |
| Queen | Rook and bishop rays | 26 rays |
| King | One cell in any queen direction, subject to check | Up to 26 cells |
| Knight | Every signed permutation of `(2, 1, 0)`; jumps | Up to 24 cells |

Sliding rays stop at the first occupied cell. Friendly pieces block; enemy pieces may be captured. A king cannot be captured: moves that would leave it attacked are illegal. The attacked-cell calculation must be separate from legal-move generation, especially for kings and pawns.

These vector sets are the first direct translation of familiar 2D movement into the cube. They provide a consistent prototype, but any piece's geometry can be amended after actual games show how it plays. The counts above describe this initial profile only.

### Pawn movement experiments

Keep the opposing outer-plane setup. Compare two small rule profiles before settling pawn movement. Let `s = +1` for White and `s = −1` for Black; all vectors below are relative to the pawn's cell. A quiet destination must be empty, a capture destination must hold an enemy, and all destinations must be in bounds.

| Profile | Quiet vectors | Capture/attack vectors |
| --- | --- | --- |
| **Four-direction experiment (recommended first)** | `(0, +1, 0)`, `(0, −1, 0)`, `(0, 0, +1)`, `(0, 0, −1)` | Eight diagonals: `(±1, ±1, 0)` and `(±1, 0, ±1)`; each `±` varies independently. |
| Three-direction comparison | `(0, s, 0)`, `(0, 0, +1)`, `(0, 0, −1)` | Six diagonals: `(±1, s, 0)` and `(±1, 0, ±1)`. |

In the four-direction version, “forward” and “backward” remain useful names for `y` movement, but both are legal and neither player has a directional advantage along `y`. The only pawn moves that change `x` are captures. This gives a simple rule: a pawn moves one cell along `y` or `z` into emptiness, and captures one cell diagonally in an `x-y` or `x-z` plane. It never moves or captures in a `y-z` diagonal, and it cannot capture straight along an axis. Its attack map includes the in-bounds capture destinations even when they are empty; legal captures require enemy occupancy.

**Consequences to test:**

- On an open interior cell, the four-direction pawn has four possible quiet destinations and attacks eight cells. A pawn on its starting outer `z` plane has three possible quiet destinations and attacks up to six cells before occupancy is considered. In the proposed setup, each pawn's backward `y` cell is occupied by its own back-rank piece, leaving only the forward `y` and inward `z` quiet moves initially. The extra branching emerges after pawns or back-rank pieces develop, rather than on move one.
- Backward `y` moves and captures let pawns retreat and defend in-plane. Up/down `z` moves and captures let a pawn return toward its own home plane. Pawns may spend many moves without approaching promotion, so playtests should check for stalling and long games.
- A pawn cannot quietly change its `x` file. A pawn blocked by an opposing pawn on the same file can move around it in `y` or capture diagonally into another file if an enemy is present. Test whether this produces interesting manoeuvres or too many stand-offs.
- Captures are symmetric in both `y` and `z`; enemy pieces can be threatened from directions players may initially read as “behind” a pawn. Legal-move markers and threat previews must display those eight diagonals clearly.
- The rule is identical for White and Black apart from promotion destination. Any colour-dependent attack vector in this profile would be a bug.

For the initial experiment, **promote immediately** on reaching the opponent's starting plane (`z = 7` for White, `z = 0` for Black), whether by a quiet vertical move or an `x-z` capture. Choose queen, rook, bishop, or knight. Reaching an edge in `y` does not promote. Omit initial double moves and en passant: either would add exceptions to this one-cell geometry. Promotion is the one intentional directional asymmetry in the four-direction profile.

The four-direction/eight-diagonal combination is the first playtest recommendation, not a settled rule. Keep the three-direction/six-diagonal version as a controlled comparison. Change movement rules from observed play before tuning AI or notation around them.

### Other game rules

- White moves first. Each legal move, including promotion, changes the side to move; there is no separate “End Turn” step.
- Check means a player's king is in an opponent's attacked cell. Checkmate means check with no legal response; stalemate means no check and no legal move.
- Omit castling in V1. The spatial board has no obvious orthodox castling lane or king safety analogue.
- Automatically draw at three occurrences of the same position or 100 halfmoves without a capture or promotion. Quiet pawn moves can be reversed, so they do **not** reset this experimental no-progress counter. The repetition key includes piece types, owners, cells, and side to move. Also draw a kings-only position. Defer broader insufficient-material rules until mating possibilities are understood.
- Undo restores the exact prior state, including captured piece, promotion, side to move, no-progress count, repetition history, and game status.

### Starting setup: opposing outer planes

Place all 16 White pieces on `z = 0` and all 16 Black pieces on `z = 7`. On each face, the back-rank order by `x = 0…7` is `R N B Q K B N R`, with one pawn at each `x` on the pawn row. The working coordinates are:

| Side | Back-rank cells | Pawn cells | Promotion face |
| --- | --- | --- | --- |
| White | `(x, 1, 0)` | `(x, 2, 0)` | `z = 7` |
| Black | `(x, 6, 7)` | `(x, 5, 7)` | `z = 0` |

The `y` rows are offset one cell from the outer edges and mirror each other. This avoids an artefact of placing back ranks at `y = 0` and `y = 7`: under the proposed bishop/queen geometry, opposing bishops and queens would be able to capture each other across an unobstructed seven-cell diagonal on the first move. An independent vector/ray check found no opening attacks on enemy pieces or kings with the proposed offset; the actual rules engine must confirm it. The empty middle planes (`z = 1…6`) are the intended meeting space. Keep setup data separate from move rules so playtesting can change the in-plane arrangement without changing the top/bottom orientation.

## Software design

Keep one authoritative, renderer-independent `GameState`. A compact 512-cell occupancy array can map `index = x + 8*y + 64*z` to a stable piece ID; a piece table stores colour, type, and cell. An explicit undo record supports fast make/unmake during search. Start with straightforward arrays and measurable correctness; optimise only after profiling.

Keep each piece's movement geometry in a small, explicit rule module, and keep pawn quiet moves, captures/attacks, promotion, and setup as separate rule functions. Select the four- or three-direction pawn vector set through an explicit rule profile, while preserving one rules engine for UI, tests, and AI. Identify playtest rule sets with a version or profile name so saved positions and test fixtures remain interpretable after a movement change. Avoid a generic rule language until experiments show one is needed.

Represent piece ownership with a player ID and game setup with an explicit player list and turn order, while implementing and testing only White and Black first. Keep promotion destinations in the rule profile rather than deriving them from a hard-coded colour check. This leaves room to study larger games without making the initial engine a generic multiplayer framework.

```text
src/
  rules/        coordinates, setup, attacks, pseudo moves, legal moves,
                make/unmake, status, repetition, serialization
  ai/           evaluation, search, worker messages and worker entry
  view/         Three.js scene, cube, pieces, picking, markers, trajectories
  ui/           game controls, status, promotion, settings, accessibility
  app/          state coordination and input flow
tests/          geometry, legality, state integrity, terminal positions
```

Node.js will run a TypeScript build and test workflow. Vite is a suitable small browser build tool and supports module workers with `new Worker(new URL(..., import.meta.url), { type: 'module' })` ([Vite documentation](https://vite.dev/guide/features#web-workers)). The AI worker receives a serializable state snapshot and returns a move with a request ID; stale replies are ignored after undo, restart, or a newer request. Browser workers exchange structured-cloneable data ([MDN](https://developer.mozilla.org/en-US/docs/Web/API/Worker/postMessage)). The rules package must run headlessly in Node.js and in that browser worker without importing Three.js or DOM APIs.

The rules engine should expose legal destinations **and** explanation data: piece, origin, destination, capture, and the path/ray for sliders. The view renders only engine-provided moves and attacked cells. For a preview, make a temporary move, calculate its consequences, then unmake it without touching visible history. Keep attack maps distinct from legal moves: a pinned piece can attack a cell it cannot legally move to, and pawn attacks differ from pawn quiet moves.

### Single-screen layout and browser history

Keep the cube central and give it the largest share of the viewport. On desktop, place compact status, move-history, and display controls beside it. On tablets, collapse those panels into tabs or drawers so the board stays large in portrait and landscape. Keep the page itself within one viewport; a long game log may scroll inside its panel. Provide mouse orbit/pan/zoom and touch rotate/pan/pinch with clear tap-to-select behaviour. A drag or gesture must never commit a move. Do not spend the first pass on a phone-specific layout.

Store the active game and an archive of finished or explicitly saved games in the browser's `localStorage`. Each compact record should include a schema version, rule-profile ID, setup ID or starting position, game ID, timestamps, players/mode, move coordinates and promotion choices, result, and a final-position snapshot for archive inspection. Save the active game after each committed move, undo, or promotion; offer Resume, Save Game, New Game, and a history list on the same screen. Replay history from the move list with its original rules profile, or preserve a readable record if an old profile cannot be replayed after a rule change. Keep visual preferences separately from game records.

**Prototype implementation:** automatic active-game save/resume is now implemented under `cubical-chess.active-game`, using schema/rules versions, setup/profile IDs and committed move commands. Reload legally replays the commands to reconstruct board, turn, history, draw counters and undo. Reset game requires a modal confirmation and restarts the current setup/profile; loading a position also asks before replacing played moves. Storage failures are shown in the game panel. Unreadable records are preserved until a game change replaces them. Archives, multiple named games and saved view preferences remain later work.

Use small JSON records and write on game events rather than every animation frame: Web Storage operations are synchronous ([MDN](https://developer.mozilla.org/en-US/docs/Web/API/Web_Storage_API)). Handle unavailable storage and quota errors without losing the current in-memory game. Saved games are local to that browser and site origin, can be cleared by the user/browser, and do not sync across devices ([MDN](https://developer.mozilla.org/en-US/docs/Web/API/Window/localStorage), [MDN storage limits](https://developer.mozilla.org/en-US/docs/Web/API/Storage_API/Storage_quotas_and_eviction_criteria)). If archive size becomes a real constraint, evaluate an export option or IndexedDB then.

## First playable vertical slice

Build a narrow end-to-end slice before adding all rules or optical effects:

1. Model all 512 cells, piece occupancy, coordinate conversion, side to move, and make/unmake. Load a small fixture containing both kings and representative rook, bishop, and knight positions.
2. Generate geometry, attacks, check-safe legal moves, and tests for those pieces. Include blockers and all relevant board boundaries. Make a move in the headless runner and verify undo restores the exact state.
3. Render a restrained wire cube, axes, cell markers, and simple distinct piece shapes in Three.js. Add orbit, pan, zoom, camera reset, and front/side/top/isometric presets. [OrbitControls](https://threejs.org/docs/pages/OrbitControls.html) supplies the basic camera interaction.
4. Select a piece and a legal destination through explicit pick targets. Use [Raycaster](https://threejs.org/docs/pages/Raycaster.html) with cell/instance IDs; distinguish a click from a drag so orbiting cannot commit a move. Highlight legal destinations and show slider paths. Show a discontinuous guide for knight moves.
5. Verify that users can identify and select cells at the cube's front, middle, and back without relying on slice mode, using both desktop pointer controls and tablet touch gestures. Add a plane selector or cycling through overlapping ray hits where needed.

**Slice exit gate:** a player can navigate the whole cube, select legal 3D moves, and see an accurate path; illegal king-exposing moves are unavailable; headless state and rendered position stay in sync. The cube remains usable with trajectories hidden. Use a few observed play sessions to find selection or depth failures before proceeding.

## Computer opponent: modest first target

There are public examples of actual 3D chess AI: a [Raumschach browser game](https://github.com/edweenie123/3D-Chess) describes minimax with alpha-beta pruning, and [space-chess](https://github.com/guille0/space-chess) includes a basic minimax opponent for a 5 × 5 × 5 variant. They demonstrate an approach, not a ready engine for this game's 8 × 8 × 8 board or evolving rules. Build the opponent on the same legal-move generator as human play.

1. Start with a baseline that always chooses from legal moves. Score terminal checkmate and draw states correctly; then add a simple, deterministic material score with small mobility and king-danger terms. Treat piece values as provisional because 3D reach differs from orthodox chess. If adding a pawn-progress term, measure progress toward the opposing `z` promotion face without assuming every pawn move advances it; keep the weight small until playtests justify it.
2. Search with negamax and alpha-beta pruning. Order captures and forcing moves first. Complete one ply, then two, then attempt three within a short thinking budget. A *ply* is one player's move, so three plies sees the AI move, the human reply, and the AI continuation. Return the best move from the last fully completed depth; a legal fallback is always available.
3. Run search in a Web Worker and discard results for positions that have changed. Measure branching and latency on opening, tactical, and sparse positions. Tune the budget from those measurements rather than promising a fixed depth in every position.

This is sufficient for an opponent that plays legal moves and notices some immediate tactics. More elaborate evaluation, transposition tables, quiescence, learned models, and self-play are later options only if testing reveals a specific need. Playing strength is a playtest outcome, not a V1 performance claim.

## Future shared and multi-player games

Two people can play locally on one screen in V1. A later online mode should let players join the same game from separate browsers. At that point, use a Node.js server to own the current game state, validate submitted moves with the shared TypeScript rules, sequence turns, and synchronize clients. Browser `localStorage` remains useful for personal history; online games would also need a server-side record and a reconnect policy. The first website does not need accounts, matchmaking, or a server to reserve space for this path.

The cube may support more than two players, but **player count is a separate rule variant**. The six outer faces offer candidate starting regions, not six automatically viable armies: faces intersect at edges, starting cells could overlap, and piece movement may favour some faces. In particular, a pawn under the proposed four-direction rule cannot leave an `x = 0` or `x = 7` face by a quiet move, because changing `x` requires a capture. `y` faces are more plausible candidates alongside the two `z` faces, subject to placement and balance tests.

Before implementing a three- or four-player variant, decide its non-overlapping starting positions, each player's promotion destination, turn order, check and elimination rules, and win/draw conditions. The present “opponent's home plane” promotion rule is only defined for the two opposing `z` faces. The planned negamax opponent also assumes a two-player, zero-sum game; it should stay scoped to that variant until a multiplayer AI approach is deliberately chosen.

## Completion sequence

| Stage | Work | Acceptance gate |
| --- | --- | --- |
| 1. Baseline rules | Record the four-direction/eight-diagonal pawn experiment, its three-direction comparison, the opposing outer-plane setup, and a few example positions. Label the first playtest profile `prototype-1`. | The vertical slice has a consistent rules profile that can be revised after play. |
| 2. Core game | Add pawns, queen, promotion, full initial setup, checkmate, stalemate, repetition, undo, and restart. | Two people can complete a legal game headlessly and in the browser; targeted rules tests pass. |
| 3. Spatial UI and history | Preserve the complete destination constellation; reveal individual paths and move explanations on hover/focus. Develop intrinsically three-dimensional piece symbols, slice/plane inspection, coordinate labels, promotion choice, move log, turn and game status; add responsive desktop/tablet panels and local game records. | Piece types remain identifiable from front, rear, sides, above, below and oblique views; new players can interpret movement fields and inspect one prospective move; reload restores an active game and the archive can open a saved game. |
| 4. Computer opponent | Reuse legal moves, add terminal and simple position scoring, alpha-beta search to a completed depth of one or two plies and attempt three within a short budget; run it in a worker. | It always returns a legal move, handles mate/draw correctly, and leaves camera and UI responsive. |
| 5. Guidance and polish | Add optional threats, ghost preview, saved display preferences, then restrained bloom/refraction. Explore control maps and self-play later. | Overlays remain correct and readable; visual effects do not harm input or frame rate. |
| Later variants | Add server-authoritative online two-player games after the local game is stable; prototype three- or four-player setups as a separate rules study. | Remote players remain synchronized, and any larger variant has explicit placement, turn, promotion, and endgame rules before implementation. |

Focus the rules tests on direction counts, centre/edge/corner positions, ray blockers, friendly occupancy, knight-vector uniqueness, the four and eight pawn vector sets, edge clipping, attack versus quiet moves, backward/retreat moves, promotion from quiet moves and captures, king safety, terminal states, repetition, the no-progress counter, and make/unmake equality. Add a small set of property-style invariants: all destinations are in bounds, rays stop at occupancy, own pieces cannot be captured, and make/unmake is lossless. This covers the high-risk geometry without treating every render detail as a unit-test problem.

## Visual and interaction direction

Use the concept image's dark background, central blue crystal volume, blue/cyan versus warm/red holographic armies, fine grid, and compact side panels as a design starting point. Render the 512-cell lattice with batched/instanced elements where repeated geometry warrants it; [InstancedMesh](https://threejs.org/docs/pages/InstancedMesh.html) can reduce draw calls. Keep refraction, bloom, and chromatic edges subtle and profile them on representative hardware. The silhouette of pieces and destination markers should remain legible from common camera angles.

**Stage 3 piece design requirement:** eventual pieces must be intrinsically three-dimensional symbols rather than conventional upright Staunton figures. Each type must remain recognisable from front, rear, sides, above, below and oblique viewpoints through the cube. Explore the Queen concept of a cubic/spherical core with identifying geometry distributed across multiple surfaces, and develop similarly distinct spatial signatures for the other types. Validate recognition through a full orbit and from below before adding optical effects. The vertical slice uses temporary simplified geometry and labels; final piece design is not a dependency for functional implementation.

The Knight placeholder's knot-like form provides a useful design reference: it reads as a spatial object from unusual angles. Preserve that property when developing final symbols; test recognisability independently of an upright camera orientation.

### Stage 3 movement fields and progressive inspection

The first Knight spatial study supports using the **complete cube as the primary interface**. Its 24 destinations form a comprehensible spatial constellation that communicates the geometry of the piece's movement. Preserve that coherent field, including destinations away from the currently inspected plane when isolation is off. Keep the existing fine, subdued lattice; pieces, selection, destinations and future threats should stand visually above it. Slice and isolation controls remain optional inspection aids.

Use this interaction sequence:

**Select piece → perceive complete movement constellation → hover/focus destination → inspect one trajectory → preview consequences → commit move.**

- Selection shows every engine-derived legal destination, with no simultaneous trajectory fan. The field must remain visible while an individual move is inspected; unrelated markers may fade moderately.
- Hovering a marker or focusing its destination button strengthens that marker and reveals only its own path. Sliders use the engine's actual traversed cells, ending at the chosen destination and never extending through blockers. Knights use a dashed, bent `(2,1,0)` jump guide that cannot be mistaken for a sliding ray. Its elbow is explanatory geometry, not a sequence of occupancy-tested cells.
- Use variations of the same destination marker: quiet gold for ordinary moves, warmer amber and slightly greater size for captures, increased brightness/size and an outline for the inspected destination. Check-giving moves initially get an on-demand text annotation. If an additional check marker becomes useful, explore a subtle rim variation within this same family, rather than a fourth unrelated symbol.
- A touchscreen has no hover: the first destination tap inspects, and a second tap on the same destination commits. Selecting a different destination changes the inspection. Drag, pinch and pan clear the preview without committing. Keyboard focus inspects; Enter commits. Mouse click commits the inspected destination directly.
- Explain displacement, capture and prospective check on inspection. Evaluate consequences through the rules engine against a temporary state; never mutate the live game during preview. Promotion previews must distinguish consequences that depend on the selected promotion. A later ghost preview should extend this same inspected move, without adding persistent overlays for every candidate.

### Future threat fields

Threat assistance follows the same progression: first show a comprehensible attacked-cell/danger-zone field, then let inspection of a threatened cell or enemy piece reveal the responsible attacking trajectories. Do not permanently fill the cube with every red attack ray. Derive attacks from the rules engine's attack queries, including pawn capture cells and defended occupied cells, rather than treating enemy legal destinations as the attack map. When multiple attackers cover a cell, explain that relationship on inspection. Threat visibility, inspected paths and slice emphasis remain independent controls. Implementation belongs to the later guidance stage; this requirement guides Stage 3 interaction design.

The generated screenshot's move list, timers, piece count, and “End Turn” button are illustrative. V1 should commit a turn when a legal destination is chosen. Add clocks only if a timed mode is later specified.

## Decisions and risks to validate early

- **Pawn movement:** compare the four-direction/eight-diagonal profile with the three-direction/six-diagonal profile. Measure contact in the middle planes, repeated shuffling, pawn survival, promotion frequency, and whether attacks from behind are understandable. These choices affect game length, search branching, and evaluation.
- **Starting layout:** check development, king safety, and visual readability from the outer planes. The offset `y` rows avoid immediate long-range captures in the first profile, but may change after playtesting.
- **Depth perception and picking:** transparent surfaces can compete with piece and cell hits. Use dedicated pick targets and clear hover feedback, then test from multiple camera angles.
- **Desktop/tablet fit:** test landscape and portrait tablet layouts, touch hit targets, and gesture-versus-tap separation. Keep the cube usable while the history panel is open.
- **Local saves:** version records as rules evolve and handle storage errors visibly. The first version keeps history on the same device/browser; test reload, undo, archive, and old-profile display.
- **Branching factor:** 26 queen rays and extra spatial routes may make even three plies expensive in some positions. Measure legal-move counts and worker search time before fixing difficulty budgets or piece values; retain the last completed search result when time runs out.
- **Visual cost:** 512 cells plus overlays can become noisy or expensive. Begin with a clean lattice and batch repeated markers; add optical effects only after comprehension works.

**Next step:** use the implemented slice for observed games and compare the two pawn profiles. Carry the [slice findings](docs/PROTOTYPE_1_RESULTS.md) into Stage 3's local history and piece-recognition work, then add the Stage 4 opponent before optical polish. Record each rule change alongside its affected tests and example positions.
