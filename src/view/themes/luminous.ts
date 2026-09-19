import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { disposeVisual } from './dispose';
import type { PieceAppearance, PieceVisual, ThemeRuntime } from './types';

const AXES = [[1, 0, 0], [-1, 0, 0], [0, 1, 0], [0, -1, 0], [0, 0, 1], [0, 0, -1]];
const DIAGONALS = [-1, 1].flatMap(x => [-1, 1].flatMap(y => [-1, 1].map(z => [x, y, z])));
const hues = { white: 0x247dff, black: 0xe51c46 };
const edges = { white: 0x62e7ff, black: 0xff527b };

/** Every structural element stays inside the existing cell and shares its picking proxy. */
function form(type: PieceAppearance['type']): THREE.BufferGeometry {
  const parts: THREE.BufferGeometry[] = [];
  const add = (geometry: THREE.BufferGeometry, at = new THREE.Vector3()) => { geometry.translate(at.x, at.y, at.z); parts.push(geometry); };
  const at = (v: number[], r: number) => new THREE.Vector3(...v).normalize().multiplyScalar(r);
  switch (type) {
    case 'pawn': add(new THREE.IcosahedronGeometry(0.20, 1)); break;
    case 'rook':
      add(new THREE.BoxGeometry(0.28, 0.28, 0.28));
      AXES.forEach(v => {
        const g = new THREE.BoxGeometry(0.10, 0.25, 0.10);
        g.applyQuaternion(new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(0, 1, 0), at(v, 1)));
        add(g, at(v, 0.24));
      }); break;
    case 'bishop':
      add(new THREE.OctahedronGeometry(0.23));
      DIAGONALS.forEach(v => {
        const g = new THREE.OctahedronGeometry(0.09); g.scale(0.65, 1.7, 0.65);
        g.applyQuaternion(new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(0, 1, 0), at(v, 1)));
        add(g, at(v, 0.25));
      }); break;
    case 'knight':
      add(new THREE.TorusKnotGeometry(0.18, 0.055, 56, 5, 2, 3).scale(1, 1, 2.2));
      [[0.20, 0.12, 0.10], [-0.18, 0.09, -0.14], [0.02, -0.20, 0.11]].forEach(p => add(new THREE.IcosahedronGeometry(0.068), new THREE.Vector3(...p)));
      break;
    case 'queen':
      add(new THREE.IcosahedronGeometry(0.23));
      for (let i = 0; i < 3; i++) {
        const ring = new THREE.TorusGeometry(0.33, 0.024, 5, 36);
        if (i === 1) ring.rotateX(Math.PI / 2); if (i === 2) ring.rotateY(Math.PI / 2);
        add(ring);
      }
      DIAGONALS.forEach(v => add(new THREE.OctahedronGeometry(0.05), at(v, 0.31)));
      break;
    case 'king':
      add(new THREE.DodecahedronGeometry(0.23));
      AXES.forEach(v => {
        const g = new THREE.OctahedronGeometry(0.12); g.scale(0.65, 1.5, 0.65);
        g.applyQuaternion(new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(0, 1, 0), at(v, 1)));
        add(g, at(v, 0.23));
      }); break;
  }
  const flat = parts.map(g => { const result = g.index ? g.toNonIndexed() : g.clone(); result.computeVertexNormals(); return result; });
  const geometry = mergeGeometries(flat)!;
  parts.forEach(g => g.dispose()); flat.forEach(g => g.dispose());
  // Keep even the outer tips inside the common fixed 0.34-unit hit sphere.
  const vertices = geometry.getAttribute('position'); let radius = 0;
  for (let i = 0; i < vertices.count; i++) radius = Math.max(radius, Math.hypot(vertices.getX(i), vertices.getY(i), vertices.getZ(i)));
  geometry.scale(...Array(3).fill(Math.min(1, 0.335 / radius)) as [number, number, number]);
  return geometry;
}

