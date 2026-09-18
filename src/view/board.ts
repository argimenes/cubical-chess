import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { CSS2DObject, CSS2DRenderer } from 'three/addons/renderers/CSS2DRenderer.js';
import { coordinates, formatCell } from '../rules/geometry';
import { CameraDirector } from './camera-director';
import { createTheme, disposeVisual } from './themes';
import type { CrystalEffects, PieceVisual, SceneCue, ThemeId, ThemeRuntime } from './themes/types';
import type { Cell, Move, Piece } from '../rules/types';
import { PIECE_LETTERS } from '../rules/types';

export type CameraPreset = 'iso' | 'front' | 'side' | 'top' | 'below';
export type SelectionInput = 'pointer' | 'touch';
export interface ViewOptions { trajectories: boolean; labels: boolean; plane: number | null; isolate: boolean }
export interface BoardCallbacks {
  select: (cell: Cell, input: SelectionInput) => void;
  hover: (cell: Cell | null) => void;
  chooseDepth: (cells: Cell[], x: number, y: number, input: SelectionInput) => void;
  gesture: () => void;
  navigate: () => void;
}
const BLUE = 0x79d4ff;
const CORAL = 0xff8f89;
const GOLD = 0xffd78c;
const CAPTURE = 0xffa94d;
const world = (cell: Cell): THREE.Vector3 => {
  const [x, y, z] = coordinates(cell);
  return new THREE.Vector3(x - 3.5, z - 3.5, y - 3.5);
};

interface ScenePosition { readonly pieces: readonly Readonly<Piece>[] }
interface PieceView { visual: PieceVisual; group: THREE.Group; label: CSS2DObject; proxy: THREE.Mesh; target: THREE.Vector3; start: THREE.Vector3 }

/** Rendering consumes authoritative cells and moves; it never decides legality. */
export class BoardView {
  readonly renderer: THREE.WebGLRenderer;
  readonly camera = new THREE.PerspectiveCamera(43, 1, 0.1, 120);
  readonly controls: OrbitControls;
  readonly scene = new THREE.Scene();
  private readonly labels = new CSS2DRenderer();
  private readonly pieces = new Map<number, PieceView>();
  private readonly assists = new THREE.Group();
  private readonly guide = new THREE.Group();
  private readonly focusOutline: THREE.LineSegments;
  private markers: THREE.InstancedMesh | null = null;
  private markerBackplates: THREE.InstancedMesh | null = null;
  private fieldMoves: Move[] = [];
  private hovered: Cell | null = null;
  private readonly picks = new THREE.Group();
  private readonly raycaster = new THREE.Raycaster();
  private readonly targetProxyGeometry = new THREE.SphereGeometry(0.23, 10, 8);
  private readonly pieceProxyGeometry = new THREE.SphereGeometry(0.34, 10, 8);
  private readonly invisible = new THREE.MeshBasicMaterial({ visible: false });
  private readonly selection: THREE.LineSegments;
  private readonly hoverBox: THREE.LineSegments;
  private readonly plane = new THREE.Group();
  private theme: ThemeRuntime = createTheme('diagnostic');
  private readonly latticeMaterials: { material: THREE.LineBasicMaterial; role: 'grid' | 'edge' | 'home' }[] = [];
  readonly director: CameraDirector;
  private effectsEnabled = true;
  private readonly reducedMotion = matchMedia('(prefers-reduced-motion: reduce)');
  private renderSamples: number[] = [];
  private readonly interruptCamera = (): void => { this.director.interrupt(); };
  private readonly motionPreferenceChanged = (): void => { this.director.interrupt(); this.theme.clearTransient(); this.dirty = true; };
  private readonly axisLabels: CSS2DObject[] = [];
  private readonly resizeObserver: ResizeObserver;
  private options: ViewOptions = { trajectories: true, labels: true, plane: null, isolate: false };
  private state: ScenePosition | null = null;
  private selected: number | null = null;
  private moves: Move[] = [];
  private pointer: { id: number; x: number; y: number; dragged: boolean } | null = null;
  private pointers = new Set<number>();
  private gestureSuppressed = false;
  private dirty = true;
  private animationStart = 0;
  private animationFrame = 0;
  private lastRender = 0;
  private renders = 0;
  readonly metrics = { drawCalls: 0, triangles: 0, lastRenderMs: 0, renders: 0 };

