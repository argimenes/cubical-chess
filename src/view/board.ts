import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { CSS2DObject, CSS2DRenderer } from 'three/addons/renderers/CSS2DRenderer.js';
import { coordinates, formatCell } from '../rules/geometry';
import type { Cell, GameState, Move, Piece, PieceType } from '../rules/types';
import { PIECE_LETTERS } from '../rules/types';

export type CameraPreset = 'iso' | 'front' | 'side' | 'top' | 'below';
export interface ViewOptions { trajectories: boolean; labels: boolean; plane: number | null; isolate: boolean }
export interface BoardCallbacks {
  select: (cell: Cell) => void;
  hover: (cell: Cell | null) => void;
  chooseDepth: (cells: Cell[], x: number, y: number) => void;
  gesture: () => void;
}
const BLUE = 0x79d4ff;
const CORAL = 0xff8f89;
const GOLD = 0xffd78c;
const world = (cell: Cell): THREE.Vector3 => {
  const [x, y, z] = coordinates(cell);
  return new THREE.Vector3(x - 3.5, z - 3.5, y - 3.5);
};

interface PieceView { group: THREE.Group; label: CSS2DObject; proxy: THREE.Mesh; target: THREE.Vector3; start: THREE.Vector3 }

/** Rendering consumes authoritative cells and moves; it never decides legality. */
export class BoardView {
  readonly renderer: THREE.WebGLRenderer;
  readonly camera = new THREE.PerspectiveCamera(43, 1, 0.1, 120);
  readonly controls: OrbitControls;
  readonly scene = new THREE.Scene();
  private readonly labels = new CSS2DRenderer();
  private readonly pieces = new Map<number, PieceView>();
  private readonly assists = new THREE.Group();
  private readonly picks = new THREE.Group();
  private readonly raycaster = new THREE.Raycaster();
  private readonly targetProxyGeometry = new THREE.SphereGeometry(0.23, 10, 8);
  private readonly pieceProxyGeometry = new THREE.SphereGeometry(0.34, 10, 8);
  private readonly invisible = new THREE.MeshBasicMaterial({ visible: false });
  private readonly selection: THREE.LineSegments;
  private readonly hoverBox: THREE.LineSegments;
  private readonly plane = new THREE.Group();
  private readonly shapes: Record<PieceType, THREE.BufferGeometry>;
  private readonly axisLabels: CSS2DObject[] = [];
  private readonly resizeObserver: ResizeObserver;
  private options: ViewOptions = { trajectories: true, labels: true, plane: null, isolate: false };
  private state: GameState | null = null;
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
    this.controls.enableDamping = true;
    this.controls.dampingFactor = 0.12;
    this.controls.minDistance = 7;
    this.controls.maxDistance = 45;
    this.controls.minPolarAngle = 0.001;
    this.controls.maxPolarAngle = Math.PI - 0.001;
    this.controls.addEventListener('change', () => { this.dirty = true; });
    this.scene.add(new THREE.AmbientLight(0xcdeaff, 2));
    const light = new THREE.DirectionalLight(0xffffff, 3);
    light.position.set(5, 9, -7);
    this.scene.add(light, this.assists, this.picks, this.plane);
    this.shapes = {
      pawn: new THREE.IcosahedronGeometry(0.18, 1),
      rook: new THREE.BoxGeometry(0.36, 0.36, 0.36),
      bishop: new THREE.OctahedronGeometry(0.3),
      knight: new THREE.TorusKnotGeometry(0.16, 0.055, 40, 6, 2, 3),
      queen: new THREE.IcosahedronGeometry(0.24, 0),
      king: new THREE.OctahedronGeometry(0.22),
    };
    this.selection = new THREE.LineSegments(new THREE.EdgesGeometry(new THREE.BoxGeometry(0.84, 0.84, 0.84)), new THREE.LineBasicMaterial({ color: GOLD, transparent: true, opacity: 0.85 }));
    this.hoverBox = new THREE.LineSegments(new THREE.EdgesGeometry(new THREE.BoxGeometry(0.78, 0.78, 0.78)), new THREE.LineBasicMaterial({ color: 0xf0f6ff, transparent: true, opacity: 0.7 }));
    this.selection.visible = this.hoverBox.visible = false;
    this.scene.add(this.selection, this.hoverBox);
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
    this.scene.add(new THREE.LineSegments(geometry, new THREE.LineBasicMaterial({ color: 0x6aadd6, transparent: true, opacity: 0.075, depthWrite: false })));
    const edges = new THREE.LineSegments(new THREE.EdgesGeometry(new THREE.BoxGeometry(8, 8, 8)), new THREE.LineBasicMaterial({ color: BLUE, transparent: true, opacity: 0.42 }));
    this.scene.add(edges);
    for (const [height, colour] of [[-4, BLUE], [4, CORAL]]) {
      const grid = new THREE.GridHelper(8, 8, colour, colour);
      grid.position.y = height;
      (grid.material as THREE.Material).transparent = true;
      (grid.material as THREE.Material).opacity = 0.2;
      this.scene.add(grid);
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
    const colour = piece.owner === 'white' ? BLUE : CORAL;
    const group = new THREE.Group();
    const geometry = this.shapes[piece.type];
    const material = new THREE.MeshStandardMaterial({ color: colour, emissive: colour, emissiveIntensity: 0.38, metalness: 0.25, roughness: 0.45, transparent: true, opacity: 0.85 });
    const mesh = new THREE.Mesh(geometry, material);
    group.add(mesh);
    const wire = new THREE.LineSegments(new THREE.EdgesGeometry(geometry), new THREE.LineBasicMaterial({ color: colour, transparent: true, opacity: 0.9 }));
    group.add(wire);
    if (piece.type === 'king') {
      for (let axis = 0; axis < 3; axis++) {
        const sizes = [0.09, 0.09, 0.09]; sizes[axis] = 0.67;
        group.add(new THREE.Mesh(new THREE.BoxGeometry(...sizes as [number, number, number]), material));
      }
    }
    if (piece.type === 'queen') {
      for (let axis = 0; axis < 3; axis++) {
        const ring = new THREE.Mesh(new THREE.TorusGeometry(0.33, 0.017, 4, 24), material);
        if (axis === 1) ring.rotation.x = Math.PI / 2;
        if (axis === 2) ring.rotation.y = Math.PI / 2;
        group.add(ring);
      }
    }
    const el = document.createElement('span');
    el.className = 'piece-label ' + piece.owner;
    el.textContent = PIECE_LETTERS[piece.type];
    const label = new CSS2DObject(el); label.position.y = 0.44;
    group.add(label);
    const proxy = new THREE.Mesh(this.pieceProxyGeometry, this.invisible);
    proxy.userData.cell = piece.cell;
    const target = world(piece.cell!);
    group.position.copy(target); proxy.position.copy(target);
    group.userData.type = piece.type;
    this.scene.add(group); this.picks.add(proxy);
    return { group, label, proxy, target, start: target.clone() };
  }

