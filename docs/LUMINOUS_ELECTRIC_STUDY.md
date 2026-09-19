# Luminous: electric pieces in an open spatial lattice

19 September 2026. A bounded art-direction study following human review of Crystal. Strong whole-volume crystal development is stopped. The Crystal theme, its controls and prior reports remain available as reference.

## Try the study

Choose **Luminous · electric space** under **View & guidance**. Try **Adaptive** or **Structural** in the separate **Lattice display** selector. Select a piece, open **Camera study**, and use **Close inspection** for a short orbit close to its surface. Any pointer, wheel or keyboard input immediately returns camera control. **Reset camera** or **Isometric** returns to the whole board.

**Ambient animation** freezes internal light activity and scintillation when switched off. Reduced-motion preference also freezes these effects and makes camera focus instantaneous. Gold destinations, amber captures and the single inspected trajectory retain their common meaning and appearance. Themes and lattice modes do not change game state or localStorage history.

The visual vocabulary takes the requested general direction—electric objects and sharp points of light suspended in darkness. It does not reproduce specific Sapphire & Steel title objects. There are no new raster assets, external textures or additional dependencies.

## Star-sphere follow-up

The board sits inside a radius-58 star sphere with no visible shell. Following visibility feedback, the field was increased from 480 through 1,400 to 3,200 points. A brighter tier of larger icy-white stars makes the surrounding space more apparent. Frost retains the static stars’ bright cores while adding twinkling spikes. **Frosty star twinkle** starts off, keeps its setting across theme switches during the page session and affects only Luminous stars. Ambient animation off or reduced motion freezes the effect while preserving its static appearance. Stars still use one draw call with no image texture or postprocessing target.

[Sharp starfield](electric-stars-sharp.png) · [Frosty starfield](electric-stars-frost.png)

The follow-up build and targeted browser check pass: toggling preserves game/save/field state and draw-call count, survives theme changes, animates when enabled and freezes under reduced motion or Ambient animation off. The timing table below predates the increased star count; this follow-up did not repeat the timing benchmark.

## Environment and pieces

The environment is near-black with 3,200 small stars distributed well outside the board; only a sparse subset is visible in any view. Stars are sharp points by default. The optional **Frosty star twinkle** switch adds small icy diffraction spikes and independently phased brightness changes to a subset of them, without full-screen bloom. There is no glass enclosure, volume refraction, dispersion pass or caustic surface in Luminous.

Each piece combines an opaque faceted body, restrained edge definition and 24 small glint points sampled on its actual geometry. A surface shader creates localized white highlights, sapphire/cyan or ruby/red internal light bands, slow brightness variation and narrow angle-dependent prismatic flashes. Geometry remains fixed at its authoritative position: light activity never warps a piece or moves a hit target. All structural parts stay within the unchanged 0.34-unit picking sphere; a geometry-bound check covers every piece type and both armies.

| Piece | Current spatial vocabulary | Recognition assessment |
| --- | --- | --- |
| Pawn | Small faceted orb | Compact, consistently distinct from the structured pieces in seven-view review |
| Rook | Cubic nucleus and six square-ended axial arms | Orthogonal block profile survives axis views; shares a broad axial family with King |
| Bishop | Octahedral nucleus with eight elongated diagonal jewels | Diagonal/X silhouette contrasts with the Rook; can resemble a spiked star at small sizes |
| Knight | Irregular knot with asymmetric nodes and expanded depth | Holes and asymmetry distinguish it; an initial flattened side/above profile was corrected by increasing its depth |
| Queen | Dominant faceted core, three crossed rings and distributed small tips | Rings form a recognisable enclosing structure from each tested axis and oblique view |
| King | Large central jewel with six pointed axial lobes | Distinct pointed outline at inspection scale; Rook/King discrimination needs human testing at board scale |

[White recognition sheet](electric-pieces-white.png) · [Black recognition sheet](electric-pieces-black.png)

The sheets use the actual runtime models at front, rear, left, right, above, below and oblique poses. This is visual review of rendered models, **not a measured human-recognition result**. Colour identifies the armies consistently in these views, but the saturated red palette and intense highlights need physical-display review. Labels remain available. Small projected size, overlapping pieces in the opening and briefly bright facets can still weaken type recognition. Final forms, lighting and relative piece sizes remain unsettled.

## Frosted cell-line follow-up

Luminous now has an optional **Frosted cell lines** switch. It starts off. When enabled, it shows the complete analytical cell grid as faint ice-blue/white lines with sparse, subtle glitter. It shares the exact analytical grid geometry—243 continuous axis lines that cover all cell boundaries—rather than drawing overlapping boxes for 512 cells. Plain grid/home-plane lines are suppressed while frost is active to avoid accumulating brightness.

The chosen Full/Structural/Adaptive setting is retained and restored when frost is disabled. Adaptive local cues can remain visible above the faint frost grid. The setting is retained across theme switches within the page but is active only in Luminous. Ambient animation off and reduced motion freeze the glitter. It adds no textures or full-screen pass; line animation follows Luminous's existing redraw cadence.

[Frosted cell lines](electric-frosted-cells.png)

## Lattice belongs to navigation

The theme contract no longer supplies lattice colour or opacity. `LatticeView` owns fixed-coordinate navigation geometry and its display settings. Changing theme preserves the selected lattice mode; all three modes work in Diagnostic, Luminous and the retained Crystal reference.

| Mode | Behaviour |
| --- | --- |
| Full | The original complete analytical grid, outer edges and home-plane cues; Diagnostic's original weights are preserved |
| Structural | Reduced grid cues through the boundary and central planes, with fewer lines and faint outer edges |
| Adaptive | A very faint complete grid; short exact-cell corner brackets strengthen around the selected piece, engine-provided legal destinations and the inspected move's engine-provided path |