  constructor(private readonly host: HTMLElement, private readonly callbacks: BoardCallbacks) {
    this.renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true, powerPreference: 'high-performance' });
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    this.renderer.setClearColor(0x000000, 0);
    this.renderer.outputColorSpace = THREE.SRGBColorSpace;
    this.renderer.domElement.setAttribute('aria-label', 'Interactive 8 by 8 by 8 chess cube. Drag to orbit; click or tap a piece to select.');
    this.renderer.domElement.tabIndex = 0;
    this.host.append(this.renderer.domElement);
    this.labels.domElement.className = 'world-labels';
    this.host.append(this.labels.domElement);
    this.controls = new OrbitControls(this.camera, this.renderer.domElement);
    this.director = new CameraDirector(this.camera, this.controls);
    this.controls.enableDamping = true;
    this.controls.dampingFactor = 0.12;
    this.controls.minDistance = 7;
    this.controls.maxDistance = 45;
    this.controls.minPolarAngle = 0.001;
    this.controls.maxPolarAngle = Math.PI - 0.001;
    this.controls.addEventListener('change', () => { this.dirty = true; });
    this.scene.add(this.theme.root, this.assists, this.guide, this.picks, this.plane);
    this.renderer.info.autoReset = false;
    // Capture phase cancels scripted motion before OrbitControls handles the same input.
    for (const event of ['pointerdown', 'wheel', 'keydown']) document.addEventListener(event, this.interruptCamera, { capture: true, passive: true });
    this.reducedMotion.addEventListener('change', this.motionPreferenceChanged);
    this.selection = new THREE.LineSegments(new THREE.EdgesGeometry(new THREE.BoxGeometry(0.84, 0.84, 0.84)), new THREE.LineBasicMaterial({ color: GOLD, transparent: true, opacity: 0.85 }));
    this.hoverBox = new THREE.LineSegments(new THREE.EdgesGeometry(new THREE.BoxGeometry(0.78, 0.78, 0.78)), new THREE.LineBasicMaterial({ color: 0xf0f6ff, transparent: true, opacity: 0.7 }));
    this.selection.visible = this.hoverBox.visible = false;
    this.selection.layers.set(1); this.hoverBox.layers.set(1);
    this.camera.layers.enable(1);
    this.scene.add(this.selection, this.hoverBox);
    this.focusOutline = new THREE.LineSegments(new THREE.EdgesGeometry(new THREE.OctahedronGeometry(1)), new THREE.LineBasicMaterial({ color: GOLD, transparent: true, opacity: 0.95, depthTest: false, depthWrite: false }));
    this.focusOutline.visible = false;
    this.focusOutline.renderOrder = 4;
    this.focusOutline.layers.set(1);
    this.scene.add(this.focusOutline);
    this.buildLattice();
    this.bindPointers();
    this.resizeObserver = new ResizeObserver(() => this.resize());
    this.resizeObserver.observe(host);
    this.resize();
    this.preset('iso');
    this.tick();
  }

  private buildLattice(): void {
    const points: number[] = [];
    for (let a = -4; a <= 4; a++) for (let b = -4; b <= 4; b++) {
      points.push(-4, a, b, 4, a, b, a, -4, b, a, 4, b, a, b, -4, a, b, 4);
    }
    const geometry = new THREE.BufferGeometry();
    geometry.setAttribute('position', new THREE.Float32BufferAttribute(points, 3));
    const gridMaterial = new THREE.LineBasicMaterial({ color: 0x6aadd6, transparent: true, opacity: 0.075, depthWrite: false });
    this.latticeMaterials.push({ material: gridMaterial, role: 'grid' });
    this.scene.add(new THREE.LineSegments(geometry, gridMaterial));
    const edges = new THREE.LineSegments(new THREE.EdgesGeometry(new THREE.BoxGeometry(8, 8, 8)), new THREE.LineBasicMaterial({ color: BLUE, transparent: true, opacity: 0.42 }));
    this.scene.add(edges);
    this.latticeMaterials.push({ material: edges.material as THREE.LineBasicMaterial, role: 'edge' });
    for (const [height, colour] of [[-4, BLUE], [4, CORAL]]) {
      const grid = new THREE.GridHelper(8, 8, colour, colour);
      grid.position.y = height;
      (grid.material as THREE.Material).transparent = true;
      (grid.material as THREE.Material).opacity = 0.2;
      this.scene.add(grid);
      this.latticeMaterials.push({ material: grid.material as THREE.LineBasicMaterial, role: 'home' });
    }
    const planeGrid = new THREE.GridHelper(8, 8, GOLD, BLUE);
    (planeGrid.material as THREE.Material).transparent = true;
    (planeGrid.material as THREE.Material).opacity = 0.35;
    const fill = new THREE.Mesh(new THREE.PlaneGeometry(8, 8), new THREE.MeshBasicMaterial({ color: BLUE, transparent: true, opacity: 0.035, side: THREE.DoubleSide, depthWrite: false }));
    fill.rotation.x = -Math.PI / 2;
    this.plane.add(planeGrid, fill);
    this.plane.visible = false;
    const axes: [string, THREE.Vector3, string][] = [
      ['X', new THREE.Vector3(4.45, -4.1, -4.1), '#ffb89b'],
      ['Y', new THREE.Vector3(-4.1, -4.1, 4.45), '#82dec4'],
      ['Z', new THREE.Vector3(-4.1, 4.45, -4.1), '#79d4ff'],
    ];
    for (const [text, position, colour] of axes) {
      const el = document.createElement('span');
      el.className = 'axis-label'; el.textContent = text; el.style.color = colour;
      const label = new CSS2DObject(el); label.position.copy(position);
      this.axisLabels.push(label); this.scene.add(label);
    }
  }

  private createPiece(piece: Piece): PieceView {
    const visual = this.theme.createPiece(Object.freeze({ type: piece.type, owner: piece.owner }));
    const group = visual.object;
    const el = document.createElement('span');
    el.className = 'piece-label ' + piece.owner;
    el.textContent = PIECE_LETTERS[piece.type];
    const label = new CSS2DObject(el); label.position.y = 0.44;
    group.add(label);
    if (this.theme.postprocessing?.preservePieceSilhouettes) group.traverse(object => object.layers.set(2));
    const proxy = new THREE.Mesh(this.pieceProxyGeometry, this.invisible);
    proxy.userData.cell = piece.cell;
    const target = world(piece.cell!);
    group.position.copy(target); proxy.position.copy(target);
    group.userData.type = piece.type;
    this.scene.add(group); this.picks.add(proxy);
    return { visual, group, label, proxy, target, start: target.clone() };
  }

  setState(state: ScenePosition, animate = false): void {
    this.director.interrupt();
    this.theme.clearTransient();
    this.state = Object.freeze({ pieces: Object.freeze(state.pieces.map(piece => Object.freeze({ ...piece }))) });
    for (const [id, view] of this.pieces) {
      const piece = state.pieces[id];
      if (!piece || piece.cell === null || view.group.userData.type !== piece.type || !animate) {
        this.scene.remove(view.group); this.picks.remove(view.proxy);
        view.visual.dispose(); view.label.element.remove(); this.pieces.delete(id);
      }
    }
    for (const piece of state.pieces) {
      if (piece.cell === null) continue;
      let view = this.pieces.get(piece.id);
      if (!view) { view = this.createPiece(piece); this.pieces.set(piece.id, view); }
      view.start.copy(view.group.position); view.target.copy(world(piece.cell));
      view.proxy.position.copy(view.target); view.proxy.userData.cell = piece.cell;
      if (!animate) view.group.position.copy(view.target);
    }
    this.animationStart = animate && !this.reducedMotion.matches ? performance.now() : 0;
    if (!this.animationStart) for (const view of this.pieces.values()) view.group.position.copy(view.target);
    this.applyVisibility();
    this.dirty = true;
  }

  setSelection(pieceId: number | null, moves: Move[]): void {
    this.director.interrupt();
    this.selected = pieceId; this.moves = structuredClone(moves);
    this.hovered = null; this.hoverBox.visible = false;
    const piece = pieceId === null ? null : this.state?.pieces[pieceId];
    this.selection.visible = !!piece && piece.cell !== null;
    if (piece?.cell !== null && piece?.cell !== undefined) this.selection.position.copy(world(piece.cell));
    this.buildAssists();
  }

  setOptions(options: ViewOptions): void {
    this.options = options;
    this.plane.visible = options.plane !== null;
    this.plane.position.y = (options.plane ?? 0) - 3.98;
    this.applyVisibility(); this.buildAssists();
  }

  private cellVisible(cell: Cell): boolean {
    return !this.options.isolate || this.options.plane === null || coordinates(cell)[2] === this.options.plane;
  }

  private applyVisibility(): void {
    for (const [id, view] of this.pieces) {
      const piece = this.state?.pieces[id];
      view.group.visible = !!piece && piece.cell !== null && this.cellVisible(piece.cell);
      view.proxy.visible = view.group.visible;
      view.label.visible = this.options.labels;
    }
    if (this.selected !== null && this.state?.pieces[this.selected]?.cell !== null) {
      this.selection.visible = this.cellVisible(this.state!.pieces[this.selected].cell!);
    }
    this.hoverBox.visible = false;
    this.dirty = true;
  }

  private buildAssists(): void {
    this.disposeObject(this.assists); this.assists.clear();
    this.markers = null;
    this.markerBackplates = null;
    for (const proxy of [...this.picks.children]) if (proxy.userData.destination) this.picks.remove(proxy);
    const unique = [...new Map(this.moves.map(m => [m.to, m])).values()].filter(m => this.cellVisible(m.to));
    this.fieldMoves = unique;
    if (unique.length) {
      const geometry = new THREE.OctahedronGeometry(0.11);
      // The complete field stays readable through occupied cells, including capture endpoints.
      this.markers = new THREE.InstancedMesh(geometry, new THREE.MeshBasicMaterial({ transparent: true, opacity: 0.82, depthTest: false, depthWrite: false }), unique.length);
      this.markers.renderOrder = 3;
      this.markers.layers.set(1);
      if (this.theme.markerBackdrop !== undefined) {
        this.markerBackplates = new THREE.InstancedMesh(new THREE.OctahedronGeometry(0.15),
          new THREE.MeshBasicMaterial({ color: this.theme.markerBackdrop, transparent: true, opacity: 1, depthTest: false, depthWrite: false }), unique.length);
        this.markerBackplates.renderOrder = 2.5;
        this.markerBackplates.layers.set(1);
        this.assists.add(this.markerBackplates);
      }
      for (const m of unique) {
        const proxy = new THREE.Mesh(this.targetProxyGeometry, this.invisible);
        proxy.position.copy(world(m.to)); proxy.userData.cell = m.to; proxy.userData.destination = true;
        this.picks.add(proxy);
      }
      this.assists.add(this.markers);
    }
    this.updateFieldFocus();
    this.dirty = true;
  }

  private updateFieldFocus(): void {
    const focused = this.fieldMoves.find(m => m.to === this.hovered);
    const matrix = new THREE.Matrix4();
    this.fieldMoves.forEach((move, index) => {
      const active = move === focused;
      const scale = (move.capturedId === null ? 1 : 1.15) * (active ? 1.65 : 1);
      matrix.makeScale(scale, scale, scale).setPosition(world(move.to));
      const color = new THREE.Color(move.capturedId === null ? GOLD : CAPTURE);
      if (active) color.lerp(new THREE.Color(0xffffff), 0.25);
      else if (focused) color.multiplyScalar(0.5);
      this.markers!.setMatrixAt(index, matrix); this.markers!.setColorAt(index, color);
      this.markerBackplates?.setMatrixAt(index, matrix);
    });
    if (this.markers) {
      this.markers.instanceMatrix.needsUpdate = true;
      if (this.markers.instanceColor) this.markers.instanceColor.needsUpdate = true;
      this.markers.computeBoundingSphere();
    }
    if (this.markerBackplates) {
      this.markerBackplates.instanceMatrix.needsUpdate = true;
      this.markerBackplates.computeBoundingSphere();
    }
    this.focusOutline.visible = !!focused;
    if (focused) {
      this.focusOutline.position.copy(world(focused.to));
      this.focusOutline.scale.setScalar(focused.capturedId === null ? 0.24 : 0.39);
      (this.focusOutline.material as THREE.LineBasicMaterial).color.set(focused.capturedId === null ? GOLD : CAPTURE);
    }
    this.disposeObject(this.guide); this.guide.clear();
    if (focused && this.options.trajectories) this.drawFocusedGuide(focused);
    this.dirty = true;
  }

  private drawFocusedGuide(move: Move): void {
    const start = world(move.from), end = world(move.to);
    let points: THREE.Vector3[];
    if (move.kind === 'jump') {
      // A visual elbow explains the engine-provided jump, not an occupancy-tested route.
      const delta = end.clone().sub(start);
      const components = [Math.abs(delta.x), Math.abs(delta.y), Math.abs(delta.z)];
      const elbow = start.clone().setComponent(components.indexOf(Math.max(...components)), end.getComponent(components.indexOf(Math.max(...components))));
      points = [start, elbow, end];
    } else {
      points = [start, ...move.path.map(world)];
    }
    const geometry = new THREE.BufferGeometry().setFromPoints(points);
    const style = { color: move.capturedId === null ? GOLD : CAPTURE, transparent: true, opacity: 0.85, depthWrite: false, depthTest: false };
    const line = new THREE.Line(geometry, move.kind === 'jump' ? new THREE.LineDashedMaterial({ ...style, dashSize: 0.10, gapSize: 0.12 }) : new THREE.LineBasicMaterial(style));
    if (move.kind === 'jump') line.computeLineDistances();
    line.renderOrder = 2;
    line.layers.set(1);
    this.guide.add(line);
  }

  setHover(cell: Cell | null): void {
    if (cell === this.hovered) return;
    this.hovered = cell;
    this.hoverBox.visible = cell !== null && this.cellVisible(cell) && !this.moves.some(move => move.to === cell);
    if (cell !== null) this.hoverBox.position.copy(world(cell));
    this.updateFieldFocus();
    if (cell !== null && this.fieldMoves.some(m => m.to === cell)) this.present({ kind: 'trajectory', at: world(cell).toArray() });
    this.dirty = true;
  }

  /** Read-only UI diagnostics: reflects the rendered field rather than predicting it. */
  movementField(): { cells: Cell[]; focused: Cell | null; guideKind: Move['kind'] | null; guideCount: number; points: number[][]; dashed: boolean } {
    const focused = this.fieldMoves.find(move => move.to === this.hovered);
    const line = this.guide.children[0] as THREE.Line | undefined;
    const position = line?.geometry.getAttribute('position');
    return {
      cells: this.fieldMoves.map(m => m.to), focused: focused?.to ?? null,
      guideKind: line && focused ? focused.kind : null, guideCount: this.guide.children.length,
      points: position ? Array.from({ length: position.count }, (_, i) => [position.getX(i), position.getY(i), position.getZ(i)]) : [],
      dashed: line?.material instanceof THREE.LineDashedMaterial,
    };
  }

  private hits(event: PointerEvent): Cell[] {
    const rect = this.renderer.domElement.getBoundingClientRect();
    this.raycaster.setFromCamera(new THREE.Vector2((event.clientX - rect.left) / rect.width * 2 - 1, -(event.clientY - rect.top) / rect.height * 2 + 1), this.camera);
    const objects = this.picks.children.filter(p => p.visible);
    return [...new Set(this.raycaster.intersectObjects(objects, false).map(hit => hit.object.userData.cell as Cell))];
  }

  private bindPointers(): void {
    const canvas = this.renderer.domElement;
    canvas.addEventListener('pointerdown', event => {
      this.pointers.add(event.pointerId);
      if (this.pointers.size === 1) {
        this.gestureSuppressed = event.button !== 0 || event.shiftKey || event.ctrlKey || event.metaKey;
        this.pointer = { id: event.pointerId, x: event.clientX, y: event.clientY, dragged: false };
      } else { this.gestureSuppressed = true; this.callbacks.navigate(); }
      this.callbacks.gesture();
    });
    canvas.addEventListener('pointermove', event => {
      if (this.pointer && Math.hypot(event.clientX - this.pointer.x, event.clientY - this.pointer.y) > 5) {
        if (!this.pointer.dragged) this.callbacks.navigate();
        this.pointer.dragged = true;
      }
      if (!this.pointers.size) {
        const target = this.hits(event)[0] ?? null;
        canvas.style.cursor = target === null ? 'grab' : 'pointer';
        this.callbacks.hover(target);
      }
    });
    canvas.addEventListener('pointerup', event => {
      const tap = this.pointer?.id === event.pointerId && !this.pointer.dragged && !this.gestureSuppressed && this.pointers.size === 1;
      this.pointers.delete(event.pointerId);
      if (tap && !this.isAnimating) {
        const hits = this.hits(event);
        const input = event.pointerType === 'touch' ? 'touch' : 'pointer';
        if (hits.length > 1) this.callbacks.chooseDepth(hits, event.clientX, event.clientY, input);
        else if (hits.length === 1) this.callbacks.select(hits[0], input);
        else this.callbacks.select(-1, input);
      }
      if (!this.pointers.size) this.pointer = null;
    });
    canvas.addEventListener('pointercancel', event => { this.pointers.delete(event.pointerId); this.gestureSuppressed = true; this.pointer = null; });
    canvas.addEventListener('pointerleave', event => { if (!this.pointers.size && event.pointerType !== 'touch') this.callbacks.hover(null); });
    canvas.addEventListener('wheel', () => this.callbacks.navigate(), { passive: true });
    canvas.addEventListener('contextmenu', event => event.preventDefault());
  }

  get isAnimating(): boolean { return this.animationStart !== 0; }

  preset(name: CameraPreset): void {
    this.director.interrupt();
    const aspect = this.camera.aspect;
    const vertical = THREE.MathUtils.degToRad(this.camera.fov / 2);
    const angle = Math.min(vertical, Math.atan(Math.tan(vertical) * aspect));
    const distance = 6.93 / Math.sin(angle) * 1.07;
    const direction = { iso: new THREE.Vector3(1, 0.72, -1.12), front: new THREE.Vector3(0, 0, -1), side: new THREE.Vector3(1, 0, 0), top: new THREE.Vector3(0, 1, -0.001), below: new THREE.Vector3(0, -1, -0.001) }[name];
    // Flush accumulated damping before setting the requested position.
    const damping = this.controls.enableDamping;
    this.controls.enableDamping = false; this.controls.update();
    this.controls.target.set(0, 0, 0);
    this.camera.position.copy(direction.normalize().multiplyScalar(distance));
    this.controls.update(); this.controls.enableDamping = damping;
    this.dirty = true;
  }

  private resize(): void {
    this.director.interrupt();
    const width = Math.max(this.host.clientWidth, 1), height = Math.max(this.host.clientHeight, 1);
    const halfFov = THREE.MathUtils.degToRad(this.camera.fov / 2);
    const oldAngle = Math.min(halfFov, Math.atan(Math.tan(halfFov) * this.camera.aspect));
    const newAngle = Math.min(halfFov, Math.atan(Math.tan(halfFov) * width / height));
    this.camera.position.sub(this.controls.target).multiplyScalar(Math.sin(oldAngle) / Math.sin(newAngle)).add(this.controls.target);
    this.camera.aspect = width / height; this.camera.updateProjectionMatrix();
    this.theme.postprocessing?.resize(width, height, this.renderer.getPixelRatio());
    this.renderer.setSize(width, height); this.labels.setSize(width, height);
    this.dirty = true;
  }

  project(cell: Cell): { x: number; y: number } {
    this.camera.updateMatrixWorld();
    const point = world(cell).project(this.camera);
    const rect = this.renderer.domElement.getBoundingClientRect();
    return { x: rect.left + (point.x + 1) / 2 * rect.width, y: rect.top + (1 - point.y) / 2 * rect.height };
  }

  describe(cell: Cell): string { return formatCell(cell); }

  private tick = (): void => {
    this.animationFrame = requestAnimationFrame(this.tick);
    if (document.hidden) { this.director.interrupt(); return; }
    const now = performance.now();
    const directed = this.director.update(now);
    const moved = this.controls.update();
    const effectsChanged = this.theme.update(now, this.effectsEnabled && !this.reducedMotion.matches);
    if (this.animationStart) {
      const t = Math.min((now - this.animationStart) / this.theme.motion.durationMs, 1);
      const ease = this.theme.motion.sample(t);
      for (const view of this.pieces.values()) view.group.position.lerpVectors(view.start, view.target, ease);
      if (t === 1) this.animationStart = 0;
      this.dirty = true;
    }
    if (this.dirty || moved || directed || effectsChanged) {
      const start = performance.now();
      this.renderer.info.reset();
      if (this.theme.postprocessing && this.theme.postprocessing.enabled !== false) {
        // Post effects process the world only. Legal markers and guides stay crisp on layer 1.
        const mask = this.camera.layers.mask, autoClear = this.renderer.autoClear, background = this.scene.background;
        try {
          this.camera.layers.set(0);
          this.theme.postprocessing.render(this.renderer, this.scene, this.camera);
          this.renderer.setRenderTarget(null); this.renderer.autoClear = false;
          this.scene.background = null; this.camera.layers.set(1);
          if (this.theme.postprocessing.preservePieceSilhouettes) this.camera.layers.enable(2);
          this.renderer.clearDepth();
          this.renderer.render(this.scene, this.camera);
        } finally { this.camera.layers.mask = mask; this.renderer.autoClear = autoClear; this.scene.background = background; }
      } else this.renderer.render(this.scene, this.camera);
      this.labels.render(this.scene, this.camera);
      this.lastRender = performance.now() - start;
      this.renderSamples.push(this.lastRender); if (this.renderSamples.length > 120) this.renderSamples.shift();
      this.renders++;
      Object.assign(this.metrics, { drawCalls: this.renderer.info.render.calls, triangles: this.renderer.info.render.triangles, lastRenderMs: this.lastRender, renders: this.renders });
      this.dirty = false;
    }
  };

  private disposeObject(root: THREE.Object3D): void { disposeVisual(root); }

  setTheme(id: ThemeId): void {
    if (id === this.theme.id) return;
    this.director.interrupt();
    for (const piece of this.pieces.values()) {
      this.scene.remove(piece.group); this.picks.remove(piece.proxy); piece.visual.dispose(); piece.label.element.remove();
    }
    this.pieces.clear(); this.scene.remove(this.theme.root); this.theme.postprocessing?.dispose(); this.theme.dispose();
    this.theme = createTheme(id); this.scene.add(this.theme.root); this.scene.background = this.theme.background;
    this.scene.environment = this.theme.environment ?? null;
    if (this.theme.postprocessing?.preservePieceSilhouettes) this.camera.layers.enable(2);
    else this.camera.layers.disable(2);
    for (const { material, role } of this.latticeMaterials) {
      material.opacity = role === 'grid' ? this.theme.volume.gridOpacity : role === 'edge' ? this.theme.volume.edgeOpacity : this.theme.volume.homeOpacity;
      if (role === 'grid') material.color.set(this.theme.volume.gridColor);
    }
    this.theme.postprocessing?.resize(this.host.clientWidth, this.host.clientHeight, this.renderer.getPixelRatio());
    const hovered = this.hovered;
    if (this.state) this.setState(this.state);
    this.setSelection(this.selected, this.moves); this.setHover(hovered);
    this.renderSamples = []; this.dirty = true;
  }

  setCrystalEffects(effects: CrystalEffects): void {
    this.theme.optical?.set(effects);
    this.renderSamples = []; this.dirty = true;
  }

  setEffects(enabled: boolean): void {
    this.effectsEnabled = enabled;
    if (!enabled) this.theme.clearTransient();
    this.dirty = true;
  }

  /** Engine/controller decides which event occurred; themes only consume frozen visual descriptors. */
  present(cue: SceneCue): void {
    const copy = structuredClone(cue); Object.freeze(copy.at); if ('from' in copy) Object.freeze(copy.from); Object.freeze(copy);
    if (this.effectsEnabled && !this.reducedMotion.matches) this.theme.onCue(copy, performance.now());
    this.dirty = true;
  }

  focusSelection(orbit = false): boolean {
    const cell = this.selected === null ? null : this.state?.pieces[this.selected]?.cell;
    if (cell === null || cell === undefined) return false;
    this.director.focus(world(cell).toArray(), 3.2, performance.now(), this.reducedMotion.matches, orbit);
    this.dirty = true; return true;
  }

  presentationMetrics() {
    const sorted = [...this.renderSamples].sort((a, b) => a - b);
    return { theme: this.theme.id, optical: this.theme.optical?.get() ?? null, director: this.director.mode, effects: this.effectsEnabled && !this.reducedMotion.matches,
      geometries: this.renderer.info.memory.geometries, textures: this.renderer.info.memory.textures,
      samples: sorted.length, medianSubmitMs: sorted[Math.floor(sorted.length / 2)] ?? 0,
      p95SubmitMs: sorted[Math.min(sorted.length - 1, Math.floor(sorted.length * 0.95))] ?? 0 };
  }

  dispose(): void {
    for (const event of ['pointerdown', 'wheel', 'keydown']) document.removeEventListener(event, this.interruptCamera, true);
    this.reducedMotion.removeEventListener('change', this.motionPreferenceChanged);
    for (const piece of this.pieces.values()) {
      this.scene.remove(piece.group); piece.visual.dispose(); piece.label.element.remove();
    }
    this.pieces.clear();
    this.director.interrupt(); this.scene.remove(this.theme.root); this.theme.postprocessing?.dispose(); this.theme.dispose();
    cancelAnimationFrame(this.animationFrame); this.resizeObserver.disconnect(); this.controls.dispose();
    this.disposeObject(this.scene); this.targetProxyGeometry.dispose(); this.pieceProxyGeometry.dispose();
    this.renderer.dispose(); this.labels.domElement.remove(); this.renderer.domElement.remove();
  }
}
