# Crystal: exaggerated intact-volume study

**Reference experiment — further whole-volume Crystal development stopped after human review.** The [Luminous electric study](LUMINOUS_ELECTRIC_STUDY.md) concentrates theme identity in pieces and environment and makes lattice display independent.

19 September 2026. This supersedes the [first, visually too subtle optical experiment](CRYSTAL_OPTICAL_EXPERIMENT.md). The aim is to establish an unmistakable upper aesthetic bound, with perceptually convincing fake optics rather than physical simulation.

## Try it

Choose **Crystal · optical study** under **View & guidance**. The three main optical components turn on immediately. **Cubical inclusions** starts off as a separate comparison. Orbit manually or use **Camera study → Inspect orbit** to see the reflections and glints change with viewpoint. **Ambient animation** controls travelling caustic concentrations and time-based scintillation; turning it off leaves a complete static treatment. Reduced-motion preference also freezes the time-based effects. Camera-dependent highlights still follow deliberate camera changes.

| Toggle | Treatment |
| --- | --- |
| Cut facets / reflections | One connected cubical cut surface, broad internal cleavage planes, sharp facet seams and reflection-like light segments |
| Spectral / prismatic | Saturated, localized rainbow separation across selected bevels and internal seams; colour shifts with viewpoint |
| Caustics / scintillation | Concentrated white/cyan bands, slowly travelling light concentrations and sharp glints with spectral fringes |
| Cubical inclusions | Replaces broad internal fractures with cell-aligned optical inclusions throughout the 8×8×8 arrangement; only a small subset catches the light at any angle |

Diagnostic remains the startup/reload default. Theme controls are presentation settings, separate from the saved active game. Selecting Crystal again restores the exaggerated combined study.

## Art-direction correction: one intact crystal

The initial stronger treatment made isolated corner forms and small internal facets. The user's assessment was that these looked like an **exploded crystal**. That arrangement was replaced within this iteration.

The current outer surface has six broad faces, twelve connecting bevels and eight triangular corner cuts. Their vertices meet along shared edges, producing one continuous cubical cut. Two broad internal facet assemblies terminate on its outer faces. The interior is no longer populated by disconnected small crystal forms. The broad outer faces are almost clear; the strongest colour and light remain localized to bevels, seams and glints. The original fine lattice retains its material colour and opacity.

These are art-directed approximations: spectral ribbons suggest dispersion; bent light segments suggest internal reflections; moving narrow highlights suggest caustics. There is no physical refraction, duplicate piece imagery, wavelength simulation, real caustic lighting or full-screen distortion. The existing internal option key `refraction` now selects cut facets/reflections; the visible control uses that accurate name.

## Cubical inclusions comparison

The user's next suggestion—one cube composed of 8×8×8 cubical inclusions—is implemented as a switchable comparison. It retains the same connected outer crystal. All 512 cell volumes are represented in one geometry batch. A deterministic, camera-dependent light response lets roughly two dozen cells catch the light at a time. Inactive cells collapse outside the viewport in the vertex shader, avoiding fragment shading for hundreds of overlapping boxes. The outermost inclusion faces are clipped to the bevelled envelope.

Turning this option on suppresses the broad internal fracture surfaces and their associated light paths. It does not change cell occupancy, the lattice, legal moves or hit targets. Spectral treatment on inclusion faces follows the Spectral switch. The inclusion response is camera-dependent and needs no idle animation.

[Inclusions with the outer crystal](crystal-bold-inclusion-study.png) · [Inclusions in the full opening](crystal-bold-inclusion-study-opening.png) · [Inclusions alone](crystal-bold-inclusions.png)

In screenshot review this adds a coherent cell-scale structure, but the clusters of highlighted cells can still read as small boxes inside a larger crystal. It is a useful comparison rather than a settled design. Motion and human assessment are needed to judge whether it conveys inclusions, ice, stacked blocks, or something else. It remains off initially.

## Visual evidence and legibility

[Diagnostic baseline](crystal-bold-diagnostic.png) · [Combined Crystal](crystal-bold-combined.png) · [Full opening](crystal-bold-combined-opening.png) · [Below](crystal-bold-combined-below.png) · [Tablet](crystal-bold-tablet.png)

[Facets alone](crystal-bold-refraction.png) · [Spectrum alone](crystal-bold-spectral.png) · [Caustics alone](crystal-bold-caustics.png) · [Components off](crystal-bold-off.png)

The comparison stills freeze ambient animation and use fixed camera poses. The current rendering is immediately distinguishable from Diagnostic in screenshot review: the cube has a connected bevel silhouette, visible internal cuts and bright spectral events. Whether this delivers the intended “that's crystal” response remains a human art-direction judgment.

The sparse Knight position retains all 24 destinations; the dense opening retains the Queen's 33 destinations and 32 piece labels. Bright bands initially reduced the contrast of overlapping gold markers. Crystal now requests a narrow dark backing behind each common destination marker, following the exact same position, scale and focus state. The gold/amber marker vocabulary and hit proxies are unchanged. Crystal piece bodies use opaque versions of the original materials so optical light cannot bleed through their silhouettes. Diagnostic and Luminous keep their existing materials and appearance.