Adaptive cues are cool neutral lines beneath the interaction overlays. They do not become a second gold move-marker system, and Knight guides still show only the inspected dashed jump. Level isolation filters local cues consistently with piece/destination visibility. The broad destination constellation remains the first thing revealed by selection.

[Full](electric-luminous-full.png) · [Structural](electric-luminous-structural.png) · [Adaptive](electric-luminous-adaptive.png) · [Dense opening](electric-opening.png)

In screenshot review, Structural gives the pieces the clearest dark space but provides fewer depth references. Adaptive retains useful local cell context while leaving the outer volume faint. Its many small brackets can become visible texture around a dense movement field, especially close to the camera. Full remains useful for analytical inspection. None is claimed as the final default: Diagnostic and Full remain startup defaults.

## Local effects and camera

An ordinary move produces a small, short-lived light release at its origin. A capture replaces that with an outward spark cluster at the destination. These effects use the moving side's electric hue, expire in 280–500 ms and do not introduce red attack rays or gold legal-looking particles. Rendering and animation never delay move commitment or autosave.

The existing interruptible camera director now has an explicit **Close inspection** option. It frames a selected piece with a small radius and uses the existing twelve-second orbit. Manual zoom can enter the volume; no Luminous shell blocks or dominates the view. Normal selection does not trigger unsolicited camera motion.

This demonstrates spatial compatibility with future cinematic replay, not a replay implementation. A future scheduler still needs a separate replay state, semantic-event timing, occlusion-aware shot planning and collision/framing choices. Current close inspection can pass near other pieces and show large destination markers or clipped labels; this remains a gameplay scene, not an isolated model viewer.

## Performance

Chromium/SwiftShader, 1440 × 1000 viewport, DPR 1. Same ten-piece Knight study with 24 destinations. Ambient animation is frozen for still comparisons. Each orbit records 24 animation callbacks, discards the first six and reports the median of the remaining 18 intervals. CPU submission measurements include the renderer call and CSS labels.

| Theme / lattice | Draw calls | Triangles | Median CPU submission | Median frame interval |
| --- | ---: | ---: | ---: | ---: |
| diagnostic / full | 32 | 1,440 | 0.5 ms | 50.0 ms |
| diagnostic / structural | 30 | 1,440 | 0.4 ms | 50.0 ms |
| diagnostic / adaptive | 33 | 1,440 | 0.4 ms | 50.0 ms |
| luminous / full | 37 | 2,072 | 0.5 ms | 50.0 ms |
| luminous / structural | 35 | 2,072 | 0.4 ms | 50.0 ms |
| luminous / adaptive | 38 | 2,072 | 0.4 ms | 50.0 ms |

The full opening with Full lattice recorded **103 draw calls and 7,144 triangles**, compared with the first Luminous spike’s 135 calls and 5,768 triangles. Merging structural parts reduces draw calls while the richer faceted forms increase triangle count. A first-use dense-opening submission reached about **240 ms**; warm submissions were around **1 ms**. All these modes retain the baseline one resident texture. Theme-switch regression checks recover Diagnostic’s baseline geometry/texture counts.

The Luminous piece meshes are merged into one body mesh per piece, with one edge batch and one glint batch. The starfield is one draw call. There is no extra colour texture, postprocessing target or full-screen shader. Time-based material activity requests at most 24 redraws per second when enabled; static mode idles until input or a position change.

These Chromium/SwiftShader figures measure browser/software-rendering behaviour, not isolated GPU time or physical-tablet performance. Equal frame intervals at this sample size do not establish equal GPU cost; frame scheduling can hide differences. Dense openings, close surfaces and particle activity require physical-device profiling. First-use shader compilation can still stall. The existing large-bundle advisory remains.

[Raw measurements](electric-measurements.json)

## Verification and boundaries

- **57 unit tests pass**, including geometry bounds against the fixed picking sphere.
- The **33-scenario browser regression run** passed 32 scenarios and exposed the hover-layout issue described below. After fixing it, **all eight affected/focused scenarios passed**, covering pointer/keyboard capture, blocked storage, theme/resource switching, tablet input, all lattice modes, close camera interruption and the refreshed visual/measurement artifacts.
- No browser exceptions or shader/console errors occurred in the new Luminous scenarios. Existing Crystal capture, resize, disposal and reduced-motion checks also passed.
- TypeScript and production build pass. Output is approximately **645 kB JavaScript / 166 kB gzip**, with the existing chunk-size advisory.
- Physical desktop/tablet GPUs, Safari and timed human piece-recognition studies remain untested.

The broader inspector layout exposed an existing hover-layout problem: expanding move text could move a destination button between pointer entry and click. The explanation now occupies a fixed-height scrollable region, so its text cannot shift the destination targets. This was found by the blocked-storage gameplay scenario and checked again with pointer, keyboard and themed capture paths.

The rules engine, move semantics and saved-game format are unchanged. Diagnostic retains its original piece appearance. Crystal's rendering implementation is preserved, with no further optical intensity changes. Luminous replaces its earlier conservative visual treatment; [the first Luminous screenshot](luminous-first-study-reference.png) and [original architecture report](THEME_CAMERA_SPIKE.md) remain available for comparison.

Next art-direction decisions should come from human review of the recognition sheets and normal play: distinguish Rook/King at small scale, judge Knight depth, choose the useful lattice setting, and tune localized brightness. No final polish or additional volume theme is implied by this study.