  setState(state: GameState, animate = false): void {
    this.state = state;
    for (const [id, view] of this.pieces) {
      const piece = state.pieces[id];
      if (!piece || piece.cell === null || view.group.userData.type !== piece.type || !animate) {
        this.scene.remove(view.group); this.picks.remove(view.proxy);
        this.disposeObject(view.group, true); view.label.element.remove(); this.pieces.delete(id);
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
    this.animationStart = animate ? performance.now() : 0;
    this.applyVisibility();
    this.dirty = true;
  }

  setSelection(pieceId: number | null, moves: Move[]): void {
    this.selected = pieceId; this.moves = moves;
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
    for (const proxy of [...this.picks.children]) if (proxy.userData.destination) this.picks.remove(proxy);
    const unique = [...new Map(this.moves.map(m => [m.to, m])).values()].filter(m => this.cellVisible(m.to));
    if (unique.length) {
      const geometry = new THREE.OctahedronGeometry(0.11);
      const markers = new THREE.InstancedMesh(geometry, new THREE.MeshBasicMaterial({ transparent: true, opacity: 0.9 }), unique.length);
      const matrix = new THREE.Matrix4();
      unique.forEach((m, index) => {
        matrix.makeTranslation(...world(m.to).toArray());
        markers.setMatrixAt(index, matrix); markers.setColorAt(index, new THREE.Color(m.capturedId === null ? BLUE : GOLD));
        const proxy = new THREE.Mesh(this.targetProxyGeometry, this.invisible);
        proxy.position.copy(world(m.to)); proxy.userData.cell = m.to; proxy.userData.destination = true;
        this.picks.add(proxy);
      });
      this.assists.add(markers);
      if (this.options.trajectories) this.drawTrajectories(unique);
    }
    this.dirty = true;
  }

  private drawTrajectories(moves: Move[]): void {
    const segments = new Set<string>();
    const points: number[] = [];
    const jumpPoints: number[] = [];
    for (const move of moves) {
      if (move.kind === 'jump') {
        const start = world(move.from), end = world(move.to);
        const delta = end.clone().sub(start);
        const elbow = start.clone();
        const components = [Math.abs(delta.x), Math.abs(delta.y), Math.abs(delta.z)];
        const axis = components.indexOf(Math.max(...components));
        elbow.setComponent(axis, end.getComponent(axis));
        jumpPoints.push(...start.toArray(), ...elbow.toArray(), ...elbow.toArray(), ...end.toArray());
      } else {
        let previous = move.from;
        for (const next of move.path) {
          const key = previous + ':' + next;
          if (!segments.has(key)) { segments.add(key); points.push(...world(previous).toArray(), ...world(next).toArray()); }
          previous = next;
        }
      }
    }
    if (points.length) {
      const geometry = new THREE.BufferGeometry(); geometry.setAttribute('position', new THREE.Float32BufferAttribute(points, 3));
      this.assists.add(new THREE.LineSegments(geometry, new THREE.LineBasicMaterial({ color: BLUE, transparent: true, opacity: 0.34, depthWrite: false })));
    }
    if (jumpPoints.length) {
      const geometry = new THREE.BufferGeometry(); geometry.setAttribute('position', new THREE.Float32BufferAttribute(jumpPoints, 3));
      const lines = new THREE.LineSegments(geometry, new THREE.LineDashedMaterial({ color: BLUE, transparent: true, opacity: 0.4, dashSize: 0.10, gapSize: 0.10, depthWrite: false }));
      lines.computeLineDistances(); this.assists.add(lines);
    }
  }

  setHover(cell: Cell | null): void {
    this.hoverBox.visible = cell !== null && this.cellVisible(cell);
    if (cell !== null) this.hoverBox.position.copy(world(cell));
    this.dirty = true;
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
      } else this.gestureSuppressed = true;
      this.callbacks.gesture();
    });
    canvas.addEventListener('pointermove', event => {
      if (this.pointer && Math.hypot(event.clientX - this.pointer.x, event.clientY - this.pointer.y) > 5) {
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
        if (hits.length > 1) this.callbacks.chooseDepth(hits, event.clientX, event.clientY);
        else if (hits.length === 1) this.callbacks.select(hits[0]);
        else this.callbacks.select(-1);
      }
      if (!this.pointers.size) this.pointer = null;
    });
    canvas.addEventListener('pointercancel', event => { this.pointers.delete(event.pointerId); this.gestureSuppressed = true; this.pointer = null; });
    canvas.addEventListener('pointerleave', () => { if (!this.pointers.size) this.callbacks.hover(null); });
    canvas.addEventListener('contextmenu', event => event.preventDefault());
  }

  get isAnimating(): boolean { return this.animationStart !== 0; }

  preset(name: CameraPreset): void {
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
    const width = Math.max(this.host.clientWidth, 1), height = Math.max(this.host.clientHeight, 1);
    const halfFov = THREE.MathUtils.degToRad(this.camera.fov / 2);
    const oldAngle = Math.min(halfFov, Math.atan(Math.tan(halfFov) * this.camera.aspect));
    const newAngle = Math.min(halfFov, Math.atan(Math.tan(halfFov) * width / height));
    this.camera.position.sub(this.controls.target).multiplyScalar(Math.sin(oldAngle) / Math.sin(newAngle)).add(this.controls.target);
    this.camera.aspect = width / height; this.camera.updateProjectionMatrix();
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
    const moved = this.controls.update();
    if (this.animationStart) {
      const t = Math.min((performance.now() - this.animationStart) / 190, 1);
      const ease = 1 - (1 - t) ** 3;
      for (const view of this.pieces.values()) view.group.position.lerpVectors(view.start, view.target, ease);
      if (t === 1) this.animationStart = 0;
      this.dirty = true;
    }
    if (this.dirty || moved) {
      const start = performance.now();
      this.renderer.render(this.scene, this.camera); this.labels.render(this.scene, this.camera);
      this.lastRender = performance.now() - start;
      this.renders++;
      Object.assign(this.metrics, { drawCalls: this.renderer.info.render.calls, triangles: this.renderer.info.render.triangles, lastRenderMs: this.lastRender, renders: this.renders });
      this.dirty = false;
    }
  };

  private disposeObject(root: THREE.Object3D, keepShapes = false): void {
    root.traverse(object => {
      if (object instanceof THREE.Mesh || object instanceof THREE.LineSegments) {
        if (!keepShapes || !Object.values(this.shapes).includes(object.geometry)) object.geometry.dispose();
        const materials = Array.isArray(object.material) ? object.material : [object.material];
        for (const material of materials) material.dispose();
      }
    });
  }

  dispose(): void {
    cancelAnimationFrame(this.animationFrame); this.resizeObserver.disconnect(); this.controls.dispose();
    this.disposeObject(this.scene); this.targetProxyGeometry.dispose(); this.pieceProxyGeometry.dispose();
    this.renderer.dispose(); this.labels.domElement.remove(); this.renderer.domElement.remove();
  }
}
