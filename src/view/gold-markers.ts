import * as THREE from 'three';
import { disposeVisual } from './themes/dispose';

/** Shared, material-only studio reflections keep gold readable in every theme. */
export class GoldMarkers {
  private readonly reflections: THREE.WebGLRenderTarget;

  constructor(renderer: THREE.WebGLRenderer) {
    const studio = new THREE.Scene();
    studio.background = new THREE.Color(0.24, 0.24, 0.24);
    const panel = (position: [number, number, number], width: number, height: number, light: number) => {
      const mesh = new THREE.Mesh(new THREE.PlaneGeometry(width, height),
        new THREE.MeshBasicMaterial({ color: new THREE.Color(light, light, light), side: THREE.DoubleSide }));
      mesh.position.set(...position); mesh.lookAt(0, 0, 0); studio.add(mesh);
    };
    // Bright softboxes and dark gaps produce recognisable polished-metal reflections.
    panel([4, 6, -5], 5, 8, 4);
    panel([-6, 2, 3], 3, 9, 2.8);
    panel([2, -5, 5], 7, 3, 1.8);
    panel([-2, -3, -6], 3, 8, 0.015);
    const generator = new THREE.PMREMGenerator(renderer);
    try {
      this.reflections = generator.fromScene(studio, 0, 0.1, 30, { size: 128 });
    } finally { generator.dispose(); disposeVisual(studio); }
  }

  createMaterial(): THREE.MeshStandardMaterial {
    return new THREE.MeshStandardMaterial({
      color: 0xffffff, // Each instance supplies its gold or warm capture-gold tint.
      metalness: 1, roughness: 0.23,
      envMap: this.reflections.texture, envMapIntensity: 1,
      // A small floor keeps unlit facets discernible without flattening the reflections.
      emissive: 0x422000, emissiveIntensity: 0.12,
      transparent: true, opacity: 1, depthTest: false, depthWrite: false,
    });
  }

  dispose(): void { this.reflections.dispose(); }
}
