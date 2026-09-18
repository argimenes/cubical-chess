# Bounded Crystal / Optical experiment

**Historical first experiment.** Human assessment found this treatment too subtle. The [exaggerated Crystal study](CRYSTAL_EXAGGERATED_STUDY.md) supersedes its rendering implementation and all-off defaults; this report and its measurements are retained for comparison.

18 September 2026. One additional theme, evaluated effect by effect. Diagnostic and Luminous retain their existing appearance, materials, lighting, animation and defaults. Water and Deep Space are not implemented.

## Controls and scope

Select **Crystal · optical study** under View & guidance. Three independent switches start **off**:

| Switch | Isolated treatment |
| --- | --- |
| Transmission / refraction | Very slight displacement of the lattice/background, thickness-dependent attenuation and faint internal facet light |
| Spectral / prismatic | Restrained coloured bands on internal oblique facet families, changing with viewpoint |
| Caustics / scintillation | Sparse pale interference patterns within the volume, with slow brightness variation |

Start with a single switch. The controls can be adjusted independently, but there is no combined preset and combined settings have not been assessed or recommended. Every recorded comparison activates at most one effect. **Ambient animation** freezes scintillation while retaining its static light pattern; reduced-motion preference does the same. Refraction and spectral effects are stationary except for changes caused by the camera.

The normal Diagnostic startup and active-game autosave behaviour are unchanged. Switching themes resets Crystal's switches. Theme/effect settings are not stored in the active game.

## Crystalline medium without a glass enclosure

The optical pass reconstructs a camera ray for each pixel and intersects it with the existing eight-cell-wide volume. Six samples along that segment provide a bounded approximation of internal facet light. Effects fade towards the boundary. There is no glass-box mesh, thick outline, new cell geometry or opaque cube face.

This is an art-directed optical approximation. Refraction uses a weak refracted direction, then caps the resulting lattice/background displacement at **0.65 CSS pixels per axis**. Attenuation varies with distance through the medium. Spectral colour is a procedural treatment on oblique internal facets, not wavelength-accurate dispersion. Caustics are a procedural illumination pattern, not a light-transport simulation. There are no duplicated/reflected piece images or physically simulated multiple internal bounces.