export function createLuminousTheme(): ThemeRuntime {
  const root = new THREE.Group(); root.name = 'theme:luminous';
  const time = { value: 0 };
  let previous: number | null = null, lastFrame = -Infinity;
  const transient = new THREE.Group(); root.add(transient);
  let burst: { material: THREE.ShaderMaterial; start: number; duration: number } | null = null;
  // A distant, sparse field. Stars have no glow halo and never resemble gold destinations.
  const stars: number[] = [];
  for (let i = 0; i < 480; i++) {
    const y = 1 - 2 * (i + 0.5) / 480, r = Math.sqrt(1 - y * y), a = i * 2.39996;
    stars.push(Math.cos(a) * r * 58, y * 58, Math.sin(a) * r * 58);
  }
  root.add(new THREE.Points(new THREE.BufferGeometry().setAttribute('position', new THREE.Float32BufferAttribute(stars, 3)),
    new THREE.ShaderMaterial({ transparent: true, depthWrite: false, toneMapped: false,
      vertexShader: 'varying float light; void main(){ light = fract(sin(position.x * 12.3 + position.y) * 4321.0); gl_PointSize = 1.0 + step(0.93, light); gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }',
      fragmentShader: 'varying float light; void main(){ if(length(gl_PointCoord - 0.5)>0.5) discard; gl_FragColor = vec4(mix(vec3(0.32,0.45,0.7),vec3(0.85,0.92,1.0),light), 0.3 + light * 0.5); }',
    })));

  function createPiece(piece: PieceAppearance): PieceVisual {
    const object = new THREE.Group(), geometry = form(piece.type);
    const tint = new THREE.Color(hues[piece.owner]);
    const material = new THREE.ShaderMaterial({ uniforms: { time, tint: { value: tint } }, toneMapped: false,
      vertexShader: `varying vec3 local, world, facet; void main(){ local = position; world = (modelMatrix * vec4(position,1.0)).xyz; facet = normalize(mat3(modelMatrix) * normal); gl_Position = projectionMatrix * modelViewMatrix * vec4(position,1.0); }`,
      fragmentShader: `
        uniform float time; uniform vec3 tint;
        varying vec3 local, world, facet;
        void main(){
          vec3 n = normalize(facet), eye = normalize(cameraPosition-world), light = normalize(vec3(-0.6,0.8,-0.5));
          float rim = pow(1.0-abs(dot(eye,n)),3.0);
          float highlight = pow(max(0.0,dot(n,normalize(light+eye))),48.0);
          float facetPulse = 0.75+0.25*sin(time*0.75+dot(local,vec3(17.0,13.0,21.0)));
          float vein = pow(0.5+0.5*cos(dot(local,vec3(38.0,23.0,-19.0))),24.0);
          float prism = pow(max(0.0,cos(dot(n,eye)*27.0+dot(n,vec3(3.0,7.0,11.0)))),60.0);
          vec3 spectral = 0.5+0.5*cos(vec3(0.0,2.1,4.2)+dot(n,eye)*10.0);
          vec3 color = tint*(0.28+max(0.0,dot(n,light))*0.65+rim*1.7+vein*facetPulse*0.8);
          color += vec3(0.7,0.85,1.0)*highlight*2.5 + spectral*prism*0.25;
          gl_FragColor = vec4(color,1.0);
          #include <colorspace_fragment>
        }`,
    });
    object.add(new THREE.Mesh(geometry, material));
    object.add(new THREE.LineSegments(new THREE.EdgesGeometry(geometry, 28), new THREE.LineBasicMaterial({ color: edges[piece.owner], transparent: true, opacity: 0.38 })));
    // Points are sampled on the actual form, so sparkle reinforces rather than replaces its silhouette.
    const points: number[] = [], positions = geometry.getAttribute('position');
    for (let i = 0; i < 24; i++) {
      const index = Math.floor((i * 0.618034 % 1) * positions.count);
      points.push(positions.getX(index), positions.getY(index), positions.getZ(index));
    }
    object.add(new THREE.Points(new THREE.BufferGeometry().setAttribute('position', new THREE.Float32BufferAttribute(points, 3)),
      new THREE.ShaderMaterial({ transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, toneMapped: false,
        uniforms: { time, tint: { value: new THREE.Color(edges[piece.owner]) } },
        vertexShader: `uniform float time; varying float flash; void main(){ vec4 p=modelViewMatrix*vec4(position,1.0); vec3 n=normalize(mat3(modelMatrix)*normalize(position)); vec3 eye=normalize(cameraPosition-(modelMatrix*vec4(position,1.0)).xyz); float seed=dot(position,vec3(45.0,31.0,17.0)); flash=0.14+0.86*pow(0.5+0.5*sin(seed+dot(eye,n)*16.0+time*1.1),16.0); gl_PointSize=clamp(85.0/max(0.3,-p.z),2.0,14.0); gl_Position=projectionMatrix*p; }`,
        fragmentShader: `uniform vec3 tint; varying float flash; void main(){ vec2 p=gl_PointCoord-0.5; float r=length(p); float star=exp(-abs(p.x*p.y)*180.0)*exp(-r*8.0); float core=exp(-r*r*180.0); gl_FragColor=vec4(tint*star+vec3(core*1.5),flash); }`,
      })));
    return { object, dispose: () => disposeVisual(object) };
  }
  const clearTransient = () => { disposeVisual(transient); transient.clear(); burst = null; };
  return {
    id: 'luminous', root, background: new THREE.Color(0x010207),
    motion: { durationMs: 280, sample: t => 1 - (1 - t) ** 3 },
    createPiece,
    onCue(cue, start) {
      if (cue.kind !== 'move' && cue.kind !== 'capture') return;
      clearTransient();
      const capture = cue.kind === 'capture', points: number[] = [];
      for (let i = 0; i < (capture ? 32 : 14); i++) {
        const y = 1 - 2 * (i + 0.5) / (capture ? 32 : 14), r = Math.sqrt(1 - y * y), a = i * 2.39996;
        points.push(Math.cos(a)*r,y,Math.sin(a)*r);
      }
      const material = new THREE.ShaderMaterial({ transparent: true, depthWrite: false, blending: THREE.AdditiveBlending,
        uniforms: { progress: { value: 0 }, tint: { value: new THREE.Color(edges[cue.owner]) }, radius: { value: capture ? 0.5 : 0.23 } },
        vertexShader: 'uniform float progress, radius; void main(){ gl_Position=projectionMatrix*modelViewMatrix*vec4(position*radius*(0.2+progress),1.0); gl_PointSize=2.0; }',
        fragmentShader: 'uniform float progress; uniform vec3 tint; void main(){ float a=(1.0-progress)*(1.0-smoothstep(0.1,0.5,length(gl_PointCoord-0.5))); gl_FragColor=vec4(tint,a); }',
      });
      const light = new THREE.Points(new THREE.BufferGeometry().setAttribute('position', new THREE.Float32BufferAttribute(points, 3)), material);
      light.position.fromArray(capture ? cue.at : cue.from); transient.add(light);
      burst = { material, start, duration: capture ? 500 : 280 };
    },
    update(now, animated) {
      const dt = previous === null ? 0 : Math.min(Math.max(now-previous,0),100); previous = now;
      if (!animated) { if (burst) clearTransient(); return false; }
      time.value += dt / 1000;
      if (now-lastFrame < 1000/24) return false;
      lastFrame = now;
      if (burst) {
        const t = Math.min((now-burst.start)/burst.duration,1); burst.material.uniforms.progress.value = t;
        if (t === 1) clearTransient();
      }
      return true;
    },
    clearTransient,
    dispose() { clearTransient(); disposeVisual(root); root.clear(); },
  };
}
