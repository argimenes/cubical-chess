import * as THREE from 'three';
import { disposeVisual } from './dispose';
import type { CaptureVisual, PieceAppearance, PieceVisual } from './types';

const seed = (n: number) => { const x = Math.sin(n * 127.1 + 311.7) * 43758.5453; return x - Math.floor(x); };

/** Local presentation only: pulse/bolts follow the attacker; shards surround the victim's cell. */
export function electricCapture(attackerPiece: PieceAppearance, victim: PieceVisual, victimPiece: PieceAppearance): CaptureVisual {
  const root = new THREE.Group(), attacker = new THREE.Group();
  root.name = 'capture:shattering-victim'; attacker.name = 'capture:electrical-discharge';
  root.add(victim.object);
  const tint = new THREE.Color(victimPiece.owner === 'white' ? 0x62dfff : 0xff476c);
  const current = new THREE.Color(attackerPiece.owner === 'white' ? 0x80eaff : 0xff647e);
  // Start fragments on the actual victim's form rather than on an unrelated sphere.
  victim.object.updateMatrixWorld(true);
  const surface: THREE.Vector3[] = [];
  victim.object.traverse(object => {
    if (!(object instanceof THREE.Mesh)) return;
    const positions = object.geometry.getAttribute('position');
    for (let i = 0; i < positions.count; i++) surface.push(new THREE.Vector3().fromBufferAttribute(positions, i).applyMatrix4(object.matrixWorld));
  });
  const count = 56;
  const material = new THREE.ShaderMaterial({
    transparent: true, depthWrite: false, toneMapped: false,
    uniforms: { tint: { value: tint }, progress: { value: 0 }, opacity: { value: 1 } },
    vertexShader: `varying vec3 world, facet; varying float phase;
      void main(){ mat4 m=modelMatrix*instanceMatrix; world=(m*vec4(position,1.0)).xyz;
      facet=normalize(mat3(m)*normal); phase=dot(instanceMatrix[3].xyz,vec3(19.3,27.1,13.7));
      gl_Position=projectionMatrix*viewMatrix*vec4(world,1.0); }`,
    fragmentShader: `uniform vec3 tint; uniform float progress, opacity; varying vec3 world, facet; varying float phase;
      void main(){ vec3 n=normalize(facet), eye=normalize(cameraPosition-world);
      float shine=pow(abs(dot(n,normalize(eye+vec3(-0.4,0.7,0.6)))),32.0);
      float flash=pow(0.5+0.5*sin(phase+progress*45.0),18.0);
      vec3 color=tint*(0.38+0.6*abs(dot(n,vec3(0.4,0.7,-0.5))))+vec3(0.8,0.94,1.0)*(shine*2.2+flash*1.4);
      gl_FragColor=vec4(color,opacity);
      #include <colorspace_fragment>
      }`,
  });
  const shards = new THREE.InstancedMesh(new THREE.TetrahedronGeometry(1), material, count);
  shards.frustumCulled = false; root.add(shards);
  const fragments = Array.from({ length: count }, (_, i) => {
    const y = 1 - 2 * (i + 0.5) / count, r = Math.sqrt(1 - y * y), a = i * 2.39996;
    return { start: surface[Math.floor(seed(i + 1) * surface.length)]?.clone() ?? new THREE.Vector3(),
      direction: new THREE.Vector3(Math.cos(a) * r, y, Math.sin(a) * r),
      rotation: new THREE.Vector3(seed(i + 7), seed(i + 11), seed(i + 31)),
      size: 0.035 + seed(i + 51) * 0.055, distance: 1.2 + seed(i + 83) * 1.6 };
  });
  const haloMaterial = new THREE.MeshBasicMaterial({ color: current, transparent: true, opacity: 0, wireframe: true, depthWrite: false, blending: THREE.AdditiveBlending });
  const halo = new THREE.Mesh(new THREE.IcosahedronGeometry(0.36, 1), haloMaterial); attacker.add(halo);
  const boltPoints = new Float32Array(6 * 12 * 2 * 3);
  const boltGeometry = new THREE.BufferGeometry().setAttribute('position', new THREE.BufferAttribute(boltPoints, 3));
  const boltMaterial = new THREE.LineBasicMaterial({ color: 0xd9f7ff, transparent: true, opacity: 1, depthWrite: false, blending: THREE.AdditiveBlending });
  const bolts = new THREE.LineSegments(boltGeometry, boltMaterial); bolts.frustumCulled = false; attacker.add(bolts);
  const transform = new THREE.Object3D();

  return {
    root, attacker, durationMs: 1900,
    update(progress) {
      const t = THREE.MathUtils.clamp(progress, 0, 1);
      const contact = 0.38;
      const burst = Math.max(0, (t - contact) / (1 - contact));
      const travel = Math.min(t / contact, 1);
      const energy = t < contact ? 0.55 + 0.45 * Math.sin(t * 95) ** 2 : (1 - burst) ** 2;
      haloMaterial.opacity = energy * 0.4;
      halo.rotation.set(t * 4, t * 7, t * 3);
      halo.scale.setScalar(1 + energy * 0.15);
      boltMaterial.opacity = energy * 0.95;
      // Six broken arcs flicker around the piece; no attack ray crosses unrelated cells.
      let offset = 0;
      const beat = Math.floor(t * 80);
      for (let arc = 0; arc < 6; arc++) {
        const axis = arc % 3, start = arc * 1.3 + beat * 0.09;
        const point = (j: number) => {
          const angle = start + j / 12 * Math.PI * 1.6;
          const radius = 0.37 + seed(beat * 131 + arc * 17 + j) * 0.11;
          const p = new THREE.Vector3(Math.cos(angle) * radius, Math.sin(angle) * radius, (seed(j + arc * 39 + beat) - 0.5) * 0.2);
          if (axis === 1) p.set(p.z, p.x, p.y); else if (axis === 2) p.set(p.y, p.z, p.x);
          return p;
        };
        for (let j = 0; j < 12; j++) for (const p of [point(j), point(j + 1)]) { p.toArray(boltPoints, offset); offset += 3; }
      }
      boltGeometry.attributes.position.needsUpdate = true;
      victim.object.visible = t < contact;
      shards.visible = t >= contact;
      material.uniforms.progress.value = burst;
      material.uniforms.opacity.value = Math.pow(1 - burst, 1.3);
      fragments.forEach((fragment, i) => {
        transform.position.copy(fragment.start).addScaledVector(fragment.direction, fragment.distance * (1 - (1 - burst) ** 2));
        transform.rotation.set(fragment.rotation.x * 6 + burst * 9, fragment.rotation.y * 6 + burst * 6, fragment.rotation.z * 6 + burst * 11);
        transform.scale.set(fragment.size * 0.45, fragment.size * 1.8, fragment.size * 0.8);
        transform.updateMatrix(); shards.setMatrixAt(i, transform.matrix);
      });
      shards.instanceMatrix.needsUpdate = true;
      return { travel: travel * travel * (3 - 2 * travel), scale: 1 + energy * 0.11 };
    },
    dispose() { root.remove(victim.object); victim.dispose(); shards.dispose(); disposeVisual(root); disposeVisual(attacker); root.clear(); attacker.clear(); },
  };
}