Three.js supports custom [ShaderMaterial](https://threejs.org/docs/pages/ShaderMaterial.html) programs; this experiment uses one shader with uniform switches rather than adding material variants for every effect combination. Full transmissive physical materials remain a possible later comparison, but their additional features carry per-pixel costs, as described in the [MeshPhysicalMaterial reference](https://threejs.org/docs/pages/MeshPhysicalMaterial.html).

## Recognition and picking protections

The common renderer, rules and input model are unchanged. Crystal reuses Diagnostic's piece forms and materials so that this comparison concerns the medium rather than simultaneous piece redesign.

The rendering sequence for an enabled effect is:

1. Render lattice, environment and inspection plane using the normal camera and normal transparent blending.
2. Copy that display image into a framebuffer texture; apply only the selected optical treatment within the projected volume.
3. Render pieces with the same lighting at their exact, unwarped coordinates, then the common movement markers/guides and DOM labels.

The original piece and destination picking proxies remain authoritative. The effect has no access to occupancy, legal-move generation, game commands or storage. Gold legal destinations and amber captures stay crisp; shader geometry never becomes a pick target. The protected pieces still depth-test against each other. This selective compositing favours interaction accuracy over a fully physical optical scene.

**A visual issue was found and fixed:** rendering transparent grid lines into a linear offscreen target and then encoding the result made the grid appear brighter than the approved diagnostic lattice. The pass now copies the normally blended canvas image, decodes it for optical colour arithmetic and encodes it once on output. This preserves the subdued lattice rather than compensating by arbitrarily changing its weight.

All effects off bypasses the optical pass. With an effect enabled, there is one full-screen triangle and one additional colour-copy texture at the canvas resolution (the existing renderer caps device pixel ratio at two). Switching theme and resizing release the replaced optical texture. There is no separate optical depth target, bloom chain or duplicated scene implementation.

## Results

### Visual comparisons

[All effects off](crystal-off.png) · [Refraction only](crystal-refraction.png) · [Spectral only](crystal-spectral.png) · [Caustics only](crystal-caustics.png)

[Refraction in the full opening](crystal-refraction-opening.png) · [Spectral opening](crystal-spectral-opening.png) · [Caustics opening](crystal-caustics-opening.png) · [View from below](crystal-caustics-below.png) · [Tablet](crystal-tablet.png)

Still comparisons freeze ambient animation. Each treatment uses the same camera and unchanged piece positions. The dense opening retains the Queen's 33 destinations, and the Knight study retains all 24.

### Measured rendering cost

Chromium with SwiftShader software WebGL, desktop viewport 1440 × 1000, DPR 1. Same sparse Knight position; every optical treatment enabled **alone**. Camera samples use 24 animation callbacks per treatment, discard the first six and report the median of the remaining 18 frame intervals. Frame intervals include browser scheduling and software rendering; they are not isolated GPU timings.

| Treatment | Draw calls at fixed isometric pose | Triangles | Resident geometries / textures | Median CPU render submission during camera motion | Median animation-frame interval |
| --- | ---: | ---: | ---: | ---: | ---: |
| Off | 32 | 1,440 | 34 / 1 | 0.9 ms | 100 ms |
| Refraction only | 33 | 1,441 | 35 / 2 | 0.9 ms | 200 ms |
| Spectral only | 33 | 1,441 | 35 / 2 | 0.7 ms | 192 ms |
| Caustics only | 33 | 1,441 | 35 / 2 | 0.8 ms | 300 ms |

One extra draw call does **not** mean negligible cost: the full-frame copy and six shader samples per intersecting pixel materially slowed this software-rendered run. Refraction's first enabled frame recorded an approximately **891 ms** CPU-side stall during setup; later modes reused the same shader. The first effects-off sample also had a 216 ms setup outlier. These small, sequential measurements are workload evidence, not precise hardware rankings between effects. No claim of interactive frame rate on physical hardware is made.

The extra colour texture uses approximately `canvasWidth × canvasHeight × 4` bytes, without mipmaps, in addition to renderer/driver overhead. At DPR 2 that copy has four times as many pixels as DPR 1. Its cost must be profiled on real tablets before default use. Refraction and spectral-only settings request no idle redraws. Scintillation requests updates at most 24 times per second when ambient animation is enabled; switching animation off or using reduced-motion preference restores static rendering.

[Raw measurement data](crystal-measurements.json) records per-mode flags, metrics and every sampled frame interval. The JSON diagnostic field `effects: false` in these comparisons means ambient animation was frozen; the `optical` flags identify which optical treatment was active.

### Verification

- **56 unit tests pass**, including Crystal defaults, copied toggle state, animation cadence and the unchanged Diagnostic/Luminous capability boundaries.
- **29 browser scenarios pass:** the existing 25-scenario regression suite plus four dedicated Crystal scenarios. Crystal checks cover all three effects independently, unchanged game/save/legal moves and projected coordinates, actual desktop capture picking, undo, resized optical resources, return-to-Diagnostic resource counts, reduced-motion/idle behaviour, dense-position screenshots, and tablet two-tap capture followed by saved-game reload.
- Existing rules and saved-game modules are untouched. The build and TypeScript checks pass; bundle size is approximately **630 kB / 162 kB gzip**, with the existing Vite chunk-size advisory.
- No browser exceptions or shader/console errors occurred in the dedicated Crystal scenarios. Physical GPU, Safari and device testing remain open.

## Limits and next decision

- **Refraction:** the small stationary facet distortion adds a weak sense of medium, most apparent against the fine lattice and when the view moves. It stays below a pixel per axis; increasing it could detach visual cells from their pick coordinates. Pieces and destinations do not move with the distortion.
- **Spectral treatment:** faint internal colour bands can be seen without recolouring either army or the gold field. At this strength they are deliberately subtle; the current result does not establish a compelling crystalline identity by itself.
- **Caustics/scintillation:** pale internal light adds texture without a new enclosing surface. The pattern does not illuminate the protected pieces, so this is a selective visual metaphor rather than coherent physical light transport. This mode had the slowest sampled camera intervals.
- **Recognition:** visual review of the sparse study, full opening and tablet image found the two armies, gold destinations and labels still distinct. Face-on projection overlap remains, and labels are still useful. This is an author review plus interaction checks, not a human-recognition study.
- **Performance:** the opt-in treatments are too expensive in this software-WebGL run to recommend as the normal playing view. The all-off path keeps the clean baseline. Before stronger effects, investigate a cheaper decorative-light overlay for spectral/caustic modes and a bounded-resolution/refined refraction path, while checking that the grid stays thin and silhouettes remain aligned. Those optimisations are not part of this experiment.
- **Combination:** no combined treatment has been evaluated, tuned or selected as a default. Independent switches remain available for deliberate inspection; their combined legibility and cost are unknown.

The scope stops here. Keep Diagnostic available for immediate comparison and leave all Crystal effects off initially. Evaluate the isolated effects on physical desktop/tablet hardware and with users before increasing strength, combining treatments or beginning another theme.