The deliberate excess is still visible: large internal facet seams can compete with the one inspected move trajectory, and several aligned highlights can make some viewing angles busy. Labels remain useful for the temporary piece forms; face-on cell overlap still needs the existing depth chooser. A visually protected marker is not proof of instant recognition under every projection. Future reduction should first consider internal seam brightness and rainbow-band width, while retaining the continuous cubical form. No reduction is applied merely to make this study a final playing default.

## Rendering architecture and cost

Five small world-space geometry batches provide facet surfaces, reflection segments, spectral ribbons, caustic bands and glint billboards. One instanced batch provides the destination contrast backing. The optional inclusions add one batch containing 6,144 simple triangles for 512 cells; the vertex shader suppresses inactive cells before rasterisation. These triangles still incur vertex processing, and the additional attributes occupy approximately 0.84 MiB of geometry storage when uploaded. This option is not 512 separate draw calls. No image textures, framebuffer copies, render targets, full-screen triangles, bloom chain or per-pixel volume march are added. There are no new dependencies or changes to the rules core.

The existing world compositor renders optical geometry and lattice first, then the protected pieces and common interaction overlays. Piece depth relationships are retained; decorations cannot intercept picking or mutate game state. CSS labels remain outside the optical rendering. Component switches hide batches; resizing needs no optical texture allocation; theme disposal releases the geometry/materials. The all-components-off view still retains Crystal's darker background, opaque pieces and marker backing—select Diagnostic for the exact clean baseline.

Caustic animation requests at most 24 updates per second, pausing under reduced motion or when Ambient animation is disabled. Facets and spectral-only modes are otherwise idle until the camera or game changes. Sparse shaders still shade their projected triangles at canvas resolution, so this is reduced pixel coverage, not a bounded-resolution render target. Zooming in, fill rate and simultaneous bright surfaces still need physical-device profiling.

Chromium with SwiftShader software WebGL; desktop viewport 1440 × 1000, DPR 1. Each mode uses the same Knight study and isometric starting pose. Ambient animation is frozen; the camera then orbits for 24 animation callbacks, discarding the first six and reporting the remaining 18 intervals. Render-submission samples include the camera frames. These are browser timings, not isolated GPU measurements.

| Treatment | Draw calls | Submitted triangles | Median CPU submission | Median frame interval |
| --- | ---: | ---: | ---: | ---: |
| Diagnostic | 32 | 1,440 | 0.5 ms | 50.0 ms |
| Crystal components off | 33 | 1,632 | 0.4 ms | 50.0 ms |
| Facets / reflections | 35 | 1,684 | 0.5 ms | 66.7 ms |
| Spectral only | 34 | 1,668 | 0.4 ms | 50.0 ms |
| Caustics only | 35 | 1,684 | 0.4 ms | 50.0 ms |
| Combined Crystal | 38 | 1,772 | 0.4 ms | 66.7 ms |
| Inclusions only | 34 | 7,776 | 0.4 ms | 66.7 ms |
| Crystal + inclusions | 39 | 7,916 | 0.4 ms | 83.3 ms |

All modes retain the baseline **one resident texture**. Diagnostic uses 34 resident geometries; Crystal uses 40 after the main effects are uploaded, and 41 once the inclusions batch has been used. Hiding a component retains its reusable geometry; switching back to Diagnostic returns to baseline resource counts. The first inclusions-enabled sample recorded approximately **183 ms** of CPU setup/compilation time; subsequent camera submissions were around 0.4 ms.

In this run the combined Crystal frame interval was about **1.3× Diagnostic**; adding inclusions raised it to about **1.7× Diagnostic**. The inclusions therefore have a measurable cost even though their inactive cells avoid rasterisation. The additional triangles reported above include those collapsed by the vertex shader.

The old experiment's single effects measured approximately 192–300 ms median frame intervals in SwiftShader and allocated one full-resolution colour-copy texture. The new implementation eliminates that allocation and six-sample full-screen work. Comparing these small sequential runs supports the cheaper-rendering direction, not a guaranteed speedup on every GPU. Diagnostic frame intervals themselves vary between runs. CPU submission time is not GPU time; shader compilation, browser scheduling and software rendering can produce large outliers. No physical desktop GPU, Safari or real tablet performance claim is made.

[Raw current measurements](crystal-bold-measurements.json) · [Historical measurements](crystal-measurements.json)

## Verification

- **56 unit tests pass**, including default toggles, copied presentation settings, capped animation requests and reduced-motion behaviour.
- **29 browser scenarios pass** in one sequential run, including all four components individually and both combined studies; unchanged board/save/legal moves/projected coordinates; real canvas captures and undo; resize/disposal; reduced-motion idle rendering; tablet two-tap capture and reload; and the existing Diagnostic/Luminous, camera and game regressions.
- Screenshot comparisons cover the sparse 24-destination Knight field, the full opening, below-cube inspection and tablet layout. No browser exceptions or shader/console errors occurred in the Crystal scenarios.
- TypeScript checking and the production build pass. JavaScript output is approximately **634 kB / 163 kB gzip**; the existing Vite chunk-size advisory remains.
- Rules and saved-game modules are unchanged. Marker backings are presentation-only and reuse the authoritative movement field; no decorative geometry participates in picking.

Earlier overlapping test invocations collided over Playwright's trace-output directory during development. The final single-run suite completed without those artifact errors. Physical-device performance and human recognition under motion remain unverified.

This remains a bounded Crystal art-direction study. The camera director, rules, local game persistence and approved Diagnostic/Luminous design remain in place. Deep Space, Water and final piece design are still later work.
